/**
 * 结构图的数据：子句框（层级、成分块、挂接目标）、逐词信息、词典、自动要点。
 *
 * 结构一律以工作目录里的子句分析为准（clause_entities.json：切分、parentId、modifies、主语、谓语），
 * 不取 Macula。bible-diagram 写入的说明（diagram.json）只补子句功能、连线标签、大意与要点。
 * 纯函数 buildDiagram 便于测试；loadDiagram 负责读库与工作文件。
 */
import type { BibleDb, Token, VariantToken } from './db.js';
import { parseTokenRange } from './ids.js';
import { chapterFromBcv, parseClauseId, toBcv, type ScriptureRange } from './ref.js';
import { LITERALNESS_LEVELS, type ClauseEntity, type ClauseText, type DiagramNote } from './schemas.js';
import { clauseNote, parseFormatted, plainText } from './segments.js';
import type { WorkFileStore } from './store.js';

export type DiagramWord = {
  id: string;
  bcv: number;
  text: string;
  after: string;
  lemma: string;
  translit: string;
  strong: string;
  morph: string;
  morphExp: string | null;
  glossEn: string;
  glossZh: string | null;
  sense: string | null;
  /** 译文里这个词的译法（rendering）。 */
  rendering: string | null;
  /** 异文、读型、NA28 双括号等提示。 */
  variant: string | null;
};

/** 成分块：主语、谓语取自分析；句首连接词按词法认出；其余相邻的词合成一块，不标角色。 */
export type DiagramChip = { role: 's' | 'v' | 'conj' | null; wordIds: string[] };

export type DiagramRecord = { tag: string; text: string };

export type DiagramClause = {
  id: string;
  /** 范围内的母句；母句不在范围内时为 null（作为一棵树的根）。 */
  parentId: string | null;
  label: string;
  link: string | null;
  gist: string;
  status: ClauseEntity['status'];
  chips: DiagramChip[];
  /** 连线起点（本句首词）与终点（母句中被修饰的词）。 */
  fromWordId: string;
  targetWordId: string | null;
  /** 是否有 bible-diagram 写的说明（没有时功能、连线、大意用默认值）。 */
  annotated: boolean;
  /** bible-diagram 写的要点。 */
  points: string[];
  /** 分析与译文里已有的备注、其他读法、异文。 */
  records: DiagramRecord[];
};

export type DiagramVerse = { bcv: number; verse: number; wordIds: string[]; translation: string };

export type DiagramLexiconEntry = { source: string; lemma: string; gloss: string; definition: string };

export type DiagramData = {
  title: string;
  isOT: boolean;
  /** 译文档位，如「第 3 档「平衡」」；没有译文时为 null。 */
  literalness: string | null;
  verses: DiagramVerse[];
  words: Record<string, DiagramWord>;
  clauses: DiagramClause[];
  lexicon: Record<string, DiagramLexiconEntry[]>;
};

export type DiagramInput = {
  title: string;
  isOT: boolean;
  clauses: ClauseEntity[];
  texts: ClauseText[];
  tokens: Token[];
  variants: VariantToken[];
  notes: DiagramNote[];
  morphExpansion: (code: string) => string | null;
};

const KIND_ZH: Record<string, string> = { textual: '异文', punctuation: '断句', syntax: '句法', lexical: '词义', other: '其他' };

/** 新约主干是 NA28 的词；这些版本没有这个词时提示（多为异文替换或省略）。 */
const NT_EDITIONS = ['NA27', 'SBL', 'WH', 'Treg', 'TR', 'Byz'];

/** 句首连接词：连词（希伯来含连续式的 וְ）、条件词、希伯来关系词；介词 + 关系代名词（ἄχρι οὗ、ἐν ᾧ）也算。 */
function isConnector(token: Token, next: Token | undefined, isOT: boolean): boolean {
  if (isOT) {
    return /^[HA](C|c|Tr|Tc)$/.test(token.morph);
  }
  if (token.morph === 'CONJ' || token.morph === 'COND') {
    return true;
  }
  return token.morph === 'PREP' && next !== undefined && next.morph.startsWith('R-');
}

/** 名词性的词：被它修饰的从句是定语。 */
function isNominal(token: Token, isOT: boolean): boolean {
  return isOT ? /^[HA](N|A|P|S)/.test(token.morph) : /^[NARPDSFKQX]-/.test(token.morph);
}

function idsInRange(range: string | null, words: Token[]): Set<string> {
  if (!range) {
    return new Set();
  }
  const [first, last] = parseTokenRange(range);
  return new Set(words.filter((word) => word.id >= first && word.id <= last).map((word) => word.id));
}

/** 影响翻译的异文：STEPBible 的异文说明（只取大写标记的有意义异文，拼写差异不算）；新约另看哪些版本没有这个词。 */
function variantOf(token: Token, isOT: boolean): string | null {
  const parts: string[] = [];
  if (isOT && token.textType !== 'L') {
    parts.push(`文本类型 ${token.textType}`);
  }
  if (token.significant && token.variantNote) {
    parts.push(token.variantNote);
  } else if (!isOT) {
    const editions = token.editions?.split('+') ?? [];
    const missing = NT_EDITIONS.filter((edition) => !editions.includes(edition));
    if (missing.length > 0) {
      parts.push(`${missing.join('、')} 此处无此词`);
    }
  }
  if (token.naBracket) {
    parts.push('在 NA28 双括号 [[ ]] 内');
  }
  return parts.length > 0 ? parts.join('；') : null;
}

