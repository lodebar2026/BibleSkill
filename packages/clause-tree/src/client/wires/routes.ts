/**
 * 句法连线：每个从句连到母句里被修饰的词（或嵌入子句的占位符）。这里定出每条线的几种走法，挑选在 pick.ts。
 * 指向同一个词的线共用一条横道（汇成主干）；同一母句里指向不同词的，横道上下错开。
 */
import { $ } from '../dom.js';
import { type Clause, D, byId } from '../model.js';
import { candidatesFor } from './candidates.js';
import { type Point, polyline } from './geometry.js';
import type { Layout } from './layout.js';

/**
 * 一条线的候选走法（farSide、startSide 记下走尾侧、起始侧沟槽的是哪几种）；span 是子句与母句相隔多远，跨度短的先定。
 * into：箭头伸进母句框、指到被修饰词的那一段（画在方框上层）；没有目标词时为 null，箭头停在框边。
 */
export type Wire = { candidates: Point[][]; farSide: Set<number>; startSide: Set<number>; span: number; group: string; into: number | null; clause: string };

// 连线指到母句里的占位符（嵌入子句）或被修饰的词
const targetOf = (clause: Clause, parentBox: HTMLElement) => clause.targetSlot
  ? $(`[data-slot="${clause.targetSlot}"] .g`, parentBox)
  : clause.targetWordId ? $(`[data-id="${clause.targetWordId}"] .g`, parentBox) : null;

// 同一母句同一侧的横道按跨度排：子句离得最远的那组（主干在最外圈）用最靠近母句的横道，
// 内圈的竖线从更远的横道起，不会横穿外圈的横线（徒 8:9a 下 10a→Σίμων 与 9b–9d→προϋπῆρχεν）
function laneOrder(): Map<string, Map<string, number>> {
  const lanes = new Map<string, Map<string, number>>();
  const reach = new Map<string, Map<string, number>>();
  for (const clause of D.clauses) {
    const childBox = clause.parentId && byId.has(clause.parentId) ? $(`[data-box="${clause.id}"]`) : null;
    const parentBox = childBox ? $(`[data-box="${clause.parentId}"]`) : null;
    if (!childBox || !parentBox || childBox.hidden || parentBox.hidden || childBox.classList.contains('side')) {
      continue;
    }
    const c = childBox.getBoundingClientRect();
    const p = parentBox.getBoundingClientRect();
    const below = c.top >= p.bottom;
    const key = `${clause.parentId}|${below ? 'b' : 'a'}`;
    const targetKey = clause.targetSlot ?? clause.targetWordId ?? '';
    const spans = reach.get(key) ?? new Map<string, number>();
    spans.set(targetKey, Math.max(spans.get(targetKey) ?? 0, below ? c.top - p.bottom : p.top - c.bottom));
    reach.set(key, spans);
  }
  for (const [key, spans] of reach) {
    lanes.set(key, new Map([...spans].sort((a, b) => b[1] - a[1]).map(([target], i) => [target, i])));
  }
  return lanes;
}

export function buildWires(L: Layout): Wire[] {
  const { base, rtl, start, endOf, segs, svg, arrow, hitArea } = L;
  const lanes = laneOrder();
  const wires: Wire[] = [];
  for (const clause of D.clauses) {
    if (!clause.parentId || !byId.has(clause.parentId)) {
      continue;
    }
    const childBox = $(`[data-box="${clause.id}"]`);
    const parentBox = $(`[data-box="${clause.parentId}"]`);
    if (!childBox || !parentBox || childBox.hidden || parentBox.hidden) {
      continue;
    }
    const c = childBox.getBoundingClientRect();
    const p = parentBox.getBoundingClientRect();
    // 行尾的引语框架、过渡句引出的从句：一根横线从它的起始边指回母句的尾边，高度对着被修饰的词（排不下折到下一行时照常布线）
    if (childBox.classList.contains('side') && c.top < p.bottom) {
      const word = targetOf(clause, parentBox)?.getBoundingClientRect();
      const y = Math.round((word ? word.top + word.height / 2 : p.top + p.height / 2) - base.top);
      const points: Array<[number, number]> = [[start(c), y], [endOf(p) + (rtl ? -1 : 1), y]];
      segs.push(...polyline(points));
      arrow(svg, points);
      hitArea(points, clause.id);
      continue;
    }
    const below = c.top >= p.bottom;
    const laneKey = `${clause.parentId}|${below ? 'b' : 'a'}`;
    const byTarget = lanes.get(laneKey) ?? new Map<string, number>();
    const targetKey = clause.targetSlot ?? clause.targetWordId ?? '';
    if (!byTarget.has(targetKey)) {
      byTarget.set(targetKey, byTarget.size);
    }
    lanes.set(laneKey, byTarget);
    const lane = byTarget.get(targetKey)!;
    const skip = [childBox, parentBox];
    // 连线的起止点放在边的中段，不贴着框角：侧边取垂直中点，顶边、底边取中间 60%
    const yChild = Math.round(c.top + c.height / 2 - base.top);
    const target = targetOf(clause, parentBox);
    const t = target?.getBoundingClientRect();
    const edge = (below ? p.bottom : p.top) - base.top;
    // 从下方来的箭头伸进框里指到词的下沿；从上方来的停在框边（框头的编号、译文在词的上面）
    const into = t && below ? t.bottom - base.top + 3 : null;
    const tip = into !== null ? edge : below ? edge + 1 : edge - 1;
    // 横道离母句至少 13px：箭头（9px）前留一段竖线，折点不直接接在箭头上；多条横道相隔 4px，都在框间 26px 的空隙里
    const yLane = below ? edge + 13 + lane * 4 : edge - 13 - lane * 4;
    const xT = t ? t.left + t.width / 2 - base.left : (c.left + c.right) / 2 - base.left;
    const { candidates, farSide, startSide, childEdge } = candidatesFor(L, { clause, c, skip, below, edge, tip, yLane, yChild, xT });
    wires.push({ candidates, farSide, startSide, span: Math.abs(childEdge - edge), group: `${laneKey}|${targetKey}`, into, clause: clause.id });
  }
  return wires;
}
