/**
 * 工具实现。与 MCP 注册分开，便于脚本与测试直接调用。
 *
 * 输出控制体积：逐词数据用 TSV 文本而不是 JSON 对象数组（大 payload 下模型摘要会失真，
 * 在 Codex/agy 上实测过）。
 */
import { renderClausesText, type TextViewClause } from '@bs/clause-tree';
import {
  GlossaryEntrySchema,
  RuleSchema,
  TermPreferenceSchema,
  bareLemma,
  basicClauseType,
  bookById,
  chapterFromBcv,
  DEFAULT_LITERALNESS,
  LITERALNESS_LEVELS,
  effectiveClauseOrder,
  formattedMarkup,
  isContentWord,
  isMeaningBased,
  loadChapterViews,
  parseSegments,
  suppliedNotes,
  parseClauseId,
  parseScriptureRange,
  strongMatches,
  type BibleDb,
  type CriticalTextTool,
  type ClauseEntity,
  type ClauseText,
  type HistoryOrigin,
  type Literalness,
  type ScriptureRange,
  type SeedClause,
  type TermPreference,
  type Token,
  type VersionExpectation,
  type WorkFileStore,
} from '@bs/core';
import { chaptersBetween } from './args.js';
import {
  RenderingMemoryIndex,
  buildConsistencyReport,
  checkRenderings,
  glossaryFor,
  listChapterDirs,
  renderingDistribution,
  tokenSenseKey,
  type ConsistencyIssue,
} from './consistency.js';
import { checkClauseAnalysis, checkTranslations, type SeedOverride, type VerseError } from './validate.js';
import { collectDisputes, hasDisputes } from './disputes.js';
import { ambiguityHints } from './ambiguity.js';
import { reviewChapter, verseRanges, type HumanReviewItem, type ReviewIssue } from './review.js';
import {
  LEARN_ORIGINS,
  buildRevisionReport,
  historyChapters,
  replaceRendering as replaceRenderingIn,
  type HistoryScope,
  type ReplaceTarget,
} from './revisions.js';

export { toSubmission } from './review.js';
export { importRevisions, type ImportLine } from './revisions.js';
export { migrateSegments } from './migrate.js';
export type { ReviewIssue } from './review.js';

export type Deps = { db: BibleDb; store: WorkFileStore; memory: RenderingMemoryIndex; criticalText?: CriticalTextTool };

export function createDeps(db: BibleDb, store: WorkFileStore, criticalText?: CriticalTextTool): Deps {
  return { db, store, memory: new RenderingMemoryIndex(store, db), criticalText };
}

function groupByVerse(tokens: Token[]): Map<number, Token[]> {
  const map = new Map<number, Token[]>();
  for (const token of tokens) {
    map.set(token.bcv, [...(map.get(token.bcv) ?? []), token]);
  }
  return map;
}

function verseLabel(bcv: number): string {
  return `${chapterFromBcv(bcv)}:${bcv % 1000}`;
}

function rangeTokens(deps: Deps, range: ScriptureRange): Map<number, Token[]> {
  const verses = groupByVerse(deps.db.tokensInRange(range.startBcv, range.endBcv));
  if (verses.size === 0) {
    throw new Error(`范围内没有经文：${range.bookName} ${verseLabel(range.startBcv)}-${verseLabel(range.endBcv)}`);
  }
  return verses;
}

const STYLE_PRIORITY = '个人风格是偏好：只在原文两种译法都成立时采用；与当前档位的翻译原则、术语表冲突时以原则和术语表为准。';

/** briefing 里的个人风格（工作目录 style.md）；没有时不给。 */
async function styleBriefing(deps: Deps) {
  const style = await deps.store.readStyle();
  return style ? { options: style.options, text: style.text || undefined, priority: STYLE_PRIORITY } : undefined;
}

/** 当前翻译档位（style.md 的 literalness；没有 style.md 时为 2）。 */
async function currentLevel(deps: Deps): Promise<Literalness> {
  return (await deps.store.readStyle())?.options.literalness ?? DEFAULT_LITERALNESS;
}

/** briefing 里的翻译档位：总是给出。 */
async function approachBriefing(deps: Deps) {
  const options = (await deps.store.readStyle())?.options ?? { clauseOrder: 'fluent' as const, literalness: DEFAULT_LITERALNESS };
  const { name, summary } = LITERALNESS_LEVELS[options.literalness];
  return { literalness: options.literalness, name, summary, clauseOrder: effectiveClauseOrder(options), rules: 'references/literalness.md' };
}

/** 术语偏好按 senseKey > strong > lemma 匹配。 */
function preferenceFor(sense: { key: string; strong: string; lemma: string }, preferences: TermPreference[]): TermPreference | undefined {
  return preferences.find((item) => item.senseKey === sense.key)
    ?? preferences.find((item) => !item.senseKey && item.strong !== undefined && strongMatches(item.strong, sense.strong))
    ?? preferences.find((item) => !item.senseKey && !item.strong && bareLemma(item.lemma) === bareLemma(sense.lemma));
}

const TOKEN_HEADER = 'id\ttext\tlemma\tstrong\tmorph\tgloss\tzh\tcontent';

function tokenLine(token: Token): string {
  return [
    token.id,
    token.surface + token.after.trimEnd(),
    token.lemma,
    token.strong,
    token.morph,
    token.glossEn,
    token.glossZh ?? '',
    isContentWord(token.morph, token.strong) ? '1' : '',
  ].join('\t');
}

