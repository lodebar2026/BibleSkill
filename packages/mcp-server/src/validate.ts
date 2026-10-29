/**
 * 提交校验。以"节"为单位：通过的节写盘，未通过的节在 errors 里返回 clauseIds，要求整节重提。
 */
import {
  ClauseAlternativeSchema,
  ClauseLogicSchema,
  LOGIC_RELATIONS,
  displayClauseType,
  validateBasicType,
  verbInfoFromMorph,
  RenderingSchema,
  TranslationAlternativeSchema,
  isContentWord,
  isMeaningBased,
  isTokenId,
  markupToSegments,
  parseClauseId,
  parseTokenRange,
  resolveAlignment,
  DEFAULT_LITERALNESS,
  DISPUTE_KINDS,
  LITERALNESS_LEVELS,
  type ClauseEntity,
  type ClauseText,
  type SeedClause,
  type Token,
} from '@bs/core';
import { z } from 'zod';
import { tokensOfRendering } from './consistency.js';
import type { ClauseDisputes } from './disputes.js';

export type VerseError = { bcv: number; clauseIds: string[]; messages: string[] };

function subOrdinal(sub: string): number {
  return [...sub].reduce((value, char) => value * 26 + (char.charCodeAt(0) - 96), 0);
}

function letterOf(index: number): string {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(97 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

const nullableString = z.preprocess((value) => (value === '' || value === undefined ? null : value), z.string().nullable());

/** 子句 id 去掉前导零：模型有时照词 id 的定宽格式写成 09009011a，而 bcv 是 9009011。 */
export function canonicalClauseId(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().replace(/^0+(?=\d{7,}[a-z]+$)/, '') : value;
}

const clauseIdString = z.preprocess(canonicalClauseId, z.string());
const nullableClauseId = z.preprocess((value) => (value === '' || value === undefined ? null : canonicalClauseId(value)), z.string().nullable());

/** 格式错误时按出错字段附上正确写法，免得模型反复猜。 */
const FORMAT_HINTS: Record<string, string> = {
  span: 'span 是整数，不是原文：不合并为 1；合并 N 个连续子句时首句写 N，其后各句写 0、text 为 ""',
  merge: 'merge 是合并理由（只写在 span>1 的首句上）：reorder（中文调换了语序）、constituent（断开会切在一个成分中间，note 写明切在哪两个成分之间）；第 4、5 档另可用 meaning（按意思合并）',
  tokens: 'tokens 是一个字符串：单个词 id（如 o010010010012、n40001001001）或连续范围「首id-末id」；不连续的几个词分成几条 rendering，不要用逗号或数组',
  zh: 'zh 是这个（些）词在本行译文里的中文，必须原样出现在去掉 [ ] 的 text 中',
  kind: `kind 只能是 ${DISPUTE_KINDS.join('、')}`,
  firstWordId: 'firstWordId / lastWordId 是 briefing 里的词 id 字符串，如 o010010010011',
  lastWordId: 'firstWordId / lastWordId 是 briefing 里的词 id 字符串，如 o010010010011',
  parentId: 'parentId 是母句的子句 id（bcv+字母，如 1001001a），独立句为 null',
  status: 'status 只能是 accepted、ambiguous 或 needs-review',
  relation: `logic.relation 只能是 ${LOGIC_RELATIONS.join('、')}`,
  target: 'logic.target 是本章的子句 id 或「首id-末id」，如 1030025d-1030026c',
};

function formatError(label: string, index: number, error: z.ZodError): Error {
  const keys = new Set(error.issues.map((issue) => [...issue.path].reverse().find((part) => typeof part === 'string')).filter((key) => key !== undefined));
  const hints = [...new Set([...keys].map((key) => FORMAT_HINTS[key as string]).filter(Boolean))];
  return new Error(`第 ${index + 1} 条${label}格式不对: ${z.prettifyError(error)}${hints.length ? `\n正确写法：\n- ${hints.join('\n- ')}` : ''}`);
}

/** 模型提交的子句：必填结构字段，其余可省（取空值）。 */
export const SubmittedClauseSchema = z.object({
  id: clauseIdString,
  firstWordId: z.string(),
  lastWordId: z.string(),
  /** 旧约基础句型全称（wayyiqtol / qatal …），写盘时换算成展示码；新约不填。 */
  type: z.string().default(''),
  parentId: nullableClauseId.default(null),
  modifies: nullableString.default(null),
  subjectRange: nullableString.default(null),
  verbRange: nullableString.default(null),
  verbPerson: nullableString.default(null),
  verbStem: nullableString.default(null),
  br: nullableString.default(null),
  alone: z.boolean().default(false),
  status: z.enum(['accepted', 'ambiguous', 'needs-review']).default('accepted'),
  alternatives: z.array(ClauseAlternativeSchema).default([]),
  seedDiff: nullableString.default(null),
  sources: z.array(z.string()).default(['ai']),
  note: z.string().default(''),
  logic: ClauseLogicSchema.nullable().default(null),
}).loose();

/** 子句 id 按节、再按字母序比较。 */
function compareClauseIds(a: string, b: string): number {
  const x = parseClauseId(a);
  const y = parseClauseId(b);
  return x.bcv - y.bcv || subOrdinal(x.sub) - subOrdinal(y.sub);
}

function formsCycle(clause: ClauseEntity, all: Map<string, ClauseEntity>): boolean {
  const seen = new Set<string>();
  let current: ClauseEntity | undefined = clause;
  while (current?.parentId) {
    if (seen.has(current.id)) {
      return true;
    }
    seen.add(current.id);
    if (current.parentId === clause.id) {
      return true;
    }
    current = all.get(current.parentId);
  }
  return false;
}

export type SeedOverride = { clauseId: string; seedDiff: string; overridden: string[] };

export type AnalysisCheck = { accepted: ClauseEntity[]; errors: VerseError[]; overrides: SeedOverride[]; readingWarnings: string[] };

/** 关联读法组 → 涉及的子句 id（按 alternatives 的 reading 归并）。 */
export function readingGroups(items: Array<{ id: string; alternatives: Array<{ reading?: string }> }>): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    for (const label of new Set(item.alternatives.map((alt) => alt.reading).filter((label): label is string => Boolean(label)))) {
      groups.set(label, [...(groups.get(label) ?? []), item.id]);
    }
  }
  return groups;
}

