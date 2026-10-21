/**
 * 从修改历史学习：汇总人工改动（revision_report），按术语偏好批量替换译词（replace_rendering），导入外部历史。
 *
 * 历史行见 core/schemas.ts HistoryEntrySchema。工具写入的历史两边都是 ClauseText，带 renderings，
 * 可以精确到 senseKey 的「从 A 改成 B」；外部导入的只有整节文本，按字符 diff 归并成替换片段，
 * 由模型结合词流判断属于哪个原文词。
 */
import {
  bookFromBcv,
  bookById,
  chapterFromBcv,
  parseSegments,
  resolveAlignment,
  segmentsText,
  formattedMarkup,
  strongMatches,
  type BibleDb,
  type ClauseText,
  type HistoryEntry,
  type HistoryOrigin,
  type Token,
  type TranslationSegment,
  type WorkFileStore,
} from '@bs/core';
import { listChapterDirs, singleContentToken, tokenSenseKey } from './consistency.js';

export type ChapterRef = { bookName: string; chapter: number };

export type HistoryScope = { chapters: ChapterRef[]; keep: (bcv: number) => boolean };

/** 默认只学人工改动：AI 的初稿与重提、批量替换都不算。 */
export const LEARN_ORIGINS: HistoryOrigin[] = ['human', 'import'];

function verseLabel(bcv: number): string {
  return `${chapterFromBcv(bcv)}:${bcv % 1000}`;
}

function refLabel(bookName: string, bcv: number, sub = ''): string {
  return `${bookName} ${verseLabel(bcv)}${sub}`;
}

// ---------------------------------------------------------------- 字符 diff

export type Hunk = { from: string; to: string; context: string };

/** 两段改动之间只隔这么多个相同的字时合成一段（「事奉→服事」按字对齐会被「事」拆开）。 */
const MERGE_GAP = 1;

/**
 * 按字符做最长公共子序列，相邻的增删合成一段。
 * context 为改后文本里这一段前后各两个字，改动处用【改前→改后】标出。
 */
export function diffHunks(before: string, after: string): Hunk[] {
  const a = [...before];
  const b = [...after];
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  // 改动区间：before 的 [i0, i1) 换成 after 的 [j0, j1)
  const spans: Array<[number, number, number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    const [i0, j0] = [i, j];
    while ((i < a.length || j < b.length) && !(i < a.length && j < b.length && a[i] === b[j])) {
      if (j < b.length && (i >= a.length || table[i][j + 1] >= table[i + 1][j])) {
        j += 1;
      } else {
        i += 1;
      }
    }
    const last = spans.at(-1);
    if (last && i0 - last[1] <= MERGE_GAP) {
      last[1] = i;
      last[3] = j;
    } else {
      spans.push([i0, i, j0, j]);
    }
  }
  return spans.map(([i0, i1, j0, j1]) => {
    const [from, to] = [a.slice(i0, i1).join(''), b.slice(j0, j1).join('')];
    return { from, to, context: `${b.slice(Math.max(0, j0 - 2), j0).join('')}【${from}→${to}】${b.slice(j1, j1 + 2).join('')}` };
  });
}

const PUNCTUATION = /^[\s\p{P}\p{S}]*$/u;

// ---------------------------------------------------------------- 报告

type ClauseChange = { ref: string; bcv: number; before: HistoryEntry['before']; after: HistoryEntry['after'] };

/** 每个子句（导入的历史按整节）取所选来源里最早的改前与最晚的改后，中间的反复修改不计。 */
async function collectChanges(store: WorkFileStore, scope: HistoryScope, origins: HistoryOrigin[]): Promise<ClauseChange[]> {
  const changes: ClauseChange[] = [];
  for (const { bookName, chapter } of scope.chapters) {
    const byClause = new Map<string, ClauseChange>();
    for (const entry of await store.readHistory(bookName, chapter)) {
      if (!origins.includes(entry.origin) || !scope.keep(entry.bcv)) {
        continue;
      }
      const key = `${entry.bcv}${entry.sub}`;
      const existing = byClause.get(key);
      if (existing) {
        existing.after = entry.after;
      } else {
        byClause.set(key, { ref: refLabel(bookName, entry.bcv, entry.sub), bcv: entry.bcv, before: entry.before, after: entry.after });
      }
    }
    changes.push(...byClause.values());
  }
  return changes;
}

