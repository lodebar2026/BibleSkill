/**
 * 从句的连线上标「宾语」「引语」「定语」等：标签骑在线上，放在最长的一段，两头尽量各露出 10px 的线
 * （带标签的从句框上方多留了空隙，紧挨母句的短竖线也放得下）；与已放的标签重叠就沿线挪开。
 */
import type { Point } from './geometry.js';
import type { Layout } from './layout.js';
import type { ArgumentLines } from './pick.js';

const MARGIN = 10;
// 一组线从箭头往回共用的那段（到分叉为止）：标签放在这里，表示整串子句（如 8:32c–33b 这段引文）共同的作用，不落在某一条分支上
const sharedPart = (lines: Point[][]): Point[] => {
  const back = lines.map((line) => [...line].reverse());
  const same = (a: Point, b: Point) => Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5;
  const shared: Point[] = [back[0][0]];
  for (let k = 0; ; k += 1) {
    const nexts = back.map((line) => line[k + 1]);
    if (nexts.some((point) => !point) || !back.every((line) => same(line[k], shared.at(-1)!))) {
      break;
    }
    if (nexts.every((point) => same(point, nexts[0]))) {
      shared.push(nexts[0]);
      continue;
    }
    // 方向相同、在不同处拐弯：共用到最近的拐点
    const from = shared.at(-1)!;
    const dir = (point: Point) => [Math.sign(point[0] - from[0]), Math.sign(point[1] - from[1])].join();
    if (nexts.every((point) => dir(point) === dir(nexts[0]))) {
      shared.push(nexts.reduce((near, point) => (Math.abs(point[0] - from[0]) + Math.abs(point[1] - from[1])
        < Math.abs(near[0] - from[0]) + Math.abs(near[1] - from[1]) ? point : near)));
    }
    break;
  }
  return shared.length > 1 ? shared.reverse() : lines[0];
};

export function placeArgumentLabels(L: Layout, argumentLines: ArgumentLines): void {
  const { canvas, placed, overlapsLabel } = L;
  for (const { text, lines } of argumentLines) {
    const line = sharedPart(lines);
    const label = document.createElement('div');
    label.className = 'll al';
    label.textContent = text;
    canvas.append(label);
    const width = label.offsetWidth + 6;
    const height = label.offsetHeight + 4;
    const segments = line.slice(1).map((point, i) => ({ a: line[i], b: point, i }))
      .map((seg) => ({ ...seg, horizontal: seg.a[1] === seg.b[1], size: Math.abs(seg.b[0] - seg.a[0]) + Math.abs(seg.b[1] - seg.a[1]) }));
    const extent = (seg: (typeof segments)[number]) => (seg.horizontal ? width : height);
    const longest = (list: typeof segments) => list.reduce((best, item) => (item.size > best.size || (item.size === best.size && item.i > best.i) ? item : best));
    const fits = segments.filter((seg) => seg.size >= extent(seg) + 2 * MARGIN);
    const seg = longest(fits.length > 0 ? fits : segments);
    const [mx, my] = [(seg.a[0] + seg.b[0]) / 2, (seg.a[1] + seg.b[1]) / 2];
    const room = Math.max(0, (seg.size - extent(seg)) / 2 - MARGIN);
    let spot: Point = [mx, my];
    for (let k = 1; k <= 20 && overlapsLabel(spot[0], spot[1], width, height); k += 1) {
      const shift = (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * extent(seg) / 2;
      if (Math.abs(shift) <= room) {
        spot = seg.horizontal ? [mx + shift, my] : [mx, my + shift];
      }
    }
    placed.push({ x: spot[0], y: spot[1], w: width, h: height });
    label.style.left = `${spot[0]}px`;
    label.style.top = `${spot[1]}px`;
  }
}
