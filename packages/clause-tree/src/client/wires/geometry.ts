/** 连线的几何：折线由横竖线段组成，坐标相对画布。 */

export type Point = [number, number];
export type Seg = { x1: number; y1: number; x2: number; y2: number };

export const polyline = (points: Point[]): Seg[] => points.slice(1).map(([x, y], i) => ({ x1: points[i][0], y1: points[i][1], x2: x, y2: y }));

/** 一横一竖在两段内部相交（端点相接不算）。 */
export const crosses = (a: Seg, b: Seg) => {
  const [h, v] = a.y1 === a.y2 ? [a, b] : [b, a];
  if (h.y1 !== h.y2 || v.x1 !== v.x2) {
    return false;
  }
  const [hx1, hx2] = [Math.min(h.x1, h.x2), Math.max(h.x1, h.x2)];
  const [vy1, vy2] = [Math.min(v.y1, v.y2), Math.max(v.y1, v.y2)];
  return v.x1 > hx1 + 1 && v.x1 < hx2 - 1 && h.y1 > vy1 + 1 && h.y1 < vy2 - 1;
};

/** 两段在同一条直线上且有一段叠在一起。 */
export const overlapping = (a: Seg, b: Seg) => {
  const range = (p1: number, p2: number, q1: number, q2: number) => Math.min(Math.max(p1, p2), Math.max(q1, q2)) - Math.max(Math.min(p1, p2), Math.min(q1, q2)) > 1;
  return a.x1 === a.x2 && b.x1 === b.x2 ? Math.abs(a.x1 - b.x1) < 1 && range(a.y1, a.y2, b.y1, b.y2)
    : a.y1 === a.y2 && b.y1 === b.y2 && Math.abs(a.y1 - b.y1) < 1 && range(a.x1, a.x2, b.x1, b.x2);
};

export const length = (points: Point[]) => points.slice(1).reduce((sum, [x, y], i) => sum + Math.abs(x - points[i][0]) + Math.abs(y - points[i][1]), 0);

/** 从 (x, y) 沿 seg 能走的方向（l r u d）；点不在 seg 上时为空。 */
const directions = (x: number, y: number, seg: Seg) => {
  const on = (a: number, b: number, v: number) => v >= Math.min(a, b) - 0.5 && v <= Math.max(a, b) + 0.5;
  if (!on(seg.x1, seg.x2, x) || !on(seg.y1, seg.y2, y) || (seg.x1 === seg.x2 && Math.abs(seg.x1 - x) > 0.5) || (seg.y1 === seg.y2 && Math.abs(seg.y1 - y) > 0.5)) {
    return [];
  }
  const ends = [[seg.x1, seg.y1], [seg.x2, seg.y2]].filter(([ex, ey]) => Math.abs(ex - x) > 0.5 || Math.abs(ey - y) > 0.5);
  return ends.map(([ex, ey]) => (ex > x ? 'r' : ex < x ? 'l' : ey > y ? 'd' : 'u'));
};

/** 指向同一个词的线汇成主干：汇合处最多三个方向（┬ ┴ ├ ┤），四个方向就成了十字，看着像交叉而过。返回 path 上这样的十字数。 */
export const crossJoints = (path: Seg[], others: Seg[]) => {
  const points = path.flatMap((seg) => [[seg.x1, seg.y1], [seg.x2, seg.y2]])
    .concat(others.flatMap((seg) => [[seg.x1, seg.y1], [seg.x2, seg.y2]]));
  const seen = new Set<string>();
  let count = 0;
  for (const [x, y] of points) {
    const key = `${Math.round(x)},${Math.round(y)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const mine = new Set(path.flatMap((seg) => directions(x, y, seg)));
    if (mine.size > 0 && new Set([...mine, ...others.flatMap((seg) => directions(x, y, seg))]).size === 4) {
      count += 1;
    }
  }
  return count;
};

/** 折线的 path；hops 是与已画线段的交叉点，在那里画一个小半圆跨过去（看得出是交叉而过，不是接在一起）。 */
const HOP = 5;
export const pathD = (points: Point[], hops: Point[] = []) => points.map(([x, y], i) => {
  if (i === 0) {
    return `M${x},${y}`;
  }
  const [px, py] = points[i - 1];
  const length = Math.hypot(x - px, y - py) || 1;
  const [ux, uy] = [(x - px) / length, (y - py) / length];
  const along = hops.map(([hx, hy]) => ({ hx, hy, t: (hx - px) * ux + (hy - py) * uy }))
    .filter(({ hx, hy, t }) => t > HOP + 1 && t < length - HOP - 1 && Math.abs((hx - px) * uy - (hy - py) * ux) < 0.5)
    .sort((a, b) => a.t - b.t);
  return along.map(({ hx, hy }) => `L${hx - ux * HOP},${hy - uy * HOP} A${HOP},${HOP} 0 0 1 ${hx + ux * HOP},${hy + uy * HOP}`).join(' ') + ` L${x},${y}`;
}).join(' ');
