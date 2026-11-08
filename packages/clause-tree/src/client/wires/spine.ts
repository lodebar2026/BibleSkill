/** 叙事主线：主线上的顶层句用短横线接到最外侧的脊线（不画圆点，前置看框头标签）；离线句不接，脊线只连主线句。 */
import { $ } from '../dom.js';
import { D, hasParent, mainline, offline } from '../model.js';
import type { Layout } from './layout.js';

export function drawSpine(L: Layout): void {
  const { base, rtl, start, svg } = L;
  const roots: Array<[number, HTMLElement]> = [];
  for (const clause of D.clauses) {
    const box = $(`[data-box="${clause.id}"]`);
    if (mainline && box && (box.dataset.form || box.dataset.ntForm || clause.mainline) && !box.hidden && !hasParent(clause) && !offline(clause)) {
      const r = box.getBoundingClientRect();
      roots.push([Math.round(r.top + r.height / 2 - base.top), box]);
    }
  }
  if (roots.length > 0) {
    const forestRect = $('#forest').getBoundingClientRect();
    const x = start(forestRect) + (rtl ? -12 : 12);
    L.path(svg, `M${x},${roots[0][0]} L${x},${roots.at(-1)![0]}`, 'spine');
    for (const [y, box] of roots) {
      L.path(svg, `M${x},${y} L${start(box.getBoundingClientRect())},${y}`, 'spine').style.strokeWidth = '1.5';
    }
  }
}
