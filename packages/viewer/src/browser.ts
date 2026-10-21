/**
 * 浏览器端缩进视图（只读）。版式：节号 | 原文（树形前缀）| 直译（按 span 设置 rowSpan），
 * 段落标题独占一行。缩进用 canvas 按实际字体测量。
 */
import { buildChapterTree, continuationPrefix, flipTreePrefix, type Measure } from '@bs/clause-tree';

type Alternative = { summary: string; basis?: string; parentId?: string | null; modifies?: string | null };
type Clause = {
  id: string; type: string; parentId: string | null; modifies: string | null;
  firstWordId: string; lastWordId: string; subjectRange: string | null; br: string | null; alone: boolean;
  status: string; alternatives: Alternative[]; seedDiff: string | null; sources: string[]; note: string;
};
type Rendering = { tokens: string; zh: string; note?: string };
type TranslationAlternative = { text: string; kind: string; basis: string };
type Text = {
  bcv: number; sub: string; translationSpan: number; formatted: string; paraTitle: string | null;
  renderings: Rendering[]; alternatives?: TranslationAlternative[]; sources: string[];
};
type Word = { id: string; text: string; after: string; gloss: string; zh: string | null; morph: string; naBracket: boolean };
type Chapter = { bookName: string; chapter: number; isOT: boolean; clauses: Clause[]; texts: Text[]; words: Word[] };

declare global {
  interface Window { __BIBLESKILL__: { title: string; chapters: Chapter[] } }
}

const ORIGINAL_FONT = '"SBL BibLit", "SBL Hebrew", "SBL Greek", "Noto Serif Hebrew", "Noto Serif", serif';
const ORIGINAL_SIZE = 20;
const PREFIX_FONT = '"Times New Roman", Times, serif';
const PREFIX_SIZE = 25;

