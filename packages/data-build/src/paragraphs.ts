/**
 * 新约分段与小标题（可选，构建时给 --paragraphs）。
 *
 * 文件格式（自备，不随仓库分发）：
 *   { "source": "UBS5", "breaks": [ { "book": 44, "chapter": 8, "verse": 1, "letters": 36, "heading": "…" }, … ] }
 * - book：新教 66 卷序号；chapter、verse：原文（NA28/UBS5）节号；
 * - letters：本节在分段处之前的字母数（NFD 分解后只数字母，不计重音、标点、空格），0 = 节首；
 * - heading：段前的小标题，没有就省略。
 *
 * 分段落到主干词上：按原文节号把主干词分组，在节内数字母，落到恰好在 letters 处开始的那个词；
 * letters 等于整节字母数时（分段在节末，如可 16:8 短结尾之后、罗 16:23 之后），落到下一个主干词。
 */
import { readFileSync } from 'node:fs';
import { toBcv } from '@bs/core';
import type { Report, TokenRow } from './stepbible.js';

export type ParagraphBreak = { book: number; chapter: number; verse: number; letters: number; heading?: string };

export type ParagraphRow = { tokenId: string; bcv: number; heading: string | null };

export function loadParagraphs(file: string): { source: string; breaks: ParagraphBreak[] } {
  const data = JSON.parse(readFileSync(file, 'utf8')) as { source?: string; breaks?: ParagraphBreak[] };
  if (!Array.isArray(data.breaks)) {
    throw new Error(`${file} 里没有 breaks 数组`);
  }
  return { source: data.source ?? 'paragraphs', breaks: data.breaks };
}

export function letterCount(text: string): number {
  return text.normalize('NFD').replace(/[^\p{L}]/gu, '').length;
}

/** 分段 → 主干词。对不上的（字母数超出本节、落在词中间、节不存在）记进 report，跳过。 */
export function locateParagraphs(tokens: Array<Pick<TokenRow, 'id' | 'bcv' | 'surface' | 'maculaBcv'>>, breaks: ParagraphBreak[], report: Report): ParagraphRow[] {
  const byVerse = new Map<number, Array<Pick<TokenRow, 'id' | 'bcv' | 'surface' | 'maculaBcv'>>>();
  const next = new Map<string, Pick<TokenRow, 'id' | 'bcv'>>();
  tokens.forEach((token, index) => {
    byVerse.set(token.maculaBcv, [...(byVerse.get(token.maculaBcv) ?? []), token]);
    if (index + 1 < tokens.length) {
      next.set(token.id, tokens[index + 1]);
    }
  });
  const rows = new Map<string, ParagraphRow>();
  for (const item of breaks) {
    const where = `${item.book}:${item.chapter}:${item.verse}+${item.letters}`;
    const words = byVerse.get(toBcv(item.book, item.chapter, item.verse));
    if (!words) {
      report('paragraph-unmatched', where, '主干里没有这一节');
      continue;
    }
    let offset = 0;
    let hit: Pick<TokenRow, 'id' | 'bcv'> | undefined = words.find((word) => {
      if (offset === item.letters) {
        return true;
      }
      offset += letterCount(word.surface);
      return false;
    });
    if (!hit && offset === item.letters) {
      hit = next.get(words.at(-1)!.id);
    }
    if (!hit) {
      report('paragraph-unmatched', where, offset < item.letters ? `本节只有 ${offset} 个字母` : '分段处落在词中间');
      continue;
    }
    const heading = item.heading?.trim() || null;
    const existing = rows.get(hit.id);
    rows.set(hit.id, { tokenId: hit.id, bcv: hit.bcv, heading: existing?.heading ?? heading });
  }
  return [...rows.values()];
}