/** 只落在一个子句上的读法组：多半是漏标了另一半，或者本不需要分组。 */
function loneReadingWarnings(groups: Map<string, string[]>, scope: string): string[] {
  return [...groups].filter(([, ids]) => ids.length === 1).map(([label, [id]]) =>
    `关联读法 ${label} 在${scope}只出现在 ${id}：关联读法要标在两个以上子句上；另一半漏标就补上，不需要关联就去掉 reading`);
}

function inSpan(id: string, first: string, last: string): boolean {
  return id >= first && id <= last;
}

function checkRangeField(value: string | null, label: string, first: string, last: string, messages: string[]): void {
  if (value === null) {
    return;
  }
  try {
    const [start, end] = parseTokenRange(value);
    if (!inSpan(start, first, last) || !inSpan(end, first, last) || start > end) {
      messages.push(`${label} ${value} 不在本子句范围内`);
    }
  } catch (error) {
    messages.push(`${label}: ${(error as Error).message}`);
  }
}

/**
 * 子句切分校验：
 * - 子句 id 的 bcv 必须在提交范围内，sub 按 a,b,c… 连续
 * - 每节的子句首尾相接、恰好覆盖该节全部主干词（不重叠、不遗漏）
 * - parentId 指向本章子句且不成环；modifies 落在父句范围内
 * - subjectRange / verbRange / br 落在本句内；ambiguous 必须给 alternatives
 */
/**
 * 主语检查：以 Macula 种子为证据（谓词落在本句内、且标出了主语的种子）。
 * - 主语有词落在本句之外 → 切分可能把主语切走了
 * - 本句没填 subjectRange → 漏标主语
 * - subjectRange 与 Macula 主语完全不重叠 → 主语可能标错（如把表语当主语）
 * 不同意 Macula 时可在 seedDiff 写明理由放行，但该句会被标为 needs-review 交人工复核（理由好坏机器判断不了）。
 */
