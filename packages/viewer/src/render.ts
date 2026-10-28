/**
 * 浏览器端缩进视图的渲染。版式：节号 | 原文（树形前缀）| 译文（按 span 设置 rowSpan），
 * 段落标题独占一行。缩进用 canvas 按实际字体测量。
 * 译文按 renderings 切成片段，悬停原文词或译文片段时双向高亮对应的另一侧（词级对齐）；补词段带括号、灰色显示。
 */
import type { ChapterView, ClauseEntity, ClauseText, ViewWord } from '@bs/core';
import { alignmentSpans } from '@bs/core/align';
import { LOGIC_LABELS } from '@bs/core/logic';
import { addedRanges, clauseNote, parseFormatted, plainText, segmentsMarkup } from '@bs/core/segments';
import { buildChapterTree, continuationPrefix, flipTreePrefix, type Measure } from '@bs/clause-tree';

type Clause = ClauseEntity;
type Text = ClauseText;
type Word = ViewWord;
export type ReviewMark = { bcv: number; kind: string; message: string };
/** issues 只在可编辑模式下有：本章审校问题，按节标在节号上。 */
export type Chapter = ChapterView & { issues?: ReviewMark[] };


const ORIGINAL_FONT = '"SBL BibLit", "SBL Hebrew", "SBL Greek", "Noto Serif Hebrew", "Noto Serif", serif';
const ORIGINAL_SIZE = 20;
const PREFIX_FONT = '"Times New Roman", Times, serif';
const PREFIX_SIZE = 25;

export type { ClauseEntity, ClauseText };

const canvas = document.createElement('canvas');
const context = canvas.getContext('2d')!;
const measure: Measure = (text, font) => {
  context.font = font === 'prefix' ? `${PREFIX_SIZE}pt ${PREFIX_FONT}` : `${ORIGINAL_SIZE}pt ${ORIGINAL_FONT}`;
  return context.measureText(text).width;
};

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 纯文本（补词不带括号），对齐按它算。 */
export function segmentsText(json: string): string {
  return plainText(parseFormatted(json));
}

/** 标记文本（补词带 [ ]），显示与编辑用。 */
export function segmentsMarkupText(json: string): string {
  return segmentsMarkup(parseFormatted(json));
}

/** 主译的取舍理由（补词说明另列）。 */
export function segmentsNote(json: string): string {
  return clauseNote(parseFormatted(json));
}

/** 补词说明：「补词：说明」。 */
export function suppliedLines(json: string): string[] {
  return addedRanges(parseFormatted(json)).filter((range) => range.note).map((range) => `[${range.text}]：${range.note}`);
}

export const KIND_LABELS: Record<string, string> = { textual: '异文', punctuation: '断句', syntax: '句法', lexical: '词义', other: '其他' };

/** 可选译法的标签：类型，属关联读法组时加上组号，如「句法 · 读法 R1」。 */
export function altLabel(alt: { kind: string; reading?: string }): string {
  const kind = KIND_LABELS[alt.kind] ?? alt.kind;
  return alt.reading ? `${kind} · 读法 ${alt.reading}` : kind;
}

export function verseLabel(clauseId: string): string {
  const match = clauseId.match(/^\d+?(\d{3})([a-z]+)$/);
  return match ? `${Number(match[1])}${match[2]}` : clauseId;
}

