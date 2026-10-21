/**
 * 工作文件 schema。ClauseEntity、ClauseText 的既有字段保持稳定（编辑器等下游依赖它们），新功能只**追加**字段。
 */
import { z } from 'zod';
import { isTokenId } from './ids.js';

const TokenId = z.string().refine(isTokenId, { message: '不是合法词 id' });
const TokenRange = z.string().regex(/^[on]\d{11,12}(-[on]\d{11,12})?$/, '词范围应为 id 或 id-id');
const ClauseKey = z.string().regex(/^\d{7,}[a-z]+$/, '子句 id 应为 bcv+sub，如 1001001a');

export const CLAUSE_STATUSES = ['accepted', 'ambiguous', 'needs-review'] as const;

export const ClauseAlternativeSchema = z.object({
  /** 另一种读法的简述，如「2b 挂到 2a 作时间状语」。 */
  summary: z.string().min(1),
  /** 依据：语法、标点传统、版本、学者意见等。 */
  basis: z.string().optional(),
  parentId: ClauseKey.nullable().optional(),
  modifies: TokenId.nullable().optional(),
  firstWordId: TokenId.optional(),
  lastWordId: TokenId.optional(),
});

export const ClauseEntitySchema = z.object({
  id: ClauseKey,
  type: z.string(),
  parentId: ClauseKey.nullable(),
  /** 父句中被本句修饰的词；决定缩进视图里分支符的位置。 */
  modifies: TokenId.nullable(),
  firstWordId: TokenId,
  lastWordId: TokenId,
  verbRange: TokenRange.nullable(),
  verbPerson: z.string().nullable(),
  verbStem: z.string().nullable(),
  subjectRange: TokenRange.nullable(),
  /** 逗号分隔的词 id，在这些词之后换行显示。 */
  br: z.string().nullable(),
  alone: z.boolean(),
  // ↓ 本项目追加
  status: z.enum(CLAUSE_STATUSES),
  alternatives: z.array(ClauseAlternativeSchema),
  /** 与 Macula 种子不一致时的说明；一致为 null。 */
  seedDiff: z.string().nullable(),
  /** 判断依据来源：macula / ai / human / ext:<能力>。 */
  sources: z.array(z.string()),
  note: z.string(),
  version: z.number().int().nonnegative(),
});

export type ClauseEntity = z.infer<typeof ClauseEntitySchema>;

export const TranslationSegmentSchema = z.object({
  text: z.string(),
  styleName: z.string().optional(),
  note: z.string().optional(),
});

export type TranslationSegment = z.infer<typeof TranslationSegmentSchema>;

/** 原文词 → 中文译词的对照（词级对齐），用于用词统一检查、译法记忆与视图里的原文↔译文高亮。 */
export const RenderingSchema = z.object({
  /** 单个词 id 或 `首-末` 范围（短语整体译为一个中文词时）。 */
  tokens: TokenRange,
  zh: z.string().min(1),
  /** 偏离术语表 preferred 或既有主导译法时必须说明理由。 */
  note: z.string().optional(),
  /** zh 在本行译文中的起始位置（UTF-16 下标）。提交时可省，存盘时由 resolveAlignment 定位补上。 */
  at: z.number().int().nonnegative().optional(),
});

export type Rendering = z.infer<typeof RenderingSchema>;

export const DISPUTE_KINDS = ['textual', 'punctuation', 'syntax', 'lexical', 'other'] as const;

/** 争议处的另一种译法：主译放在 text，其余读法放这里，各自写依据。 */
export const TranslationAlternativeSchema = z.object({
  text: z.string().min(1),
  /** textual 经文异文 / punctuation 断句 / syntax 句法 / lexical 词义 / other */
  kind: z.enum(DISPUTE_KINDS),
  /** 依据：哪个版本、哪种语法分析、哪类译本或学者采此读法。 */
  basis: z.string().min(1),
});

export type TranslationAlternative = z.infer<typeof TranslationAlternativeSchema>;

export const ClauseTextSchema = z.object({
  bcv: z.number().int().positive(),
  sub: z.string().regex(/^[a-z]+$/),
  /** 未合并为 1；合并时首句为 N、被合并的后续子句为 0。 */
  translationSpan: z.number().int().nonnegative(),
  /** JSON 字符串：TranslationSegment[]（存字符串而非数组）。 */
  formatted: z.string(),
  /** JSON 字符串：段落标题的 TranslationSegment[]；非 null 即段首。 */
  paraTitle: z.string().nullable(),
  // ↓ 本项目追加
  /** 合并子句（span=0）的对照记在首句上。 */
  renderings: z.array(RenderingSchema),
  /** 争议处的其他译法；主译的取舍理由写在 formatted 的 note 里。 */
  alternatives: z.array(TranslationAlternativeSchema).default([]),
  sources: z.array(z.string()),
  version: z.number().int().nonnegative(),
});

export type ClauseText = z.infer<typeof ClauseTextSchema>;

export const GLOSSARY_LEVELS = ['locked', 'preferred'] as const;

export const GlossaryEntrySchema = z.object({
  /** 扩展 Strong（如 H0430G）。扩展 Strong 已区分同形词与专名个体。 */
  strong: z.string().regex(/^[HAG]\d{4}[A-Za-z]?$/),
  /** 只对某一义项生效时填 senseKey（见 senseKey()）；null 表示该 Strong 的所有义项。 */
  senseKey: z.string().nullable(),
  lemma: z.string(),
  zh: z.string().min(1),
  /** locked 必须照用；preferred 为默认译法，偏离须写理由。 */
  level: z.enum(GLOSSARY_LEVELS),
  note: z.string(),
  /** 适用范围：all 或书卷名。 */
  scope: z.string(),
  version: z.number().int().nonnegative(),
});

/**
 * 用词统一的归并键：扩展 Strong + Macula 义项（旧约 SDBH、新约 Louw-Nida）。
 * 没有义项标注时只用 Strong。
 */
export function senseKey(strong: string, sense: string | null | undefined): string {
  return sense ? `${strong}|${sense}` : strong;
}

export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>;

export const RuleSchema = z.object({
  id: z.string().min(1),
  /** analyze | translate */
  task: z.enum(['analyze', 'translate']),
  pattern: z.string().min(1),
  resolution: z.string().min(1),
  examples: z.array(z.string()),
  version: z.number().int().nonnegative(),
});

export type Rule = z.infer<typeof RuleSchema>;

export function parseSegments(formatted: string): TranslationSegment[] {
  return z.array(TranslationSegmentSchema).parse(JSON.parse(formatted));
}

export function segmentsText(formatted: string): string {
  return parseSegments(formatted).map((segment) => segment.text).join('');
}