function checkSubject(clause: ClauseEntity, seeds: SeedClause[], surfaceOf: (id: string) => string): string[] {
  const inClause = (id: string) => inSpan(id, clause.firstWordId, clause.lastWordId);
  const messages: string[] = [];
  for (const seed of seeds) {
    if (!seed.predicateToken || !inClause(seed.predicateToken) || seed.subjectTokens.length === 0) {
      continue;
    }
    const subject = `${seed.subjectTokens[0]}-${seed.subjectTokens[seed.subjectTokens.length - 1]}（${seed.subjectTokens.map(surfaceOf).join(' ')}）`;
    const hint = '；若确实不同意 Macula，在 seedDiff 写明句法理由（该句会标为 needs-review 交人工复核）';
    const outside = seed.subjectTokens.filter((id) => !inClause(id));
    if (outside.length > 0) {
      messages.push(`Macula 以 ${surfaceOf(seed.predicateToken)} 为谓词的主语是 ${subject}，其中 ${outside.join(',')} 落在本句之外，切分可能把主语切走了${hint}`);
    } else if (!clause.subjectRange) {
      messages.push(`Macula 标出主语 ${subject}，本句没有填 subjectRange${hint}`);
    } else {
      const [start, end] = parseTokenRange(clause.subjectRange);
      if (!seed.subjectTokens.some((id) => id >= start && id <= end)) {
        messages.push(`subjectRange ${clause.subjectRange} 与 Macula 主语 ${subject} 不重叠，可能把表语或宾语当成了主语${hint}`);
      }
    }
  }
  return messages;
}

