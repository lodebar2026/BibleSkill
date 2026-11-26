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
  normalizeSenseKey,
  parseTokenRange,
  senseKey,
  renderingKey,
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
  /** 该义项首见词的 morph，供撞名检查判断专名、数词。 */
  morph?: string;
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
          uses.push({ token, use: { zh: renderingKey(rendering.zh), clauseKey: `${text.bcv}${text.sub}`, note: rendering.note } });
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
        const entry = memory.get(key) ?? { key, strong: token.strong, lemma: token.lemma, glossEn: token.glossEn, morph: token.morph, uses: [] };
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
    && (entry.senseKey === null || normalizeSenseKey(entry.senseKey) === key)
    && (entry.scope === 'all' || entry.scope === bookName));
  const rank = (entry: GlossaryEntry) => (entry.senseKey ? 2 : 0) + (entry.scope === bookName ? 1 : 0);
  return candidates.sort((a, b) => rank(b) - rank(a))[0];
}


// ---------------------------------------------------------------- 撞名（多词一译）

type LexemeInfo = { strong: string; lemma: string; morph?: string };

/** Strong 去掉扩展字母（H0310A → H0310），同一词条的变体不算撞名。 */
function baseStrong(strong: string): string {
  return strong.replace(/^([HGA]\d+).*$/, '$1');
}

/** 系动词 הָיָה / εἰμί、γίνομαι 随句式译成“是、有、在、成为”，不算撞名。 */
const LIGHT_VERBS = new Set(['H1961', 'G1510', 'G1096']);

/** 专名、数词、系动词：同译是音译、数目相同或句式所致，不算撞名。 */
function isNameOrNumeral(info: LexemeInfo): boolean {
  const morph = info.morph ?? '';
  return LIGHT_VERBS.has(baseStrong(info.strong)) || /^[HA]Np/.test(morph) || /^[HA]A[co]/.test(morph) || /^N-PRI/.test(morph) || /^A-NUI/.test(morph);
}

/** 词根骨架：希伯来文去点符、终形归一、去弱辅音 אהוי；希腊文去重音、小写。 */
function lemmaCore(lemma: string): string {
  const plain = lemma.normalize('NFD').replace(/[\u0300-\u036f\u0591-\u05c7]/g, '');
  if (/[\u05d0-\u05ea]/.test(plain)) {
    const finals: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
    return [...plain].map((ch) => finals[ch] ?? ch).filter((ch) => /[\u05d0-\u05ea]/.test(ch) && !'אהוי'.includes(ch)).join('');
  }
  return plain.toLowerCase().replace(/[^a-zα-ω]/g, '');
}

/** 同根词（如 בָּרַךְ / בְּרָכָה、מוּת / מָוֶת、שָׁמַר / מִשְׁמֶרֶת）：词根骨架相同，或较短的（至少两个辅音）连续出现在较长的里；希腊文按前 4 个字母。 */
export function sameRoot(a: string, b: string): boolean {
  const x = lemmaCore(a);
  const y = lemmaCore(b);
  if (!x || !y) {
    return false;
  }
  if (x === y) {
    return true;
  }
  if (/[a-zα-ω]/.test(x + y)) {
    return x.length >= 4 && y.length >= 4 && x.slice(0, 4) === y.slice(0, 4);
  }
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 2 && long.includes(short);
}

/** 两个原文词同译一个中文词是否算撞名。 */
export function isCollision(a: LexemeInfo, b: LexemeInfo): boolean {
  // 希伯来文（含亚兰文）与希腊文各自统一，跨语言同译不算
  if (baseStrong(a.strong) === baseStrong(b.strong) || (a.strong.charAt(0) === 'G') !== (b.strong.charAt(0) === 'G')) {
    return false;
  }
  if (isNameOrNumeral(a) || isNameOrNumeral(b)) {
    return false;
  }
  return !sameRoot(a.lemma, b.lemma);
}