/** 逐词 TSV，节之间以 `# 章:节` 分隔。 */
function tokensTsv(verses: Map<number, Token[]>): string {
  const lines = [TOKEN_HEADER];
  for (const [bcv, tokens] of verses) {
    lines.push(`# ${verseLabel(bcv)}`);
    tokens.forEach((token) => lines.push(tokenLine(token)));
  }
  return lines.join('\n');
}

function morphLegend(deps: Deps, verses: Map<number, Token[]>): Record<string, string> {
  const legend: Record<string, string> = {};
  for (const tokens of verses.values()) {
    for (const token of tokens) {
      for (const code of token.morph.split('/')) {
        if (!(code in legend)) {
          const expansion = deps.db.morphExpansion(code);
          if (expansion) {
            legend[code] = expansion;
          }
        }
      }
    }
  }
  return legend;
}

/** 有序 id 列表压缩成区间：a-b,c,d-e（按节内词序判断连续）。 */
function compressIds(ids: string[], order: Map<string, number>): string {
  const sorted = [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  const parts: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (const id of sorted.slice(1)) {
    if ((order.get(id) ?? -2) === (order.get(previous) ?? -10) + 1) {
      previous = id;
      continue;
    }
    parts.push(start === previous ? start : `${start}-${previous}`);
    start = id;
    previous = id;
  }
  if (start) {
    parts.push(start === previous ? start : `${start}-${previous}`);
  }
  return parts.join(',');
}

function seedsTsv(seeds: SeedClause[], verses: Map<number, Token[]>): string {
  const order = new Map<string, number>();
  let index = 0;
  for (const tokens of verses.values()) {
    tokens.forEach((token) => order.set(token.id, index++));
  }
  const lines = ['seedId\tparentSeedId\trule\tattributive\tpredicate\tsubject\ttokens'];
  for (const seed of seeds) {
    const inRange = seed.tokens.filter((id) => order.has(id));
    if (inRange.length === 0) {
      continue;
    }
    const subject = seed.subjectTokens.filter((id) => order.has(id));
    lines.push([seed.seedId, seed.parentSeedId ?? '', seed.rule ?? '', seed.attributive ? '1' : '', seed.predicateToken ?? '',
      subject.length > 0 ? compressIds(subject, order) : '', compressIds(inRange, order)].join('\t'));
  }
  return lines.join('\n');
}

async function chapterEntities(deps: Deps, bookName: string, chapters: number[]): Promise<Map<number, ClauseEntity[]>> {
  const result = new Map<number, ClauseEntity[]>();
  for (const chapter of chapters) {
    result.set(chapter, await deps.store.readClauseEntities(bookName, chapter));
  }
  return result;
}

function inRange(bcv: number, range: ScriptureRange): boolean {
  return bcv >= range.startBcv && bcv <= range.endBcv;
}

// ---------------------------------------------------------------- 读取

export function getPassage(deps: Deps, range: ScriptureRange) {
  const verses = rangeTokens(deps, range);
  const variants = deps.db.variantsInRange(range.startBcv, range.endBcv);
  return {
    range: `${range.bookName} ${verseLabel(range.startBcv)}-${verseLabel([...verses.keys()].at(-1)!)}`,
    tokens: tokensTsv(verses),
    morphLegend: morphLegend(deps, verses),
    variants: variants.length === 0
      ? undefined
      : variants.map((variant) => `${variant.ref}\t${variant.surface}\t${variant.strong}\t${variant.glossEn}\t${variant.editions ?? ''}`).join('\n'),
    notes: [...verses.values()].flat().filter((token) => token.variantNote).map((token) => `${token.id}: ${token.variantNote}`),
  };
}

export function lookupLexicon(deps: Deps, input: { strong?: string; tokenId?: string }) {
  let strong = input.strong;
  let token: Token | undefined;
  if (input.tokenId) {
    token = deps.db.tokensByIds([input.tokenId]).get(input.tokenId);
    if (!token) {
      throw new Error(`找不到词 ${input.tokenId}`);
    }
    strong = token.strong;
  }
  if (!strong) {
    throw new Error('请给 strong（如 H7225G、G0976）或 tokenId');
  }
  const entries = deps.db.lookupLexicon(strong);
  return {
    strong,
    token: token ? { id: token.id, surface: token.surface, morph: token.morph, morphExpansion: deps.db.morphExpansion(token.morph), senseKey: tokenSenseKey(token) } : undefined,
    entries: entries.map((entry) => ({ ...entry, definition: entry.definition.length > 3000 ? `${entry.definition.slice(0, 3000)}…（已截断）` : entry.definition })),
  };
}

// ---------------------------------------------------------------- analyze

/**
 * 新约 briefing 的底本提示：放在工具输出里，比只写在 prompts 里更不容易被忽略。
 * 工作目录配置了校勘本工具（私有扩展）时点名让模型调用；没有时给通用做法。
 */
function na28Check(criticalText: CriticalTextTool | undefined): string {
  const usage = '主切分/主译必须按 NA28 断句（THGNT、SBLGNT、Macula 的不同断句只作其他读法；跨节时 parentId 可指向下一节的子句），校勘符号（⸀ ⸂⸃ ⸋⸌ ˸ 等）标出的异文与标点异文作为争议线索，sources 记 ext:critical-text。tokens 中的标点来自 THGNT，不是 NA28。';
  if (criticalText) {
    const args = JSON.stringify({ range: '<本次范围>', ...criticalText.args });
    return `新约以 NA28/UBS 断句。本工作目录配置了 NA28 原文工具：先调用 ${criticalText.server} 服务器的 ${criticalText.tool}，参数 ${args}，取本范围带标点的 NA28 原文，${usage}`;
  }
  return '新约以 NA28/UBS 断句。先看有没有别的 MCP 服务器提供取原文的工具（名称常含 source / passage / text，有的可按版本码 na28 取经文）：'
    + '有就直接按工具名调用（参数传 range；不要去查 MCP resources，那不是工具），返回内容标明 NA28、或带 NA28 校勘符号的就是 NA28 原文，'
    + `${usage}没有这类工具或取不到 NA28 时，按你对 NA28/UBS 断句的了解判断，拿不准就标为争议。`;
}

/** 影响翻译的经文异文，按节列出（切分时也要考虑，如异文改变句子结构）。 */
function textualVariantLines(deps: Deps, range: ScriptureRange, verses: Map<number, Token[]>): string[] | undefined {
  const lines: string[] = [];
  for (const tokens of verses.values()) {
    for (const token of tokens.filter((item) => item.significant)) {
      lines.push(`${verseLabel(token.bcv)} ${token.id} ${token.surface}（${token.textType}）：${token.variantNote ?? ''}`.slice(0, 220));
    }
  }
  for (const variant of deps.db.variantsInRange(range.startBcv, range.endBcv).filter((item) => item.significant)) {
    lines.push(`${verseLabel(variant.bcv)} 主干外的词 ${variant.surface}（${variant.glossEn}）见于 ${variant.editions ?? variant.textType}，位置约在 ${variant.posId}`);
  }
  return lines.length > 0 ? lines : undefined;
}

export async function buildAnalysisBriefing(deps: Deps, range: ScriptureRange) {
  const verses = rangeTokens(deps, range);
  const chapters = chaptersBetween(range.startBcv, range.endBcv);
  const existing = [...(await chapterEntities(deps, range.bookName, chapters)).values()].flat().filter((clause) => inRange(parseClauseId(clause.id).bcv, range));
  const rules = (await deps.store.readRules()).filter((rule) => rule.task === 'analyze');
  return {
    task: 'analyze',
    range: `${range.bookName} ${verseLabel(range.startBcv)}-${verseLabel([...verses.keys()].at(-1)!)}`,
    language: range.isOT ? 'hebrew/aramaic' : 'greek',
    baseText: range.isOT ? undefined : na28Check(deps.criticalText),
    tokens: tokensTsv(verses),
    morphLegend: morphLegend(deps, verses),
    maculaSeeds: seedsTsv(deps.db.seedsInRange(range.startBcv, range.endBcv), verses),
    textualVariants: textualVariantLines(deps, range, verses),
    ambiguityHints: ambiguityHints(verses, deps.db.seedsInRange(range.startBcv, range.endBcv)),
    existingClauses: existing.length > 0 ? existing : undefined,
    rules: rules.length > 0 ? rules : undefined,
    approach: await approachBriefing(deps),
    style: await styleBriefing(deps),
    submit: 'submit_clause_analysis：range + clauses（JSON 数组）。每节子句首尾相接覆盖全部词；id 为 bcv+字母（如 1001001a）。',
  };
}

/** 编辑器提交时带上读到的版本号做乐观锁；MCP 调用不带。origin 记进修改历史：MCP 提交为 ai，编辑器为 human。 */
export type SubmitOptions = { expected?: VersionExpectation; origin?: HistoryOrigin };

export async function submitClauseAnalysis(deps: Deps, range: ScriptureRange, rawClauses: unknown[], options: SubmitOptions = {}) {
  const verses = rangeTokens(deps, range);
  const errors: VerseError[] = [];
  const written: string[] = [];
  const overrides: SeedOverride[] = [];
  const translatedVerses: string[] = [];
  for (const chapter of chaptersBetween(range.startBcv, range.endBcv)) {
    const chapterVerses = new Map([...verses].filter(([bcv]) => chapterFromBcv(bcv) === chapter));
    if (chapterVerses.size === 0) {
      continue;
    }
    const chapterClauses = rawClauses.filter((raw) => {
      const id = (raw as { id?: unknown })?.id;
      return typeof id === 'string' && /^\d{7,}[a-z]+$/.test(id) && chapterFromBcv(parseClauseId(id).bcv) === chapter;
    });
    const existing = await deps.store.readClauseEntities(range.bookName, chapter);
    const outside = existing.filter((clause) => !chapterVerses.has(parseClauseId(clause.id).bcv));
    const bcvs = [...chapterVerses.keys()];
    const seeds = deps.db.seedsInRange(Math.min(...bcvs), Math.max(...bcvs));
    const result = checkClauseAnalysis(chapterClauses, chapterVerses, outside, seeds);
    errors.push(...result.errors);
    overrides.push(...result.overrides);
    if (result.accepted.length > 0) {
      const acceptedVerses = new Set(result.accepted.map((clause) => parseClauseId(clause.id).bcv));
      await deps.store.replaceClauseEntitiesForVerses(range.bookName, chapter, acceptedVerses, result.accepted, options.expected);
      written.push(...[...acceptedVerses].map(verseLabel));
      const texts = await deps.store.readClauseTexts(range.bookName, chapter);
      translatedVerses.push(...[...new Set(texts.map((text) => text.bcv))].filter((bcv) => acceptedVerses.has(bcv)).map(verseLabel));
    }
  }
  const unclaimed = rawClauses.filter((raw) => {
    const id = (raw as { id?: unknown })?.id;
    return typeof id !== 'string' || !/^\d{7,}[a-z]+$/.test(id);
  });
  if (unclaimed.length > 0) {
    throw new Error(`有 ${unclaimed.length} 条子句缺少合法 id（bcv+字母，如 1001001a）`);
  }
  return {
    writtenVerses: written,
    errors: errors.map((error) => ({ verse: verseLabel(error.bcv), clauseIds: error.clauseIds, messages: error.messages })),
    needsReview: overrides.length > 0 ? overrides : undefined,
    translatedVerses: translatedVerses.length > 0
      ? `这些节已有译文，子句分析变了译文可能对不上：${translatedVerses.join(', ')}。用 review_report 检查，需要时整节重译`
      : undefined,
    next: errors.length > 0
      ? '按 errors 修正后整节重提这些节（已写入的节不必重提）'
      : overrides.length > 0
        ? 'needsReview 中的子句用 seedDiff 推翻了 Macula 的主语判断，已标为 needs-review；向用户逐条列出，供人工复核'
        : '可以用 view_clauses 查看缩进结构，然后进行 translate',
  };
}

/**
 * 编辑器（pnpm view --serve）提交的子句：存盘形态（type 为展示码）→ 提交形态，再走 submitClauseAnalysis 的同一套校验。
 * 谓词范围改过的子句清空 verbPerson/verbStem，按词法重新回填。
 * 提交的节按连续段分批（submitClauseAnalysis 要求范围内每节都有子句），乐观锁的版本号也按段拆开。
 */
export async function editClauseAnalysis(deps: Deps, bookName: string, chapter: number, entities: ClauseEntity[], expected: VersionExpectation) {
  if (entities.length === 0) {
    throw new Error('没有要保存的子句');
  }
  const bcvs = [...new Set(entities.map((clause) => parseClauseId(clause.id).bcv))].sort((a, b) => a - b);
  if (bcvs.some((bcv) => chapterFromBcv(bcv) !== chapter)) {
    throw new Error('只能提交同一章的子句');
  }
  const book = parseScriptureRange(`${bookName} ${chapter}`);
  const testament = book.isOT ? 'OT' : 'NT';
  const onDisk = new Map((await deps.store.readClauseEntities(book.bookName, chapter)).map((clause) => [clause.id, clause]));
  const runs: number[][] = [];
  for (const bcv of bcvs) {
    const run = runs.at(-1);
    if (run && run.at(-1)! + 1 === bcv) {
      run.push(bcv);
    } else {
      runs.push([bcv]);
    }
  }
  const submitRun = async (run: number[]) => {
    const verses = new Set(run);
    const raw = entities.filter((clause) => verses.has(parseClauseId(clause.id).bcv)).map(({ version: _version, ...clause }) => {
      const verbChanged = onDisk.get(clause.id)?.verbRange !== clause.verbRange;
      return {
        ...clause,
        type: basicClauseType(testament, clause.type) ?? clause.type,
        verbPerson: verbChanged ? null : clause.verbPerson,
        verbStem: verbChanged ? null : clause.verbStem,
      };
    });
    const runExpected = new Map([...expected].filter(([id]) => verses.has(parseClauseId(id).bcv)));
    const range = { ...book, startBcv: run[0], endBcv: run.at(-1)! };
    return submitClauseAnalysis(deps, range, raw, { expected: runExpected });
  };
  // 段与段之间可能互相挂接（如前段的 parentId 指向后段新改名的子句）：失败的段在其他段写入后再试一次
  const settled = [];
  for (const run of runs) {
    settled.push({ run, result: await submitRun(run) });
  }
  const failed = settled.filter((item) => item.result.errors.length > 0);
  if (failed.length > 0 && failed.length < settled.length) {
    for (const item of failed) {
      item.result = await submitRun(item.run);
    }
  }
  const results = settled.map((item) => item.result);
  return {
    writtenVerses: results.flatMap((result) => result.writtenVerses),
    errors: results.flatMap((result) => result.errors),
    needsReview: results.flatMap((result) => result.needsReview ?? []),
    translatedVerses: results.flatMap((result) => (result.translatedVerses ? [result.translatedVerses] : [])),
  };
}

// ---------------------------------------------------------------- translate

function textViewClauses(entities: ClauseEntity[], texts: ClauseText[]): TextViewClause[] {
  const byKey = new Map(texts.map((text) => [`${text.bcv}${text.sub}`, text]));
  return entities.map((entity) => {
    const text = byKey.get(entity.id);
    return {
      ...entity,
      translation: text && text.translationSpan > 0 ? formattedMarkup(text.formatted) : null,
      alternatives: text?.alternatives,
    };
  });
}

export async function buildTranslationBriefing(deps: Deps, range: ScriptureRange) {
  const verses = rangeTokens(deps, range);
  const chapters = chaptersBetween(range.startBcv, range.endBcv);
  const entitiesByChapter = await chapterEntities(deps, range.bookName, chapters);
  const clauses = [...entitiesByChapter.values()].flat().filter((clause) => inRange(parseClauseId(clause.id).bcv, range));
  const missingVerses = [...verses.keys()].filter((bcv) => !clauses.some((clause) => parseClauseId(clause.id).bcv === bcv));
  if (missingVerses.length > 0) {
    throw new Error(`这些节还没有子句分析，请先运行 analyze：${missingVerses.map(verseLabel).join(', ')}`);
  }
  const glossary = await deps.store.readGlossary();
  const preferences = await deps.store.readTermPreferences();
  const memory = await deps.memory.build({ books: new Set([range.bookName]), excludeVerses: new Set(verses.keys()) });
  const existingTexts = (await Promise.all(chapters.map((chapter) => deps.store.readClauseTexts(range.bookName, chapter)))).flat();

  const allTokens = [...verses.values()].flat();
  const disputes = collectDisputes(clauses, allTokens, deps.db.variantsInRange(range.startBcv, range.endBcv));
  const clauseLines = clauses.map((clause) => {
    const tokens = allTokens.filter((token) => token.id >= clause.firstWordId && token.id <= clause.lastWordId);
    return {
      id: clause.id,
      parentId: clause.parentId,
      type: clause.type,
      status: clause.status === 'accepted' ? undefined : clause.status,
      alternatives: clause.alternatives.length > 0 ? clause.alternatives : undefined,
      note: clause.note || undefined,
      text: tokens.map((token) => token.surface + token.after).join('').trim(),
      contentTokens: tokens.filter((token) => isContentWord(token.morph, token.strong)).map((token) => token.id).join(','),
      disputes: hasDisputes(disputes.get(clause.id)) ? disputes.get(clause.id) : undefined,
    };
  });

  const seen = new Set<string>();
  const terms: Array<Record<string, unknown>> = [];
  for (const token of allTokens) {
    if (!isContentWord(token.morph, token.strong)) {
      continue;
    }
    const key = tokenSenseKey(token);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const entry = glossaryFor(token, range.bookName, glossary);
    const distribution = renderingDistribution(memory.get(key));
    const ubs = deps.db.lookupLexicon(token.strong).find((item) => item.source === 'UBS-zh');
    const preference = entry ? undefined : preferenceFor({ key, strong: token.strong, lemma: token.lemma }, preferences);
    terms.push({
      senseKey: key,
      lemma: token.lemma,
      gloss: token.glossEn,
      maculaZh: token.glossZh ?? undefined,
      ubsZh: ubs ? ubs.gloss.slice(0, 80) : undefined,
      glossary: entry ? { zh: entry.zh, level: entry.level, note: entry.note || undefined } : undefined,
      history: distribution.length > 0 ? distribution.slice(0, 4) : undefined,
      preference: preference
        ? { zh: preference.zh, avoid: preference.avoid.length > 0 ? preference.avoid : undefined, note: preference.note || undefined }
        : undefined,
    });
  }

  const firstChapterTexts = await deps.store.readClauseTexts(range.bookName, chapterFromBcv(range.startBcv));
  const preceding = firstChapterTexts
    .filter((text) => text.bcv < range.startBcv && text.translationSpan > 0)
    .slice(-8)
    .map((text) => `${verseLabel(text.bcv)}${text.sub} ${formattedMarkup(text.formatted)}`);

  const view = chapters.map((chapter) => {
    const entities = (entitiesByChapter.get(chapter) ?? []).filter((clause) => inRange(parseClauseId(clause.id).bcv, range));
    const words = allTokens.map((token) => ({ id: token.id, text: token.surface, after: token.after }));
    return renderClausesText(textViewClauses(entities, existingTexts), words, { leftToRight: !range.isOT });
  }).join('\n\n');

  const rules = (await deps.store.readRules()).filter((rule) => rule.task === 'translate');
  return {
    task: 'translate',
    range: `${range.bookName} ${verseLabel(range.startBcv)}-${verseLabel([...verses.keys()].at(-1)!)}`,
    baseText: range.isOT ? undefined : na28Check(deps.criticalText),
    clauseView: view,
    clauses: clauseLines,
    ambiguityHints: ambiguityHints(verses, deps.db.seedsInRange(range.startBcv, range.endBcv)),
    tokens: tokensTsv(verses),
    terms,
    precedingTranslations: preceding.length > 0 ? preceding : undefined,
    existingTranslations: existingTexts.some((text) => inRange(text.bcv, range))
      ? existingTexts.filter((text) => inRange(text.bcv, range)).map((text) => {
        const supplied = suppliedNotes(parseSegments(text.formatted));
        return {
          clauseId: `${text.bcv}${text.sub}`,
          span: text.translationSpan,
          text: formattedMarkup(text.formatted),
          renderings: text.renderings,
          alternatives: text.alternatives.length > 0 ? text.alternatives : undefined,
          supplied: supplied.length > 0 ? supplied : undefined,
          literalness: text.literalness,
        };
      })
      : undefined,
    rules: rules.length > 0 ? rules : undefined,
    approach: await approachBriefing(deps),
    style: await styleBriefing(deps),
    submit: 'submit_translation：translations（JSON 数组），每个子句一项 {clauseId, span, text, renderings:[{tokens, zh, note?}], alternatives?:[{text, kind, basis}], note?, supplied?:[{text, note}], paraTitle?}；按 approach 的档位翻译；text 里补出的词用 [ ]（第 4、5 档不用），补词说明写进 supplied；renderings 的 zh 与 at 按去掉 [ ] 的译文算；contentTokens 里的每个实词都要有 rendering；有 disputes 的子句须给 alternatives 或 note。',
  };
}

export async function submitTranslation(deps: Deps, range: ScriptureRange, raw: unknown[], options: SubmitOptions = {}) {
  const verses = rangeTokens(deps, range);
  const chapters = chaptersBetween(range.startBcv, range.endBcv);
  const entitiesByChapter = await chapterEntities(deps, range.bookName, chapters);
  const clausesByVerse = new Map<number, ClauseEntity[]>();
  for (const clause of [...entitiesByChapter.values()].flat()) {
    const { bcv } = parseClauseId(clause.id);
    if (inRange(bcv, range)) {
      clausesByVerse.set(bcv, [...(clausesByVerse.get(bcv) ?? []), clause]);
    }
  }
  const disputes = collectDisputes([...clausesByVerse.values()].flat(), [...verses.values()].flat(), deps.db.variantsInRange(range.startBcv, range.endBcv));
  const level = await currentLevel(deps);
  // 编辑器改旧译文时沿用它原来的档位，不因 style.md 换了档位就拒收
  const structural = checkTranslations(raw, clausesByVerse, verses, disputes, { level, itemLevels: options.origin === 'human' });
  const submittedVerses = new Set(structural.accepted.map((text) => text.bcv));
  const glossary = await deps.store.readGlossary();
  const memory = await deps.memory.build({ books: new Set([range.bookName]), excludeVerses: submittedVerses });

  const consistency: Array<{ verse: string; clauseId: string; issues: ConsistencyIssue[] }> = [];
  const blocked = new Set<number>();
  for (const text of structural.accepted) {
    const issues = checkRenderings(text, verses.get(text.bcv) ?? [], range.bookName, glossary, memory);
    if (issues.length > 0) {
      consistency.push({ verse: verseLabel(text.bcv), clauseId: `${text.bcv}${text.sub}`, issues });
      // 第 4、5 档用词统一只作提示：只有违反 locked 才拦
      if (!isMeaningBased(text.literalness ?? level) || issues.some((issue) => issue.severity === 'error')) {
        blocked.add(text.bcv);
      }
    }
  }
  const toWrite = structural.accepted.filter((text) => !blocked.has(text.bcv));
  const written: string[] = [];
  for (const chapter of chapters) {
    const rows = toWrite.filter((text) => chapterFromBcv(text.bcv) === chapter);
    if (rows.length > 0) {
      const versesInChapter = new Set(rows.map((text) => text.bcv));
      await deps.store.replaceClauseTextsForVerses(range.bookName, chapter, versesInChapter, rows, options.expected, options.origin ?? 'ai');
      written.push(...[...versesInChapter].map(verseLabel));
    }
  }
  return {
    writtenVerses: written,
    errors: structural.errors.map((error) => ({ verse: verseLabel(error.bcv), clauseIds: error.clauseIds, messages: error.messages })),
    consistency: consistency.length > 0 ? consistency : undefined,
    next: structural.errors.length + blocked.size > 0
      ? '未写入的节：按 errors 修正；consistency 中的用词要么统一为既有/术语表译法，要么在该 rendering 写 note 说明理由，然后整节重提'
      : consistency.length > 0
        ? '已全部写入。当前档位下 consistency 只作提示：与既有译法不同处，确认是有意为之即可；确定的新术语可用 upsert_glossary 固化'
        : '已全部写入。确定的新术语可用 upsert_glossary 固化；用 view_clauses 查看',
  };
}

// ---------------------------------------------------------------- 查看与用词统一

export async function viewClauses(deps: Deps, range: ScriptureRange): Promise<string> {
  const parts: string[] = [];
  for (const view of await loadChapterViews(deps.db, deps.store, range)) {
    if (view.clauses.length === 0) {
      parts.push(`${view.bookName} ${view.chapter} 章：范围内还没有子句分析`);
      continue;
    }
    const paragraphStarts = new Set(view.texts.filter((text) => text.paraTitle !== null).map((text) => `${text.bcv}${text.sub}`));
    parts.push(`${view.bookName} ${view.chapter} 章`, renderClausesText(textViewClauses(view.clauses, view.texts), view.words, { leftToRight: !view.isOT, paragraphStarts }));
  }
  return parts.join('\n\n');
}

export async function upsertGlossary(deps: Deps, rawEntries: unknown[]) {
  const entries = rawEntries.map((raw, index) => {
    const parsed = GlossaryEntrySchema.omit({ version: true }).safeParse({
      senseKey: null, note: '', scope: 'all', level: 'preferred', lemma: '', ...(raw as object),
    });
    if (!parsed.success) {
      throw new Error(`第 ${index + 1} 条术语格式不对: ${parsed.error.message}`);
    }
    return parsed.data;
  });
  return {
    written: await deps.store.upsertGlossary(entries),
    next: '已译的经文不会自动按新术语表复查：用 review_report(书卷) 列出需要改译的节',
  };
}

export async function consistencyReport(deps: Deps, range: ScriptureRange | null) {
  const books = range ? new Set([range.bookName]) : undefined;
  const memory = await deps.memory.build({ books });
  const report = buildConsistencyReport(memory);
  const preferences = await deps.store.readTermPreferences();
  const preferenceConflicts = [...memory.values()].flatMap((history) => {
    const preference = preferenceFor(history, preferences);
    const off = preference ? history.uses.filter((use) => use.zh !== preference.zh) : [];
    if (!preference || off.length === 0) {
      return [];
    }
    const counts = new Map<string, string[]>();
    off.forEach((use) => counts.set(use.zh, [...(counts.get(use.zh) ?? []), use.clauseKey]));
    return [{
      senseKey: history.key, strong: history.strong, lemma: history.lemma, preferred: preference.zh,
      others: [...counts].map(([zh, clauses]) => ({ zh, count: clauses.length, avoided: preference.avoid.includes(zh), examples: clauses.slice(0, 5) })),
    }];
  });
  return {
    scope: range ? bookById(range.bookId).name : '全部',
    senses: memory.size,
    oneToMany: report.oneToMany.slice(0, 200),
    manyToOne: report.manyToOne.slice(0, 200),
    preferenceConflicts: preferenceConflicts.length > 0 ? preferenceConflicts.slice(0, 200) : undefined,
    guidance: '一词多译：先判断是否原文义项不同（senseKey 已按 Macula 义项分开，仍可能需人工再分）或合理的中文同义变化；同一义项内的非同义分叉才需统一。多词一译：虚词归并正常，实词误并要修。判定后用 upsert_glossary 固化。'
      + 'preferenceConflicts：与 terms.yaml 术语偏好不同的译法（avoided 为偏好里明确不要的）；确认要统一的，用 replace_rendering 批量替换。',
  };
}

// ---------------------------------------------------------------- 审校

const REVIEW_MESSAGES_PER_VERSE = 8;
const REVIEW_VERSE_LIMIT = 300;

/** 审校报告：range 给出时只审该范围，否则审 books 中的书卷（不给则全部）。 */
/** 单章的审校问题（编辑器在节号上标出需要重译的节）。 */
export async function chapterReviewIssues(deps: Deps, bookName: string, chapter: number): Promise<ReviewIssue[]> {
  const entities = await deps.store.readClauseEntities(bookName, chapter);
  const texts = await deps.store.readClauseTexts(bookName, chapter);
  if (texts.length === 0) {
    return [];
  }
  const bcvs = [...entities.map((clause) => parseClauseId(clause.id).bcv), ...texts.map((text) => text.bcv)];
  const [startBcv, endBcv] = [Math.min(...bcvs), Math.max(...bcvs)];
  return reviewChapter({
    bookName,
    entities,
    texts,
    tokensByVerse: groupByVerse(deps.db.tokensInRange(startBcv, endBcv)),
    variants: deps.db.variantsInRange(startBcv, endBcv),
    glossary: await deps.store.readGlossary(),
    level: await currentLevel(deps),
  }).issues;
}

export async function reviewReport(deps: Deps, target: { range?: ScriptureRange; books?: Set<string> }) {
  const { range } = target;
  const chapters = range
    ? chaptersBetween(range.startBcv, range.endBcv).map((chapter) => ({ bookName: range.bookName, chapter }))
    : listChapterDirs(deps.store, target.books);
  const glossary = await deps.store.readGlossary();
  const level = await currentLevel(deps);
  const issues: Array<ReviewIssue & { bookName: string }> = [];
  const humanReview: HumanReviewItem[] = [];
  const retranslate: string[] = [];
  const untranslated: string[] = [];
  const otherLevel: string[] = [];
  const legacy: string[] = [];
  for (const { bookName, chapter } of chapters) {
    const keep = (bcv: number) => !range || inRange(bcv, range);
    const entities = (await deps.store.readClauseEntities(bookName, chapter)).filter((clause) => keep(parseClauseId(clause.id).bcv));
    const texts = (await deps.store.readClauseTexts(bookName, chapter)).filter((text) => keep(text.bcv));
    if (entities.length === 0 && texts.length === 0) {
      continue;
    }
    const bcvs = [...entities.map((clause) => parseClauseId(clause.id).bcv), ...texts.map((text) => text.bcv)];
    const [startBcv, endBcv] = [Math.min(...bcvs), Math.max(...bcvs)];
    const review = reviewChapter({
      bookName,
      entities,
      texts,
      tokensByVerse: groupByVerse(deps.db.tokensInRange(startBcv, endBcv)),
      variants: deps.db.variantsInRange(startBcv, endBcv),
      glossary,
      level,
    });
    issues.push(...review.issues.map((issue) => ({ ...issue, bookName })));
    humanReview.push(...review.humanReview);
    retranslate.push(...verseRanges(bookName, review.issues.map((issue) => issue.bcv)));
    untranslated.push(...verseRanges(bookName, review.untranslated));
    otherLevel.push(...verseRanges(bookName, review.otherLevel));
    legacy.push(...verseRanges(bookName, review.legacy));
  }

  const counts: Record<string, number> = {};
  const verses = new Map<string, { verse: string; issues: Array<{ kind: string; message: string }>; more?: number }>();
  for (const issue of issues) {
    counts[issue.kind] = (counts[issue.kind] ?? 0) + 1;
    const label = `${issue.bookName} ${verseLabel(issue.bcv)}`;
    const entry = verses.get(label) ?? { verse: label, issues: [] };
    if (entry.issues.length < REVIEW_MESSAGES_PER_VERSE) {
      entry.issues.push({ kind: issue.kind, message: issue.message });
    } else {
      entry.more = (entry.more ?? 0) + 1;
    }
    verses.set(label, entry);
  }
  humanReview.forEach((item) => { counts[item.status] = (counts[item.status] ?? 0) + 1; });
  const scope = range
    ? `${range.bookName} ${verseLabel(range.startBcv)}-${verseLabel(range.endBcv)}`
    : target.books ? [...target.books].join('、') : '全部';
  return {
    scope,
    counts,
    retranslate,
    verses: [...verses.values()].slice(0, REVIEW_VERSE_LIMIT),
    humanReview: humanReview.length > 0 ? humanReview : undefined,
    untranslated: untranslated.length > 0 ? untranslated : undefined,
    otherLevel: otherLevel.length > 0
      ? { literalness: level, ranges: otherLevel, note: '这些节是按别的档位译的，按各自的档位复查，不算问题；要统一成当前档位，把范围交给 bible-translate 重译' }
      : undefined,
    legacy: legacy.length > 0
      ? { ranges: legacy, note: '这些节的补词还以 [ ] 字符存在译文里（旧格式），请用户在 BibleSkill 目录运行 pnpm migrate:segments --workdir <工作目录> 转成补词段' }
      : undefined,
    approach: await approachBriefing(deps),
    style: await styleBriefing(deps),
    next: retranslate.length > 0
      ? 'retranslate 中的范围按 bible-translate 流程整节重提（structure 里提示没有子句分析或子句对不上的，先 analyze）；humanReview 逐条列给用户复核'
      : humanReview.length > 0
        ? '译文与当前分析、术语表一致；humanReview 逐条列给用户复核'
        : '没有需要处理的问题',
  };
}

// ---------------------------------------------------------------- 个人风格、术语偏好、规则

export async function updateStyle(deps: Deps, content: string) {
  const before = await currentLevel(deps);
  const style = await deps.store.writeStyle(content);
  const changed = style.options.literalness !== before;
  return {
    options: style.options,
    length: style.text.length,
    next: changed
      ? `翻译档位从 ${before}（${LITERALNESS_LEVELS[before].name}）改为 ${style.options.literalness}（${LITERALNESS_LEVELS[style.options.literalness].name}），对之后的 briefing 生效。已译经文不会自动改写：review_report 的 otherLevel 列出按旧档位译的节，需要时交给 bible-translate 重译`
      : '新风格对之后的 briefing 生效；已译经文不会自动按风格改写',
  };
}

export async function updateTermPreferences(deps: Deps, rawEntries: unknown[]) {
  const entries = rawEntries.map((raw, index) => {
    const parsed = TermPreferenceSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`第 ${index + 1} 条术语偏好格式不对: ${parsed.error.message}`);
    }
    return parsed.data;
  });
  return {
    written: await deps.store.upsertTermPreferences(entries),
    next: '术语偏好只在 translate briefing 里提示（terms[].preference）。要强制统一，用 upsert_glossary 写成 preferred；要改已译经文，用 replace_rendering',
  };
}

