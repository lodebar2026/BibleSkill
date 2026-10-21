/**
 * 主干词（STEPBible）与 Macula 词按节做序列对齐：最长公共子序列，匹配谓词由调用方给。
 * 只接受谓词判定相等的配对，对不上的两侧词原样留空，交给 build_report 记录——不猜。
 */
export function alignSequences<A, B>(left: A[], right: B[], same: (a: A, b: B) => boolean): Array<[number, number]> {
  const rows = left.length;
  const cols = right.length;
  const table: Uint16Array[] = Array.from({ length: rows + 1 }, () => new Uint16Array(cols + 1));
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      table[i][j] = same(left[i], right[j])
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (same(left[i], right[j]) && table[i][j] === table[i + 1][j + 1] + 1) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}

/** 希伯来文只比辅音：去掉元音点、重音符号与标点，词尾形保持原样（两边都一样写）。 */
export function hebrewConsonants(text: string): string {
  return text.replace(/[^א-ת]/g, '');
}

/** 希腊文规范化：去变音符、小写、词尾 sigma 统一、去标点。 */
export function greekKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ς/g, 'σ')
    .replace(/[^α-ω]/g, '');
}

/** Strong 号只比数字部分：H7225G / 7225 / G0976 / 976 → 7225 / 976。 */
export function strongNumber(strong: string | undefined): number | null {
  const match = strong?.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}
