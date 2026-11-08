/**
 * 词级对齐：把 rendering 的 zh 定位到译文里的具体位置。纯函数，浏览器端视图也用（@bs/core/align）。
 *
 * zh 只要求是译文的子串，同一字串可能出现多次，也可能是另一个译词的一部分（「地」在「大地」里）。
 * 译文里被别的词隔开的，zh 用「…」连接各段（παθεῖν 译「受…苦」，中间的「多少」是 ὅσα），各段须按顺序出现，位置取首段。
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
const GAP = /…+/;

/** zh 被别的词隔开时的各段（「受…苦」→ 受、苦）。 */
export function renderingParts(zh: string): string[] {
  return zh.split(GAP).filter(Boolean);
}

/** 比较译法用的形式：去掉「…」（「受…苦」与「受苦」算同一译法）；显示也用它。 */
export function renderingKey(zh: string): string {
  return renderingParts(zh).join('');
}

/** zh 的各段从 start 起在 text 里依次出现的位置 [起, 止)；首段不在 start 或后面的段找不到时为 null。 */
export function partRanges(text: string, zh: string, start: number): Array<[number, number]> | null {
  const parts = renderingParts(zh);
  if (parts.length === 0 || !text.startsWith(parts[0], start)) {
    return null;
  }
  const ranges: Array<[number, number]> = [[start, start + parts[0].length]];
  for (const part of parts.slice(1)) {
    const at = text.indexOf(part, ranges.at(-1)![1]);
    if (at < 0) {
      return null;
    }
    ranges.push([at, at + part.length]);
  }
  return ranges;
}

/** zh 在 text 里的各个出现处（各段都能依次找到的首段位置）。 */
function occurrences(text: string, zh: string): number[] {
  const [head] = renderingParts(zh);
  const found: number[] = [];
  for (let index = head ? text.indexOf(head) : -1; index >= 0; index = text.indexOf(head, index + 1)) {
    if (partRanges(text, zh, index)) {
      found.push(index);
    }
  }
  return found;
}

/** zh 是否出现在 text 里（被隔开的各段依次出现也算）。 */
export function containsRendering(text: string, zh: string): boolean {
  return occurrences(text, zh).length > 0;
}

/** 每条 rendering 在 text 中的起始位置；∅ 或找不到为 null。 */
export function resolveAlignment(text: string, renderings: AlignedRendering[]): Array<number | null> {
  const positions: Array<number | null> = renderings.map(() => null);
  const claimed: Array<[number, number]> = [];
  const free = (ranges: Array<[number, number]>) => ranges.every(([start, end]) => claimed.every(([from, to]) => end <= from || start >= to));
  const pending: number[] = [];
  renderings.forEach((rendering, index) => {
    if (rendering.zh === NOT_TRANSLATED || renderingKey(rendering.zh) === '') {
      return;
    }
    const ranges = rendering.at !== undefined ? partRanges(text, rendering.zh, rendering.at) : null;
    if (ranges) {
      positions[index] = rendering.at!;
      claimed.push(...ranges);
    } else {
      pending.push(index);
    }
  });
  const size = (index: number) => renderingKey(renderings[index].zh).length;
  pending.sort((a, b) => size(b) - size(a) || renderings[a].tokens.localeCompare(renderings[b].tokens));
  for (const index of pending) {
    const { zh } = renderings[index];
    const found = occurrences(text, zh);
    const start = found.find((position) => free(partRanges(text, zh, position)!)) ?? found[0];
    if (start !== undefined) {
      positions[index] = start;
      claimed.push(...partRanges(text, zh, start)!);
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
    for (const [from, to] of partRanges(text, renderings[index].zh, start) ?? []) {
      for (let offset = from; offset < to; offset += 1) {
        cover[offset].push(renderings[index].tokens);
      }
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
