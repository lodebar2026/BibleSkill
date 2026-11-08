/**
 * 逻辑关系：虚线走在框的另一侧（尾侧），从本句连到关联子句（一段时连到首句并标出范围）。
 * 跨度短的贴近方框、长的往外（嵌套的不相交）；每条在候选车道里挑交叉最少、又不与纵向重叠的竖线贴得太近的；指向同一句的箭头上下错开。
 */
import { $ } from '../dom.js';
import { type Clause, D } from '../model.js';
import { type Point, type Seg, polyline } from './geometry.js';
import type { Layout } from './layout.js';

/** 逻辑虚线后画，先估出它们的位置：从两框尾边中点横出，到两句之间所有方框尾侧之外的竖道。句法连线挑走法时与它们的交叉照样计数。 */
export function estimateLogicSegs(L: Layout): Seg[] {
  const { base, rtl, endOf, visible, showLogic } = L;
  const logicSegs: Seg[] = [];
  for (const clause of showLogic ? D.clauses : []) {
    const from = $(`[data-box="${clause.id}"]`);
    const to = clause.logic && clause.logic.targetIds.length > 0 ? $(`[data-box="${clause.logic.targetIds[0]}"]`) : null;
    if (!from || !to || from.hidden || to.hidden) {
      continue;
    }
    const [ra, rb] = [from.getBoundingClientRect(), to.getBoundingClientRect()];
    const [ya, yb] = [ra.top + ra.height / 2 - base.top, rb.top + rb.height / 2 - base.top];
    let lane = rtl ? Math.min(endOf(ra), endOf(rb)) : Math.max(endOf(ra), endOf(rb));
    for (const item of visible) {
      if (item.top < Math.max(ya, yb) && item.bottom > Math.min(ya, yb)) {
        lane = rtl ? Math.min(lane, item.left) : Math.max(lane, item.right);
      }
    }
    lane += rtl ? -18 : 18;
    logicSegs.push(...polyline([[endOf(ra), ya], [lane, ya], [lane, yb], [endOf(rb), yb]]));
  }
  return logicSegs;
}

