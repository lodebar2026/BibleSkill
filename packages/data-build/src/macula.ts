/**
 * Macula lowfat → 主干词映射 + 子句种子。
 *
 * - 旧约 macula-hebrew/WLC/lowfat：每章一个文件，节号为希伯来版本节号
 * - 新约 macula-greek/SBLGNT/lowfat：每卷一个文件，只与 editions 含 SBL 的主干词对齐
 *
 * Macula 的词 id 在这里就地换算成主干词 id，之后只在 token_macula 表里保留原编号。
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { bookByStepCode, toBcv } from '@bs/core';
import { alignSequences, greekKey, hebrewConsonants, strongNumber } from './align.js';
import { attr, collectClauseGroups, directPredicateWord, directWords, isClauseGroup } from './macula/clause-groups.js';
import { collectWords, parseTree, type GroupNode, type Node, type WordNode } from './macula/lowfat-xml.js';
import type { Report, TokenRow } from './stepbible.js';

export type SeedClauseRow = {
  seedId: string;
  bcvFirst: number;
  bcvLast: number;
  parentSeedId: string | null;
  rule: string | null;
  role: string | null;
  attributive: boolean;
  predicateToken: string | null;
  subjectTokens: string[];
  tokens: string[];
};

export type MaculaResult = {
  links: Array<[string, string]>;
  seeds: SeedClauseRow[];
  stats: { maculaWords: number; mappedWords: number; baseTokens: number; mappedTokens: number };
};

type Testament = 'OT' | 'NT';

/** `GEN 1:1!1` → 该词所在节（Macula 版本节号）。 */
function maculaBcv(ref: string | undefined): number | null {
  const match = ref?.match(/^([1-3]?[A-Z]{2,3}) (\d+):(\d+)/);
  if (!match) {
    return null;
  }
  return toBcv(bookByStepCode(match[1]).id, Number(match[2]), Number(match[3]));
}

function wordText(word: WordNode): string {
  return attr(word, 'unicode') ?? attr(word, 'normalized') ?? '';
}

function sameWord(testament: Testament) {
  return (token: TokenRow, word: WordNode): boolean => {
    const maculaStrong = strongNumber(attr(word, 'strongnumberx') ?? attr(word, 'strong'));
    const tokenStrong = /^H9\d{3}/.test(token.strong) ? null : strongNumber(token.strong);
    if (testament === 'OT') {
      const left = hebrewConsonants(token.surface);
      if (left.length > 0 && left === hebrewConsonants(wordText(word))) {
        return true;
      }
    } else if (greekKey(token.surface) === greekKey(wordText(word))) {
      return true;
    }
    return tokenStrong !== null && tokenStrong === maculaStrong;
  };
}

function nearestClauseAncestor(node: Node, emitted: Map<GroupNode, string>): string | null {
  let current = node.parent;
  while (current && current.tag !== 'root') {
    if (current.tag === 'wg' && isClauseGroup(current) && emitted.has(current)) {
      return emitted.get(current) ?? null;
    }
    current = current.parent;
  }
  return null;
}

/** 成分中不属于嵌套子句的词。 */
function wordsOutsideClauses(node: Node): WordNode[] {
  if (node.tag === 'w') {
    return [node];
  }
  if (isClauseGroup(node)) {
    return [];
  }
  return node.children.flatMap((child) => wordsOutsideClauses(child));
}

function listFiles(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir).filter((name) => pattern.test(name)).sort().map((name) => path.join(dir, name));
}

