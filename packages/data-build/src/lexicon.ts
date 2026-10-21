/**
 * 词典与词法代码：
 * - TBESH / TBESG（STEPBible 简明词典，按扩展 Strong）
 * - UBS 希伯来 / 希腊新约词典简体中文版（按基础 Strong，CC BY-SA 4.0）
 * - TEHMC / TEGMC（词法代码展开）
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type LexiconRow = {
  strong: string;
  source: 'TBESH' | 'TBESG' | 'UBS-zh';
  lemma: string;
  translit: string | null;
  pos: string | null;
  gloss: string;
  definition: string;
};

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function findFile(dir: string, prefix: string): string {
  const name = readdirSync(dir).find((entry) => entry.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!name) {
    throw new Error(`${dir} 下找不到 ${prefix}*`);
  }
  return path.join(dir, name);
}

export function readStepLexicon(stepDir: string, source: 'TBESH' | 'TBESG'): LexiconRow[] {
  const file = findFile(path.join(stepDir, 'Lexicons'), source);
  const rows: LexiconRow[] = [];
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!/^[HAG]\d{4}/.test(line)) {
      continue;
    }
    const [, dStrongCell = '', , lemma = '', translit = '', pos = '', gloss = '', meaning = ''] = line.split('\t');
    const strong = dStrongCell.trim().split(/\s/)[0];
    if (!/^[HAG]\d{4}[A-Za-z]?$/.test(strong)) {
      continue;
    }
    rows.push({ strong, source, lemma, translit, pos, gloss, definition: htmlToText(meaning) });
  }
  return rows;
}

type UbsSense = { Glosses?: string[]; DefinitionShort?: string; LanguageCode?: string };
type UbsMeaning = { LEXSenses?: UbsSense[]; LEXDomains?: Array<{ Domain?: string }> | null };
type UbsEntry = {
  Lemma: string;
  StrongCodes?: string[];
  BaseForms?: Array<{ PartsOfSpeech?: string[]; LEXMeanings?: UbsMeaning[] | null }>;
};

export function readUbsLexicon(ubsDir: string): LexiconRow[] {
  const files = [
    findFile(path.join(ubsDir, 'dictionaries/hebrew/JSON'), 'UBSHebrewDic-v0.9.2-zh-hans'),
    findFile(path.join(ubsDir, 'dictionaries/greek/JSON'), 'UBSGreekNTDic-v1.0-zh-Hans'),
  ];
  const rows: LexiconRow[] = [];
  for (const file of files) {
    const entries = JSON.parse(readFileSync(file, 'utf8')) as UbsEntry[];
    for (const entry of entries) {
      const glosses: string[] = [];
      const lines: string[] = [];
      const pos = new Set<string>();
      for (const baseForm of entry.BaseForms ?? []) {
        baseForm.PartsOfSpeech?.forEach((item) => pos.add(item));
        for (const meaning of baseForm.LEXMeanings ?? []) {
          const domain = meaning.LEXDomains?.map((item) => item.Domain).filter(Boolean).join('、');
          for (const sense of meaning.LEXSenses ?? []) {
            const gloss = (sense.Glosses ?? []).join('；');
            if (gloss) {
              glosses.push(gloss);
            }
            lines.push(`${lines.length + 1}. ${gloss}${domain ? `【${domain}】` : ''}${sense.DefinitionShort ? ` ${sense.DefinitionShort}` : ''}`);
          }
        }
      }
      if (lines.length === 0) {
        continue;
      }
      for (const strong of entry.StrongCodes ?? []) {
        rows.push({
          strong,
          source: 'UBS-zh',
          lemma: entry.Lemma,
          translit: null,
          pos: [...pos].join(' ') || null,
          gloss: glosses.join(' / '),
          definition: lines.join('\n'),
        });
      }
    }
  }
  return rows;
}

export function readMorphCodes(stepDir: string): Array<[string, string]> {
  const dir = path.join(stepDir, 'Morphology codes');
  const codes = new Map<string, string>();
  for (const prefix of ['TEHMC', 'TEGMC']) {
    for (const line of readFileSync(findFile(dir, prefix), 'utf8').split(/\r?\n/)) {
      const match = line.match(/^(\S+)\t(Function=[^\t]*)/);
      if (match && !codes.has(match[1])) {
        codes.set(match[1], match[2].trim());
      }
    }
  }
  return [...codes];
}