function chipsOf(clause: ClauseEntity, words: Token[], isOT: boolean): DiagramChip[] {
  const subject = idsInRange(clause.subjectRange, words);
  const verb = idsInRange(clause.verbRange, words);
  let leading = true;
  const chips: DiagramChip[] = [];
  words.forEach((word, index) => {
    const afterPreposition = !isOT && index > 0 && words[index - 1].morph === 'PREP' && word.morph.startsWith('R-');
    leading = leading && (isConnector(word, words[index + 1], isOT) || afterPreposition);
    const role = subject.has(word.id) ? 's' : verb.has(word.id) ? 'v' : leading ? 'conj' : null;
    const last = chips.at(-1);
    if (last && last.role === role) {
      last.wordIds.push(word.id);
    } else {
      chips.push({ role, wordIds: [word.id] });
    }
  });
  return chips;
}

export function buildDiagram(input: DiagramInput): Omit<DiagramData, 'lexicon'> {
  const { isOT, tokens } = input;
  const textByKey = new Map(input.texts.map((text) => [`${text.bcv}${text.sub}`, text]));
  const tokenById = new Map(tokens.map((token) => [token.id, token]));

  const renderings = new Map<string, string>();
  for (const text of input.texts) {
    for (const rendering of text.renderings) {
      const [first, last] = parseTokenRange(rendering.tokens);
      for (const token of tokens) {
        if (token.id >= first && token.id <= last) {
          renderings.set(token.id, renderings.has(token.id) ? `${renderings.get(token.id)}；${rendering.zh}` : rendering.zh);
        }
      }
    }
  }

  const words: Record<string, DiagramWord> = {};
  for (const token of tokens) {
    words[token.id] = {
      id: token.id, bcv: token.bcv, text: token.surface, after: token.after, lemma: token.lemma, translit: token.translit,
      strong: token.strong, morph: token.morph, morphExp: input.morphExpansion(token.morph), glossEn: token.glossEn,
      glossZh: token.glossZh, sense: token.sense, rendering: renderings.get(token.id) ?? null, variant: variantOf(token, isOT),
    };
  }

  const clauseIds = new Set(input.clauses.map((clause) => clause.id));
  const wordsOf = new Map(input.clauses.map((clause) => [
    clause.id,
    tokens.filter((token) => token.id >= clause.firstWordId && token.id <= clause.lastWordId),
  ]));
  // 子句重新切分后，首末词对不上的说明作废
  const noteOf = new Map(input.notes
    .filter((note) => input.clauses.some((clause) => clause.id === note.clauseId && clause.firstWordId === note.firstWordId && clause.lastWordId === note.lastWordId))
    .map((note) => [note.clauseId, note]));

  const clauses = input.clauses.map((clause): DiagramClause => {
    const own = wordsOf.get(clause.id) ?? [];
    const parentId = clause.parentId && clauseIds.has(clause.parentId) ? clause.parentId : null;
    const parent = parentId ? input.clauses.find((item) => item.id === parentId) : undefined;
    const parentWords = parent ? wordsOf.get(parent.id) ?? [] : [];
    let targetWordId: string | null = null;
    if (parent) {
      targetWordId = clause.modifies && parentWords.some((word) => word.id === clause.modifies)
        ? clause.modifies
        : [...idsInRange(parent.verbRange, parentWords)][0] ?? parent.firstWordId;
    }
    const target = targetWordId ? tokenById.get(targetWordId) : undefined;
    const note = noteOf.get(clause.id);

    const text = textByKey.get(clause.id);
    const segments = text ? parseFormatted(text.formatted) : [];
    let gist = note?.gist ?? '';
    if (!gist && text) {
      gist = text.translationSpan === 0 ? '（译文并入前句）' : plainText(segments).replace(/\s*\n\s*/g, '') + (text.translationSpan > 1 ? '（合译）' : '');
    }

    const records: DiagramRecord[] = [];
    if (clause.note) {
      records.push({ tag: '分析', text: clause.note });
    }
    for (const alternative of clause.alternatives) {
      records.push({ tag: '另一种分析', text: alternative.basis ? `${alternative.summary}（${alternative.basis}）` : alternative.summary });
    }
    const reason = clauseNote(segments);
    if (reason) {
      records.push({ tag: '译注', text: reason });
    }
    for (const alternative of text?.alternatives ?? []) {
      records.push({ tag: `其他译法·${KIND_ZH[alternative.kind] ?? alternative.kind}`, text: `${alternative.text.replace(/\n/g, '')}（${alternative.basis}）` });
    }
    for (const word of own) {
      const variant = words[word.id]?.variant;
      if (variant) {
        records.push({ tag: '异文', text: `${word.surface}：${variant}` });
      }
    }
    for (const variant of input.variants) {
      if (variant.posId >= clause.firstWordId && variant.posId <= clause.lastWordId) {
        records.push({ tag: '异文', text: `${variant.surface}（${variant.editions ?? variant.textType}，${variant.glossEn}）` });
      }
    }

    const targetZh = target ? words[target.id]?.rendering ?? target.glossZh ?? target.surface : null;
    return {
      id: clause.id,
      parentId,
      label: note?.label ?? (clause.parentId === null ? '主句' : target && isNominal(target, isOT) ? '定语从句' : '从句'),
      link: note?.link ?? (targetZh ? `修饰“${targetZh}”` : null),
      gist,
      status: clause.status,
      chips: chipsOf(clause, own, isOT),
      fromWordId: clause.firstWordId,
      targetWordId,
      annotated: note !== undefined,
      points: note?.notes ?? [],
      records,
    };
  });

  const verses: DiagramVerse[] = [];
  for (const token of tokens) {
    let verse = verses.at(-1);
    if (!verse || verse.bcv !== token.bcv) {
      const texts = input.texts.filter((text) => text.bcv === token.bcv && text.translationSpan > 0).sort((a, b) => a.sub.localeCompare(b.sub));
      verse = { bcv: token.bcv, verse: token.bcv % 1000, wordIds: [], translation: texts.map((text) => plainText(parseFormatted(text.formatted))).join('').replace(/\s*\n\s*/g, '') };
      verses.push(verse);
    }
    verse.wordIds.push(token.id);
  }

  const level = input.texts.find((text) => text.translationSpan > 0)?.literalness;
  const literalness = input.texts.some((text) => text.translationSpan > 0)
    ? `第 ${level ?? 2} 档「${LITERALNESS_LEVELS[(level ?? 2) as keyof typeof LITERALNESS_LEVELS].name}」`
    : null;

  return { title: input.title, isOT, literalness, verses, words, clauses };
}

