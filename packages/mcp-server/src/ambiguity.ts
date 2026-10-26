/**
 * 歧义线索：只靠词形标注与马所拉重音就能找出、模型又常常想不到的几类歧义（仅旧约）。
 * 只是线索，由模型逐条检验；成立的在 analyze 标 ambiguous、在 translate 列 alternatives。
 */
import { chapterFromBcv, type SeedClause, type Token } from '@bs/core';

function verseLabel(bcv: number): string {
  return `${chapterFromBcv(bcv)}:${bcv % 1000}`;
}

const ATHNACH = '֑';
const POINTS = /[֑-ׇ]/g;

/** 动词形态：语言、V、词干、变位、人称性数，如 HVqi2ms。 */
const VERB = /^[HA]V(\w)(\w)(\w*)$/;

function verbParts(morph: string): { stem: string; conj: string; pgn: string } | undefined {
  const match = VERB.exec(morph);
  return match ? { stem: match[1], conj: match[2], pgn: match[3] } : undefined;
}

/** 限定动词（完成、未完成及其连续式、祈愿、命令）。 */
function isFinite(morph: string): boolean {
  const verb = verbParts(morph);
  return verb !== undefined && 'pqiwhjv'.includes(verb.conj);
}

/** 中空动词：去掉点符后三个辅音、中间是 ו 或 י（排除 היה 这类第三字母为 ה 的）。 */
function isHollow(lemma: string): boolean {
  const consonants = lemma.replace(POINTS, '');
  return consonants.length === 3 && (consonants[1] === 'ו' || consonants[1] === 'י') && consonants[2] !== 'ה';
}

function baseStrong(strong: string): string {
  return strong.replace(/[A-Z]$/, '');
}

/** כִּי、אִם 与 כַּאֲשֶׁר：引导可前可后挂的状语从句。 */
function isSubordinator(tokens: Token[], index: number): boolean {
  const strong = baseStrong(tokens[index].strong);
  if (strong === 'H3588' || strong === 'H0518') {
    return true;
  }
  return strong === 'H0834' && tokens[index - 1]?.strong === 'H9004';
}

function hasExplicitSubject(token: Token, seeds: SeedClause[]): boolean {
  return seeds.some((seed) => seed.predicateToken === token.id && seed.subjectTokens.length > 0);
}

function homographHints(token: Token, seeds: SeedClause[]): string | undefined {
  const verb = verbParts(token.morph);
  if (!verb) {
    return undefined;
  }
  const label = `${verseLabel(token.bcv)} ${token.id} ${token.surface}`;
  // wayyiqtol 叙事里主语通常清楚，只看 yiqtol 与 jussive
  if ('ij'.includes(verb.conj) && ['2ms', '3fs'].includes(verb.pgn) && !hasExplicitSubject(token, seeds)) {
    return `${label}：前缀式 2ms 与 3fs 同形（标注为 ${verb.pgn}），没有明示主语；主语可能是“你”，也可能是前文的阴性单数名词`;
  }
  if (verb.stem === 'h' && (verb.conj === 'a' || (verb.conj === 'v' && verb.pgn === '2ms'))) {
    return `${label}：Hiphil 不定式独立式与阳性单数祈使式同形（标注为${verb.conj === 'a' ? '不定式独立式' : '祈使式'}）；施动者可能是说话人，也可能是听话人`;
  }
  if (verb.stem === 'q' && ['p3ms', 'p3fs', 'rmsa', 'rfsa'].includes(verb.conj + verb.pgn) && isHollow(token.lemma)) {
    return `${label}：中空动词 Qal 完成式与分词同形（标注为${verb.conj === 'p' ? '完成式' : '分词'}）；时态与子句类型可能不同`;
  }
  return undefined;
}

/**
 * athnach 前半节末尾的状语从句：重音把它归上半节，也可能作下半节的前提。
 * 要求前半节在从句之前已有限定动词；下半节有动词，不以 wayyiqtol 接续叙事，也不自带 כִּי、אִם。
 */
function athnachHint(tokens: Token[]): string | undefined {
  const athnach = tokens.findIndex((token) => token.surface.includes(ATHNACH));
  if (athnach < 0) {
    return undefined;
  }
  let subordinator = -1;
  for (let index = 1; index <= athnach; index += 1) {
    if (isSubordinator(tokens, index)) {
      subordinator = index;
    }
  }
  if (subordinator < 0 || !tokens.slice(0, subordinator).some((token) => isFinite(token.morph))) {
    return undefined;
  }
  const rest = tokens.slice(athnach + 1);
  const verbs = rest.filter((token) => verbParts(token.morph));
  if (verbs.length === 0 || verbParts(verbs[0].morph)!.conj === 'w' || isSubordinator(rest, 0)) {
    return undefined;
  }
  const head = tokens[subordinator];
  return `${verseLabel(head.bcv)} ${head.id} ${head.surface}：它引出的从句在 athnach（${tokens[athnach].surface}）处收尾，重音把它归上半节；也可能改挂下半节，作其条件、时间或原因`;
}

export function ambiguityHints(verses: Map<number, Token[]>, seeds: SeedClause[]): string[] | undefined {
  const hints: string[] = [];
  for (const tokens of verses.values()) {
    if (!tokens[0]?.id.startsWith('o')) {
      continue;
    }
    const boundary = athnachHint(tokens);
    if (boundary) {
      hints.push(boundary);
    }
    for (const token of tokens) {
      const hint = homographHints(token, seeds);
      if (hint) {
        hints.push(hint);
      }
    }
  }
  return hints.length > 0 ? hints : undefined;
}
