/**
 * 用词统一：译法记忆（从工作文件的 renderings 实时汇总）、提交检查、一致性报告。
 *
 * 归并键 senseKey = 扩展 Strong + Macula 义项（见 core/schemas.ts senseKey()）。
 * 只对**单个实词**的 rendering 做统一检查；短语整体译法（tokens 为范围且含多个实词）
 * 记在复合键下，只供参考。
 */
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  isContentWord,
  listBooks,
  parseTokenRange,
  senseKey,
  type BibleDb,
  type ClauseText,
  type GlossaryEntry,
  type Rendering,
  type Token,
  type WorkFileStore,
} from '@bs/core';

export type RenderingUse = { zh: string; clauseKey: string; note?: string };

export type SenseHistory = {
  key: string;
  strong: string;
  lemma: string;
  glossEn: string;
  uses: RenderingUse[];
};

export type RenderingMemory = Map<string, SenseHistory>;

export function tokenSenseKey(token: Token): string {
  return senseKey(token.strong, token.sense);
}

/** rendering 覆盖的主干词（按 id 区间从给定有序词表里取）。 */
export function tokensOfRendering(rendering: Pick<Rendering, 'tokens'>, ordered: Token[]): Token[] {
  const [first, last] = parseTokenRange(rendering.tokens);
  return ordered.filter((token) => token.id >= first && token.id <= last);
}

/** 单实词 rendering → 该词；否则 null（短语或纯虚词）。 */
export function singleContentToken(rendering: Pick<Rendering, 'tokens'>, ordered: Token[]): Token | null {
  const content = tokensOfRendering(rendering, ordered).filter((token) => isContentWord(token.morph, token.strong));
  return content.length === 1 ? content[0] : null;
}

/** 工作目录里已有的章目录（<书名>/chNN），按书卷顺序。 */
export function listChapterDirs(store: WorkFileStore, bookFilter?: Set<string>): Array<{ bookName: string; chapter: number; dir: string }> {
  const result: Array<{ bookName: string; chapter: number; dir: string }> = [];
  for (const book of listBooks()) {
    if (bookFilter && !bookFilter.has(book.name)) {
      continue;
    }
    const bookDir = path.join(store.projectRoot, book.name);
    let entries: string[];
    try {
      entries = readdirSync(bookDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const match = entry.match(/^ch(\d+)$/);
      if (match) {
        result.push({ bookName: book.name, chapter: Number(match[1]), dir: path.join(bookDir, entry) });
      }
    }
  }
  return result;
}

type CacheEntry = { mtimeMs: number; uses: Array<{ token: Token; use: RenderingUse }> };

/**
 * 按章缓存的译法记忆。每章以 clauses.json 的 mtime 判断是否失效；
 * 汇总时可排除正在重提的节（它们的旧译法不应算作"既有译法"）。
 */
export class RenderingMemoryIndex {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly store: WorkFileStore, private readonly db: BibleDb) {}

  private chapterFiles(bookFilter?: Set<string>): Array<{ bookName: string; chapter: number; file: string }> {
    return listChapterDirs(this.store, bookFilter).map((item) => ({ ...item, file: path.join(item.dir, 'clauses.json') }));
  }

  private async chapterUses(bookName: string, chapter: number, file: string): Promise<CacheEntry['uses']> {
    let mtimeMs: number;
    try {
      mtimeMs = statSync(file).mtimeMs;
    } catch {
      return [];
    }
    const cached = this.cache.get(file);
    if (cached && cached.mtimeMs === mtimeMs) {
      return cached.uses;
    }
    const texts = await this.store.readClauseTexts(bookName, chapter);
    const uses: CacheEntry['uses'] = [];
    const verses = [...new Set(texts.map((text) => text.bcv))];
    const tokensByVerse = new Map<number, Token[]>();
    for (const bcv of verses) {
      tokensByVerse.set(bcv, this.db.tokensInRange(bcv, bcv));
    }
    for (const text of texts) {
      const ordered = tokensByVerse.get(text.bcv) ?? [];
      for (const rendering of text.renderings) {
        const token = singleContentToken(rendering, ordered);
        if (token) {
          uses.push({ token, use: { zh: rendering.zh, clauseKey: `${text.bcv}${text.sub}`, note: rendering.note } });
        }
      }
    }
    this.cache.set(file, { mtimeMs, uses });
    return uses;
  }

  async build(options: { books?: Set<string>; excludeVerses?: Set<number> } = {}): Promise<RenderingMemory> {
    const memory: RenderingMemory = new Map();
    for (const { bookName, chapter, file } of this.chapterFiles(options.books)) {
      for (const { token, use } of await this.chapterUses(bookName, chapter, file)) {
        if (options.excludeVerses?.has(token.bcv)) {
          continue;
        }
        const key = tokenSenseKey(token);
        const entry = memory.get(key) ?? { key, strong: token.strong, lemma: token.lemma, glossEn: token.glossEn, uses: [] };
        entry.uses.push(use);
        memory.set(key, entry);
      }
    }
    return memory;
  }
}

