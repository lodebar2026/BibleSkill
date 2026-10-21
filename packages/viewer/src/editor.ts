/**
 * 可编辑的缩进视图（pnpm view --serve）。
 *
 * 每章有两份数据：server 是最近一次从服务端拿到的盘上状态，clauses / texts 是工作副本。
 * 每次操作先改工作副本，再把有变化的节（连同之前没保存成功的节）提交；通过的节换成盘上状态，
 * 没通过的留作草稿并显示错误，可以接着改或撤销。撤销就是把操作前的副本当作一次新编辑提交。
 */
import { BASIC_TYPES_NT, BASIC_TYPES_OT, basicClauseType } from '@bs/core/clause-type';
import {
  changedClauseVerses,
  changedTextVerses,
  finalizeClauses,
  mergeTranslationWithNext,
  mergeWithNext,
  setFields,
  setParent,
  setRange,
  setRendering,
  splitClause,
  splitTranslation,
  textRowOfWord,
  toggleBr,
  updateRendering,
  verseOf,
} from './edit-ops.js';
import {
  KIND_LABELS,
  el,
  renderChapter,
  segmentsNote,
  segmentsText,
  verseLabel,
  type Chapter,
  type ClauseEntity,
  type ClauseText,
} from './render.js';

type Mode = 'select' | 'split' | 'attach' | 'subject' | 'verb' | 'br' | 'align';

const MODES: Array<[Mode, string, string]> = [
  ['select', '选择', '点子句行选中，在右侧修改句型、状态、说明'],
  ['split', '拆分', '点词：在这个词前面把子句切开'],
  ['attach', '挂接', '先选中子句，再点父句里被它修饰的词'],
  ['subject', '主语', '先选中子句，再依次点主语的首词、末词（单词点两次）'],
  ['verb', '谓词', '先选中子句，再依次点谓词的首词、末词（单词点两次）'],
  ['br', '换行', '点词：在这个词后面换行 / 取消换行'],
  ['align', '对齐', '点原文首词、末词（单词点两次），再在译文里划选对应的中文'],
];

const STATUSES = ['accepted', 'ambiguous', 'needs-review'];

type Work = {
  server: Chapter;
  clauses: ClauseEntity[];
  texts: ClauseText[];
  dirtyClauses: Set<number>;
  dirtyTexts: Set<number>;
  errors: Map<number, string[]>;
};

type UndoEntry =
  | { chapter: number; kind: 'clauses'; before: ClauseEntity[]; after: ClauseEntity[] }
  | { chapter: number; kind: 'texts'; before: ClauseText[]; after: ClauseText[] };

type SaveResult = {
  writtenVerses: string[];
  errors: Array<{ verse: string; messages: string[] }>;
  consistency?: Array<{ verse: string; clauseId: string; issues: Array<{ surface: string; zh: string; message: string }> }>;
  needsReview?: unknown[];
};

/** 「3:5」→ bcv。书号取自词 id（o/n + 书号两位）。 */
function bcvOfLabel(label: string, chapter: Chapter): number {
  const [chapterNo, verse] = label.split(':').map(Number);
  return Number(chapter.words[0].id.slice(1, 3)) * 1_000_000 + chapterNo * 1000 + verse;
}

function surfaceOf(work: Work, range: string | null): string {
  if (!range) {
    return '—';
  }
  const [first, last = first] = range.split('-');
  return work.server.words.filter((word) => word.id >= first && word.id <= last).map((word) => word.text).join(' ');
}

