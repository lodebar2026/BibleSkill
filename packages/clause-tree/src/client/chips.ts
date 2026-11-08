/**
 * 成分块切行：按实际排版宽度，超宽时在停顿最强的一级处切（同级的一起切；最弱一级只切一处，取两边最匀的位置），递归到每行够窄。
 */
import { $, $$ } from './dom.js';

const LINE_MAX = 460;

export function layoutChips(scope: ParentNode = document): void {
  const forestWidth = $('#forest').clientWidth;
  for (const ws of $$('.chip > .ws', scope)) {
    $$('.lb', ws).forEach((lb) => lb.remove());
    ws.style.width = '';
    const items = $$('.w', ws);
    items.forEach((item) => item.classList.remove('ind'));
    if (items.length < 2 || !items[0].dataset.pause) {
      continue;
    }
    const box = ws.closest<HTMLElement>('.box')!;
    const depth = Number(box.style.getPropertyValue('--depth') || 0);
    const max = Math.max(160, Math.min(LINE_MAX, forestWidth - depth * 40 - 140));
    const widths = items.map((item) => item.getBoundingClientRect().width);
    const pauses = items.map((item) => Number(item.dataset.pause));
    const cuts = new Set<number>();
    const width = (from: number, to: number) => widths.slice(from, to).reduce((sum, value) => sum + value, 0);
    const split = (from: number, to: number): void => {
      if (width(from, to) <= max) {
        return;
      }
      let best = -1;
      for (let index = from; index < to - 1; index += 1) {
        if (pauses[index] < 0) {
          continue;
        }
        const balance = (i: number) => Math.abs(width(from, i + 1) - width(i + 1, to));
        if (best < 0 || pauses[index] > pauses[best] || (pauses[index] === pauses[best] && balance(index) < balance(best))) {
          best = index;
        }
      }
      if (best < 0) {
        return;
      }
      // 同一级的停顿（强度相同的重音、同类的句法边界）一起断，各段对等；最弱一级（不到 1）只断一处
      const level = pauses[best];
      const same = level >= 1 ? [...Array(to - 1 - from).keys()].map((k) => from + k).filter((i) => pauses[i] === level) : [best];
      same.forEach((index) => cuts.add(index));
      [from, ...same.map((index) => index + 1)].forEach((start, k, starts) => split(start, starts[k + 1] ?? to));
    };
    let start = 0;
    pauses.forEach((pause, index) => {
      if (pause >= 9 && index < items.length - 1) {
        cuts.add(index);
        split(start, index + 1);
        start = index + 1;
      }
    });
    split(start, items.length);
    // 嵌入的分词短语、关系从句起头的行缩进（每级 28px，同 .w.ind）
    const indentOf = (index: number) => Number(items[index]?.dataset.indent ?? 0);
    for (const index of cuts) {
      items[index].insertAdjacentHTML('afterend', '<span class="lb"></span>');
      if (indentOf(index + 1) > 0) {
        items[index + 1].classList.add('ind');
        items[index + 1].style.setProperty('--ind', String(indentOf(index + 1)));
      }
    }
    // 折行后块宽取最宽的一行，方框随之收窄（否则仍按未折行的整行宽度撑开）
    if (cuts.size > 0) {
      const ends = [...cuts].sort((a, b) => a - b).map((index) => index + 1);
      const lines = [0, ...ends].map((from, i) => width(from, ends[i] ?? items.length) + (from > 0 ? indentOf(from) * 28 : 0));
      ws.style.width = `${Math.ceil(Math.max(...lines)) + 1}px`;
    }
  }
}