function plainText(value: HistoryEntry['before']): string {
  if (value === null) {
    return '';
  }
  // 导入的纯文本历史里补词带着 [ ]，工具写入的也拼回标记文本，两者才能对比
  return typeof value === 'string' ? value : formattedMarkup(value.formatted);
}

export type RenderingChange = {
  senseKey: string;
  strong: string;
  lemma: string;
  gloss: string;
  from: string;
  to: string;
  count: number;
  examples: string[];
  /** 当前译文里这个义项仍译作 from 的子句（不一致处，可用 replace_rendering 替换）。 */
  stillFrom: string[];
};

export type TextChange = {
  from: string;
  to: string;
  kind: 'text' | 'punctuation';
  count: number;
  examples: Array<{ ref: string; context: string }>;
};

const EXAMPLES = 4;

function tokensOf(db: BibleDb, cache: Map<number, Token[]>, bcv: number): Token[] {
  let tokens = cache.get(bcv);
  if (!tokens) {
    tokens = db.tokensInRange(bcv, bcv);
    cache.set(bcv, tokens);
  }
  return tokens;
}

/** 每个单实词 rendering 的 senseKey → zh。 */
function renderingMap(text: ClauseText, tokens: Token[]): Map<string, { token: Token; zh: string }> {
  const map = new Map<string, { token: Token; zh: string }>();
  for (const rendering of text.renderings) {
    const token = singleContentToken(rendering, tokens);
    if (token) {
      map.set(token.id, { token, zh: rendering.zh });
    }
  }
  return map;
}

export async function buildRevisionReport(
  db: BibleDb,
  store: WorkFileStore,
  scope: HistoryScope,
  current: Map<string, Array<{ zh: string; clauseKey: string }>>,
  origins: HistoryOrigin[] = LEARN_ORIGINS,
  limit = 200,
) {
  const changes = await collectChanges(store, scope, origins);
  const tokenCache = new Map<number, Token[]>();
  const renderingChanges = new Map<string, RenderingChange>();
  const textChanges = new Map<string, TextChange>();
  let structured = 0;
  let textOnly = 0;

  for (const change of changes) {
    const { before, after } = change;
    if (before && after && typeof before !== 'string' && typeof after !== 'string') {
      structured += 1;
      const tokens = tokensOf(db, tokenCache, change.bcv);
      const old = renderingMap(before, tokens);
      for (const [tokenId, next] of renderingMap(after, tokens)) {
        const previous = old.get(tokenId);
        if (!previous || previous.zh === next.zh) {
          continue;
        }
        const key = tokenSenseKey(next.token);
        const id = `${key}|${previous.zh}|${next.zh}`;
        const entry = renderingChanges.get(id) ?? {
          senseKey: key, strong: next.token.strong, lemma: next.token.lemma, gloss: next.token.glossEn,
          from: previous.zh, to: next.zh, count: 0, examples: [], stillFrom: [],
        };
        entry.count += 1;
        if (entry.examples.length < EXAMPLES) {
          entry.examples.push(change.ref);
        }
        renderingChanges.set(id, entry);
      }
      continue;
    }
    const [left, right] = [plainText(before), plainText(after)];
    if (left === right || !left || !right) {
      continue;
    }
    textOnly += 1;
    for (const hunk of diffHunks(left, right)) {
      const id = `${hunk.from}→${hunk.to}`;
      const entry = textChanges.get(id) ?? {
        from: hunk.from, to: hunk.to, kind: PUNCTUATION.test(hunk.from + hunk.to) ? 'punctuation' : 'text', count: 0, examples: [],
      };
      entry.count += 1;
      if (entry.examples.length < EXAMPLES) {
        entry.examples.push({ ref: change.ref, context: hunk.context });
      }
      textChanges.set(id, entry);
    }
  }

  for (const entry of renderingChanges.values()) {
    entry.stillFrom = (current.get(entry.senseKey) ?? []).filter((use) => use.zh === entry.from).map((use) => use.clauseKey);
  }
  const byCount = <T extends { count: number }>(a: T, b: T) => b.count - a.count;
  const sortedText = [...textChanges.values()].sort(byCount);
  return {
    clausesChanged: structured,
    versesChangedTextOnly: textOnly,
    renderingChanges: [...renderingChanges.values()].sort(byCount).slice(0, limit),
    textChanges: sortedText.filter((entry) => entry.kind === 'text').slice(0, limit),
    punctuationChanges: sortedText.filter((entry) => entry.kind === 'punctuation').slice(0, 40),
    truncated: renderingChanges.size > limit || sortedText.length > limit ? `只列出前 ${limit} 组；缩小 range 可看到更多` : undefined,
  };
}

