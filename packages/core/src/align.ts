/**
 * 词级对齐：把 rendering 的 zh 定位到译文里的具体位置。纯函数，浏览器端视图也用（@bs/core/align）。
 *
 * zh 只要求是译文的子串，同一字串可能出现多次，也可能是另一个译词的一部分（「地」在「大地」里）。
 * 定位规则：
 * 1. ∅（有意不译）不定位；
 * 2. 给了 at 且该处确实是 zh 的，先认领；
 * 3. 其余按 zh 长度降序、同长按词序，取第一个不与已认领位置重叠的出现处；
 *    都重叠就取第一个出现处（几个词合译为同一个中文词时会这样）；找不到为 null。
 *
 * at 与译文对不上时不报错、重新定位：模型改了译文却带回旧 at 是常态。
 */

export type AlignedRendering = { tokens: string; zh: string; at?: number };

export type AlignmentSpan = { text: string; tokens: string[] };

const NOT_TRANSLATED = '∅';

function occurrences(text: string, zh: string): number[] {
  const found: number[] = [];
  for (let index = text.indexOf(zh); index >= 0; index = text.indexOf(zh, index + 1)) {
    found.push(index);
  }
  return found;
}

/** 每条 rendering 在 text 中的起始位置；∅ 或找不到为 null。 */
export function resolveAlignment(text: string, renderings: AlignedRendering[]): Array<number | null> {
  const positions: Array<number | null> = renderings.map(() => null);
  const claimed: Array<[number, number]> = [];
  const free = (start: number, length: number) => claimed.every(([from, to]) => start + length <= from || start >= to);
  const pending: number[] = [];
  renderings.forEach((rendering, index) => {
    if (rendering.zh === NOT_TRANSLATED || rendering.zh === '') {
      return;
    }
    if (rendering.at !== undefined && text.startsWith(rendering.zh, rendering.at)) {
      positions[index] = rendering.at;
      claimed.push([rendering.at, rendering.at + rendering.zh.length]);
    } else {
      pending.push(index);
    }
  });
  pending.sort((a, b) => renderings[b].zh.length - renderings[a].zh.length || renderings[a].tokens.localeCompare(renderings[b].tokens));
  for (const index of pending) {
    const { zh } = renderings[index];
    const found = occurrences(text, zh);
    const start = found.find((position) => free(position, zh.length)) ?? found[0];
    if (start !== undefined) {
      positions[index] = start;
      claimed.push([start, start + zh.length]);
    }
  }
  return positions;
}

/**
 * 把译文切成连续片段：每段记下覆盖它的 rendering 的 tokens（`id` 或 `首-末`），
 * 覆盖集合相同的相邻字合为一段。没有对齐的字 tokens 为空。
 */
export function alignmentSpans(text: string, renderings: AlignedRendering[], positions = resolveAlignment(text, renderings)): AlignmentSpan[] {
  const chars = [...text];
  // 按 UTF-16 下标记录覆盖，再按字符切段（扩展区汉字占两个码元）
  const cover: string[][] = Array.from({ length: text.length }, () => []);
  positions.forEach((start, index) => {
    if (start === null) {
      return;
    }
    for (let offset = start; offset < start + renderings[index].zh.length; offset += 1) {
      cover[offset].push(renderings[index].tokens);
    }
  });
  const spans: AlignmentSpan[] = [];
  let offset = 0;
  for (const char of chars) {
    const tokens = cover[offset];
    const last = spans[spans.length - 1];
    if (last && last.tokens.join(' ') === tokens.join(' ')) {
      last.text += char;
    } else {
      spans.push({ text: char, tokens: [...tokens] });
    }
    offset += char.length;
  }
  return spans;
}
