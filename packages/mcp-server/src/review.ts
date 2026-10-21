/**
 * 审校：对**已落盘**的译文按当前子句分析与术语表重新检查，列出需要改译、需要人工复核的地方。
 *
 * 提交时的检查只在那一刻生效；之后术语表改了、子句重新切分了，旧译文不会自动复查。
 * 这里把已存的 ClauseText 还原成提交格式，重跑 checkTranslations 与 checkRenderings。
 * 每节按它写入时的档位（ClauseText.literalness，旧数据按 2）复查；与当前档位不同的只列出来，不要求重译。
 */
import {
  DEFAULT_LITERALNESS,
  chapterFromBcv,
  clauseNote,
  hasLegacyBrackets,
  isMeaningBased,
  parseClauseId,
  parseSegments,
  segmentsMarkup,
  suppliedNotes,
  type ClauseEntity,
  type ClauseText,
  type GlossaryEntry,
  type Token,
  type VariantToken,
} from '@bs/core';
import { checkRenderings } from './consistency.js';
import { collectDisputes } from './disputes.js';
import { checkTranslations } from './validate.js';

/**
 * structure 译文与当前子句分析对不上 / dispute 有未处理的争议 / glossary 违反当前术语表。
 * 三者都要整节改译。
 */
export type ReviewIssue = { kind: 'structure' | 'dispute' | 'glossary'; bcv: number; message: string };

/** 子句分析里标为 needs-review / ambiguous 的子句，交人工复核。 */
export type HumanReviewItem = { clauseId: string; status: 'needs-review' | 'ambiguous'; detail: string };

export type ChapterReview = {
  issues: ReviewIssue[];
  humanReview: HumanReviewItem[];
  /** 已分析但整节没有译文的节。 */
  untranslated: number[];
  /** 写入时的档位与当前档位不同的节（只作提示）。 */
  otherLevel: number[];
  /** 补词还以 [ ] 字符存在普通段里的节（旧数据，跑 pnpm migrate:segments）。 */
  legacy: number[];
};

/** 已存译文 → submit_translation 的提交格式。 */
export function toSubmission(text: ClauseText) {
  const segments = parseSegments(text.formatted);
  return {
    clauseId: `${text.bcv}${text.sub}`,
    span: text.translationSpan,
    text: segmentsMarkup(segments),
    renderings: text.renderings,
    alternatives: text.alternatives,
    note: clauseNote(segments),
    supplied: suppliedNotes(segments),
    paraTitle: text.paraTitle,
    sources: text.sources,
    literalness: text.literalness ?? DEFAULT_LITERALNESS,
  };
}

function translationMessages(
  texts: ClauseText[],
  clauses: ClauseEntity[],
  tokens: Token[],
  disputes: ReturnType<typeof collectDisputes> | undefined,
): string[] {
  const bcv = texts[0].bcv;
  try {
    return checkTranslations(texts.map(toSubmission), new Map([[bcv, clauses]]), new Map([[bcv, tokens]]), disputes, { itemLevels: true })
      .errors.flatMap((error) => error.messages);
  } catch (error) {
    return [(error as Error).message];
  }
}

export function reviewChapter(input: {
  bookName: string;
  entities: ClauseEntity[];
  texts: ClauseText[];
  tokensByVerse: Map<number, Token[]>;
  variants: VariantToken[];
  glossary: GlossaryEntry[];
  /** 当前档位。 */
  level?: number;
}): ChapterReview {
  const { bookName, entities, texts, tokensByVerse, variants, glossary } = input;
  const level = input.level ?? DEFAULT_LITERALNESS;
  const clausesByVerse = new Map<number, ClauseEntity[]>();
  for (const clause of entities) {
    const { bcv } = parseClauseId(clause.id);
    clausesByVerse.set(bcv, [...(clausesByVerse.get(bcv) ?? []), clause]);
  }
  const textsByVerse = new Map<number, ClauseText[]>();
  for (const text of texts) {
    textsByVerse.set(text.bcv, [...(textsByVerse.get(text.bcv) ?? []), text]);
  }

  const issues: ReviewIssue[] = [];
  for (const [bcv, verseTexts] of textsByVerse) {
    const clauses = clausesByVerse.get(bcv);
    if (!clauses) {
      issues.push({ kind: 'structure', bcv, message: '本节有译文但没有子句分析（先跑 analyze 再重译）' });
      continue;
    }
    const tokens = tokensByVerse.get(bcv) ?? [];
    // 不带争议跑一遍得出结构问题；带争议多出来的就是未处理的争议
    const structural = translationMessages(verseTexts, clauses, tokens, undefined);
    const withDisputes = translationMessages(verseTexts, clauses, tokens, collectDisputes(clauses, tokens, variants.filter((variant) => variant.bcv === bcv)));
    const seen = new Set(structural);
    structural.forEach((message) => issues.push({ kind: 'structure', bcv, message }));
    withDisputes.filter((message) => !seen.has(message)).forEach((message) => issues.push({ kind: 'dispute', bcv, message }));
    for (const text of verseTexts) {
      const meaningBased = isMeaningBased(text.literalness ?? DEFAULT_LITERALNESS);
      for (const issue of checkRenderings(text, tokens, bookName, glossary, new Map())) {
        if (meaningBased && issue.severity !== 'error') {
          continue;
        }
        issues.push({ kind: 'glossary', bcv, message: `${text.bcv}${text.sub}: ${issue.surface}（${issue.tokenId}）译作「${issue.zh}」，${issue.message}` });
      }
    }
  }

  const humanReview: HumanReviewItem[] = [];
  for (const clause of entities) {
    if (clause.status === 'needs-review') {
      humanReview.push({ clauseId: clause.id, status: clause.status, detail: clause.seedDiff ?? clause.note });
    } else if (clause.status === 'ambiguous') {
      humanReview.push({ clauseId: clause.id, status: clause.status, detail: clause.alternatives.map((alt) => alt.summary).join('；') });
    }
  }

  const untranslated = [...clausesByVerse.keys()].filter((bcv) => !textsByVerse.has(bcv)).sort((a, b) => a - b);
  const spoken = texts.filter((text) => text.translationSpan > 0);
  const otherLevel = [...new Set(spoken.filter((text) => (text.literalness ?? DEFAULT_LITERALNESS) !== level).map((text) => text.bcv))].sort((a, b) => a - b);
  const legacy = [...new Set(spoken.filter((text) => hasLegacyBrackets(parseSegments(text.formatted))).map((text) => text.bcv))].sort((a, b) => a - b);
  return { issues, humanReview, untranslated, otherLevel, legacy };
}

/** 节号列表 → 按章合并的连续范围，如「创 1:3-5」。 */
export function verseRanges(bookName: string, bcvs: number[]): string[] {
  const sorted = [...new Set(bcvs)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];
  const flush = () => {
    const chapter = chapterFromBcv(start);
    ranges.push(start === previous ? `${bookName} ${chapter}:${start % 1000}` : `${bookName} ${chapter}:${start % 1000}-${previous % 1000}`);
  };
  for (const bcv of sorted.slice(1)) {
    if (bcv === previous + 1) {
      previous = bcv;
      continue;
    }
    flush();
    start = bcv;
    previous = bcv;
  }
  if (start !== undefined) {
    flush();
  }
  return ranges;
}