export function checkClauseAnalysis(
  rawClauses: unknown[],
  versesInRange: Map<number, Token[]>,
  existingOutsideRange: ClauseEntity[],
  seeds: SeedClause[] = [],
): AnalysisCheck {
  const surfaces = new Map([...versesInRange.values()].flat().map((token) => [token.id, token.surface]));
  const overrides: SeedOverride[] = [];
  const surfaceOf = (id: string) => surfaces.get(id) ?? id;
  const byVerse = new Map<number, ClauseEntity[]>();
  const errors = new Map<number, VerseError>();
  const fail = (bcv: number, clauseId: string | null, message: string) => {
    const error = errors.get(bcv) ?? { bcv, clauseIds: [], messages: [] };
    if (clauseId && !error.clauseIds.includes(clauseId)) {
      error.clauseIds.push(clauseId);
    }
    error.messages.push(message);
    errors.set(bcv, error);
  };

  rawClauses.forEach((raw, index) => {
    const parsed = SubmittedClauseSchema.safeParse(raw);
    if (!parsed.success) {
      throw formatError('子句', index, parsed.error);
    }
    const clause = parsed.data;
    let bcv: number;
    try {
      bcv = parseClauseId(clause.id).bcv;
    } catch (error) {
      throw new Error(`第 ${index + 1} 条: ${(error as Error).message}`);
    }
    if (!versesInRange.has(bcv)) {
      throw new Error(`子句 ${clause.id} 不在本次提交范围内（或该节无经文）`);
    }
    const entity: ClauseEntity = {
      id: clause.id,
      type: clause.type,
      parentId: clause.parentId,
      modifies: clause.modifies,
      firstWordId: clause.firstWordId,
      lastWordId: clause.lastWordId,
      verbRange: clause.verbRange,
      verbPerson: clause.verbPerson,
      verbStem: clause.verbStem,
      subjectRange: clause.subjectRange,
      br: clause.br,
      alone: clause.alone,
      status: clause.status,
      alternatives: clause.alternatives,
      seedDiff: clause.seedDiff,
      sources: clause.sources,
      note: clause.note,
      version: 0,
      ...(clause.logic ? { logic: clause.logic } : {}),
    };
    byVerse.set(bcv, [...(byVerse.get(bcv) ?? []), entity]);
  });

  for (const [bcv, tokens] of versesInRange) {
    const clauses = (byVerse.get(bcv) ?? []).sort((a, b) => subOrdinal(parseClauseId(a.id).sub) - subOrdinal(parseClauseId(b.id).sub));
    byVerse.set(bcv, clauses);
    if (clauses.length === 0) {
      fail(bcv, null, '该节没有提交任何子句');
      continue;
    }
    clauses.forEach((clause, index) => {
      const expectedSub = letterOf(index);
      if (parseClauseId(clause.id).sub !== expectedSub) {
        fail(bcv, clause.id, `子句字母应按 a、b、c… 连续，第 ${index + 1} 句应为 ${bcv}${expectedSub}`);
      }
    });
    const ids = tokens.map((token) => token.id);
    let cursor = 0;
    for (const clause of clauses) {
      if (!isTokenId(clause.firstWordId) || !isTokenId(clause.lastWordId)) {
        fail(bcv, clause.id, `firstWordId/lastWordId 不是合法词 id`);
        continue;
      }
      const start = ids.indexOf(clause.firstWordId);
      const end = ids.indexOf(clause.lastWordId);
      if (start < 0 || end < 0) {
        fail(bcv, clause.id, `首末词不是本节主干词（${clause.firstWordId}-${clause.lastWordId}）`);
        continue;
      }
      if (start !== cursor) {
        fail(bcv, clause.id, start > cursor
          ? `与前一子句之间漏了词 ${ids.slice(cursor, start).join(',')}`
          : `与前一子句重叠（从 ${clause.firstWordId} 起）`);
      }
      if (end < start) {
        fail(bcv, clause.id, '首词在末词之后');
        continue;
      }
      cursor = end + 1;
      const messages: string[] = [];
      checkRangeField(clause.subjectRange, 'subjectRange', clause.firstWordId, clause.lastWordId, messages);
      checkRangeField(clause.verbRange, 'verbRange', clause.firstWordId, clause.lastWordId, messages);
      for (const brId of clause.br ? clause.br.split(',') : []) {
        if (!inSpan(brId.trim(), clause.firstWordId, clause.lastWordId)) {
          messages.push(`br 中的 ${brId} 不在本子句内`);
        }
      }
      if (clause.status === 'ambiguous' && clause.alternatives.length === 0) {
        messages.push('status=ambiguous 时必须给出 alternatives');
      }
      // 主语不能包含本句谓词（结构规则，不能用 seedDiff 豁免）
      if (clause.subjectRange && clause.verbRange) {
        const [subjectStart, subjectEnd] = parseTokenRange(clause.subjectRange);
        const [verbStart, verbEnd] = parseTokenRange(clause.verbRange);
        if (subjectStart <= verbEnd && verbStart <= subjectEnd) {
          messages.push(`subjectRange ${clause.subjectRange} 包含了谓词 ${clause.verbRange}；主语只标主语名词短语本身`);
        }
      }
      if (messages.length === 0) {
        const subjectIssues = checkSubject(clause, seeds, surfaceOf);
        if (subjectIssues.length > 0 && clause.seedDiff) {
          overrides.push({ clauseId: clause.id, seedDiff: clause.seedDiff, overridden: subjectIssues });
          // 人工改过的子句本身就是复核结论，不再降级
          if (clause.status === 'accepted' && !clause.sources.includes('human')) {
            clause.status = 'needs-review';
          }
        } else {
          messages.push(...subjectIssues);
        }
      }
      // 基础句型 → 展示码（WayX / XAor …），并从谓词词法回填动词信息
      const testament = bcv < 40_000_000 ? 'OT' : 'NT';
      const typeIssues = validateBasicType(testament, clause);
      messages.push(...typeIssues);
      if (typeIssues.length === 0 && messages.length === 0) {
        if (clause.verbRange) {
          const verb = tokens.find((token) => token.id === parseTokenRange(clause.verbRange!)[0]);
          const info = verbInfoFromMorph(verb?.morph ?? '');
          clause.verbPerson ??= info.person;
          clause.verbStem ??= info.stem;
        }
        clause.type = displayClauseType(testament, clause);
      }
      messages.forEach((message) => fail(bcv, clause.id, message));
    }
    if (cursor < ids.length) {
      fail(bcv, clauses[clauses.length - 1].id, `节末漏了词 ${ids.slice(cursor).join(',')}`);
    }
  }

  // parentId / modifies 依赖其他节，最后统一查；某节失败会连带引用它的节失败
  const all = new Map<string, ClauseEntity>();
  for (const clause of existingOutsideRange) {
    all.set(clause.id, clause);
  }
  for (const clauses of byVerse.values()) {
    for (const clause of clauses) {
      all.set(clause.id, clause);
    }
  }
  // logic.target 要在本章找得到，范围首尾有序，不能指向自己
  for (const [bcv, clauses] of byVerse) {
    for (const clause of clauses) {
      if (!clause.logic) {
        continue;
      }
      const [first, last = first] = clause.logic.target.split('-');
      const missing = [first, last].filter((id) => !all.has(id));
      if (missing.length > 0) {
        fail(bcv, clause.id, `logic.target ${missing.join('、')} 在本章找不到`);
      } else if (compareClauseIds(first, last) > 0) {
        fail(bcv, clause.id, `logic.target ${clause.logic.target} 首尾颠倒`);
      } else if (compareClauseIds(first, clause.id) <= 0 && compareClauseIds(clause.id, last) <= 0) {
        fail(bcv, clause.id, 'logic.target 不能包含本句');
      }
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [bcv, clauses] of byVerse) {
      if (errors.has(bcv)) {
        continue;
      }
      for (const clause of clauses) {
        if (clause.parentId === null) {
          if (clause.modifies !== null) {
            fail(bcv, clause.id, '没有 parentId 时 modifies 应为 null');
            changed = true;
          }
          continue;
        }
        const parent = all.get(clause.parentId);
        const parentBcv = /^\d{7,}[a-z]+$/.test(clause.parentId) ? parseClauseId(clause.parentId).bcv : NaN;
        if (!parent) {
          fail(bcv, clause.id, `parentId ${clause.parentId} 在本章找不到`);
        } else if (errors.has(parentBcv) && byVerse.has(parentBcv)) {
          fail(bcv, clause.id, `parentId ${clause.parentId} 所在节未通过校验，需一起重提`);
        } else if (clause.modifies !== null && !inSpan(clause.modifies, parent.firstWordId, parent.lastWordId)) {
          fail(bcv, clause.id, `modifies ${clause.modifies} 不在父句 ${parent.id} 范围内`);
        } else if (formsCycle(clause, all)) {
          fail(bcv, clause.id, 'parentId 成环');
        } else {
          continue;
        }
        changed = true;
      }
    }
  }

  const accepted = [...byVerse].filter(([bcv]) => !errors.has(bcv)).flatMap(([, clauses]) => clauses);
  return {
    accepted,
    errors: [...errors.values()].sort((a, b) => a.bcv - b.bcv),
    overrides: overrides.filter((item) => !errors.has(parseClauseId(item.clauseId).bcv)),
    readingWarnings: loneReadingWarnings(readingGroups([...all.values()]), '本章'),
  };
}