export function showDetails(panel: HTMLElement, clause: Clause, text: Text | undefined, words: Map<string, Word>): void {
  panel.replaceChildren();
  panel.append(el('h3', '', clause.type ? `${verseLabel(clause.id)} · ${clause.type}` : verseLabel(clause.id)));
  const rows: Array<[string, string]> = [
    ['状态', clause.status],
    ['父句', clause.parentId ? verseLabel(clause.parentId) : '—'],
    ['来源', [...clause.sources, ...(text?.sources ?? [])].filter((v, i, a) => a.indexOf(v) === i).join('、') || '—'],
  ];
  if (clause.logic) rows.push(['逻辑关系', `${LOGIC_LABELS[clause.logic.relation]} → ${clause.logic.target.split('-').map(verseLabel).join('–')}${clause.logic.note ? `（${clause.logic.note}）` : ''}`]);
  if (clause.seedDiff) rows.push(['与 Macula 不同', clause.seedDiff]);
  if (clause.note) rows.push(['说明', clause.note]);
  const list = el('dl');
  for (const [key, value] of rows) {
    list.append(el('dt', '', key), el('dd', '', value));
  }
  panel.append(list);
  if (clause.alternatives.length > 0) {
    panel.append(el('h4', '', '结构上的其他读法'));
    const ul = el('ul');
    clause.alternatives.forEach((alt) => ul.append(el('li', '', `${alt.reading ? `[读法 ${alt.reading}] ` : ''}${alt.basis ? `${alt.summary}（${alt.basis}）` : alt.summary}`)));
    panel.append(ul);
  }
  const translationNote = text && text.translationSpan > 0 ? segmentsNote(text.formatted) : '';
  if (translationNote) {
    panel.append(el('h4', '', '主译取舍'), el('p', '', translationNote));
  }
  const supplied = text && text.translationSpan > 0 ? suppliedLines(text.formatted) : [];
  if (supplied.length > 0) {
    panel.append(el('h4', '', '补词说明'));
    const ul = el('ul');
    supplied.forEach((line) => ul.append(el('li', '', line)));
    panel.append(ul);
  }
  if (text?.alternatives && text.alternatives.length > 0) {
    panel.append(el('h4', '', '其他译法'));
    const ul = el('ul', 'alternatives');
    for (const alt of text.alternatives) {
      const li = el('li');
      li.append(el('span', 'alt-kind', altLabel(alt)), el('span', '', ` ${alt.text}`), el('div', 'muted', alt.basis));
      ul.append(li);
    }
    panel.append(ul);
  }
  if (text && text.renderings.length > 0) {
    panel.append(el('h4', '', '译法对照'));
    const table = el('table', 'renderings');
    for (const rendering of text.renderings) {
      const [first, last] = rendering.tokens.split('-');
      const surface = [...words.values()].filter((w) => w.id >= first && w.id <= (last ?? first)).map((w) => w.text).join(' ');
      const row = el('tr');
      row.append(el('td', 'orig', surface), el('td', '', rendering.zh), el('td', 'muted', rendering.note ?? ''));
      table.append(row);
    }
    panel.append(table);
  }
  panel.hidden = false;
}

export type RenderHooks = {
  /** 点子句行；不给就在详情栏显示只读信息。 */
  onSelect?: (clause: Clause, text: Text | undefined) => void;
  /** 点词；返回 true 表示已处理（不再当作点行）。 */
  onWord?: (wordId: string, clause: Clause) => boolean;
  selectedId?: string | null;
  /** 节号 → 未保存成功时的错误。 */
  errors?: Map<number, string[]>;
};

/** 区间 `首-末` 展开成章内的词 id（词表按 id 有序）。 */
function wordsOfRange(range: string, words: Word[]): string[] {
  const [first, last = first] = range.split('-');
  return words.filter((word) => word.id >= first && word.id <= last).map((word) => word.id);
}

