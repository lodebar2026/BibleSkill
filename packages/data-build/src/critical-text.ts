/**
 * 按 NA28 正文挑新约主干的词行（可选，构建时给 --critical-text）。
 *
 * TAGNT 版本列里的「NA28」并不总是 NA28：马可福音、使徒行传等卷跟的是 ECM（徒 9:8 οὐδένα、可 1:2 ἐγώ），
 * NA28 单括号里的词也常不算 NA28（徒 9:12 [ἐν ὁράματι]）。NA28 的读法几乎都在 TAGNT 的某一行里（本行读法或异文列里的读法），
 * 所以拿 NA28 正文逐节对一遍，按顺序给每个词找到对应的行，改挑这些行进主干。NA28 原文只用来挑行，不写进数据库。
 *
 * 只在本节 NA28 的每个词都对上时才改；不删八个版本都有的词（那是分节不同，NA28 把它算在邻节，如徒 13:38–39、罗 3:25–26）。
 */
import { readFileSync } from 'node:fs';
import { greekKey } from './align.js';

/** 一行进主干时用哪个读法：本行读法、异文列里 TAGNT 标为 NA28 的读法；null = 不进主干（记为异文）。 */
export type RowChoice = 'own' | 'alt' | null;

export type CandidateRow = {
  own: string;
  /** 异文列里 TAGNT 标为 NA28 的读法（本行读法不属 NA28 时才有）。 */
  alt: string | null;
  /** 按 TAGNT 版本列的默认选择。 */
  fallback: RowChoice;
  /** 八个版本都有这个词。 */
  universal: boolean;
};

export type Selection =
  | { kind: 'same' }
  | { kind: 'changed'; choices: RowChoice[] }
  | { kind: 'unmatched'; missing: number }
  | { kind: 'renumbered'; words: string[] };

/** 可移动的 ν、οὕτω(ς) 这类只差词尾一个字母的算同一个词。 */
function sameWord(a: string, b: string): boolean {
  return a === b || ((a.length - b.length) ** 2 === 1 && (a.startsWith(b) || b.startsWith(a)) && /[νσ]$/.test(a.length > b.length ? a : b));
}

/** NA28 原文文件：{ "<bcv>": "<带校勘符号的一节经文>" }，由 scripts/fetch-critical-text.mjs 生成。 */
export function loadCriticalText(file: string): Map<number, string> {
  const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
  return new Map(Object.entries(data).map(([bcv, text]) => [Number(bcv), text]));
}

/**
 * 给一节的词行挑主干：NA28 的词按顺序对上各行的读法，对上 TAGNT 默认选择的读法优先（权重 3 对 2），
 * 求总权重最大的对法。
 */
export function selectRows(rows: CandidateRow[], text: string): Selection {
  const words = text.split(/\s+/).map(greekKey).filter(Boolean);
  const defaults = rows.flatMap((row) => (row.fallback === null ? [] : [greekKey(row.fallback === 'alt' ? row.alt! : row.own)]));
  if (defaults.length === words.length && defaults.every((key, i) => sameWord(key, words[i]))) {
    return { kind: 'same' };
  }
  const options = rows.map((row) => [
    { choice: 'own' as const, key: greekKey(row.own), weight: row.fallback === 'own' ? 3 : 2 },
    ...(row.alt ? [{ choice: 'alt' as const, key: greekKey(row.alt), weight: row.fallback === 'alt' ? 3 : 2 }] : []),
  ]);
  // best[i][j]：NA28 前 i 个词与前 j 行能对上的最大权重
  const best = Array.from({ length: words.length + 1 }, () => new Array<number>(rows.length + 1).fill(0));
  const pair = (i: number, j: number) => options[j - 1].filter((option) => sameWord(option.key, words[i - 1]))
    .reduce((top, option) => Math.max(top, option.weight), 0);
  for (let i = 1; i <= words.length; i += 1) {
    for (let j = 1; j <= rows.length; j += 1) {
      const w = pair(i, j);
      best[i][j] = Math.max(best[i - 1][j], best[i][j - 1], w > 0 ? best[i - 1][j - 1] + w : 0);
    }
  }
  const choices: RowChoice[] = rows.map(() => null);
  let matched = 0;
  for (let i = words.length, j = rows.length; i > 0 && j > 0;) {
    const option = options[j - 1].find((item) => sameWord(item.key, words[i - 1]) && best[i][j] === best[i - 1][j - 1] + item.weight);
    if (option) {
      choices[j - 1] = option.choice;
      matched += 1;
      i -= 1;
      j -= 1;
    } else if (best[i][j] === best[i - 1][j]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  if (matched < words.length) {
    return { kind: 'unmatched', missing: words.length - matched };
  }
  const dropped = rows.filter((row, j) => row.fallback !== null && choices[j] === null && row.universal);
  if (dropped.length > 0) {
    return { kind: 'renumbered', words: dropped.map((row) => row.own) };
  }
  return rows.every((row, j) => row.fallback === choices[j]) ? { kind: 'same' } : { kind: 'changed', choices };
}