export function drawLogic(L: Layout): void {
  const { canvas, base, rtl, allBoxes, segs, verticals, placed, svg, cost, arrow, overlapsLabel, endOf: end } = L;
  const outer = (a: number, b: number) => (rtl ? Math.min(a, b) : Math.max(a, b));
  // 尾侧挨着横排进来的从句（同一行里后面还有框）：逻辑虚线改从顶边、底边进出，横线从整行上方或下方绕过去
  const hemmed = (box: HTMLElement) => box.parentElement?.classList.contains('row') && box.nextElementSibling instanceof HTMLElement && !box.nextElementSibling.hidden
    ? box.parentElement.getBoundingClientRect() : null;
  const links: Array<{ clause: Clause; c: DOMRect; t: DOMRect; top: number; bottom: number; edge: number; cRow: DOMRect | null; tRow: DOMRect | null }> = [];
  for (const clause of D.clauses) {
    const targetId = clause.logic?.targetIds[0];
    const childBox = targetId ? $(`[data-box="${clause.id}"]`) : null;
    const targetBox = targetId ? $(`[data-box="${targetId}"]`) : null;
    if (!clause.logic || !childBox || !targetBox || childBox.hidden || targetBox.hidden) {
      continue;
    }
    const c = childBox.getBoundingClientRect();
    const t = targetBox.getBoundingClientRect();
    const top = Math.min(c.top, t.top) - base.top;
    const bottom = Math.max(c.bottom, t.bottom) - base.top;
    let edge = outer(end(c), end(t));
    for (const box of allBoxes) {
      const r = box.getBoundingClientRect();
      if (!box.hidden && r.bottom - base.top >= top && r.top - base.top <= bottom) {
        edge = outer(edge, end(r));
      }
    }
    links.push({ clause, c, t, top, bottom, edge, cRow: hemmed(childBox), tRow: hemmed(targetBox) });
  }
  // 每个框上的连接点按方向和跨度排好上下：往上走的在上、往下走的在下；
  // 往上的跨度越长越靠下、往下的跨度越长越靠上（外圈的横线不会横穿内圈的竖线）
  const anchors = new Map<string, Array<{ key: string; up: boolean; span: number; rect: DOMRect }>>();
  const addAnchor = (id: string, key: string, up: boolean, span: number, rect: DOMRect) => anchors.set(id, [...(anchors.get(id) ?? []), { key, up, span, rect }]);
  links.forEach(({ clause, c, t, top, bottom }, index) => {
    addAnchor(clause.id, `${index}c`, t.top < c.top, bottom - top, c);
    addAnchor(clause.logic!.targetIds[0], `${index}t`, c.top < t.top, bottom - top, t);
  });
  const anchorY = new Map<string, number>();
  const anchorRank = new Map<string, number>();
  for (const list of anchors.values()) {
    list.sort((a, b) => (a.up === b.up ? (a.up ? a.span - b.span : b.span - a.span) : a.up ? -1 : 1));
    // 顶边、底边进出时按离框远近错开：往上的、往下的各自从靠近尾角处排起
    list.filter((item) => item.up).reverse().forEach((item, i) => anchorRank.set(item.key, i));
    list.filter((item) => !item.up).forEach((item, i) => anchorRank.set(item.key, i));
    const rect = list[0].rect;
    // 以框的垂直中点为中心上下排开；间距大于标签高度，贴着同一框的两段横线各放标签时不重叠（徒 8:22a）
    const step = Math.min(24, (rect.height - 16) / Math.max(1, list.length));
    const middle = rect.top - base.top + rect.height / 2;
    list.forEach((item, i) => anchorY.set(item.key, Math.round(middle + (i - (list.length - 1) / 2) * step)));
  }
  const order = links.map((link, index) => ({ ...link, index }));
  const labels: Array<{ label: HTMLElement; line: Point[]; lane: number }> = [];
  for (const { clause, c, t, top, bottom, edge, index, cRow, tRow } of order.sort((a, b) => (a.bottom - a.top) - (b.bottom - b.top))) {
    /** 框上的连接段：尾侧空着时从侧边横出；被挡住时从顶边或底边竖出，再到整行外侧的横道。返回 [框上的点, 横道上的点]。 */
    const attach = (rect: DOMRect, row: DOMRect | null, key: string, up: boolean): Point[] => {
      if (!row) {
        return [[end(rect), anchorY.get(key)!]];
      }
      const rank = anchorRank.get(key) ?? 0;
      const x = Math.round(end(rect) + (rtl ? 1 : -1) * (16 + rank * 10));
      const yEdge = (up ? rect.top : rect.bottom) - base.top;
      // 框可能比整行的外框更靠外（如 徒 8:10a 底边低于行底）：横道从两者更外的边算起，离框边至少 16px，箭头（9px）前留一段竖线
      const yLane = Math.round((up ? Math.min(row.top, rect.top) - 16 - rank * 6 : Math.max(row.bottom, rect.bottom) + 16 + rank * 6) - base.top);
      return [[x, yEdge], [x, yLane]];
    };
    const from = attach(c, cRow, `${index}c`, t.top < c.top);
    const to = attach(t, tRow, `${index}t`, c.top < t.top).reverse();
    const y1 = from.at(-1)![1];
    const y2 = to[0][1];
    const points = (x: number): Point[] => [...from, [x, y1], [x, y2], ...to];
    let best = 0;
    let bestCost = Infinity;
    for (let k = 0; k < 16; k += 1) {
      const x = edge + (rtl ? -1 : 1) * (18 + k * 12);
      if (verticals.some((line) => line.top < bottom && line.bottom > top && Math.abs(line.x - x) < 10)) {
        continue;
      }
      const value = cost(polyline(points(x)));
      if (value < bestCost) {
        best = x;
        bestCost = value;
      }
      if (value === 0) {
        break;
      }
    }
    verticals.push({ x: best, top, bottom });
    segs.push(...polyline(points(best)));
    arrow(svg, points(best), 'logic');
    const label = document.createElement('div');
    label.className = 'll';
    label.textContent = clause.logic!.targetIds.length > 1 ? `${clause.logic!.label} → ${clause.logic!.targetText}` : clause.logic!.label;
    canvas.append(label);
    labels.push({ label, line: points(best), lane: best });
  }
  // 标签放在这条线独有的横段上（几条竖道并排时，放在竖线上看不出归属）：挑最长的横段，避开横穿它的竖线和已放好的标签；
  // 横段都放不下时才放在竖线中点，与已放好的标签重叠就往下挪
  for (const { label, line, lane } of labels) {
    const width = label.offsetWidth + 8;
    const height = label.offsetHeight + 4;
    let spot: Point | null = null;
    let room = 0;
    for (let i = 1; i < line.length; i += 1) {
      const [[xa, ya], [xb, yb]] = [line[i - 1], line[i]];
      if (ya !== yb || Math.abs(xb - xa) < width + 12) {
        continue;
      }
      const lo = Math.min(xa, xb) + 6 + width / 2;
      const hi = Math.max(xa, xb) - 6 - width / 2;
      for (let x = lo; x <= hi; x += 4) {
        const clear = !verticals.some((v) => v.x !== lane && v.top < ya && v.bottom > ya && Math.abs(v.x - x) < width / 2 + 2)
          && !overlapsLabel(x, ya, width, height);
        if (clear && hi - lo + width > room) {
          spot = [x, ya];
          room = hi - lo + width;
          break;
        }
      }
    }
    let [x, y] = spot ?? [lane, (line[0][1] + line.at(-1)![1]) / 2];
    while (!spot && overlapsLabel(x, y, width, height)) {
      y += height;
    }
    placed.push({ x, y, w: width, h: height });
    label.style.left = `${x}px`;
    label.style.top = `${y}px`;
  }
}
