/**
 * 词 id：定宽，字典序即经文词序（子句范围、编辑操作都按字符串比较取词）。
 *
 * - 旧约 `o` + 书(2) + 章(3) + 节(3) + 词(3) + 语素(1)，如 `o010010010072`
 * - 新约 `n` + 书(2) + 章(3) + 节(3) + 词(3)，如 `n40001001003`
 *
 * 编号取 STEPBible（TAHOT/TAGNT）的词序，节号取英文版本节号。格式与 Macula 相同，
 * 但**编号空间不同**：Macula 的 id 只能出现在 token_macula 映射表里，不得写进工作文件。
 */

export type TokenIdParts = {
  testament: 'OT' | 'NT';
  book: number;
  chapter: number;
  verse: number;
  word: number;
  /** 旧约语素序号（1 起）；新约恒为 0。 */
  morpheme: number;
};

const TOKEN_ID_RE = /^([on])(\d{2})(\d{3})(\d{3})(\d{3})(\d?)$/;

function pad(value: number, width: number, label: string): string {
  const text = String(value);
  if (!Number.isInteger(value) || value < 0 || text.length > width) {
    throw new Error(`${label} 超出 ${width} 位: ${value}`);
  }
  return text.padStart(width, '0');
}

export function otTokenId(book: number, chapter: number, verse: number, word: number, morpheme: number): string {
  if (morpheme < 1 || morpheme > 9) {
    throw new Error(`语素序号必须在 1-9: ${morpheme}`);
  }
  return `o${pad(book, 2, '书')}${pad(chapter, 3, '章')}${pad(verse, 3, '节')}${pad(word, 3, '词')}${morpheme}`;
}

export function ntTokenId(book: number, chapter: number, verse: number, word: number): string {
  return `n${pad(book, 2, '书')}${pad(chapter, 3, '章')}${pad(verse, 3, '节')}${pad(word, 3, '词')}`;
}

export function parseTokenId(id: string): TokenIdParts {
  const match = id.match(TOKEN_ID_RE);
  if (!match) {
    throw new Error(`词 id 格式不对: ${id}`);
  }
  const testament = match[1] === 'o' ? 'OT' : 'NT';
  if ((testament === 'OT') !== (match[6].length === 1)) {
    throw new Error(`词 id 位数与约别不符: ${id}`);
  }
  return {
    testament,
    book: Number(match[2]),
    chapter: Number(match[3]),
    verse: Number(match[4]),
    word: Number(match[5]),
    morpheme: match[6] ? Number(match[6]) : 0,
  };
}

export function isTokenId(id: string): boolean {
  return TOKEN_ID_RE.test(id);
}

export function bcvOfTokenId(id: string): number {
  const parts = parseTokenId(id);
  return parts.book * 1_000_000 + parts.chapter * 1_000 + parts.verse;
}

/** `a` 或 `a-b` 形式的词范围 → [首, 末]。 */
export function parseTokenRange(range: string): [string, string] {
  const [first, last, extra] = range.split('-').map((part) => part.trim());
  if (!first || extra !== undefined) {
    throw new Error(`词范围格式不对: ${range}`);
  }
  return [first, last || first];
}