export function startEditor(chapters: Chapter[], token: string, root: HTMLElement, panel: HTMLElement): void {
  const works: Work[] = chapters.map((server) => ({
    server, clauses: server.clauses, texts: server.texts, dirtyClauses: new Set(), dirtyTexts: new Set(), errors: new Map(),
  }));
  const undoStack: UndoEntry[] = [];
  const redoStack: UndoEntry[] = [];
  let mode: Mode = 'select';
  let selected: { chapter: number; id: string } | null = null;
  let rangeStart: string | null = null;
  /** 对齐模式下已选好的原文词区间，等着划选译文。 */
  let pendingAlign: { chapter: number; key: string; tokens: string } | null = null;
  let saving = false;
  /** 保存期间又有新编辑：保存完再提交一次。 */
  let saveAgain: number | null = null;

  const toolbar = el('div', 'toolbar');
  const modeButtons = new Map<Mode, HTMLButtonElement>();
  for (const [value, label, hint] of MODES) {
    const button = el('button', 'mode', label);
    button.title = hint;
    button.addEventListener('click', () => setMode(value));
    modeButtons.set(value, button);
    toolbar.append(button);
  }
  const undoButton = el('button', 'history', '撤销');
  const redoButton = el('button', 'history', '重做');
  undoButton.title = 'Ctrl/⌘+Z';
  redoButton.title = 'Ctrl/⌘+Shift+Z';
  undoButton.addEventListener('click', () => void history(undoStack, redoStack, 'before'));
  redoButton.addEventListener('click', () => void history(redoStack, undoStack, 'after'));
  const statusLine = el('div', 'status-line');
  toolbar.append(el('span', 'spacer'), undoButton, redoButton, statusLine);
  const content = el('div');
  root.replaceChildren(toolbar, content);

  function status(message: string, kind: 'info' | 'error' = 'info'): void {
    statusLine.textContent = message;
    statusLine.className = `status-line ${kind}`;
  }

  function setMode(next: Mode): void {
    mode = next;
    rangeStart = null;
    pendingAlign = null;
    markPending();
    modeButtons.forEach((button, value) => button.classList.toggle('active', value === mode));
    status(MODES.find(([value]) => value === mode)![2]);
  }

  function render(): void {
    content.replaceChildren(...works.map((work, index) => renderChapter(
      { ...work.server, clauses: work.clauses, texts: work.texts },
      panel,
      {
        selectedId: selected?.chapter === index ? selected.id : null,
        errors: work.errors,
        onSelect: (clause) => {
          selected = { chapter: index, id: clause.id };
          rangeStart = null;
          renderDetails();
        },
        onWord: (wordId, clause) => onWord(index, wordId, clause),
      },
    )));
    undoButton.disabled = undoStack.length === 0 || saving;
    redoButton.disabled = redoStack.length === 0 || saving;
    markPending();
    renderDetails();
  }

  /** 对齐模式里已点的原文词标出来（重绘后也要补上）。 */
  function markPending(): void {
    content.querySelectorAll('.word.pending').forEach((node) => node.classList.remove('pending'));
    const [first, last] = pendingAlign ? pendingAlign.tokens.split('-') : rangeStart && mode === 'align' ? [rangeStart] : [];
    if (!first) {
      return;
    }
    content.querySelectorAll<HTMLElement>('.word').forEach((node) => {
      if (node.dataset.id! >= first && node.dataset.id! <= (last ?? first)) {
        node.classList.add('pending');
      }
    });
  }

  // ------------------------------------------------------------ 操作

  function editClauses(chapter: number, op: (clauses: ClauseEntity[]) => ClauseEntity[]): void {
    const work = works[chapter];
    let after: ClauseEntity[];
    try {
      after = op(work.clauses);
    } catch (error) {
      status((error as Error).message, 'error');
      return;
    }
    const { entities, verses } = finalizeClauses(work.clauses, after);
    if (verses.length === 0) {
      return;
    }
    undoStack.push({ chapter, kind: 'clauses', before: work.clauses, after: entities });
    redoStack.length = 0;
    keepSelection(work.clauses, entities);
    work.clauses = entities;
    verses.forEach((bcv) => work.dirtyClauses.add(bcv));
    render();
    void save(chapter);
  }

  function editTexts(chapter: number, op: (texts: ClauseText[]) => ClauseText[]): void {
    const work = works[chapter];
    let after: ClauseText[];
    try {
      after = op(work.texts);
    } catch (error) {
      status((error as Error).message, 'error');
      return;
    }
    const verses = changedTextVerses(work.texts, after);
    if (verses.length === 0) {
      return;
    }
    undoStack.push({ chapter, kind: 'texts', before: work.texts, after });
    redoStack.length = 0;
    work.texts = after;
    verses.forEach((bcv) => work.dirtyTexts.add(bcv));
    render();
    void save(chapter);
  }

  /** 拆分 / 合并会给子句改名：选中的子句按首词跟过去。 */
  function keepSelection(before: ClauseEntity[], after: ClauseEntity[]): void {
    if (!selected) {
      return;
    }
    const old = before.find((clause) => clause.id === selected!.id);
    const moved = old && after.find((clause) => clause.firstWordId === old.firstWordId);
    selected = moved ? { chapter: selected.chapter, id: moved.id } : null;
  }

  async function history(from: UndoEntry[], to: UndoEntry[], side: 'before' | 'after'): Promise<void> {
    const entry = from.pop();
    if (!entry || saving) {
      return;
    }
    to.push(entry);
    const work = works[entry.chapter];
    if (entry.kind === 'clauses') {
      const target = entry[side];
      changedClauseVerses(work.clauses, target).forEach((bcv) => work.dirtyClauses.add(bcv));
      keepSelection(work.clauses, target);
      work.clauses = target;
    } else {
      const target = entry[side];
      changedTextVerses(work.texts, target).forEach((bcv) => work.dirtyTexts.add(bcv));
      work.texts = target;
    }
    render();
    await save(entry.chapter);
  }

  function onWord(chapter: number, wordId: string, clause: ClauseEntity): boolean {
    const work = works[chapter];
    const target = selected?.chapter === chapter ? work.clauses.find((item) => item.id === selected!.id) : undefined;
    switch (mode) {
      case 'select':
        return false;
      case 'split':
        editClauses(chapter, (clauses) => splitClause(clauses, wordId, work.server.words));
        return true;
      case 'br':
        editClauses(chapter, (clauses) => toggleBr(clauses, wordId));
        return true;
      case 'attach':
        if (!target) {
          status('先切到「选择」点选要挂接的子句，再回到「挂接」点父句里的词', 'error');
        } else if (target.id === clause.id) {
          status('要点另一句（父句）里的词', 'error');
        } else {
          editClauses(chapter, (clauses) => setParent(clauses, target.id, clause.id, wordId));
          status(`${verseLabel(target.id)} 已挂到 ${verseLabel(clause.id)}`);
        }
        return true;
      case 'subject':
      case 'verb': {
        const field = mode === 'subject' ? 'subjectRange' : 'verbRange';
        if (!target) {
          status('先切到「选择」点选子句', 'error');
        } else if (wordId < target.firstWordId || wordId > target.lastWordId) {
          status(`要点 ${verseLabel(target.id)} 里的词`, 'error');
        } else if (rangeStart === null) {
          rangeStart = wordId;
          status(`${mode === 'subject' ? '主语' : '谓词'}首词已选，再点末词（单词就再点一次同一个词）`);
        } else {
          const first = rangeStart;
          rangeStart = null;
          editClauses(chapter, (clauses) => setRange(clauses, target.id, field, first, wordId));
        }
        return true;
      }
      case 'align': {
        if (rangeStart === null || pendingAlign) {
          rangeStart = wordId;
          pendingAlign = null;
          markPending();
          status('首词已选，再点末词（单词就再点一次同一个词）');
          return true;
        }
        const [first, last] = rangeStart < wordId ? [rangeStart, wordId] : [wordId, rangeStart];
        rangeStart = null;
        const key = textRowOfWord(work.texts, work.clauses, first);
        if (!key || textRowOfWord(work.texts, work.clauses, last) !== key) {
          markPending();
          status(key ? '首末词要落在同一行译文里' : '这一句还没有译文，先跑 /bible-translate', 'error');
          return true;
        }
        pendingAlign = { chapter, key, tokens: first === last ? first : `${first}-${last}` };
        markPending();
        status(`在 ${verseLabel(key)} 的译文里划选对应的中文（有意不译的，在右侧「译法对照」里设）`);
        return true;
      }
    }
  }

  /** 对齐模式：划选完译文，把选区换算成译文里的位置，设成待定原文词的对照。 */
  content.addEventListener('mouseup', () => {
    const selection = window.getSelection();
    if (mode !== 'align' || !pendingAlign || !selection || selection.isCollapsed) {
      return;
    }
    const range = selection.getRangeAt(0);
    const main = (range.startContainer.parentElement)?.closest('.zh-main');
    if (!main || main !== range.endContainer.parentElement?.closest('.zh-main')) {
      status('选区要在同一行主译文里', 'error');
      return;
    }
    const key = (main.closest('tr') as HTMLElement | null)?.dataset.clause;
    if (key !== pendingAlign.key) {
      status(`要在 ${verseLabel(pendingAlign.key)} 的译文里划选`, 'error');
      return;
    }
    const before = document.createRange();
    before.selectNodeContents(main);
    before.setEnd(range.startContainer, range.startOffset);
    const raw = range.toString();
    const zh = raw.trim();
    if (!zh) {
      return;
    }
    const at = before.toString().length + (raw.length - raw.trimStart().length);
    const { chapter, tokens } = pendingAlign;
    pendingAlign = null;
    selection.removeAllRanges();
    editTexts(chapter, (texts) => setRendering(texts, key, { tokens, zh, at }));
  });

  // ------------------------------------------------------------ 保存

  async function post(path: string, body: unknown): Promise<{ result: SaveResult; chapter: Chapter } | null> {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bs-token': token },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) {
      status(payload.error ?? `保存失败（${response.status}）`, 'error');
      return null;
    }
    return payload;
  }

  async function save(chapter: number): Promise<void> {
    if (saving) {
      saveAgain = chapter;
      return;
    }
    saving = true;
    const work = works[chapter];
    const messages: string[] = [];
    try {
      if (work.dirtyClauses.size > 0) {
        const verses = new Set(work.dirtyClauses);
        const inVerses = (clause: ClauseEntity) => verses.has(verseOf(clause.id));
        const expected = Object.fromEntries(work.server.clauses.filter(inVerses).map((clause) => [clause.id, clause.version]));
        const response = await post('/api/clauses', {
          bookName: work.server.bookName, chapter: work.server.chapter, clauses: work.clauses.filter(inVerses), expected,
        });
        if (response) {
          const failed = applyResult(work, response, 'clauses');
          const draft = work.clauses.filter((clause) => failed.has(verseOf(clause.id)));
          work.clauses = [...response.chapter.clauses.filter((clause) => !failed.has(verseOf(clause.id))), ...draft]
            .sort((a, b) => (verseOf(a.id) - verseOf(b.id)) || a.firstWordId.localeCompare(b.firstWordId));
          work.dirtyClauses = failed;
          messages.push(...summary(response, failed));
        }
      }
      if (work.dirtyTexts.size > 0) {
        const verses = new Set(work.dirtyTexts);
        const inVerses = (text: ClauseText) => verses.has(text.bcv);
        const expected = Object.fromEntries(work.server.texts.filter(inVerses).map((text) => [`${text.bcv}${text.sub}`, text.version]));
        const response = await post('/api/translations', {
          bookName: work.server.bookName, chapter: work.server.chapter, texts: work.texts.filter(inVerses), expected,
        });
        if (response) {
          const failed = applyResult(work, response, 'texts');
          work.texts = [...response.chapter.texts.filter((text) => !failed.has(text.bcv)), ...work.texts.filter((text) => failed.has(text.bcv))]
            .sort((a, b) => (a.bcv - b.bcv) || a.sub.localeCompare(b.sub));
          work.dirtyTexts = failed;
          messages.push(...summary(response, failed));
        }
      }
      if (messages.length > 0) {
        status(messages.join('；'), work.errors.size > 0 ? 'error' : 'info');
      }
    } catch (error) {
      status(`保存失败：${(error as Error).message}`, 'error');
    } finally {
      saving = false;
      render();
    }
    if (saveAgain !== null) {
      const next = saveAgain;
      saveAgain = null;
      await save(next);
    }
  }

  /** 换上服务端返回的章数据，记下没通过的节和错误；返回没通过的节。 */
  function applyResult(work: Work, response: { result: SaveResult; chapter: Chapter }, kind: 'clauses' | 'texts'): Set<number> {
    const failed = new Map<number, string[]>();
    for (const error of response.result.errors) {
      failed.set(bcvOfLabel(error.verse, response.chapter), error.messages);
    }
    for (const item of response.result.consistency ?? []) {
      const bcv = bcvOfLabel(item.verse, response.chapter);
      failed.set(bcv, [...(failed.get(bcv) ?? []), ...item.issues.map((issue) => `${issue.surface}「${issue.zh}」${issue.message}`)]);
    }
    work.server = response.chapter;
    // 另一类（子句 / 译文）的错误保留；这一类的按本次结果重算
    const otherDirty = kind === 'clauses' ? work.dirtyTexts : work.dirtyClauses;
    work.errors = new Map([...work.errors].filter(([bcv]) => otherDirty.has(bcv)));
    failed.forEach((messages, bcv) => work.errors.set(bcv, [...(work.errors.get(bcv) ?? []), ...messages]));
    return new Set(failed.keys());
  }

  function summary({ result, chapter }: { result: SaveResult; chapter: Chapter }, failed: Set<number>): string[] {
    const lines: string[] = [];
    if (result.writtenVerses.length > 0) {
      lines.push(`已保存 ${result.writtenVerses.join(', ')}`);
    }
    if (failed.size > 0) {
      lines.push(`${failed.size} 节未通过校验，见表中红字`);
    }
    const written = new Set(result.writtenVerses.map((label) => bcvOfLabel(label, chapter)));
    if ((chapter.issues ?? []).some((issue) => issue.kind === 'structure' && written.has(issue.bcv))) {
      lines.push('改动后已有译文对不上了，节号标红（↻）的需要用 /bible-review 重译');
    }
    return lines;
  }

  // ------------------------------------------------------------ 详情栏

  function renderDetails(): void {
    const work = selected ? works[selected.chapter] : undefined;
    const clause = work?.clauses.find((item) => item.id === selected!.id);
    if (!work || !clause) {
      panel.hidden = true;
      return;
    }
    const chapter = selected!.chapter;
    const testament = work.server.isOT ? 'OT' : 'NT';
    const text = work.texts.find((item) => `${item.bcv}${item.sub}` === clause.id);
    const edit = (op: (clauses: ClauseEntity[]) => ClauseEntity[]) => editClauses(chapter, op);
    panel.replaceChildren();
    panel.append(el('h3', '', `${verseLabel(clause.id)} · ${clause.type}`));

    const form = el('div', 'edit-form');
    const typeSelect = el('select');
    for (const type of testament === 'OT' ? BASIC_TYPES_OT : BASIC_TYPES_NT) {
      typeSelect.append(new Option(type, type));
    }
    typeSelect.value = basicClauseType(testament, clause.type) ?? '';
    typeSelect.addEventListener('change', () => edit((clauses) => setFields(clauses, clause.id, { type: typeSelect.value })));
    const statusSelect = el('select');
    STATUSES.forEach((value) => statusSelect.append(new Option(value, value)));
    statusSelect.value = clause.status;
    statusSelect.addEventListener('change', () => edit((clauses) => setFields(clauses, clause.id, { status: statusSelect.value as ClauseEntity['status'] })));
    const note = el('textarea');
    note.value = clause.note;
    note.addEventListener('change', () => edit((clauses) => setFields(clauses, clause.id, { note: note.value.trim() })));
    const seedDiff = el('textarea');
    seedDiff.value = clause.seedDiff ?? '';
    seedDiff.placeholder = '与 Macula 判断不同时写明理由';
    seedDiff.addEventListener('change', () => edit((clauses) => setFields(clauses, clause.id, { seedDiff: seedDiff.value.trim() || null })));
    const field = (label: string, input: HTMLElement) => {
      const row = el('label', 'field');
      row.append(el('span', '', label), input);
      form.append(row);
    };
    field('句型', typeSelect);
    field('状态', statusSelect);
    field('说明', note);
    field('与 Macula 不同', seedDiff);
    panel.append(form);

    const parentWord = clause.modifies ? surfaceOf(work, clause.modifies) : '—';
    const list = el('dl');
    const rows: Array<[string, string]> = [
      ['父句', clause.parentId ? `${verseLabel(clause.parentId)}（修饰 ${parentWord}）` : '独立'],
      ['主语', surfaceOf(work, clause.subjectRange)],
      ['谓词', surfaceOf(work, clause.verbRange)],
      ['来源', clause.sources.join('、') || '—'],
    ];
    for (const [key, value] of rows) {
      list.append(el('dt', '', key), el('dd', '', value));
    }
    panel.append(list);

    const actions = el('div', 'actions');
    const action = (label: string, run: () => void, enabled = true) => {
      const button = el('button', '', label);
      button.disabled = !enabled;
      button.addEventListener('click', run);
      actions.append(button);
    };
    action('设为独立', () => edit((clauses) => setParent(clauses, clause.id, null, null)), clause.parentId !== null);
    action('清除 modifies', () => edit((clauses) => setParent(clauses, clause.id, clause.parentId, null)), clause.modifies !== null);
    action('清除主语', () => edit((clauses) => setRange(clauses, clause.id, 'subjectRange', null)), clause.subjectRange !== null);
    action('清除谓词', () => edit((clauses) => setRange(clauses, clause.id, 'verbRange', null)), clause.verbRange !== null);
    const hasNext = work.clauses.some((item) => verseOf(item.id) === verseOf(clause.id) && item.firstWordId > clause.lastWordId);
    action('与下一句合并', () => edit((clauses) => mergeWithNext(clauses, clause.id)), hasNext);
    panel.append(actions);

    if (clause.alternatives.length > 0) {
      panel.append(el('h4', '', '结构上的其他读法'));
      const ul = el('ul');
      clause.alternatives.forEach((alt) => ul.append(el('li', '', alt.basis ? `${alt.summary}（${alt.basis}）` : alt.summary)));
      panel.append(ul);
    }

    const marks = (work.server.issues ?? []).filter((issue) => issue.bcv === verseOf(clause.id));
    if (marks.length > 0) {
      panel.append(el('h4', '', '本节需要重译（/bible-review）'));
      const ul = el('ul');
      marks.forEach((mark) => ul.append(el('li', 'muted', `[${mark.kind}] ${mark.message}`)));
      panel.append(ul);
    }

    if (text) {
      renderTranslation(chapter, work, clause, text);
    }
    panel.hidden = false;
  }

  function renderTranslation(chapter: number, work: Work, clause: ClauseEntity, text: ClauseText): void {
    panel.append(el('h4', '', '译文'));
    if (text.translationSpan === 0) {
      panel.append(el('p', 'muted', '这一句的译文并在前一行里。'));
      return;
    }
    const value = segmentsText(text.formatted);
    panel.append(el('p', '', value));
    const reason = segmentsNote(text.formatted);
    if (reason) {
      panel.append(el('p', 'muted', `主译取舍：${reason}`));
    }
    for (const alt of text.alternatives) {
      const line = el('div', 'alt-line');
      line.append(el('span', 'alt-kind', KIND_LABELS[alt.kind] ?? alt.kind), document.createTextNode(` ${alt.text}`));
      panel.append(line);
    }
    const key = clause.id;
    renderRenderings(chapter, work, key, text);
    const actions = el('div', 'actions');
    const rows = work.texts.filter((item) => item.bcv === text.bcv).sort((a, b) => a.sub.localeCompare(b.sub));
    const index = rows.indexOf(text);
    const merge = el('button', '', '与下一行译文合并');
    merge.disabled = !rows[index + text.translationSpan];
    merge.addEventListener('click', () => editTexts(chapter, (texts) => mergeTranslationWithNext(texts, key)));
    actions.append(merge);
    panel.append(actions);
    if (text.translationSpan > 1) {
      const last = rows[index + text.translationSpan - 1];
      const box = el('div', 'edit-form');
      const kept = el('textarea');
      kept.value = value;
      const detached = el('textarea');
      detached.placeholder = `${verseLabel(`${last.bcv}${last.sub}`)} 单独一行的译文`;
      const label = (caption: string, input: HTMLElement) => {
        const row = el('label', 'field');
        row.append(el('span', '', caption), input);
        box.append(row);
      };
      label('留在本行', kept);
      label(`拆出 ${verseLabel(`${last.bcv}${last.sub}`)}`, detached);
      const split = el('button', '', '拆开译文');
      split.addEventListener('click', () => {
        if (!detached.value.trim()) {
          status('先填拆出那一句的译文', 'error');
          return;
        }
        editTexts(chapter, (texts) => splitTranslation(texts, work.clauses, key, kept.value, detached.value));
      });
      box.append(split);
      panel.append(box);
    }
  }

  /** 译法对照表：note 失焦即保存；「不译」把译词设为 ∅（须有 note）；「删除」去掉这条。 */
  function renderRenderings(chapter: number, work: Work, key: string, text: ClauseText): void {
    if (text.renderings.length === 0) {
      return;
    }
    panel.append(el('h4', '', '译法对照'));
    const table = el('table', 'renderings');
    for (const rendering of text.renderings) {
      const row = el('tr');
      const note = el('input');
      note.value = rendering.note ?? '';
      note.placeholder = 'note';
      note.addEventListener('change', () => editTexts(chapter, (texts) => updateRendering(texts, key, rendering.tokens, { note: note.value.trim() })));
      const untranslated = el('button', '', '不译');
      untranslated.disabled = rendering.zh === '∅';
      untranslated.addEventListener('click', () => {
        if (!note.value.trim()) {
          status('标为不译要先在 note 里写理由', 'error');
          note.focus();
          return;
        }
        editTexts(chapter, (texts) => updateRendering(texts, key, rendering.tokens, { zh: '∅', note: note.value.trim() }));
      });
      const remove = el('button', '', '删除');
      remove.addEventListener('click', () => editTexts(chapter, (texts) => updateRendering(texts, key, rendering.tokens, null)));
      const tools = el('td');
      tools.append(untranslated, remove);
      const noteCell = el('td');
      noteCell.append(note);
      row.append(el('td', 'orig', surfaceOf(work, rendering.tokens)), el('td', '', rendering.zh), noteCell, tools);
      table.append(row);
    }
    panel.append(table);
  }

  document.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) {
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      void (event.shiftKey ? history(redoStack, undoStack, 'after') : history(undoStack, redoStack, 'before'));
    } else if (event.key === 'Escape') {
      setMode('select');
    }
  });

  setMode('select');
  render();
}