export function processMacula(
  testament: Testament,
  lowfatDir: string,
  tokens: TokenRow[],
  report: Report,
): MaculaResult {
  const eligible = testament === 'NT'
    ? tokens.filter((token) => token.editions?.split('+').includes('SBL'))
    : tokens;
  const tokensByVerse = new Map<number, TokenRow[]>();
  for (const token of eligible) {
    const list = tokensByVerse.get(token.maculaBcv) ?? [];
    list.push(token);
    tokensByVerse.set(token.maculaBcv, list);
  }

  const links: Array<[string, string]> = [];
  const seeds: SeedClauseRow[] = [];
  const stats = { maculaWords: 0, mappedWords: 0, baseTokens: eligible.length, mappedTokens: 0 };
  const same = sameWord(testament);
  const files = listFiles(lowfatDir, testament === 'OT' ? /-lowfat\.xml$/ : /^\d{2}-.*\.xml$/);
  if (files.length === 0) {
    throw new Error(`${lowfatDir} 下没有 lowfat 文件`);
  }

  for (const file of files) {
    const root = parseTree(readFileSync(file, 'utf8'));
    const words = root.children.flatMap((child) => collectWords(child));
    stats.maculaWords += words.length;

    const wordsByVerse = new Map<number, WordNode[]>();
    for (const word of words) {
      const bcv = maculaBcv(attr(word, 'ref'));
      if (bcv === null) {
        report('macula-ref', attr(word, 'xml:id') ?? file, `无法解析 ref: ${attr(word, 'ref')}`);
        continue;
      }
      const list = wordsByVerse.get(bcv) ?? [];
      list.push(word);
      wordsByVerse.set(bcv, list);
    }

    const tokenOfWord = new Map<WordNode, TokenRow>();
    for (const [bcv, verseWords] of wordsByVerse) {
      const ordered = [...verseWords].sort((a, b) => (attr(a, 'xml:id') ?? '').localeCompare(attr(b, 'xml:id') ?? ''));
      const verseTokens = tokensByVerse.get(bcv) ?? [];
      if (verseTokens.length === 0) {
        report('macula-verse-unmatched', String(bcv), testament === 'NT' ? `Macula 有 ${ordered.length} 词，主干该节没有 SBL 版本的词` : `Macula 有 ${ordered.length} 词，主干无对应节`);
        continue;
      }
      const pairs = alignSequences(verseTokens, ordered, same);
      for (const [ti, wi] of pairs) {
        const token = verseTokens[ti];
        const word = ordered[wi];
        tokenOfWord.set(word, token);
        links.push([token.id, attr(word, 'xml:id') ?? '']);
        if (token.glossZh === null) {
          token.glossZh = attr(word, 'mandarin') ?? null;
          token.sense = (testament === 'OT' ? attr(word, 'sdbh') : attr(word, 'ln')) ?? null;
          stats.mappedTokens += 1;
        }
      }
      stats.mappedWords += pairs.length;
      const unmatchedTokens = verseTokens.length - new Set(pairs.map(([ti]) => ti)).size;
      if (unmatchedTokens > 0 || pairs.length < ordered.length) {
        report(
          'macula-partial',
          verseTokens[0]?.ref.split('#')[0] ?? String(bcv),
          `主干 ${verseTokens.length} 词 / Macula ${ordered.length} 词，对上 ${pairs.length}`,
        );
      }
    }

    const emitted = new Map<GroupNode, string>();
    let counter = 0;
    const fileKey = path.basename(file).replace(/(-lowfat)?\.xml$/, '');
    for (const sentence of root.children) {
      for (const site of collectClauseGroups(sentence)) {
        const own = directWords(site.clause)
          .map((word) => tokenOfWord.get(word))
          .filter((token): token is TokenRow => token !== undefined);
        const ids = [...new Set(own.map((token) => token.id))].sort();
        if (ids.length === 0) {
          continue;
        }
        const seedId = `${fileKey}#${String(counter++).padStart(4, '0')}`;
        emitted.set(site.clause, seedId);
        const bcvs = own.map((token) => token.bcv);
        const predicate = directPredicateWord(site.clause);
        // 主语取子句的直属成分中 role="s" 的那些；主语成分里嵌套的子句（如定语从句）不算主语本身
        const subjectTokens = site.clause.children
          .filter((child) => attr(child as { attrs: Record<string, string> }, 'role')?.toLowerCase() === 's')
          .flatMap((child) => wordsOutsideClauses(child))
          .map((word) => tokenOfWord.get(word)?.id)
          .filter((id): id is string => id !== undefined);
        seeds.push({
          seedId,
          bcvFirst: Math.min(...bcvs),
          bcvLast: Math.max(...bcvs),
          parentSeedId: nearestClauseAncestor(site.clause, emitted),
          rule: attr(site.clause, 'rule') ?? null,
          role: attr(site.clause, 'role') ?? null,
          attributive: site.attributive,
          predicateToken: predicate ? tokenOfWord.get(predicate)?.id ?? null : null,
          subjectTokens: [...new Set(subjectTokens)].sort(),
          tokens: ids,
        });
      }
    }
  }
  return { links, seeds, stats };
}