/** 主译文：按对齐切成片段，data-words 记下对应的原文词；补词段包在 .zh-added 里（括号由样式加上）。 */
function translationLine(text: Text, words: Word[]): HTMLElement {
  const main = el('span', 'zh-main');
  const segments = parseFormatted(text.formatted);
  const added = addedRanges(segments);
  const addedAt = (position: number) => added.findIndex((range) => position >= range.start && position < range.end);
  const cuts = new Set(added.flatMap((range) => [range.start, range.end]));
  let offset = 0;
  let group: { index: number; node: HTMLElement } | null = null;
  for (const span of alignmentSpans(plainText(segments), text.renderings)) {
    // 对齐片段在补词边界处再切开
    const points = [0, ...[...cuts].filter((cut) => cut > offset && cut < offset + span.text.length).map((cut) => cut - offset).sort((a, b) => a - b), span.text.length];
    for (let i = 0; i + 1 < points.length; i += 1) {
      const piece = span.text.slice(points[i], points[i + 1]);
      const index = addedAt(offset + points[i]);
      let node: Node;
      if (span.tokens.length === 0) {
        node = document.createTextNode(piece);
      } else {
        const seg = el('span', 'zh-seg', piece);
        seg.dataset.words = [...new Set(span.tokens.flatMap((range) => wordsOfRange(range, words)))].join(' ');
        node = seg;
      }
      if (index < 0) {
        group = null;
        main.append(node);
        continue;
      }
      if (!group || group.index !== index) {
        const wrapper = el('span', 'zh-added');
        if (added[index].note) wrapper.title = added[index].note!;
        group = { index, node: wrapper };
        main.append(wrapper);
      }
      group.node.append(node);
    }
    offset += span.text.length;
  }
  return main;
}

/** 原文词 ↔ 译文片段的悬停高亮：悬停一侧，点亮同一条对照的全部原文词与译文片段。 */
function wireAlignmentHover(table: HTMLElement, groups: Map<string, string[]>): void {
  let lit: Element[] = [];
  const clear = () => {
    lit.forEach((node) => node.classList.remove('aligned'));
    lit = [];
  };
  table.addEventListener('mouseover', (event) => {
    const target = (event.target as Element).closest('.word, .zh-seg');
    clear();
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const seeds = target.classList.contains('word') ? [target.dataset.id!] : (target.dataset.words ?? '').split(' ');
    const ids = new Set(seeds.flatMap((id) => groups.get(id) ?? []));
    if (ids.size === 0) {
      return;
    }
    table.querySelectorAll<HTMLElement>('.word, .zh-seg').forEach((node) => {
      const own = node.classList.contains('word') ? [node.dataset.id!] : (node.dataset.words ?? '').split(' ');
      if (own.some((id) => ids.has(id))) {
        node.classList.add('aligned');
        lit.push(node);
      }
    });
  });
  table.addEventListener('mouseleave', clear);
}

function verseOfClause(clauseId: string): number {
  return Number(clauseId.match(/^(\d+)[a-z]+$/)![1]);
}

