/**
 * 争议线索：数据能直接给出的只有经文异文（STEPBible 以大写标出影响翻译者）。
 * 断句、句法、词义争议由模型在 analyze（status=ambiguous）与 translate（alternatives）中标出。
 */
import type { ClauseEntity, Token, VariantToken } from '@bs/core';

export type ClauseDisputes = {
  /** 子句分析标为 ambiguous 时的其他读法。 */
  analysis: Array<{ summary: string; basis?: string }>;
  /** 影响翻译的经文异文。 */
  textual: string[];
};

function truncate(value: string, max = 160): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** 连续的异文词合成一段（如约一 5:7 只在 TR 中的整段）。 */
function groupVariants(variants: VariantToken[]): VariantToken[][] {
  const groups: VariantToken[][] = [];
  for (const variant of variants) {
    const last = groups.at(-1)?.at(-1);
    if (last && last.bcv === variant.bcv && variant.wordNo === last.wordNo + 1 && variant.editions === last.editions) {
      groups.at(-1)!.push(variant);
    } else {
      groups.push([variant]);
    }
  }
  return groups;
}

/** 按节内子句分配争议线索：异文词按位置落到其后最近的子句（posId ≤ 子句末词）。 */
export function collectDisputes(
  clauses: ClauseEntity[],
  tokens: Token[],
  variants: VariantToken[],
): Map<string, ClauseDisputes> {
  const result = new Map<string, ClauseDisputes>();
  const byVerse = new Map<number, ClauseEntity[]>();
  for (const clause of clauses) {
    const bcv = Number(clause.id.match(/^(\d+)/)![1]);
    byVerse.set(bcv, [...(byVerse.get(bcv) ?? []), clause]);
    result.set(clause.id, {
      analysis: clause.status === 'ambiguous' ? clause.alternatives.map(({ summary, basis }) => ({ summary, basis })) : [],
      textual: [],
    });
  }
  const bracketed = new Set<string>();
  for (const token of tokens) {
    if (token.naBracket) {
      const clause = (byVerse.get(token.bcv) ?? []).find((item) => token.id >= item.firstWordId && token.id <= item.lastWordId);
      if (clause && !bracketed.has(clause.id)) {
        bracketed.add(clause.id);
        result.get(clause.id)!.textual.push('本句在 NA28/UBS5 的双括号 [[ ]] 内：编者判为后加的经文，但印在正文中');
      }
    }
    if (!token.significant) {
      continue;
    }
    const clause = (byVerse.get(token.bcv) ?? []).find((item) => token.id >= item.firstWordId && token.id <= item.lastWordId);
    if (clause) {
      result.get(clause.id)!.textual.push(`${token.surface}（${token.textType}）：${truncate(token.variantNote ?? '其他抄本此处不同')}`);
    }
  }
  for (const group of groupVariants(variants.filter((variant) => variant.significant))) {
    const verseClauses = byVerse.get(group[0].bcv) ?? [];
    const clause = verseClauses.find((item) => group[0].posId <= item.lastWordId) ?? verseClauses.at(-1);
    if (clause) {
      const words = group.map((variant) => variant.surface).join(' ');
      const gloss = group.map((variant) => variant.glossEn).join(' ');
      result.get(clause.id)!.textual.push(truncate(`主干（NA28/列宁格勒抄本）无而 ${group[0].editions ?? group[0].textType} 有：${words}（${gloss}）`));
    }
  }
  return result;
}

export function hasDisputes(disputes: ClauseDisputes | undefined): boolean {
  return Boolean(disputes && (disputes.analysis.length > 0 || disputes.textual.length > 0));
}
