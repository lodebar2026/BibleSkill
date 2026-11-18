/** 叙事主线：主线上的顶层句用短横线接到最外侧的脊线（不画圆点，前置看框头标签）；离线句不接，脊线只连主线句。 */
import { $ } from '../dom.js';
import { D, hasParent, mainline, offline } from '../model.js';
import type { Seg } from './geometry.js';
import type { Layout } from './layout.js';

export type Spine = { x: number; roots: Array<[number, number]> } | null;

/** 主线的位置：脊线横坐标，各主线句接头的纵坐标与框的起始边。 */
export function spineOf(L: Layout): Spine {
  const { base, rtl, start } = L;
  const roots: Array<[number, number]> = [];
  for (const clause of D.clauses) {
    const box = $(`[data-box="${clause.id}"]`);
    if (mainline && box && (box.dataset.form || box.dataset.ntForm || clause.mainline) && !box.hidden && !hasParent(clause) && !offline(clause)) {
      const r = box.getBoundingClientRect();
      roots.push([Math.round(r.top + r.height / 2 - base.top), start(r)]);
    }
  }
  if (roots.length === 0) {
    return null;
  }
  return { x: start($('#forest').getBoundingClientRect()) + (rtl ? -12 : 12), roots };
}

/**
 * 主线的各段：句法连线挑走法前先记进已画线段，横穿主线（脊线或接进主线句的短横线）算交叉
 * （徒 11:29a 在 29b 前、挂 29b 下的 29c，原走起始侧沟槽，穿过 29b 接主线的短横线）。
 */
export function spineSegs(spine: Spine): Seg[] {
  if (!spine) {
    return [];
  }
  const { x, roots } = spine;
  return [{ x1: x, y1: roots[0][0], x2: x, y2: roots.at(-1)![0] }, ...roots.map(([y, edge]): Seg => ({ x1: x, y1: y, x2: edge, y2: y }))];
}

export function drawSpine(L: Layout, spine: Spine): void {
  if (!spine) {
    return;
  }
  const { x, roots } = spine;
  L.path(L.svg, `M${x},${roots[0][0]} L${x},${roots.at(-1)![0]}`, 'spine');
  for (const [y, edge] of roots) {
    L.path(L.svg, `M${x},${y} L${edge},${y}`, 'spine');
  }
}
