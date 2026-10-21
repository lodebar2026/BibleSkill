/**
 * 译文的分段（ClauseText.formatted 的 TranslationSegment[]）。纯函数，浏览器端视图也用（@bs/core/segments）。
 *
 * 补出的词是单独的段：`styleName: "added"`，text 不带括号，note 是这个补词的说明。
 * 主译的取舍理由挂在最后一个普通段（没有 styleName）的 note 上。
 *
 * - 纯文本（plainText）：各段 text 直接相接，不带括号。rendering 的 zh、at 都按它算。
 * - 标记文本（segmentsMarkup）：补词段包上 `[ ]`，给模型看、给人编辑都用它；
 *   提交时用 markupToSegments 拆回分段。
 */

export type Segment = { text: string; styleName?: string; note?: string };

/** 补出的词。 */
export const ADDED_STYLE = 'added';

/** 补词的说明：text 是括号里的内容；同一补词出现多次时 at 指明是哪一处（在纯文本中的起始位置）。 */
export type SuppliedNote = { text: string; note: string; at?: number };

export function parseFormatted(formatted: string): Segment[] {
  return JSON.parse(formatted) as Segment[];
}

const isAdded = (segment: Segment) => segment.styleName === ADDED_STYLE;

export function plainText(segments: Segment[]): string {
  return segments.map((segment) => segment.text).join('');
}

export function segmentsMarkup(segments: Segment[]): string {
  return segments.map((segment) => (isAdded(segment) ? `[${segment.text}]` : segment.text)).join('');
}

/** 主译的取舍理由：普通段上的 note。 */
export function clauseNote(segments: Segment[]): string {
  return segments.filter((segment) => !isAdded(segment)).map((segment) => segment.note ?? '').filter(Boolean).join('；');
}

/** 补词段在纯文本中的位置。 */
export function addedRanges(segments: Segment[]): Array<{ start: number; end: number; text: string; note?: string }> {
  const ranges: Array<{ start: number; end: number; text: string; note?: string }> = [];
  let offset = 0;
  for (const segment of segments) {
    if (isAdded(segment)) {
      ranges.push({ start: offset, end: offset + segment.text.length, text: segment.text, note: segment.note });
    }
    offset += segment.text.length;
  }
  return ranges;
}

/** 旧数据：补词还以 `[ ]` 字符留在普通段里。 */
export function hasLegacyBrackets(segments: Segment[]): boolean {
  return segments.some((segment) => !isAdded(segment) && /[[\]]/.test(segment.text));
}

/**
 * 标记文本 → 分段。括号要成对、不嵌套、不跨行、不为空；supplied 的每一项要对上一个补词。
 * note 挂到最后一个普通段上（全是补词时另加一个空段）。格式不对时抛出 Error。
 */
export function markupToSegments(markup: string, note = '', supplied: SuppliedNote[] = []): Segment[] {
  const segments: Segment[] = [];
  const pattern = /\[([^[\]\n]*)\]/g;
  let last = 0;
  for (const match of markup.matchAll(pattern)) {
    if (match[1].trim() === '') {
      throw new Error('补词的 [ ] 里是空的');
    }
    if (match.index > last) {
      segments.push({ text: markup.slice(last, match.index) });
    }
    segments.push({ text: match[1], styleName: ADDED_STYLE });
    last = match.index + match[0].length;
  }
  if (last < markup.length) {
    segments.push({ text: markup.slice(last) });
  }
  const stray = segments.find((segment) => !isAdded(segment) && /[[\]]/.test(segment.text));
  if (stray) {
    throw new Error(`补词的 [ ] 不成对、嵌套或跨行：「${stray.text.trim()}」`);
  }

  const ranges = addedRanges(segments);
  const addedSegments = segments.filter(isAdded);
  for (const item of supplied) {
    const candidates = ranges.map((range, index) => ({ range, index })).filter(({ range }) => range.text === item.text);
    const hit = candidates.find(({ range }) => item.at === undefined || range.start === item.at) ?? (item.at === undefined ? undefined : candidates[0]);
    if (!hit) {
      throw new Error(`supplied「${item.text}」在译文里没有对应的 [ ] 补词`);
    }
    if (item.note.trim()) {
      addedSegments[hit.index].note = item.note.trim();
    }
  }

  if (note) {
    const target = [...segments].reverse().find((segment) => !isAdded(segment));
    if (target) {
      target.note = note;
    } else {
      segments.push({ text: '', note });
    }
  }
  return segments;
}

/** 补词说明：markupToSegments 的 supplied 参数的反向（给 toSubmission 用）。 */
export function suppliedNotes(segments: Segment[]): SuppliedNote[] {
  return addedRanges(segments).filter((range) => range.note).map((range) => ({ text: range.text, note: range.note!, at: range.start }));
}
