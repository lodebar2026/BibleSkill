/**
 * 提交校验。以"节"为单位：通过的节写盘，未通过的节在 errors 里返回 clauseIds，要求整节重提。
 */
import {
  ClauseAlternativeSchema,
  displayClauseType,
  validateBasicType,
  verbInfoFromMorph,
  RenderingSchema,
  TranslationAlternativeSchema,
  isContentWord,
  isTokenId,
  parseClauseId,
  parseTokenRange,
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

/** 模型提交的子句：必填结构字段，其余可省（取空值）。 */
export const SubmittedClauseSchema = z.object({
  id: z.string(),
  firstWordId: z.string(),
  lastWordId: z.string(),
  /** 基础句型全称（wayyiqtol / aorist_ind …），写盘时换算成展示码。 */
  type: z.string().default(''),
  parentId: nullableString.default(null),
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
}).loose();

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

export type AnalysisCheck = { accepted: ClauseEntity[]; errors: VerseError[]; overrides: SeedOverride[] };

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
      throw new Error(`第 ${index + 1} 条子句格式不对: ${z.prettifyError(parsed.error)}`);
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
          if (clause.status === 'accepted') {
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
  };
}

export const SubmittedTranslationSchema = z.object({
  clauseId: z.string(),
  span: z.coerce.number().int().nonnegative().default(1),
  text: z.string().default(''),
  renderings: z.array(RenderingSchema).default([]),
  /** 争议处的其他译法。 */
  alternatives: z.array(TranslationAlternativeSchema).default([]),
  /** 主译的取舍理由 / 异文不影响翻译的说明；存进 formatted 的 note。 */
  note: z.string().default(''),
  paraTitle: nullableString.default(null),
  sources: z.array(z.string()).default(['ai']),
}).loose();

/** rendering.zh 取此值表示该原文词有意不译（须带 note）。 */
export const NOT_TRANSLATED = '∅';

/** 段落标题：模型给纯文本，存成 TranslationSegment[] 的 JSON 字符串。 */
function toParaTitle(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  return value.trim().startsWith('[') ? value : JSON.stringify([{ text: value.trim() }]);
}

export type TranslationCheck = { accepted: ClauseText[]; errors: VerseError[] };

/**
 * 译文结构校验（用词统一检查另在 consistency.ts）：
 * - 每节子句齐全且按序；span：未合并 1，合并时首句 N、其后 N-1 句为 0，不跨节
 * - span>0 的子句 text 非空；span=0 的 text 必须为空
 * - renderings 的词落在所覆盖子句内，zh 必须出现在 text 里
 * - 覆盖子句内每个实词都要有 rendering
 * - 争议：子句分析为 ambiguous → 必须给 alternatives 并在 note 写主译理由；
 *   有影响翻译的经文异文 → 给 kind=textual 的 alternative，或在 note 说明为何不影响译文
 */
export function checkTranslations(
  raw: unknown[],
  clausesByVerse: Map<number, ClauseEntity[]>,
  tokensByVerse: Map<number, Token[]>,
  disputes: Map<string, ClauseDisputes> = new Map(),
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
      throw new Error(`第 ${index + 1} 条译文格式不对: ${z.prettifyError(parsed.error)}`);
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
      if (item.text.trim() === '') {
        fail(bcv, clause.id, 'text 为空');
      }
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
          if (!rendering.note) {
            fail(bcv, clause.id, `rendering ${rendering.tokens} 标为不译（∅）时必须写 note`);
          }
        } else if (!item.text.includes(rendering.zh)) {
          fail(bcv, clause.id, `rendering「${rendering.zh}」没有出现在译文里`);
        }
        hit.forEach((token) => renderedIds.add(token.id));
      }
      const unrendered = span.filter((token) => isContentWord(token.morph, token.strong) && !renderedIds.has(token.id));
      if (unrendered.length > 0) {
        fail(bcv, clause.id, `实词缺 rendering: ${unrendered.map((token) => `${token.id}(${token.surface} ${token.glossEn})`).join('、')}；若该词确实不译，给 rendering 写 zh="${NOT_TRANSLATED}" 并加 note`);
      }
      const coveredDisputes = covered.map((c) => disputes.get(c.id)).filter((d): d is ClauseDisputes => d !== undefined);
      const note = item.note.trim();
      if (coveredDisputes.some((d) => d.analysis.length > 0)) {
        if (item.alternatives.length === 0) {
          fail(bcv, clause.id, `子句分析标为 ambiguous（${coveredDisputes.flatMap((d) => d.analysis.map((a) => a.summary)).join('；')}），须在 alternatives 给出另一读法的译文与依据`);
        }
        if (!note) {
          fail(bcv, clause.id, '有争议时须在 note 写明主译采用哪种读法、依据是什么');
        }
      }
      const textual = coveredDisputes.flatMap((d) => d.textual);
      if (textual.length > 0 && !item.alternatives.some((alt) => alt.kind === 'textual') && !note) {
        fail(bcv, clause.id, `有影响翻译的经文异文：${textual.join('；')}。给 kind=textual 的 alternative，或在 note 说明为何不影响译文`);
      }
      if (item.alternatives.length > 0 && !note) {
        fail(bcv, clause.id, '给了 alternatives 时须在 note 写明主译的取舍理由');
      }
      rows.push({
        bcv, sub,
        translationSpan: item.span,
        formatted: JSON.stringify([note ? { text: item.text.trim(), note } : { text: item.text.trim() }]),
        paraTitle: toParaTitle(item.paraTitle),
        renderings: item.renderings,
        alternatives: item.alternatives,
        sources: item.sources,
        version: 0,
      });
    }
    if (!errors.has(bcv)) {
      accepted.push(...rows);
    }
  }
  return { accepted, errors: [...errors.values()].sort((a, b) => a.bcv - b.bcv) };
}
