/**
 * 子句的词与嵌入。纯函数，浏览器端视图也用（@bs/core/clause-words）。
 *
 * 子句范围（firstWordId–lastWordId）严格落在同节另一子句范围之内（首末词都不贴边）时，它嵌在那个子句中间。
 * 子句**自身的词** = 范围内的词减去嵌在其中的子句的词，所以母句可以不连续。旧数据不重叠，自身的词就是整个范围。
 */

export type ClauseSpan = { id: string; firstWordId: string; lastWordId: string };

/** outer 的范围严格包含 inner：inner 嵌在 outer 中间。 */
export function embeds(outer: ClauseSpan, inner: ClauseSpan): boolean {
  return outer.id !== inner.id && outer.firstWordId < inner.firstWordId && inner.lastWordId < outer.lastWordId;
}

/** 直接包含 clause 的最内层子句（范围层层嵌套时首词最靠后的那个）；没有嵌入时为 undefined。 */
export function containerOf<T extends ClauseSpan>(clause: ClauseSpan, clauses: T[]): T | undefined {
  return clauses.filter((item) => embeds(item, clause)).sort((a, b) => b.firstWordId.localeCompare(a.firstWordId))[0];
}

/** 每个子句自身的词（按原文顺序）。 */
export function clauseWords<T extends { id: string }>(clauses: ClauseSpan[], tokens: T[]): Map<string, T[]> {
  return new Map(clauses.map((clause) => {
    const inner = clauses.filter((item) => embeds(clause, item));
    return [clause.id, tokens.filter((token) => token.id >= clause.firstWordId && token.id <= clause.lastWordId
      && !inner.some((item) => token.id >= item.firstWordId && token.id <= item.lastWordId))];
  }));
}

/** 含这个词的最内层子句（词归属哪一句）。 */
export function clauseOfWord<T extends ClauseSpan>(wordId: string, clauses: T[]): T | undefined {
  return clauses.filter((item) => item.firstWordId <= wordId && wordId <= item.lastWordId)
    .sort((a, b) => b.firstWordId.localeCompare(a.firstWordId))[0];
}

/**
 * 母句里嵌入子句留下的空洞：`at` 是空洞后第一个自身词在 own 里的下标，clauseIds 是直接嵌在这个空洞里的子句（按原文顺序）。
 * 嵌在这些子句里面的更深一层不列（它们在自己的母句里另有空洞）。
 */
export function embedSlots(container: ClauseSpan, clauses: ClauseSpan[], own: Array<{ id: string }>): Array<{ at: number; clauseIds: string[] }> {
  const slots: Array<{ at: number; clauseIds: string[] }> = [];
  const direct = clauses.filter((item) => containerOf(item, clauses)?.id === container.id)
    .sort((a, b) => a.firstWordId.localeCompare(b.firstWordId));
  for (const item of direct) {
    const at = own.findIndex((word) => word.id > item.lastWordId);
    const slot = slots.find((existing) => existing.at === at);
    if (slot) {
      slot.clauseIds.push(item.id);
    } else {
      slots.push({ at, clauseIds: [item.id] });
    }
  }
  return slots;
}
