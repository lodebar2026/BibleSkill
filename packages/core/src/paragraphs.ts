/**
 * 分段数据（db 的 paragraph 表）→ 段首子句。
 *
 * 段首词应是某个子句的首词（子句分析要在段首开新子句）；有几个子句同以它开头时取 id 最前的。
 * 段首词落在子句中间（旧的分析没按段首切）时，退到其后第一个子句，并标 exact: false，供审校提示重做分析。
 */
import type { ParagraphBreak } from './db.js';
import { parseClauseId } from './ref.js';
import type { ClauseEntity } from './schemas.js';

export type ParagraphStart = { heading: string | null; tokenId: string; exact: boolean };

export function paragraphStarts(clauses: Array<Pick<ClauseEntity, 'id' | 'firstWordId' | 'lastWordId'>>, breaks: ParagraphBreak[]): Map<string, ParagraphStart> {
  const ordered = [...clauses].sort((a, b) => a.firstWordId.localeCompare(b.firstWordId) || compareIds(a.id, b.id));
  const result = new Map<string, ParagraphStart>();
  for (const item of breaks) {
    const exact = ordered.find((clause) => clause.firstWordId === item.tokenId);
    const covering = exact ?? ordered.find((clause) => clause.firstWordId < item.tokenId && clause.lastWordId >= item.tokenId);
    if (!covering) {
      // 段首词不在任何子句里：范围外，或这一段还没有分析
      continue;
    }
    const clause = exact ?? ordered.find((candidate) => candidate.firstWordId > item.tokenId);
    if (!clause) {
      continue;
    }
    const previous = result.get(clause.id);
    result.set(clause.id, { heading: previous?.heading ?? item.heading, tokenId: item.tokenId, exact: exact !== undefined });
  }
  return result;
}

function compareIds(a: string, b: string): number {
  const left = parseClauseId(a);
  const right = parseClauseId(b);
  return left.bcv - right.bcv || left.sub.length - right.sub.length || left.sub.localeCompare(right.sub);
}

/** 存盘的 paraTitle → 标题文字；非段首为 undefined，段首无标题为 null。 */
export function paraTitleText(paraTitle: string | null): string | null | undefined {
  if (paraTitle === null) {
    return undefined;
  }
  try {
    const parts = JSON.parse(paraTitle) as Array<{ text?: string }>;
    const text = parts.map((part) => part.text ?? '').join('').trim();
    return text || null;
  } catch {
    return paraTitle.trim() || null;
  }
}