export const SubmittedTranslationSchema = z.object({
  clauseId: clauseIdString,
  span: z.coerce.number().int().nonnegative().default(1),
  /** span>1 时的合并理由，见 FORMAT_HINTS.merge。 */
  merge: z.enum(['reorder', 'constituent', 'meaning']).optional(),
  text: z.string().default(''),
  renderings: z.array(RenderingSchema).default([]),
  /** 争议处的其他译法。 */
  alternatives: z.array(TranslationAlternativeSchema).default([]),
  /** 主译的取舍理由 / 异文不影响翻译的说明；存进 formatted 的 note。 */
  note: z.string().default(''),
  /** 补词（text 里的 [ ]）的说明，存进对应补词段的 note。 */
  supplied: z.array(z.object({
    text: z.string().min(1),
    note: z.string().default(''),
    at: z.coerce.number().int().nonnegative().optional(),
  })).default([]),
  paraTitle: nullableString.default(null),
  sources: z.array(z.string()).default(['ai']),
  /** 这条译文所用的档位。只在编辑器提交（保留原译文的档位）时采用，见 TranslationCheckOptions。 */
  literalness: z.coerce.number().int().min(1).max(5).optional(),
}).loose();

/**
 * 合并后的各行是否与所覆盖的子句一一对应、顺序同原文：第 k 行里的译词全来自第 k 个子句。
 * 行数与子句数不等、或有子句的译词没定位到时无从判断，返回 false。
 */
function sameOrder(plain: string, renderings: Array<{ tokens: string; zh: string }>, positions: Array<number | null>, covered: ClauseEntity[], words: Token[]): boolean {
  const lines = plain.split('\n');
  if (lines.length !== covered.length) {
    return false;
  }
  const starts = lines.map((_, k) => lines.slice(0, k).reduce((sum, line) => sum + line.length + 1, 0));
  const lineOf = (at: number) => starts.filter((start) => start <= at).length - 1;
  const seen = new Set<number>();
  for (const [index, rendering] of renderings.entries()) {
    const at = positions[index];
    const first = tokensOfRendering(rendering, words)[0];
    if (at === null || at === undefined || !first || rendering.zh === NOT_TRANSLATED) {
      continue;
    }
    const k = covered.findIndex((clause) => first.id >= clause.firstWordId && first.id <= clause.lastWordId);
    if (k < 0 || lineOf(at) !== k) {
      return false;
    }
    seen.add(k);
  }
  return seen.size === covered.length;
}