export function renderChapter(chapter: Chapter, panel: HTMLElement, hooks: RenderHooks = {}): HTMLElement {
  const section = el('section', 'chapter');
  section.append(el('h2', '', `${chapter.bookName} ${chapter.chapter} 章`));
  if (chapter.clauses.length === 0) {
    section.append(el('p', 'muted', '范围内还没有子句分析。'));
    return section;
  }
  const textByKey = new Map(chapter.texts.map((text) => [`${text.bcv}${text.sub}`, text]));
  const paragraphStarts = new Set(chapter.texts.filter((text) => text.paraTitle !== null).map((text) => `${text.bcv}${text.sub}`));
  const wordById = new Map(chapter.words.map((word) => [word.id, word]));
  // 原文词 → 它所在对照的译词（标在 title 上），以及同一条对照里的全部原文词（悬停时一起高亮）
  const renderingOfWord = new Map<string, string>();
  const groups = new Map<string, string[]>();
  for (const text of chapter.texts) {
    for (const rendering of text.renderings) {
      const ids = wordsOfRange(rendering.tokens, chapter.words);
      const label = rendering.zh === '∅' ? `不译${rendering.note ? `：${rendering.note}` : ''}` : `→ ${rendering.zh}`;
      for (const id of ids) {
        renderingOfWord.set(id, label);
        groups.set(id, [...new Set([...(groups.get(id) ?? []), ...ids])]);
      }
    }
  }
  const tree = buildChapterTree(chapter.clauses, chapter.words, measure, paragraphStarts);
  const orient = (prefix: string) => (chapter.isOT ? prefix : flipTreePrefix(prefix));

  const issuesByVerse = new Map<number, ReviewMark[]>();
  for (const issue of chapter.issues ?? []) {
    issuesByVerse.set(issue.bcv, [...(issuesByVerse.get(issue.bcv) ?? []), issue]);
  }
  const table = el('table', `clauses ${chapter.isOT ? 'ot' : 'nt'}`);
  tree.nodes.forEach((node, index) => {
    const clause = chapter.clauses[index];
    const text = textByKey.get(clause.id);
    const bcv = verseOfClause(clause.id);
    const errors = hooks.errors?.get(bcv);
    if (text?.paraTitle) {
      const title = segmentsText(text.paraTitle);
      const row = el('tr', 'para-title');
      const cell = el('td', '', title);
      cell.colSpan = 3;
      row.append(cell);
      if (title) table.append(row);
    }
    const row = el('tr', `clause status-${clause.status}${hooks.selectedId === clause.id ? ' selected' : ''}`);
    row.dataset.clause = clause.id;
    const verseCell = el('td', 'verse', verseLabel(clause.id));
    const marks = issuesByVerse.get(bcv);
    if (errors) {
      verseCell.classList.add('unsaved');
      verseCell.title = `未保存：\n${errors.join('\n')}`;
    } else if (marks) {
      verseCell.classList.add('needs-retranslate');
      verseCell.title = `需要重译（/bible-review）：\n${marks.map((mark) => `[${mark.kind}] ${mark.message}`).join('\n')}`;
    }
    row.append(verseCell);
    const original = el('td', 'orig');
    node.lines.forEach((line, lineIndex) => {
      const div = el('div', 'orig-line');
      const raw = tree.prefixes[index];
      div.append(el('span', 'tree-prefix', orient(lineIndex === 0 ? raw : continuationPrefix(raw))));
      for (const { word, shadow } of line.words) {
        const full = wordById.get(word.id);
        const span = el('span', ['word', shadow ? 'shadow' : '', full?.naBracket ? 'na-bracket' : ''].filter(Boolean).join(' '), word.text);
        span.dataset.id = word.id;
        if (hooks.onWord) {
          span.addEventListener('click', (event) => {
            if (hooks.onWord!(word.id, clause)) {
              event.stopPropagation();
            }
          });
        }
        span.title = [full?.gloss, full?.zh, full?.morph, full?.naBracket ? 'NA28 [[ ]] 后加经文' : '', renderingOfWord.get(word.id)].filter(Boolean).join(' · ');
        div.append(span, document.createTextNode(word.after));
      }
      original.append(div);
    });
    row.append(original);
    if (!text) {
      row.append(el('td', 'zh muted', ''));
    } else if (text.translationSpan > 0) {
      const cell = el('td', 'zh');
      cell.append(translationLine(text, chapter.words));
      for (const alt of text.alternatives ?? []) {
        const line = el('div', 'alt-line');
        line.append(el('span', 'alt-kind', altLabel(alt)), document.createTextNode(` ${alt.text}`));
        cell.append(line);
      }
      cell.rowSpan = text.translationSpan;
      row.append(cell);
    }
    row.addEventListener('click', () => {
      table.querySelectorAll('tr.selected').forEach((selected) => selected.classList.remove('selected'));
      row.classList.add('selected');
      if (hooks.onSelect) {
        hooks.onSelect(clause, text);
      } else {
        showDetails(panel, clause, text, wordById);
      }
    });
    table.append(row);
    const next = chapter.clauses[index + 1];
    if (errors && (!next || verseOfClause(next.id) !== bcv)) {
      const errorRow = el('tr', 'save-error');
      const cell = el('td', '', `${verseLabel(clause.id).replace(/[a-z]+$/, '')} 节未保存：${errors.join('；')}`);
      cell.colSpan = 3;
      errorRow.append(cell);
      table.append(errorRow);
    }
  });
  wireAlignmentHover(table, groups);
  section.append(table);
  if (tree.orphans.length > 0) {
    section.append(el('p', 'muted', `parentId 无法解析或成环，已按独立子句显示：${tree.orphans.map(verseLabel).join('、')}`));
  }
  return section;
}