// ---------------------------------------------------------------- 批量替换译词

/** 把 segments 拼接文本中 [start, start+length)（length > 0）换成 replacement；跨段时并入第一段，空段（无 note/样式）删掉。 */
export function replaceInSegments(segments: TranslationSegment[], start: number, length: number, replacement: string): TranslationSegment[] {
  const end = start + length;
  let offset = 0;
  let inserted = false;
  const result: TranslationSegment[] = [];
  for (const segment of segments) {
    const segStart = offset;
    const segEnd = offset + segment.text.length;
    offset = segEnd;
    if (segEnd <= start || segStart >= end) {
      result.push(segment);
      continue;
    }
    const head = segment.text.slice(0, Math.max(0, start - segStart));
    const tail = segment.text.slice(Math.max(0, end - segStart));
    const text = head + (inserted ? '' : replacement) + tail;
    inserted = true;
    if (text || segment.note || segment.styleName) {
      result.push({ ...segment, text });
    }
  }
  return result;
}

export type ReplaceTarget = { strong?: string; senseKey?: string; from: string; to: string };

export type ReplaceResult = {
  matched: Array<{ clause: string; before: string; after: string }>;
  skipped: Array<{ clause: string; reason: string }>;
  /** apply 时实际写入的子句（按章整节写入）。 */
  written?: number;
};

function matchesTarget(token: Token, target: ReplaceTarget): boolean {
  if (target.senseKey) {
    return tokenSenseKey(token) === target.senseKey;
  }
  return target.strong !== undefined && strongMatches(target.strong, token.strong);
}

/** 对一个子句做替换；没有命中返回 null。 */
export function replaceInClause(text: ClauseText, tokens: Token[], target: ReplaceTarget): { next: ClauseText; skipped?: string } | null {
  const hits = text.renderings
    .map((rendering, index) => ({ rendering, index, token: singleContentToken(rendering, tokens) }))
    .filter(({ rendering, token }) => token && rendering.zh === target.from && matchesTarget(token, target));
  if (hits.length === 0) {
    return null;
  }
  const plain = segmentsText(text.formatted);
  const positions = resolveAlignment(plain, text.renderings);
  if (hits.some(({ index }) => positions[index] === null)) {
    return { next: text, skipped: `译文里找不到「${target.from}」的位置` };
  }
  let segments = parseSegments(text.formatted);
  const renderings = text.renderings.map((rendering, index) => ({ ...rendering, at: positions[index] ?? undefined }));
  const delta = target.to.length - target.from.length;
  // 从后往前改，前面的位置不受影响
  for (const { index } of [...hits].sort((a, b) => positions[b.index]! - positions[a.index]!)) {
    const start = positions[index]!;
    segments = replaceInSegments(segments, start, target.from.length, target.to);
    renderings.forEach((rendering, other) => {
      if (other === index) {
        rendering.zh = target.to;
      } else if (rendering.at !== undefined && rendering.at > start) {
        rendering.at += delta;
      }
    });
  }
  const nextPlain = segments.map((segment) => segment.text).join('');
  const realigned = resolveAlignment(nextPlain, renderings);
  return {
    next: {
      ...text,
      formatted: JSON.stringify(segments),
      renderings: renderings.map(({ at: _, ...rendering }, index) => (realigned[index] === null ? rendering : { ...rendering, at: realigned[index]! })),
    },
  };
}

