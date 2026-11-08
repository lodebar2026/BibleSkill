/**
 * 句法连线挑走法并画出：按「交叉数 → 折点数 → 长度」取最好的；跨度短的先定。
 * 指向同一个词的几条线一起挑（可共用一段主干绕开别的线）：组合不多时穷举；各组按其中跨度最短的那条排先后。
 */
import { D, byId } from '../model.js';
import { type Point, type Seg, crossJoints, crosses, length, overlapping, pathD, polyline } from './geometry.js';
import type { Layout } from './layout.js';
import type { Wire } from './routes.js';

/** 从句连线上要标的「宾语」「引语」「定语」等：同一组（指向同一个词）、标签相同的几条线记在一起，标签只标一次。 */
export type ArgumentLines = Array<{ key: string; text: string; lines: Point[][] }>;

export function pickWires(L: Layout, wires: Wire[], logicSegs: Seg[]): ArgumentLines {
  const { segs, svg, tips, verticals, cost, crossings, crowded, hitArea, arrow } = L;
  const argumentLines: ArgumentLines = [];
  const groupSegs = new Map<string, Seg[]>();
  const groups = new Map<string, Wire[]>();
  for (const wire of wires) {
    groups.set(wire.group, [...(groups.get(wire.group) ?? []), wire]);
  }
  const score = (wire: Wire, index: number) => {
    const points = wire.candidates[index];
    const path = polyline(points);
    const logicCrossings = path.reduce((sum, seg) => sum + logicSegs.filter((other) => crosses(seg, other)).length, 0);
    const own = groupSegs.get(wire.group) ?? [];
    const joints = crossJoints(path, own);
    // 与别组的线重合（同一条竖道或横道上有一段叠在一起）看不出各自指向哪个词，与交叉同价
    const shared = path.reduce((sum, seg) => sum + segs.filter((other) => !own.includes(other) && overlapping(seg, other)).length, 0);
    // 新约：主干、分叉优先走起始侧（左侧），尾侧留给逻辑虚线；只在左侧会多出交叉时才走尾侧
    const farCost = !D.isOT && wire.farSide.has(index) ? 500 : 0;
    // 新约：几条线指向同一个词时，都从起始侧沟槽汇进主干（包括正对着目标词、本可直上的那条，如引语的第一句）
    const sideCost = !D.isOT && !wire.startSide.has(index) && (groups.get(wire.group)?.length ?? 0) > 1 ? 400 : 0;
    return (cost(path) + logicCrossings + joints + shared) * 1000 + crowded(points) * 300 + (points.length - 2) * 40 + length(points) * 0.05 + farCost + sideCost;
  };
  const commit = (wire: Wire, best: Point[]) => {
    // 与先画的线交叉处，后画的这条跨过去
    const hops = crossings(best);
    const lines = polyline(best);
    segs.push(...lines);
    groupSegs.set(wire.group, [...(groupSegs.get(wire.group) ?? []), ...lines]);
    // 句法竖线也记下，逻辑虚线不贴着它们走
    for (const seg of lines.filter((item) => item.x1 === item.x2)) {
      verticals.push({ x: seg.x1, top: Math.min(seg.y1, seg.y2), bottom: Math.max(seg.y1, seg.y2) });
    }
    hitArea(best, wire.clause);
    const wireLabel = byId.get(wire.clause)?.wireLabel;
    // 几条线指向同一个词（汇成一条主干）、标签又相同时只标一次，放在它们共用的那段上（见 labels.ts）
    if (wireLabel) {
      const labelKey = `${wire.group}|${wireLabel}`;
      const line: Point[] = wire.into === null ? best : [...best, [best.at(-1)![0], wire.into]];
      const entry = argumentLines.find((item) => item.key === labelKey);
      if (entry) {
        entry.lines.push(line);
      } else {
        argumentLines.push({ key: labelKey, text: wireLabel, lines: [line] });
      }
    }
    if (wire.into === null) {
      arrow(svg, best, '', hops);
    } else {
      // 框外一段画在下层，伸进框里的一段画在上层
      L.path(svg, pathD(best, hops));
      const [x, y] = best.at(-1)!;
      arrow(tips, [[x, y], [x, wire.into]]);
    }
  };
  const minSpan = (group: Wire[]) => Math.min(...group.map((wire) => wire.span));
  for (const group of [...groups.values()].sort((a, b) => minSpan(a) - minSpan(b))) {
    group.sort((a, b) => a.span - b.span);
    const combos = group.reduce((product, wire) => product * wire.candidates.length, 1);
    if (group.length === 1 || combos > 20000) {
      for (const wire of group) {
        const index = wire.candidates.reduce((best, _, i) => (score(wire, i) < score(wire, best) ? i : best), 0);
        commit(wire, wire.candidates[index]);
      }
      continue;
    }
    const singles = group.map((wire) => wire.candidates.map((_, i) => score(wire, i)));
    const pick = group.map(() => 0);
    let bestPick = [...pick];
    let bestScore = Infinity;
    const walk = (depth: number, sum: number) => {
      if (sum >= bestScore) {
        return;
      }
      if (depth === group.length) {
        bestScore = sum;
        bestPick = [...pick];
        return;
      }
      for (const [i, single] of singles[depth].entries()) {
        pick[depth] = i;
        const mine = polyline(group[depth].candidates[i]);
        const picked = pick.slice(0, depth).flatMap((j, d) => polyline(group[d].candidates[j]));
        const mutual = picked.reduce((m, seg) => m + mine.filter((other) => crosses(seg, other)).length, 0)
          + crossJoints(mine, [...(groupSegs.get(group[0].group) ?? []), ...picked]);
        walk(depth + 1, sum + single + mutual * 1000);
      }
    };
    walk(0, 0);
    group.forEach((wire, d) => commit(wire, wire.candidates[bestPick[d]]));
  }
  return argumentLines;
}