/** rendering.zh 取此值表示该原文词有意不译（须带 note）。 */
export const NOT_TRANSLATED = '∅';

/** 段落标题：模型给纯文本，存成 TranslationSegment[] 的 JSON 字符串。 */
function toParaTitle(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  return value.trim().startsWith('[') ? value : JSON.stringify([{ text: value.trim() }]);
}

export type TranslationCheck = { accepted: ClauseText[]; errors: VerseError[]; readingWarnings: string[] };

/**
 * level：当前翻译档位（style.md 的 literalness）。
 * itemLevels：每条按它自带的 literalness 校验（编辑器改旧译文、审校复查时用，旧数据没有就按 2）。
 */
export type TranslationCheckOptions = { level?: number; itemLevels?: boolean };

/**
 * 译文结构校验（用词统一检查另在 consistency.ts）：
 * - 每节子句齐全且按序；span：未合并 1，合并时首句 N、其后 N-1 句为 0，不跨节
 * - 模型提交的合并（span>1）须写 merge 理由；写 reorder 却各行与子句一一对应、顺序同原文的，拒绝（应拆开）
 * - span>0 的子句 text 非空；span=0 的 text 必须为空
 * - text 里的 [ ] 是补词，拆成 styleName=added 的段；第 4、5 档不用补词，第 1 档不合并子句
 * - renderings 的词落在所覆盖子句内，zh 必须出现在去掉 [ ] 的译文里；存盘时补上 at（zh 在译文中的位置）
 * - 覆盖子句内每个实词都要有 rendering；∅（不译）在第 1–3 档须写 note
 * - 争议：子句分析为 ambiguous → 必须给 alternatives 并在 note 写主译理由；
 *   有影响翻译的经文异文 → 给 kind=textual 的 alternative，或在 note 说明为何不影响译文
 */