export async function replaceRendering(db: BibleDb, store: WorkFileStore, scope: HistoryScope, target: ReplaceTarget, apply: boolean): Promise<ReplaceResult> {
  const result: ReplaceResult = { matched: [], skipped: [] };
  let written = 0;
  const tokenCache = new Map<number, Token[]>();
  for (const { bookName, chapter } of scope.chapters) {
    const texts = await store.readClauseTexts(bookName, chapter);
    const changed = new Map<string, ClauseText>();
    for (const text of texts) {
      if (!scope.keep(text.bcv)) {
        continue;
      }
      const outcome = replaceInClause(text, tokensOf(db, tokenCache, text.bcv), target);
      if (!outcome) {
        continue;
      }
      const clause = refLabel(bookName, text.bcv, text.sub);
      if (outcome.skipped) {
        result.skipped.push({ clause, reason: outcome.skipped });
        continue;
      }
      result.matched.push({ clause, before: formattedMarkup(text.formatted), after: formattedMarkup(outcome.next.formatted) });
      changed.set(`${text.bcv}${text.sub}`, outcome.next);
    }
    if (apply && changed.size > 0) {
      const verses = new Set([...changed.values()].map((text) => text.bcv));
      const rows = texts.filter((text) => verses.has(text.bcv)).map((text) => changed.get(`${text.bcv}${text.sub}`) ?? text);
      await store.replaceClauseTextsForVerses(bookName, chapter, verses, rows, undefined, 'replace');
      written += changed.size;
    }
  }
  return apply ? { ...result, written } : result;
}

// ---------------------------------------------------------------- 导入外部历史

export type ImportLine = { bcv: number; sub?: string; before: string; after: string; time?: string };

/** 外部历史按章写入 history.jsonl（origin = import）。返回写入行数与各章。 */
export async function importRevisions(store: WorkFileStore, lines: ImportLine[]): Promise<{ written: number; chapters: string[] }> {
  const byChapter = new Map<string, { bookName: string; chapter: number; entries: HistoryEntry[] }>();
  for (const line of lines) {
    if (line.before === line.after) {
      continue;
    }
    const bookName = bookById(bookFromBcv(line.bcv)).name;
    const chapter = chapterFromBcv(line.bcv);
    const key = `${bookName}|${chapter}`;
    const group = byChapter.get(key) ?? { bookName, chapter, entries: [] };
    group.entries.push({ bcv: line.bcv, sub: line.sub ?? '', at: line.time ?? new Date().toISOString(), origin: 'import', before: line.before, after: line.after });
    byChapter.set(key, group);
  }
  let written = 0;
  for (const { bookName, chapter, entries } of byChapter.values()) {
    await store.appendHistory(bookName, chapter, entries);
    written += entries.length;
  }
  return { written, chapters: [...byChapter.values()].map(({ bookName, chapter }) => `${bookName} ${chapter}`) };
}

/** 有 history.jsonl 的章；导入的历史可能落在还没有译文的章里，所以不能只看 clauses.json。 */
export function historyChapters(store: WorkFileStore, books?: Set<string>): ChapterRef[] {
  return listChapterDirs(store, books).map(({ bookName, chapter }) => ({ bookName, chapter }));
}
