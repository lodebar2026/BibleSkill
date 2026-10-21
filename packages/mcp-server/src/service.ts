/**
 * 工具实现。与 MCP 注册分开，便于脚本与测试直接调用。
 *
 * 输出控制体积：逐词数据用 TSV 文本而不是 JSON 对象数组（大 payload 下模型摘要会失真，
 * 在 Codex/agy 上实测过）。
 */
import { renderClausesText, type TextViewClause } from '@bs/clause-tree';
import {
  GlossaryEntrySchema,
  basicClauseType,
  bookById,
  chapterFromBcv,
  isContentWord,
  loadChapterViews,
  parseClauseId,
  parseScriptureRange,
  segmentsText,
  type BibleDb,
  type CriticalTextTool,
  type ClauseEntity,
  type ClauseText,
  type ScriptureRange,
  type SeedClause,
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
import { reviewChapter, verseRanges, type HumanReviewItem, type ReviewIssue } from './review.js';

export { toSubmission } from './review.js';
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
    existingClauses: existing.length > 0 ? existing : undefined,
    rules: rules.length > 0 ? rules : undefined,
    submit: 'submit_clause_analysis：range + clauses（JSON 数组）。每节子句首尾相接覆盖全部词；id 为 bcv+字母（如 1001001a）。',
  };
}

/** 编辑器提交时带上读到的版本号做乐观锁；MCP 调用不带。 */
export type SubmitOptions = { expected?: VersionExpectation };

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
      translation: text && text.translationSpan > 0 ? segmentsText(text.formatted) : null,
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
    terms.push({
      senseKey: key,
      lemma: token.lemma,
      gloss: token.glossEn,
      maculaZh: token.glossZh ?? undefined,
      ubsZh: ubs ? ubs.gloss.slice(0, 80) : undefined,
      glossary: entry ? { zh: entry.zh, level: entry.level, note: entry.note || undefined } : undefined,
      history: distribution.length > 0 ? distribution.slice(0, 4) : undefined,
    });
  }

  const firstChapterTexts = await deps.store.readClauseTexts(range.bookName, chapterFromBcv(range.startBcv));
  const preceding = firstChapterTexts
    .filter((text) => text.bcv < range.startBcv && text.translationSpan > 0)
    .slice(-8)
    .map((text) => `${verseLabel(text.bcv)}${text.sub} ${segmentsText(text.formatted)}`);

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
    tokens: tokensTsv(verses),
    terms,
    precedingTranslations: preceding.length > 0 ? preceding : undefined,
    existingTranslations: existingTexts.some((text) => inRange(text.bcv, range))
      ? existingTexts.filter((text) => inRange(text.bcv, range)).map((text) => ({ clauseId: `${text.bcv}${text.sub}`, span: text.translationSpan, text: segmentsText(text.formatted), renderings: text.renderings, alternatives: text.alternatives.length > 0 ? text.alternatives : undefined }))
      : undefined,
    rules: rules.length > 0 ? rules : undefined,
    submit: 'submit_translation：translations（JSON 数组），每个子句一项 {clauseId, span, text, renderings:[{tokens, zh, note?}], alternatives?:[{text, kind, basis}], note?, paraTitle?}；contentTokens 里的每个实词都要有 rendering；有 disputes 的子句须给 alternatives 或 note。',
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
  const structural = checkTranslations(raw, clausesByVerse, verses, disputes);
  const submittedVerses = new Set(structural.accepted.map((text) => text.bcv));
  const glossary = await deps.store.readGlossary();
  const memory = await deps.memory.build({ books: new Set([range.bookName]), excludeVerses: submittedVerses });

  const consistency: Array<{ verse: string; clauseId: string; issues: ConsistencyIssue[] }> = [];
  const blocked = new Set<number>();
  for (const text of structural.accepted) {
    const issues = checkRenderings(text, verses.get(text.bcv) ?? [], range.bookName, glossary, memory);
    if (issues.length > 0) {
      consistency.push({ verse: verseLabel(text.bcv), clauseId: `${text.bcv}${text.sub}`, issues });
      blocked.add(text.bcv);
    }
  }
  const toWrite = structural.accepted.filter((text) => !blocked.has(text.bcv));
  const written: string[] = [];
  for (const chapter of chapters) {
    const rows = toWrite.filter((text) => chapterFromBcv(text.bcv) === chapter);
    if (rows.length > 0) {
      const versesInChapter = new Set(rows.map((text) => text.bcv));
      await deps.store.replaceClauseTextsForVerses(range.bookName, chapter, versesInChapter, rows, options.expected);
      written.push(...[...versesInChapter].map(verseLabel));
    }
  }
  return {
    writtenVerses: written,
    errors: structural.errors.map((error) => ({ verse: verseLabel(error.bcv), clauseIds: error.clauseIds, messages: error.messages })),
    consistency: consistency.length > 0 ? consistency : undefined,
    next: structural.errors.length + consistency.length > 0
      ? '未写入的节：按 errors 修正；consistency 中的用词要么统一为既有/术语表译法，要么在该 rendering 写 note 说明理由，然后整节重提'
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
  return {
    scope: range ? bookById(range.bookId).name : '全部',
    senses: memory.size,
    oneToMany: report.oneToMany.slice(0, 200),
    manyToOne: report.manyToOne.slice(0, 200),
    guidance: '一词多译：先判断是否原文义项不同（senseKey 已按 Macula 义项分开，仍可能需人工再分）或合理的中文同义变化；同一义项内的非同义分叉才需统一。多词一译：虚词归并正常，实词误并要修。判定后用 upsert_glossary 固化。',
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
  }).issues;
}

export async function reviewReport(deps: Deps, target: { range?: ScriptureRange; books?: Set<string> }) {
  const { range } = target;
  const chapters = range
    ? chaptersBetween(range.startBcv, range.endBcv).map((chapter) => ({ bookName: range.bookName, chapter }))
    : listChapterDirs(deps.store, target.books);
  const glossary = await deps.store.readGlossary();
  const issues: Array<ReviewIssue & { bookName: string }> = [];
  const humanReview: HumanReviewItem[] = [];
  const retranslate: string[] = [];
  const untranslated: string[] = [];
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
    });
    issues.push(...review.issues.map((issue) => ({ ...issue, bookName })));
    humanReview.push(...review.humanReview);
    retranslate.push(...verseRanges(bookName, review.issues.map((issue) => issue.bcv)));
    untranslated.push(...verseRanges(bookName, review.untranslated));
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
    next: retranslate.length > 0
      ? 'retranslate 中的范围按 bible-translate 流程整节重提（structure 里提示没有子句分析或子句对不上的，先 analyze）；humanReview 逐条列给用户复核'
      : humanReview.length > 0
        ? '译文与当前分析、术语表一致；humanReview 逐条列给用户复核'
        : '没有需要处理的问题',
  };
}