export async function upsertRules(deps: Deps, rawRules: unknown[]) {
  const rules = rawRules.map((raw, index) => {
    const parsed = RuleSchema.omit({ version: true }).safeParse({ examples: [], ...(raw as object) });
    if (!parsed.success) {
      throw new Error(`第 ${index + 1} 条规则格式不对: ${parsed.error.message}`);
    }
    return { ...parsed.data, version: 0 };
  });
  return { written: await deps.store.upsertRules(rules) };
}

// ---------------------------------------------------------------- 修改历史

/** range 给出时只看该范围，否则看 books 中的书卷（不给则全部）。 */
function historyScope(deps: Deps, target: { range?: ScriptureRange; books?: Set<string> }): HistoryScope {
  const { range } = target;
  if (range) {
    return {
      chapters: chaptersBetween(range.startBcv, range.endBcv).map((chapter) => ({ bookName: range.bookName, chapter })),
      keep: (bcv) => inRange(bcv, range),
    };
  }
  return { chapters: historyChapters(deps.store, target.books), keep: () => true };
}

export async function revisionReport(deps: Deps, target: { range?: ScriptureRange; books?: Set<string> }, origins: HistoryOrigin[] = LEARN_ORIGINS) {
  const scope = historyScope(deps, target);
  const memory = await deps.memory.build({ books: target.range ? new Set([target.range.bookName]) : target.books });
  const current = new Map([...memory].map(([key, history]) => [key, history.uses]));
  const report = await buildRevisionReport(deps.db, deps.store, scope, current, origins);
  return {
    origins,
    ...report,
    termPreferences: (await deps.store.readTermPreferences()).length,
    style: await styleBriefing(deps),
    guidance: 'renderingChanges 已按原文义项归并，count 高且方向一致的是术语偏好候选；stillFrom 是当前仍用旧译法的子句。'
      + 'textChanges 只有文本：用 get_passage 看例句所在节的原文，判断改动属于哪个原文词（术语偏好）、哪种形态规律（规则）还是纯中文表达（风格）。'
      + '同一组改动方向不一、或与原文不符的，列为疑似误改，不要写入。',
  };
}

export async function replaceRendering(deps: Deps, target: { range?: ScriptureRange; books?: Set<string> }, replace: ReplaceTarget, apply: boolean) {
  if (!replace.strong && !replace.senseKey) {
    throw new Error('要给 strong 或 senseKey');
  }
  if (!replace.from || !replace.to || replace.from === replace.to) {
    throw new Error('from、to 都要给，且不能相同');
  }
  const scope = historyScope(deps, target);
  const result = await replaceRenderingIn(deps.db, deps.store, scope, replace, apply);
  return {
    ...result,
    matched: result.matched.slice(0, 300),
    more: result.matched.length > 300 ? result.matched.length - 300 : undefined,
    next: apply
      ? '已改写译文与 renderings（修改历史记为 replace）。用 review_report 复查'
      : '这是预览（dry-run）。确认后加 apply: true 再调一次；skipped 中的子句要人工改',
  };
}