/** zh → 次数，按次数降序。 */
export function renderingDistribution(history: SenseHistory | undefined): Array<{ zh: string; count: number; examples: string[] }> {
  if (!history) {
    return [];
  }
  const groups = new Map<string, string[]>();
  for (const use of history.uses) {
    const list = groups.get(use.zh) ?? [];
    list.push(use.clauseKey);
    groups.set(use.zh, list);
  }
  return [...groups]
    .map(([zh, keys]) => ({ zh, count: keys.length, examples: keys.slice(0, 3) }))
    .sort((a, b) => b.count - a.count);
}

/** 对某词生效的术语条目：义项条目优先于 Strong 条目；书卷范围优先于 all。 */
export function glossaryFor(token: Token, bookName: string, glossary: GlossaryEntry[]): GlossaryEntry | undefined {
  const key = tokenSenseKey(token);
  const candidates = glossary.filter((entry) =>
    entry.strong === token.strong
    && (entry.senseKey === null || entry.senseKey === key)
    && (entry.scope === 'all' || entry.scope === bookName));
  const rank = (entry: GlossaryEntry) => (entry.senseKey ? 2 : 0) + (entry.scope === bookName ? 1 : 0);
  return candidates.sort((a, b) => rank(b) - rank(a))[0];
}

export type ConsistencyIssue = {
  tokenId: string;
  surface: string;
  senseKey: string;
  zh: string;
  severity: 'error' | 'warning';
  message: string;
};

/** 检查一条子句译文的 renderings 是否符合术语表与既有译法。warning 在没有 note 时同样拦下。 */
export function checkRenderings(
  text: Pick<ClauseText, 'renderings'>,
  ordered: Token[],
  bookName: string,
  glossary: GlossaryEntry[],
  memory: RenderingMemory,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  for (const rendering of text.renderings) {
    const token = singleContentToken(rendering, ordered);
    if (!token) {
      continue;
    }
    const key = tokenSenseKey(token);
    const base = { tokenId: token.id, surface: token.surface, senseKey: key, zh: rendering.zh };
    const entry = glossaryFor(token, bookName, glossary);
    if (entry?.level === 'locked' && entry.zh !== rendering.zh) {
      issues.push({ ...base, severity: 'error', message: `术语表锁定译为「${entry.zh}」` });
      continue;
    }
    if (rendering.note) {
      continue;
    }
    if (entry?.level === 'preferred' && entry.zh !== rendering.zh) {
      issues.push({ ...base, severity: 'warning', message: `术语表默认译为「${entry.zh}」；若此处确需不同，在该 rendering 写 note 说明理由` });
      continue;
    }
    const distribution = renderingDistribution(memory.get(key));
    if (!entry && distribution.length > 0 && !distribution.some((item) => item.zh === rendering.zh)) {
      const summary = distribution.slice(0, 3).map((item) => `「${item.zh}」×${item.count}（${item.examples.join(',')}）`).join('、');
      issues.push({ ...base, severity: 'warning', message: `同一义项既有译法为 ${summary}；统一用既有译法，或在 note 说明为何不同` });
    }
  }
  return issues;
}

export type ConsistencyReport = {
  oneToMany: Array<{ senseKey: string; strong: string; lemma: string; glossEn: string; renderings: ReturnType<typeof renderingDistribution> }>;
  manyToOne: Array<{ zh: string; senses: Array<{ senseKey: string; lemma: string; glossEn: string; count: number }> }>;
};

/**
 * 一词多译：同一 senseKey 下多个 zh。
 * 多词一译：同一 zh 落在不同 Strong 的实词上（义项不同但 Strong 相同的不算——那是一词多义同译）。
 */
export function buildConsistencyReport(memory: RenderingMemory): ConsistencyReport {
  const oneToMany: ConsistencyReport['oneToMany'] = [];
  const byZh = new Map<string, Map<string, { senseKey: string; strong: string; lemma: string; glossEn: string; count: number }>>();
  for (const history of memory.values()) {
    const distribution = renderingDistribution(history);
    if (distribution.length > 1) {
      oneToMany.push({ senseKey: history.key, strong: history.strong, lemma: history.lemma, glossEn: history.glossEn, renderings: distribution });
    }
    for (const item of distribution) {
      const senses = byZh.get(item.zh) ?? new Map();
      senses.set(history.key, { senseKey: history.key, strong: history.strong, lemma: history.lemma, glossEn: history.glossEn, count: item.count });
      byZh.set(item.zh, senses);
    }
  }
  const manyToOne: ConsistencyReport['manyToOne'] = [];
  for (const [zh, senses] of byZh) {
    const strongs = new Set([...senses.values()].map((sense) => sense.strong));
    if (strongs.size > 1) {
      manyToOne.push({ zh, senses: [...senses.values()].map(({ strong: _strong, ...rest }) => rest) });
    }
  }
  oneToMany.sort((a, b) => b.renderings.reduce((sum, item) => sum + item.count, 0) - a.renderings.reduce((sum, item) => sum + item.count, 0));
  manyToOne.sort((a, b) => b.senses.length - a.senses.length);
  return { oneToMany, manyToOne };
}
