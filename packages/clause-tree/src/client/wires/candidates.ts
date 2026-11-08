/**
 * 一条句法连线的几种走法：1) 从子句朝母句的那条边直接出；1b) 从侧边横出；2) 起始侧沟槽；3) 尾侧沟槽；
 * 4) 经中间方框之间的空隙绕过去。排除穿过其他方框的；挑哪一种见 pick.ts。
 */
import { type Clause, logicBoxes } from '../model.js';
import type { Point } from './geometry.js';
import type { Layout } from './layout.js';

/** 子句框 c、母句的边 edge、横道 yLane、箭头尖 tip、目标词的横坐标 xT；skip 是子句与母句两个框（竖线可以碰它们）。 */
export type RouteInput = { clause: Clause; c: DOMRect; skip: HTMLElement[]; below: boolean; edge: number; tip: number; yLane: number; yChild: number; xT: number };

export function candidatesFor(L: Layout, { clause, c, skip, below, edge, tip, yLane, yChild, xT }: RouteInput) {
  const { base, rtl, start, endOf, blockedV, visible, canvas, showLogic } = L;
  const candidates: Point[][] = [];
  // 1) 从子句朝母句的那条边直接出：能对准被修饰词就一根竖线，否则在母句旁的空隙横折一次
  const childEdge = (below ? c.top : c.bottom) - base.top;
  const [cl, cr] = [c.left - base.left + c.width * 0.2, c.right - base.left - c.width * 0.2];
  // 目标词对着子句框底边、顶边的中段时直接一根竖线；否则横折，折出来的横段太短（不到 16px）不好看，不用
  const straight = xT >= cl && xT <= cr;
  const exits = [...new Set([Math.min(Math.max(xT, cl), cr), (cl + cr) / 2, rtl ? cr : cl].map(Math.round))]
    .map((x) => (straight && Math.abs(x - xT) < 16 ? xT : x))
    .filter((x) => x === xT || Math.abs(x - xT) >= 16);
  for (const x of [...new Set(exits)]) {
    if (Math.abs(x - xT) < 1) {
      if (!blockedV(xT, childEdge, tip, skip)) {
        candidates.push([[xT, childEdge], [xT, tip]]);
      }
    } else if (!blockedV(x, childEdge, yLane, skip)) {
      candidates.push([[x, childEdge], [x, yLane], [xT, yLane], [xT, tip]]);
    }
  }
  // 1b) 目标词在子句框的左右外侧时，从那一侧的边横出、再竖直指到词：只折一次。
  // 横段放在边的上部（逻辑虚线接在边的中点）；竖线、横段都不能穿过别的框；
  // 走尾侧时，竖线旁边若有带逻辑关系的框，逻辑虚线进出框的横线会穿过竖线，不用
  const sideX = xT < c.left - base.left - 16 ? c.left - base.left : xT > c.right - base.left + 16 ? c.right - base.left : null;
  if (sideX !== null) {
    const ySide = Math.round(c.top - base.top + Math.min(c.height * 0.3, 40));
    const onFar = rtl ? sideX === c.left - base.left : sideX === c.right - base.left;
    const between = visible.filter((item) => !skip.includes(item.box) && item.top < ySide && item.bottom > tip);
    const blockedH = visible.some((item) => !skip.includes(item.box) && ySide > item.top - 3 && ySide < item.bottom + 3
      && Math.max(item.left, Math.min(sideX, xT)) < Math.min(item.right, Math.max(sideX, xT)));
    const logicBeside = onFar && !canvas.classList.contains('hide-logic')
      && between.some((item) => logicBoxes.has(item.box.dataset.box!) && (rtl ? item.left > xT : item.right < xT));
    if (!blockedH && !logicBeside && !blockedV(xT, ySide, tip, skip)) {
      candidates.push([[sideX, ySide], [xT, ySide], [xT, tip]]);
    }
  }
  // 2) 起始侧沟槽：在子句与母句之间所有方框的起始侧之外（记在 startSide）
  const startSide = new Set<number>();
  let gutter = start(c) + (rtl ? 16 : -16);
  for (const item of visible) {
    if (!skip.includes(item.box) && item.top < Math.max(childEdge, edge) && item.bottom > Math.min(childEdge, edge)) {
      gutter = rtl ? Math.max(gutter, (rtl ? item.right : item.left) + 10) : Math.min(gutter, item.left - 10);
    }
  }
  // 目标词落在沟槽与子句起始边之间、或离沟槽不到 16px 时，竖道再往外挪到目标词外侧 16px：
  // 否则分支只有贴着框的一小段横线（徒 9:5d→ὁ），或在横道上折出一个小台阶
  if (rtl ? xT < gutter + 16 && xT >= start(c) : xT > gutter - 16 && xT <= start(c)) {
    gutter = rtl ? xT + 16 : xT - 16;
  }
  for (let k = 0; k < 6; k += 1) {
    const g = gutter + (rtl ? 1 : -1) * k * 6;
    startSide.add(candidates.length);
    candidates.push([[start(c), yChild], [g, yChild], [g, yLane], [xT, yLane], [xT, tip]]);
  }
  // 3) 尾侧沟槽（这里和 4) 里竖道在尾侧的走法记在 farSide）
  const farSide = new Set<number>();
  let far = endOf(c);
  for (const item of visible) {
    if (item.top < Math.max(childEdge, edge) && item.bottom > Math.min(childEdge, edge)) {
      far = rtl ? Math.min(far, item.left) : Math.max(far, item.right);
    }
  }
  // 子句自己带逻辑关系时，逻辑虚线接在尾边中点，句法线改从尾边上部出
  const yFar = showLogic && logicBoxes.has(clause.id) ? Math.round(c.top - base.top + Math.min(c.height * 0.3, 40)) : yChild;
  for (let k = 0; k < 4; k += 1) {
    const g = far + (rtl ? -1 : 1) * (10 + k * 6);
    farSide.add(candidates.length);
    candidates.push([[endOf(c), yFar], [g, yFar], [g, yLane], [xT, yLane], [xT, tip]]);
  }
  // 4) 经中间方框之间的空隙绕过去：从子句朝母句的边（或起始侧沟槽）进空隙，横走到尾侧沟槽或正对目标词处，再往母句去。
  // 挡在中间的从句与母句的连线（如嵌入子句的竖线）这样就不必横穿
  const [lo, hi] = [Math.min(childEdge, edge), Math.max(childEdge, edge)];
  const inRange = visible.filter((item) => item.top < hi && item.bottom > lo).sort((a, b) => a.top - b.top);
  let cursor = lo;
  const gaps: number[] = [];
  for (const item of inRange) {
    if (item.top - cursor >= 12) {
      gaps.push(Math.round((cursor + item.top) / 2));
    }
    cursor = Math.max(cursor, item.bottom);
  }
  if (hi - cursor >= 12) {
    gaps.push(Math.round((cursor + hi) / 2));
  }
  for (const yG of gaps.filter((y) => Math.abs(y - yLane) > 8 && Math.abs(y - childEdge) > 8)) {
    const entries: Array<Array<[number, number]>> = [
      ...[...new Set(exits)].filter((x) => !blockedV(x, childEdge, yG, skip)).map((x): Array<[number, number]> => [[x, childEdge], [x, yG]]),
      [[start(c), yChild], [gutter, yChild], [gutter, yG]],
    ];
    // 尾侧竖道只需绕开空隙到母句之间的方框：同一处空隙出来的线落在同一条竖道上，能汇成主干
    let farAbove = rtl ? Infinity : -Infinity;
    for (const item of inRange) {
      if (item.top < Math.max(yG, edge) && item.bottom > Math.min(yG, edge)) {
        farAbove = rtl ? Math.min(farAbove, item.left) : Math.max(farAbove, item.right);
      }
    }
    for (const entry of entries) {
      const g = (Number.isFinite(farAbove) ? farAbove : far) + (rtl ? -1 : 1) * 10;
      farSide.add(candidates.length);
      candidates.push([...entry, [g, yG], [g, yLane], [xT, yLane], [xT, tip]]);
      if (!blockedV(xT, yG, tip, skip)) {
        candidates.push([...entry, [xT, yG], [xT, tip]]);
      }
    }
  }
  return { candidates, farSide, startSide, childEdge };
}