/** 中文译法 → 用它的各义项。 */
function zhOwners(memory: RenderingMemory): Map<string, Array<{ history: SenseHistory; count: number; examples: string[] }>> {
  const owners = new Map<string, Array<{ history: SenseHistory; count: number; examples: string[] }>>();
  for (const history of memory.values()) {
    for (const item of renderingDistribution(history)) {
      const list = owners.get(item.zh) ?? [];
      list.push({ history, count: item.count, examples: item.examples });
      owners.set(item.zh, list);
    }
  }
  return owners;
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
  let owners: ReturnType<typeof zhOwners> | undefined;
  for (const rendering of text.renderings) {
    const token = singleContentToken(rendering, ordered);
    if (!token) {
      continue;
    }
    const key = tokenSenseKey(token);
    // 「受…苦」与「受苦」算同一译法
    const zh = renderingKey(rendering.zh);
    const base = { tokenId: token.id, surface: token.surface, senseKey: key, zh: zh };
    const entry = glossaryFor(token, bookName, glossary);
    if (entry?.level === 'locked' && entry.zh !== zh) {
      issues.push({ ...base, severity: 'error', message: `术语表锁定译为「${entry.zh}」` });
      continue;
    }
    if (rendering.note) {
      continue;
    }
    if (entry?.level === 'preferred' && entry.zh !== zh) {
      issues.push({ ...base, severity: 'warning', message: `术语表默认译为「${entry.zh}」；若此处确需不同，在该 rendering 写 note 说明理由` });
      continue;
    }
    const distribution = renderingDistribution(memory.get(key));
    if (!entry && distribution.length > 0 && !distribution.some((item) => item.zh === zh)) {
      const summary = distribution.slice(0, 3).map((item) => `「${item.zh}」×${item.count}（${item.examples.join(',')}）`).join('、');
      issues.push({ ...base, severity: 'warning', message: `同一义项既有译法为 ${summary}；统一用既有译法，或在 note 说明为何不同` });
      continue;
    }
    // 撞名：这个中文词已经用来译别的原文词。术语表明定此译法的算认可，不查
    // 不定式独立格译成“必定 / 确实”等副词，是句式不是词义
    if (entry?.zh === zh || zh === '∅' || /^HV.a/.test(token.morph)) {
      continue;
    }
    // 这个词本来就这样译的，撞名是旧账，交给一致性报告统一处理；只查新用上的译法
    if (distribution.some((item) => item.zh === zh)) {
      continue;
    }
    owners ??= zhOwners(memory);
    const clashes = (owners.get(zh) ?? []).filter((owner) => owner.history.key !== key && isCollision(token, owner.history));
    if (clashes.length > 0) {
      const summary = clashes.slice(0, 3).map((owner) => `${owner.history.lemma}（${owner.history.strong}）×${owner.count}（${owner.examples.join(',')}）`).join('、');
      issues.push({ ...base, severity: 'warning', message: `「${zh}」已用来译 ${summary}；不同的原文词默认用不同的中文词：换一个词，或在 note 说明为何同译` });
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
 * 多词一译（撞名）：同一 zh 落在不同原文词上；同一词条的义项、同根词、专名、数词不算（见 isCollision）。
 */
export function buildConsistencyReport(memory: RenderingMemory): ConsistencyReport {
  const oneToMany: ConsistencyReport['oneToMany'] = [];
  const byZh = new Map<string, Map<string, { senseKey: string; strong: string; lemma: string; glossEn: string; morph?: string; count: number }>>();
  for (const history of memory.values()) {
    const distribution = renderingDistribution(history);
    if (distribution.length > 1) {
      oneToMany.push({ senseKey: history.key, strong: history.strong, lemma: history.lemma, glossEn: history.glossEn, renderings: distribution });
    }
    for (const item of distribution) {
      if (item.zh === '∅') {
        continue;
      }
      const senses = byZh.get(item.zh) ?? new Map();
      senses.set(history.key, { senseKey: history.key, strong: history.strong, lemma: history.lemma, glossEn: history.glossEn, morph: history.morph, count: item.count });
      byZh.set(item.zh, senses);
    }
  }
  const manyToOne: ConsistencyReport['manyToOne'] = [];
  for (const [zh, senses] of byZh) {
    const list = [...senses.values()];
    if (list.some((a, i) => list.slice(i + 1).some((b) => isCollision(a, b)))) {
      manyToOne.push({ zh, senses: list.map(({ strong: _strong, morph: _morph, ...rest }) => rest) });
    }
  }
  oneToMany.sort((a, b) => b.renderings.reduce((sum, item) => sum + item.count, 0) - a.renderings.reduce((sum, item) => sum + item.count, 0));
  manyToOne.sort((a, b) => b.senses.length - a.senses.length);
  return { oneToMany, manyToOne };
}