/** 经文范围的简写：`7`、`7:17`、`7:17-18`、`7:17-8:3`。 */
export function rangeLabel(range: ScriptureRange): string {
  const startChapter = chapterFromBcv(range.startBcv);
  const endChapter = chapterFromBcv(range.endBcv);
  const startVerse = range.startBcv % 1000;
  const endVerse = range.endBcv % 1000;
  if (endVerse === 999 && startVerse <= 1) {
    return startChapter === endChapter ? `${startChapter}` : `${startChapter}-${endChapter}`;
  }
  if (startChapter === endChapter) {
    return startVerse === endVerse ? `${startChapter}:${startVerse}` : `${startChapter}:${startVerse}-${endVerse}`;
  }
  return `${startChapter}:${startVerse}-${endChapter}:${endVerse}`;
}

/** 词典释义很长时截断，单个页面不至于过大。 */
const DEFINITION_LIMIT = 3000;

export async function loadDiagram(db: BibleDb, store: WorkFileStore, range: ScriptureRange): Promise<DiagramData> {
  const clauses: ClauseEntity[] = [];
  const texts: ClauseText[] = [];
  const notes: DiagramNote[] = [];
  for (let chapter = chapterFromBcv(range.startBcv); chapter <= chapterFromBcv(range.endBcv); chapter += 1) {
    const startBcv = Math.max(toBcv(range.bookId, chapter, 0), range.startBcv);
    const endBcv = Math.min(toBcv(range.bookId, chapter, 999), range.endBcv);
    const inRange = (bcv: number) => bcv >= startBcv && bcv <= endBcv;
    clauses.push(...(await store.readClauseEntities(range.bookName, chapter)).filter((clause) => inRange(parseClauseId(clause.id).bcv)));
    texts.push(...(await store.readClauseTexts(range.bookName, chapter)).filter((text) => inRange(text.bcv)));
    notes.push(...await store.readDiagramNotes(range.bookName, chapter));
  }
  const tokens = db.tokensInRange(range.startBcv, range.endBcv);
  const data = buildDiagram({
    title: `${range.bookName} ${rangeLabel(range)}`,
    isOT: range.isOT,
    clauses,
    texts,
    tokens,
    variants: db.variantsInRange(range.startBcv, range.endBcv),
    notes,
    morphExpansion: (code) => db.morphExpansion(code),
  });
  const lexicon: Record<string, DiagramLexiconEntry[]> = {};
  for (const strong of new Set(tokens.map((token) => token.strong))) {
    const entries = db.lookupLexicon(strong);
    // 每个来源取第一条：UBS 中文词典在前，其次 STEPBible 简明词典
    const bySource = new Map<string, DiagramLexiconEntry>();
    for (const entry of entries) {
      if (!bySource.has(entry.source)) {
        bySource.set(entry.source, {
          source: entry.source, lemma: entry.lemma, gloss: entry.gloss,
          definition: entry.definition.length > DEFINITION_LIMIT ? `${entry.definition.slice(0, DEFINITION_LIMIT)}…` : entry.definition,
        });
      }
    }
    lexicon[strong] = [...bySource.values()];
  }
  return { ...data, lexicon };
}