export function checkTranslations(
  raw: unknown[],
  clausesByVerse: Map<number, ClauseEntity[]>,
  tokensByVerse: Map<number, Token[]>,
  disputes: Map<string, ClauseDisputes> = new Map(),
  options: TranslationCheckOptions = {},
): TranslationCheck {
  const errors = new Map<number, VerseError>();
  const fail = (bcv: number, clauseId: string, message: string) => {
    const error = errors.get(bcv) ?? { bcv, clauseIds: (clausesByVerse.get(bcv) ?? []).map((clause) => clause.id), messages: [] };
    error.messages.push(`${clauseId}: ${message}`);
    errors.set(bcv, error);
  };
  const submitted = new Map<number, Map<string, z.infer<typeof SubmittedTranslationSchema>>>();
  raw.forEach((item, index) => {
    const parsed = SubmittedTranslationSchema.safeParse(item);
    if (!parsed.success) {
      throw formatError('译文', index, parsed.error);
    }
    const { bcv } = parseClauseId(parsed.data.clauseId);
    if (!clausesByVerse.has(bcv)) {
      throw new Error(`${parsed.data.clauseId} 所在节不在本次范围内，或该节还没有子句分析（先跑 analyze）`);
    }
    const verse = submitted.get(bcv) ?? new Map();
    if (verse.has(parsed.data.clauseId)) {
      throw new Error(`${parsed.data.clauseId} 重复提交`);
    }
    verse.set(parsed.data.clauseId, parsed.data);
    submitted.set(bcv, verse);
  });

  const analysisGroups = readingGroups([...clausesByVerse.values()].flat());
  const accepted: ClauseText[] = [];
  for (const [bcv, verse] of submitted) {
    const clauses = clausesByVerse.get(bcv) ?? [];
    const tokens = tokensByVerse.get(bcv) ?? [];
    const missing = clauses.filter((clause) => !verse.has(clause.id)).map((clause) => clause.id);
    if (missing.length > 0) {
      fail(bcv, missing.join(','), '整节的每个子句都要提交（被合并的子句也要给出 span=0 的一行）');
      continue;
    }
    const extra = [...verse.keys()].filter((id) => !clauses.some((clause) => clause.id === id));
    if (extra.length > 0) {
      fail(bcv, extra.join(','), '不是本节已分析的子句');
      continue;
    }
    const rows: ClauseText[] = [];
    for (let index = 0; index < clauses.length; index += 1) {
      const clause = clauses[index];
      const item = verse.get(clause.id)!;
      const sub = parseClauseId(clause.id).sub;
      const level = (options.itemLevels ? item.literalness : undefined) ?? options.level ?? DEFAULT_LITERALNESS;
      if (item.span === 0) {
        if (item.text.trim() !== '' || item.renderings.length > 0 || item.alternatives.length > 0) {
          fail(bcv, clause.id, 'span=0（已并入前句）时 text、renderings、alternatives 必须为空（写在首句上）');
        }
        rows.push({ bcv, sub, translationSpan: 0, formatted: '[]', paraTitle: toParaTitle(item.paraTitle), renderings: [], alternatives: [], sources: item.sources, version: 0 });
        continue;
      }
      const covered = clauses.slice(index, index + item.span);
      if (covered.length < item.span) {
        fail(bcv, clause.id, `span=${item.span} 超出本节子句数`);
        continue;
      }
      const followers = covered.slice(1).filter((follower) => (verse.get(follower.id)?.span ?? 1) !== 0);
      if (followers.length > 0) {
        fail(bcv, clause.id, `span=${item.span} 覆盖的 ${followers.map((f) => f.id).join(',')} 必须为 span=0`);
      }
      if (index > 0) {
        const coveredByPrevious = clauses.slice(0, index).some((previous, prevIndex) => {
          const prevSpan = verse.get(previous.id)?.span ?? 1;
          return prevSpan > 0 && prevIndex + prevSpan > index;
        });
        if (coveredByPrevious) {
          fail(bcv, clause.id, '已被前面的合并覆盖，span 应为 0');
        }
      }
      if (level === 1 && item.span > 1) {
        fail(bcv, clause.id, `第 1 档（${LITERALNESS_LEVELS[1].name}）不合并子句，span 只能是 1`);
      }
      if (item.text.trim() === '') {
        fail(bcv, clause.id, 'text 为空');
      }
      const note = item.note.trim();
      const text = item.text.trim();
      let segments: ReturnType<typeof markupToSegments>;
      try {
        segments = markupToSegments(text, note, item.supplied);
      } catch (error) {
        fail(bcv, clause.id, (error as Error).message);
        segments = [{ text: text.replace(/[[\]]/g, '') }];
      }
      if (isMeaningBased(level) && segments.some((segment) => segment.styleName)) {
        fail(bcv, clause.id, `第 ${level} 档（${LITERALNESS_LEVELS[level as 4 | 5].name}）不用 [ ] 标补词：去掉括号，把补出的词直接写进译文`);
      }
      const plain = segments.map((segment) => segment.text).join('');
      const first = covered[0].firstWordId;
      const last = covered[covered.length - 1].lastWordId;
      const span = tokens.filter((token) => token.id >= first && token.id <= last);
      const renderedIds = new Set<string>();
      for (const rendering of item.renderings) {
        const hit = tokensOfRendering(rendering, span);
        if (hit.length === 0) {
          fail(bcv, clause.id, `rendering ${rendering.tokens} 不在本句（含合并句）范围内`);
        }
        if (rendering.zh === NOT_TRANSLATED) {
          if (!rendering.note && !isMeaningBased(level)) {
            fail(bcv, clause.id, `rendering ${rendering.tokens} 标为不译（∅）时必须写 note`);
          }
        } else if (!plain.includes(rendering.zh)) {
          fail(bcv, clause.id, `rendering「${rendering.zh}」没有出现在译文里`);
        }
        hit.forEach((token) => renderedIds.add(token.id));
      }
      const unrendered = span.filter((token) => isContentWord(token.morph, token.strong) && !renderedIds.has(token.id));
      if (unrendered.length > 0) {
        fail(bcv, clause.id, `实词缺 rendering: ${unrendered.map((token) => `${token.id}(${token.surface} ${token.glossEn})`).join('、')}；${isMeaningBased(level) ? `几个词合译时用 \`首-末\` 区间对应整个短语；确实不译的写 zh="${NOT_TRANSLATED}"` : `若该词确实不译，给 rendering 写 zh="${NOT_TRANSLATED}" 并加 note`}`);
      }
      const coveredDisputes = covered.map((c) => disputes.get(c.id)).filter((d): d is ClauseDisputes => d !== undefined);
      if (coveredDisputes.some((d) => d.analysis.length > 0)) {
        if (item.alternatives.length === 0) {
          fail(bcv, clause.id, `子句分析标为 ambiguous（${coveredDisputes.flatMap((d) => d.analysis.map((a) => a.summary)).join('；')}），须在 alternatives 给出另一读法的译文与依据`);
        }
        if (!note) {
          fail(bcv, clause.id, '有争议时须在 note 写明主译采用哪种读法、依据是什么');
        }
      }
      const labels = [...new Set(covered.flatMap((c) => c.alternatives.map((alt) => alt.reading).filter((label): label is string => Boolean(label))))];
      for (const label of labels.filter((label) => !item.alternatives.some((alt) => alt.reading === label))) {
        fail(bcv, clause.id, `子句分析的关联读法 ${label} 涉及 ${(analysisGroups.get(label) ?? []).join('、')}：按这组读法连起来译出本句的另一种译法，放进 alternatives 并标 reading: "${label}"，同组各句的这条译法要能连读`);
      }
      const textual = coveredDisputes.flatMap((d) => d.textual);
      if (textual.length > 0 && !item.alternatives.some((alt) => alt.kind === 'textual') && !note) {
        fail(bcv, clause.id, `有影响翻译的经文异文：${textual.join('；')}。给 kind=textual 的 alternative，或在 note 说明为何不影响译文`);
      }
      if (item.alternatives.length > 0 && !note) {
        fail(bcv, clause.id, '给了 alternatives 时须在 note 写明主译的取舍理由');
      }
      const positions = resolveAlignment(plain, item.renderings);
      // 合并理由：编辑器、审校复查提交的旧译文（itemLevels）不查
      if (item.span > 1 && level > 1 && !options.itemLevels) {
        const allowed = isMeaningBased(level) ? ['reorder', 'constituent', 'meaning'] : ['reorder', 'constituent'];
        if (!item.merge || !allowed.includes(item.merge)) {
          fail(bcv, clause.id, `span=${item.span} 要写 merge 说明合并理由：${allowed.join('、')}。中文顺序与原文相同、断开处也不在一个成分中间的，不合并，拆开各自 span=1`);
        } else if (item.merge === 'constituent' && !note) {
          fail(bcv, clause.id, 'merge=constituent 时在 note 写明断开会切在哪两个成分之间（如动词与宾语从句之间）');
        } else if (item.merge === 'reorder' && sameOrder(plain, item.renderings, positions, covered, span)) {
          fail(bcv, clause.id, `声明 merge=reorder，但合并后 ${item.span} 行与 ${covered.map((c) => c.id).join('、')} 一一对应、顺序和原文相同，没有调换语序：拆开各自 span=1；若断开会切在一个成分中间，改为 merge=constituent 并在 note 写明`);
        }
      }
      rows.push({
        bcv, sub,
        translationSpan: item.span,
        formatted: JSON.stringify(segments),
        paraTitle: toParaTitle(item.paraTitle),
        renderings: item.renderings.map(({ at: _, ...rendering }, index) => {
          const at = positions[index];
          return at === null ? rendering : { ...rendering, at };
        }),
        alternatives: item.alternatives,
        sources: item.sources,
        version: 0,
        literalness: level,
      });
    }
    if (!errors.has(bcv)) {
      accepted.push(...rows);
    }
  }
  // 子句分析已成组的读法由上面的检查管；这里只提示译文里新起、却只标了一句的组
  const submittedGroups = readingGroups([...submitted.values()].flatMap((verse) => [...verse.values()].map((item) => ({ id: item.clauseId, alternatives: item.alternatives }))));
  const newGroups = new Map([...submittedGroups].filter(([label]) => !analysisGroups.has(label)));
  return {
    accepted,
    errors: [...errors.values()].sort((a, b) => a.bcv - b.bcv),
    readingWarnings: loneReadingWarnings(newGroups, '本次提交里'),
  };
}
