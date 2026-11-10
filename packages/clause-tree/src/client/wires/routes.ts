/**
 * 句法连线：每个从句连到母句里被修饰的词（或嵌入子句的占位符）。这里定出每条线的几种走法，挑选在 pick.ts。
 * 指向同一个词的并列从句共用一条横道（汇成主干）；其余的各占一条横道，上下错开。
 */
import { $ } from '../dom.js';
import { type Clause, D, byId, firstWord, lastWord, words } from '../model.js';
import { candidatesFor } from './candidates.js';
import { type Point, polyline } from './geometry.js';
import type { Layout } from './layout.js';

/**
 * 一条线的候选走法（farSide、startSide 记下走尾侧、起始侧沟槽的是哪几种）；span 是子句与母句相隔多远，跨度短的先定。
 * into：箭头伸进母句框、指到被修饰词的那一段（画在方框上层）；没有目标词时为 null，箭头停在框边。
 */
export type Wire = {
  candidates: Point[][]; farSide: Set<number>; startSide: Set<number>; span: number; group: string; into: number | null; clause: string;
  /** 母句同一侧有几组不并列的连线时左右交替：跨度最大的走起始侧，下一组走尾侧，依此类推（徒 9:38a 左、38c 右）。 */
  preferFar: boolean;
};

/**
 * 主干：同一母句里指向同一个词的从句，只有并列的才汇成一条主干——后一句以 καί、τε、ἤ、וְ 开头，且紧接着前一句
 * （徒 9:27d–f πῶς… καὶ ὅτι… καὶ πῶς…）；同一段引语接连的几句也汇成一条，不论有没有连词（徒 10:4f–6a，6a οὗτος 不带 καί）。不并列的各走各的线（徒 9:38a 独立属格与 38c ἀκούσαντες 都修饰 ἀπέστειλαν）。
 * 并列的两句中间夹着母句的词时也分开（9:40a ἐκβαλών 在母句开头的占位符处、40c καὶ θείς 紧挨 προσηύξατο，中间隔着 ὁ Πέτρος）。
 */
const COORD = /^(G2532|G5037|G2228|H9002)/;
const startsCoordinated = (clause: Clause) => {
  const first = clause.chips.find((chip) => chip.wordIds.length > 0);
  return Boolean(first && first.role === 'conj' && COORD.test(words[first.wordIds[0]].strong));
};
const trunks = new Map<string, string>();
function trunkKey(clause: Clause): string {
  if (trunks.size === 0) {
    const groups = new Map<string, Clause[]>();
    for (const item of D.clauses) {
      const key = `${item.parentId}|${item.targetSlot ?? item.targetWordId ?? ''}`;
      groups.set(key, [...groups.get(key) ?? [], item]);
    }
    for (const [key, siblings] of groups) {
      let trunk = '';
      const sorted = siblings.sort((a, b) => firstWord(a).localeCompare(firstWord(b)));
      sorted.forEach((item, i) => {
        const parentWords = byId.get(item.parentId ?? '')?.chips.flatMap((chip) => chip.wordIds) ?? [];
        const apart = i > 0 && parentWords.some((id) => id > lastWord(sorted[i - 1]) && id < firstWord(item));
        const joins = i > 0 && (startsCoordinated(item) || (item.wireLabel === '引语' && sorted[i - 1].wireLabel === '引语'));
        trunk = joins && !apart ? trunk : `${key}|${item.id}`;
        trunks.set(item.id, trunk);
      });
    }
  }
  return trunks.get(clause.id)!;
}

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
    const targetKey = trunkKey(clause);
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
      // 过渡句一行两框竖向居中，连线放在中部；引语框架对着被修饰的词
      const word = parentBox.parentElement!.classList.contains('marker') ? null : targetOf(clause, parentBox)?.getBoundingClientRect();
      const y = Math.round((word ? word.top + word.height / 2 : p.top + p.height / 2) - base.top);
      const points: Array<[number, number]> = [[start(c), y], [endOf(p) + (rtl ? -1 : 1), y]];
      segs.push(...polyline(points));
      arrow(svg, points, '', [], clause.id);
      hitArea(points, clause.id);
      continue;
    }
    const below = c.top >= p.bottom;
    const laneKey = `${clause.parentId}|${below ? 'b' : 'a'}`;
    const byTarget = lanes.get(laneKey) ?? new Map<string, number>();
    const targetKey = trunkKey(clause);
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
    // 从下方来的箭头伸进框里指到词的下沿；从上方来的（排在母句上方的分词句，徒 9:38c → ἀπέστειλαν）穿过框头，
    // 停在那个词所在成分块的顶边，不压到成分名和词
    const chipTop = target?.closest('.chip')?.getBoundingClientRect().top;
    const into = t && below ? t.bottom - base.top + 3 : t && chipTop !== undefined ? chipTop - base.top - 1 : null;
    const tip = into !== null ? edge : below ? edge + 1 : edge - 1;
    // 横道离母句至少 13px：箭头（9px）前留一段竖线，折点不直接接在箭头上；多条横道相隔 4px，都在框间 26px 的空隙里
    const yLane = below ? edge + 13 + lane * 4 : edge - 13 - lane * 4;
    // 几条不并列的主干指向同一个词时（徒 9:38a、38c → ἀπέστειλαν），箭头在词上错开：跨度大的（竖线在外圈、横道贴近母句）
    // 落在沟槽一侧，免得横道穿过别的箭头
    const prefix = targetKey.slice(0, targetKey.lastIndexOf('|') + 1);
    const same = [...byTarget].filter(([key]) => key.startsWith(prefix)).sort((a, b) => a[1] - b[1]).map(([key]) => key);
    const half = t ? Math.max(t.width / 2 - 4, 0) : 0;
    const shift = same.length > 1 ? Math.max(-half, Math.min(half, (same.indexOf(targetKey) - (same.length - 1) / 2) * 14)) * (rtl ? -1 : 1) : 0;
    // 修饰全句（独立属格）：箭头落在母句框起始一侧的框边，不指某个词
    const xT = t ? t.left + t.width / 2 - base.left + shift
      : clause.wholeClause ? (rtl ? p.right - 28 : p.left + 28) - base.left
        : (c.left + c.right) / 2 - base.left;
    const { candidates, farSide, startSide, childEdge } = candidatesFor(L, { clause, c, skip, below, edge, tip, yLane, yChild, xT });
    const preferFar = byTarget.size > 1 && lane % 2 === 1;
    wires.push({ candidates, farSide, startSide, span: Math.abs(childEdge - edge), group: `${laneKey}|${targetKey}`, into, clause: clause.id, preferFar });
  }
  return wires;
}
