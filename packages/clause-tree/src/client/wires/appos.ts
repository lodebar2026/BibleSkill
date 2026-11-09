/**
 * 同位语：双线连到所配的成分。同一行时从两块底边往下、在块下方横过去（括号形）；下属子句的箭头要从下方伸进两块之间的词时
 * （box.ts 标了 data-appos-up）改从顶边往上、在块上方横过去。不在同一行时从上面那块的底边折到下面那块的顶边。
 */
import { $$ } from '../dom.js';
import type { Point } from './geometry.js';
import type { Layout } from './layout.js';

export function drawAppositions(L: Layout): void {
  const { canvas, base, tips } = L;
  for (const el of $$<HTMLElement>('.chip[data-appos]', canvas)) {
    const box = el.closest<HTMLElement>('.box');
    const head = box?.querySelector<HTMLElement>(`.chip[data-ci="${el.dataset.appos}"]`);
    if (!box || box.hidden || !head) {
      continue;
    }
    const [a, h] = [head.getBoundingClientRect(), el.getBoundingClientRect()];
    let points: Point[];
    // 同一行：两端放在两块相对的内侧边附近（离边 12px），不压在块中间常有箭头进来的地方（27b ἀνήρ）
    const sameRow = Math.abs(a.top - h.top) < 4;
    const inner = (rect: DOMRect, toward: DOMRect) => Math.round((toward.left > rect.left ? rect.right - Math.min(12, rect.width / 3) : rect.left + Math.min(12, rect.width / 3)) - base.left);
    const x1 = sameRow ? inner(a, h) : Math.round(a.left + a.width / 2 - base.left);
    const x2 = sameRow ? inner(h, a) : Math.round(h.left + h.width / 2 - base.left);
    if (sameRow && el.dataset.apposUp !== undefined) {
      const y = Math.round(Math.min(a.top, h.top) - base.top - 9);
      points = [[x1, a.top - base.top], [x1, y], [x2, y], [x2, h.top - base.top]];
    } else if (sameRow) {
      const y = Math.round(Math.max(a.bottom, h.bottom) - base.top + 9);
      points = [[x1, a.bottom - base.top], [x1, y], [x2, y], [x2, h.bottom - base.top]];
    } else {
      const [upper, lower, xu, xl] = a.top < h.top ? [a, h, x1, x2] : [h, a, x2, x1];
      const mid = Math.round((upper.bottom + lower.top) / 2 - base.top);
      points = [[xu, upper.bottom - base.top], [xu, mid], [xl, mid], [xl, lower.top - base.top]];
    }
    for (const cls of ['appos', 'appos-in']) {
      L.path(tips, points.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${Math.round(y)}`).join(' '), cls);
    }
  }
}