const canvas = document.createElement('canvas');
const context = canvas.getContext('2d')!;
const measure: Measure = (text, font) => {
  context.font = font === 'prefix' ? `${PREFIX_SIZE}pt ${PREFIX_FONT}` : `${ORIGINAL_SIZE}pt ${ORIGINAL_FONT}`;
  return context.measureText(text).width;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function segmentsText(json: string): string {
  return (JSON.parse(json) as Array<{ text: string }>).map((segment) => segment.text).join('');
}

function segmentsNote(json: string): string {
  return (JSON.parse(json) as Array<{ note?: string }>).map((segment) => segment.note ?? '').filter(Boolean).join(' ');
}

const KIND_LABELS: Record<string, string> = { textual: '异文', punctuation: '断句', syntax: '句法', lexical: '词义', other: '其他' };

function verseLabel(clauseId: string): string {
  const match = clauseId.match(/^\d+?(\d{3})([a-z]+)$/);
  return match ? `${Number(match[1])}${match[2]}` : clauseId;
}

function showDetails(panel: HTMLElement, clause: Clause, text: Text | undefined, words: Map<string, Word>): void {
  panel.replaceChildren();
  panel.append(el('h3', '', `${verseLabel(clause.id)} · ${clause.type}`));
  const rows: Array<[string, string]> = [
    ['状态', clause.status],
    ['父句', clause.parentId ? verseLabel(clause.parentId) : '—'],
    ['来源', [...clause.sources, ...(text?.sources ?? [])].filter((v, i, a) => a.indexOf(v) === i).join('、') || '—'],
  ];
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
    clause.alternatives.forEach((alt) => ul.append(el('li', '', alt.basis ? `${alt.summary}（${alt.basis}）` : alt.summary)));
    panel.append(ul);
  }
  const translationNote = text && text.translationSpan > 0 ? segmentsNote(text.formatted) : '';
  if (translationNote) {
    panel.append(el('h4', '', '主译取舍'), el('p', '', translationNote));
  }
  if (text?.alternatives && text.alternatives.length > 0) {
    panel.append(el('h4', '', '其他译法'));
    const ul = el('ul', 'alternatives');
    for (const alt of text.alternatives) {
      const li = el('li');
      li.append(el('span', 'alt-kind', KIND_LABELS[alt.kind] ?? alt.kind), el('span', '', ` ${alt.text}`), el('div', 'muted', alt.basis));
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

function renderChapter(chapter: Chapter, panel: HTMLElement): HTMLElement {
  const section = el('section', 'chapter');
  section.append(el('h2', '', `${chapter.bookName} ${chapter.chapter} 章`));
  if (chapter.clauses.length === 0) {
    section.append(el('p', 'muted', '范围内还没有子句分析。'));
    return section;
  }
  const textByKey = new Map(chapter.texts.map((text) => [`${text.bcv}${text.sub}`, text]));
  const paragraphStarts = new Set(chapter.texts.filter((text) => text.paraTitle !== null).map((text) => `${text.bcv}${text.sub}`));
  const wordById = new Map(chapter.words.map((word) => [word.id, word]));
  const tree = buildChapterTree(chapter.clauses, chapter.words, measure, paragraphStarts);
  const orient = (prefix: string) => (chapter.isOT ? prefix : flipTreePrefix(prefix));

  const table = el('table', `clauses ${chapter.isOT ? 'ot' : 'nt'}`);
  tree.nodes.forEach((node, index) => {
    const clause = chapter.clauses[index];
    const text = textByKey.get(clause.id);
    if (text?.paraTitle) {
      const title = segmentsText(text.paraTitle);
      const row = el('tr', 'para-title');
      const cell = el('td', '', title);
      cell.colSpan = 3;
      row.append(cell);
      if (title) table.append(row);
    }
    const row = el('tr', `clause status-${clause.status}`);
    row.append(el('td', 'verse', verseLabel(clause.id)));
    const original = el('td', 'orig');
    node.lines.forEach((line, lineIndex) => {
      const div = el('div', 'orig-line');
      const raw = tree.prefixes[index];
      div.append(el('span', 'tree-prefix', orient(lineIndex === 0 ? raw : continuationPrefix(raw))));
      for (const { word, shadow } of line.words) {
        const full = wordById.get(word.id);
        const span = el('span', ['word', shadow ? 'shadow' : '', full?.naBracket ? 'na-bracket' : ''].filter(Boolean).join(' '), word.text);
        span.title = [full?.gloss, full?.zh, full?.morph, full?.naBracket ? 'NA28 [[ ]] 后加经文' : ''].filter(Boolean).join(' · ');
        div.append(span, document.createTextNode(word.after));
      }
      original.append(div);
    });
    row.append(original);
    if (!text) {
      row.append(el('td', 'zh muted', ''));
    } else if (text.translationSpan > 0) {
      const cell = el('td', 'zh', segmentsText(text.formatted));
      for (const alt of text.alternatives ?? []) {
        const line = el('div', 'alt-line');
        line.append(el('span', 'alt-kind', KIND_LABELS[alt.kind] ?? alt.kind), document.createTextNode(` ${alt.text}`));
        cell.append(line);
      }
      cell.rowSpan = text.translationSpan;
      row.append(cell);
    }
    row.addEventListener('click', () => {
      table.querySelectorAll('tr.selected').forEach((selected) => selected.classList.remove('selected'));
      row.classList.add('selected');
      showDetails(panel, clause, text, wordById);
    });
    table.append(row);
  });
  section.append(table);
  if (tree.orphans.length > 0) {
    section.append(el('p', 'muted', `parentId 无法解析或成环，已按独立子句显示：${tree.orphans.map(verseLabel).join('、')}`));
  }
  return section;
}

async function main(): Promise<void> {
  const data = window.__BIBLESKILL__;
  await document.fonts.ready;
  const root = document.getElementById('app')!;
  const panel = document.getElementById('details')!;
  root.replaceChildren(...data.chapters.map((chapter) => renderChapter(chapter, panel)));
}

void main();
