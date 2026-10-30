/**
 * 结构图的数据：子句框（层级、成分块、挂接目标）、逐词信息、词典、自动要点。
 *
 * 结构一律以工作目录里的子句分析为准（clause_entities.json：切分、parentId、modifies、主语、谓语），
 * 不取 Macula 的子句切分；子句内部的成分（宾语、间接宾语、状语、表语）与块内折行照 Macula 短语树（新、旧约都是）。
 * bible-diagram 写入的说明（diagram.json）只补子句功能、连线标签、大意与要点。
 * 纯函数 buildDiagram 便于测试；loadDiagram 负责读库与工作文件。
 */
import { HEBREW_STEMS } from './clause-type.js';
import { clauseOfWord, clauseWords, containerOf, embedSlots } from './clause-words.js';
import type { BibleDb, SyntaxNode, Token, TokenSyntax, VariantToken } from './db.js';
import { parseTokenRange } from './ids.js';
import { chapterFromBcv, parseClauseId, toBcv, type ScriptureRange } from './ref.js';
import { LOGIC_LABELS } from './logic.js';
import { LITERALNESS_LEVELS, type ClauseEntity, type ClauseText, type DiagramNote } from './schemas.js';
import { clauseNote, parseFormatted, plainText } from './segments.js';
import type { WorkFileStore } from './store.js';

export type DiagramWord = {
  id: string;
  bcv: number;
  text: string;
  after: string;
  lemma: string;
  translit: string;
  strong: string;
  morph: string;
  morphExp: string | null;
  glossEn: string;
  glossZh: string | null;
  sense: string | null;
  /** 译文里这个词的译法（rendering）。 */
  rendering: string | null;
  /** 异文、读型、NA28 双括号等提示。 */
  variant: string | null;
  /** 新约：名词性词的格；动词的时态、语气（着色用）。 */
  gcase: GreekCase | null;
  tense: GreekTense | null;
  mood: GreekMood | null;
  /** 旧约动词的词干（qal 主动为 null，不着色；新约一律 null）。 */
  stem: HebrewStem | null;
};

export type StemFamily = 'qal' | 'niphal' | 'piel' | 'hiphil' | 'hithpael';
export type HebrewStem = { name: string; family: StemFamily; passive: boolean };

const STEM_FAMILIES: Record<StemFamily, string[]> = {
  qal: ['qal passive'],
  niphal: ['niphal'],
  piel: ['piel', 'pual', 'polel', 'polal', 'poel', 'poal', 'pilpel', 'polpal', 'pilel', 'palel', 'pulal', 'pealal'],
  hiphil: ['hiphil', 'hophal', 'tiphil'],
  hithpael: ['hithpael', 'hithpolel', 'hithpalpel', 'hithpoel', 'nithpael', 'nithpalel', 'nithpoel', 'hothpaal', 'hishtaphel'],
};
const PASSIVE_STEMS = new Set(['qal passive', 'pual', 'polal', 'poal', 'polpal', 'pulal', 'hophal', 'hothpaal']);

/** 希伯来、亚兰动词的词干：`HVpp3ms` → piel。qal 主动与非动词返回 null。 */
export function hebrewStem(morph: string): HebrewStem | null {
  const code = morph.match(/^[HA]V(\w)/)?.[1];
  const name = code ? HEBREW_STEMS[code] : undefined;
  const family = name ? (Object.keys(STEM_FAMILIES) as StemFamily[]).find((key) => STEM_FAMILIES[key].includes(name)) : undefined;
  return name && family ? { name, family, passive: PASSIVE_STEMS.has(name) } : null;
}

export type GreekCase = 'nom' | 'gen' | 'dat' | 'acc' | 'voc';
export type GreekTense = 'pres' | 'impf' | 'fut' | 'aor' | 'perf' | 'plpf';
export type GreekMood = 'ind' | 'subj' | 'opt' | 'impv' | 'inf' | 'ptcp';

const CASES: Record<string, GreekCase> = { N: 'nom', G: 'gen', D: 'dat', A: 'acc', V: 'voc' };
const TENSES: Record<string, GreekTense> = { P: 'pres', I: 'impf', F: 'fut', A: 'aor', R: 'perf', L: 'plpf' };
const MOODS: Record<string, GreekMood> = { I: 'ind', S: 'subj', O: 'opt', M: 'impv', N: 'inf', P: 'ptcp' };

/**
 * Robinson 词法码里的格、时态、语气：`N-DSF`、`P-1GP`（人称代词先写人称）、`S-1SGSN`（物主代词先写所有者的人称、数）、
 * `V-2AAP-NSM`（第二不定过去式分词，格在末段）。不变格的词（`A-NUI`）没有格。
 */
export function greekMorph(morph: string): { gcase: GreekCase | null; tense: GreekTense | null; mood: GreekMood | null } {
  const verb = morph.match(/^V-2?([PIFARL])[A-Z]([ISOMNP])(?:-([NGDAV])?)?/);
  if (verb) {
    return { gcase: verb[2] === 'P' ? CASES[verb[3] ?? ''] ?? null : null, tense: TENSES[verb[1]], mood: MOODS[verb[2]] };
  }
  const nominal = morph.match(/^[NARCDTKIXQFS]-(?:[123][SP](?=[NGDAV][SP]))?(?:[123](?=[NGDAV]))?([NGDAV])[SP][MFN]?(?:-|$)/)
    ?? morph.match(/^P-(?:[123])?([NGDAV])[SP]/);
  return { gcase: nominal ? CASES[nominal[1]] : null, tense: null, mood: null };
}

/**
 * 成分块：主语、谓语取自分析；句首连接词按词法认出。其余的词按 Macula 短语树分成宾语、间接宾语、状语、表语等，
 * 每个成分一块；谓语不在短语树上时，相邻的词合成一块，不标角色。
 * pauses：每个词之后能否换行、停顿多强（页面按实际排版宽度在停顿最强处切行）。
 * indents：某词起头的一行缩进几级（嵌入的分词短语、关系从句缩进一级），没有缩进时省略。
 * slots：嵌在本句中间的子句的占位符，插在 wordIds[at] 之前（at = wordIds.length 时在块末）；
 * id 供连线定位，pause 是占位符之后的停顿（占位符前面的词与它相连，不断开）。
 */
export type ChipRole = 's' | 'v' | 'o' | 'o2' | 'io' | 'adv' | 'p' | 'conj';
export type DiagramSlot = { id: string; at: number; clauseIds: string[]; pause?: number };
/** fronted：旧约里排在谓语之前的实词成分（宾语、状语、主语前置），多为焦点、对比或话题。 */
export type DiagramChip = { role: ChipRole | null; wordIds: string[]; pauses?: number[]; indents?: number[]; slots?: DiagramSlot[]; fronted?: true };

/** 词后不能断（词缀、maqqef 相连）。 */
export const PAUSE_JOINED = -1;
/** 子句分析 br 指定的换行：必断。 */
export const PAUSE_FORCED = 9;
/** 长块里并列连词之前：块排不下时最先在这里断，排得下就不断。 */
export const PAUSE_COORD = 8;
/** 长块里嵌入子句（分词短语、关系从句）的前后：仅次于并列连词；断在这里时，嵌入子句那几行缩进。 */
export const PAUSE_EMBED = 7;

/**
 * 希伯来文停顿重音的强弱（越大停顿越强）。同一级里把“远分”排在“近分”之前：
 * tipcha 只给 atnach / silluq 前的最后一段再分，低于 zaqef；pashta、zarqa、yetiv、tevir 是 zaqef、segolta 前的近分，低于 revia。
 * atnach 4；segolta、shalshelet、zaqef 3.5；tipcha 3；revia 2.5；zarqa、pashta、yetiv、tevir 2；
 * geresh、gershayim、pazer、telisha gedola、legarmeh（paseq）1。
 */
const HEBREW_PAUSE: Array<[RegExp, number]> = [
  [/\u0591/, 4],
  [/[\u0592\u0593\u0594\u0595]/, 3.5],
  [/\u0596/, 3],
  [/\u0597/, 2.5],
  [/[\u0598\u05AE\u0599\u059A\u059B]/, 2],
  [/[\u059C\u059D\u059E\u059F\u05A0\u05A1\u05C0]/, 1],
];

/** 一个词之后的停顿强度：句末、分句标点最强；旧约再看停顿重音；新约逗号次之；其余 0（可断，但不优先）。 */
function pauseAfter(word: Pick<Token, 'surface' | 'after'>, isOT: boolean): number {
  if (word.after === '') {
    return PAUSE_JOINED;
  }
  if (/[.;;·׃!?]/.test(word.after)) {
    return 6;
  }
  if (/[,，׀]/.test(word.after)) {
    return isOT ? 1 : 5;
  }
  return isOT ? (HEBREW_PAUSE.find(([pattern]) => pattern.test(word.surface))?.[1] ?? 0) : 0;
}

/**
 * 块内每个词之后的停顿强度；br 指定的词为 PAUSE_FORCED。
 * 旧约一个词常拆成几个语素（בּ֔ + וֹ），maqqef 又把几个词连成一个重音单位（וְכָל־ח֖וּם）：
 * 重音按整个单位算，停顿记在单位的最后一个语素后；单位内部（语素之间、maqqef 后）不断。
 */
export function chipPauses(words: Array<Pick<Token, 'id' | 'surface' | 'after'>>, isOT: boolean, manual: Set<string> = new Set()): number[] {
  let unit = '';
  return words.map((word) => {
    unit += word.surface;
    const inside = word.after === '' || (isOT && word.after === '־');
    const pause = manual.has(word.id) ? PAUSE_FORCED : inside ? PAUSE_JOINED : pauseAfter({ surface: unit, after: word.after }, isOT);
    if (!inside) {
      unit = '';
    }
    return pause;
  });
}

export type DiagramRecord = { tag: string; text: string };

export type DiagramClause = {
  id: string;
  /** 范围内的母句；母句不在范围内时为 null（作为一棵树的根）。 */
  parentId: string | null;
  label: string;
  link: string | null;
  gist: string;
  status: ClauseEntity['status'];
  /** 旧约句型展示码（WayX、XQtl、NmCl…）；新约为空。 */
  type: string;
  /** 新约：谓语动词的时态与语气，如 `aor-ind`；没有动词谓语时为 null。 */
  ntForm: string | null;
  chips: DiagramChip[];
  /** 连线起点（本句首词）与终点（母句中被修饰的词）。 */
  fromWordId: string;
  targetWordId: string | null;
  /** 嵌在母句中间时，连线指向母句里的占位符（DiagramSlot.id）。 */
  targetSlot: string | null;
  /** 逻辑关系（与句法挂接分开画）：关系名与关联的子句（范围内的）。 */
  logic: { relation: string; label: string; targetIds: string[]; targetText: string; note: string | null } | null;
  /** 旧约：同根不定式独立形强调动词（מוֹת תָּמוּת、וַתִּבְכֶּה בָכֹה）时，不定式与限定动词的词 id；没有时为空。 */
  cognate: string[];
  /** 是否有 bible-diagram 写的说明（没有时功能、连线、大意用默认值）。 */
  annotated: boolean;
  /** bible-diagram 写的要点。 */
  points: string[];
  /** 分析与译文里已有的备注、其他读法、异文。 */
  records: DiagramRecord[];
};

export type DiagramVerse = { bcv: number; verse: number; wordIds: string[]; translation: string };

export type DiagramLexiconEntry = { source: string; lemma: string; gloss: string; definition: string };

export type DiagramData = {
  title: string;
  isOT: boolean;
  /** 新约叙事书卷（福音书、使徒行传、启示录）：顶层主句按时态串成主线。 */
  narrative: boolean;
  /** 译文档位，如「第 3 档「平衡」」；没有译文时为 null。 */
  literalness: string | null;
  verses: DiagramVerse[];
  words: Record<string, DiagramWord>;
  clauses: DiagramClause[];
  lexicon: Record<string, DiagramLexiconEntry[]>;
};

export type DiagramInput = {
  title: string;
  isOT: boolean;
  clauses: ClauseEntity[];
  texts: ClauseText[];
  tokens: Token[];
  variants: VariantToken[];
  notes: DiagramNote[];
  morphExpansion: (code: string) => string | null;
  /** 新约词在 Macula 短语树上的位置（成分分块、块内折行用）；不给时按旧写法分块。 */
  syntax?: Map<string, TokenSyntax>;
  narrative?: boolean;
};

const KIND_ZH: Record<string, string> = { textual: '异文', punctuation: '断句', syntax: '句法', lexical: '词义', other: '其他' };

/** 新约主干是 NA28 的词；这些版本没有这个词时提示（多为异文替换或省略）。 */
const NT_EDITIONS = ['NA27', 'SBL', 'WH', 'Treg', 'TR', 'Byz'];

/** 句首连接词：连词（希伯来含连续式的 וְ）、条件词、希伯来关系词；介词 + 关系代名词（ἄχρι οὗ、ἐν ᾧ）也算。 */
function isConnector(token: Token, next: Token | undefined, isOT: boolean): boolean {
  if (isOT) {
    return /^[HA](C|c|Tr|Tc)$/.test(token.morph);
  }
  if (token.morph === 'CONJ' || token.morph === 'COND') {
    return true;
  }
  return token.morph === 'PREP' && next !== undefined && next.morph.startsWith('R-');
}

/** 名词性的词：被它修饰的从句是定语。 */
function isNominal(token: Token, isOT: boolean): boolean {
  return isOT ? /^[HA](N|A|P|S)/.test(token.morph) : /^[NARPDSFKQX]-/.test(token.morph);
}

function idsInRange(range: string | null, words: Token[]): Set<string> {
  if (!range) {
    return new Set();
  }
  const [first, last] = parseTokenRange(range);
  return new Set(words.filter((word) => word.id >= first && word.id <= last).map((word) => word.id));
}

/** 影响翻译的异文：STEPBible 的异文说明（只取大写标记的有意义异文，拼写差异不算）；新约另看哪些版本没有这个词。 */
function variantOf(token: Token, isOT: boolean): string | null {
  const parts: string[] = [];
  if (isOT && token.textType !== 'L') {
    parts.push(`文本类型 ${token.textType}`);
  }
  if (token.significant && token.variantNote) {
    parts.push(token.variantNote);
  } else if (!isOT) {
    const editions = token.editions?.split('+') ?? [];
    const missing = NT_EDITIONS.filter((edition) => !editions.includes(edition));
    if (missing.length > 0) {
      parts.push(`${missing.join('、')} 此处无此词`);
    }
  }
  if (token.naBracket) {
    parts.push('在 NA28 双括号 [[ ]] 内');
  }
  return parts.length > 0 ? parts.join('；') : null;
}

/** Macula 的成分角色；希伯来文的介词短语角色 pp 按状语显示。 */
const MACULA_ROLES: Record<string, ChipRole> = { s: 's', v: 'v', vc: 'v', o: 'o', o2: 'o2', io: 'io', adv: 'adv', pp: 'adv', p: 'p' };

/** 连词：新约 CONJ，旧约 HC/Hc（含连续式 וַ）。 */
const isConjunction = (token: Token, isOT: boolean) => (isOT ? /^[HA][Cc]$/.test(token.morph) : token.morph === 'CONJ');

/** 短语树：每个结点覆盖范围内的哪些词（判断一个短语是否整个落在子句里）。 */
function nodeWords(syntax: Map<string, TokenSyntax>): Map<number, Set<string>> {
  const result = new Map<number, Set<string>>();
  for (const [id, { path }] of syntax) {
    for (const node of path) {
      result.set(node.id, (result.get(node.id) ?? new Set()).add(id));
    }
  }
  return result;
}

/**
 * 每个词归入哪个成分：谓语所在的子句结点 C（Macula class=cl）下的直属成分各成一组，角色取 Macula 的 role；
 * 不在 C 之下的词（前置的冠词、悬垂话题）取整个落在本子句里、又不含 C 的最高短语成组。谓语不在树上时返回 null。
 */
function constituentsOf(words: Token[], verbId: string | undefined, syntax: Map<string, TokenSyntax>, covered: Map<number, Set<string>>):
  Array<{ key: string; role: ChipRole | null }> | null {
  const verbPath = verbId ? syntax.get(verbId)?.path : undefined;
  const cIndex = verbPath ? verbPath.map((node) => node.cls).lastIndexOf('cl') : -1;
  if (!verbPath || cIndex < 0) {
    return null;
  }
  const clauseNode = verbPath[cIndex];
  const aboveClause = new Set(verbPath.slice(0, cIndex + 1).map((node) => node.id));
  const inClause = new Set(words.map((word) => word.id));
  const roleOf = (value: string | null) => MACULA_ROLES[value ?? ''] ?? null;
  const groups = words.map((word): { key: string; role: ChipRole | null } | null => {
    const own = syntax.get(word.id);
    if (!own) {
      return null;
    }
    const k = own.path.findIndex((node) => node.id === clauseNode.id);
    if (k === own.path.length - 1) {
      return { key: `w${word.id}`, role: roleOf(own.role) };
    }
    if (k >= 0) {
      return { key: `n${own.path[k + 1].id}`, role: roleOf(own.path[k + 1].role) };
    }
    const outer = own.path.find((node) => !aboveClause.has(node.id) && [...covered.get(node.id) ?? []].every((id) => inClause.has(id)));
    return outer ? { key: `n${outer.id}`, role: roleOf(outer.role) } : { key: `w${word.id}`, role: roleOf(own.role) };
  });
  // 不在树上的词（NA28 有而 SBL 没有，如 7:43 的 [ὑμῶν]）随前一个成分，句首的随后一个
  return groups.map((group, index) => group ?? groups.slice(0, index).reverse().find(Boolean) ?? groups.slice(index).find(Boolean)
    ?? { key: `w${words[index].id}`, role: null });
}

/** 子句、或带冠词的子句（τοῦ λαλοῦντος…）：块内自成一行、缩进一级。 */
const isClauseNode = (node: SyntaxNode) => node.cls === 'cl';

/**
 * 新约块内按短语树折行（旧约只看停顿重音，不走这里）：相邻两词的最近共同祖先越浅，停顿越强；块较长（超过 6 词）时，
 * 并列连词 καί 之前是首选断点（PAUSE_COORD），其次是嵌入的子句（连同前面的冠词）前后（PAUSE_EMBED），
 * 嵌入子句的几行缩进一级。这些都只是优先断点：块排得下时不断，不把短块切成又窄又高的一列。
 */
function treeLayout(chipWords: Token[], syntax: Map<string, TokenSyntax>, isOT: boolean): { pauses: number[]; indents: number[] } | null {
  const paths = chipWords.map((word) => syntax.get(word.id)?.path);
  paths.forEach((path, i) => {
    paths[i] = path ?? paths[i - 1] ?? paths.slice(i).find(Boolean);
  });
  if (paths.some((path) => !path)) {
    return null;
  }
  const ids = paths.map((path) => path!.map((node) => node.id));
  const common = ids.slice(0, -1).map((path, i) => {
    let n = 0;
    while (n < path.length && n < ids[i + 1].length && path[n] === ids[i + 1][n]) {
      n += 1;
    }
    return n;
  });
  const shallowest = Math.min(...common);
  const pauses = chipWords.map((word, i) => {
    const punct = pauseAfter(word, isOT);
    return i < common.length && punct !== PAUSE_JOINED ? Math.max(punct, Math.max(0, 4 - (common[i] - shallowest))) : punct;
  });
  const indents = chipWords.map(() => 0);
  const boost = (at: number, level: number) => Math.max(pauses[at], level);
  if (chipWords.length > 6) {
    const blocks = new Map<number, [number, number]>();
    paths.forEach((path, i) => {
      for (const node of path!) {
        if (isClauseNode(node) && !ids[0].includes(node.id)) {
          const [from, to] = blocks.get(node.id) ?? [i, i];
          blocks.set(node.id, [Math.min(from, i), Math.max(to, i)]);
        }
      }
    });
    const seen = new Set<string>();
    for (let [from, to] of blocks.values()) {
      // 子句前紧挨着的冠词（DetCL）一起缩进；外层 DetCL 与里面的子句覆盖同一段，只算一级
      if (!isOT && from > 0 && chipWords[from - 1].morph.startsWith('T-') && ids[from].includes(ids[from - 1].at(-1)!)) {
        from -= 1;
      }
      if (seen.has(`${from}-${to}`)) {
        continue;
      }
      seen.add(`${from}-${to}`);
      for (let i = from; i <= to; i += 1) {
        indents[i] += 1;
      }
      for (const at of [from - 1, to]) {
        if (at >= 0 && at < chipWords.length - 1 && pauses[at] !== PAUSE_JOINED) {
          pauses[at] = boost(at, PAUSE_EMBED);
        }
      }
    }
    chipWords.forEach((word, i) => {
      if (i > 0 && isConjunction(word, isOT) && pauses[i - 1] !== PAUSE_JOINED) {
        pauses[i - 1] = boost(i - 1, PAUSE_COORD);
      }
    });
  }
  return { pauses, indents };
}

function chipsOf(clause: ClauseEntity, words: Token[], isOT: boolean, syntax?: Map<string, TokenSyntax>, covered?: Map<number, Set<string>>): DiagramChip[] {
  const subject = idsInRange(clause.subjectRange, words);
  const verb = idsInRange(clause.verbRange, words);
  const groups = syntax && covered ? constituentsOf(words, [...verb][0], syntax, covered) : null;
  // 后置连词（ὁ γὰρ Μωϋσῆς）夹在同一个成分中间时随成分走
  groups?.forEach((group, index) => {
    const [before, after] = [groups[index - 1], groups[index + 1]];
    if (isConjunction(words[index], isOT) && before && after && before.key === after.key) {
      groups[index] = before;
    }
  });
  let leading = true;
  const chips: Array<DiagramChip & { key?: string }> = [];
  words.forEach((word, index) => {
    const afterPreposition = !isOT && index > 0 && words[index - 1].morph === 'PREP' && word.morph.startsWith('R-');
    leading = leading && (isConnector(word, words[index + 1], isOT) || afterPreposition);
    const group = groups?.[index];
    // 分析给了主语、谓语时以分析为准，Macula 在别处标的主语、谓语不再算
    const tree = group?.role === 's' && subject.size > 0 ? null : group?.role === 'v' && verb.size > 0 ? null : group?.role ?? null;
    const lone = groups && isConjunction(word, isOT) && group?.key === `w${word.id}`;
    const role: ChipRole | null = subject.has(word.id) ? 's' : verb.has(word.id) ? 'v' : leading || lone ? 'conj' : tree;
    const key = groups && role !== 's' && role !== 'v' && role !== 'conj' ? group!.key : undefined;
    const last = chips.at(-1);
    // 同一成分的词合成一块；不属于任何成分的零散词（אֵת אֲשֶׁר、句首冠词）相邻的也合成一块
    const loose = (value: string | undefined) => value === undefined || value.startsWith('w');
    if (last && last.role === role && (last.key === key || (role === null && loose(last.key) && loose(key)))) {
      last.wordIds.push(word.id);
    } else {
      chips.push({ role, wordIds: [word.id], key });
    }
  });
  const manual = new Set((clause.br ?? '').split(',').map((id) => id.trim()).filter(Boolean));
  const byId = new Map(words.map((word) => [word.id, word]));
  for (const chip of chips) {
    delete chip.key;
    if (chip.wordIds.length < 2) {
      continue;
    }
    const chipWords = chip.wordIds.map((id) => byId.get(id)!);
    // 旧约块内折行只看停顿重音（chipPauses）；新约按短语树
    const layout = groups && syntax && !isOT ? treeLayout(chipWords, syntax, isOT) : null;
    // 旧约只看停顿重音：分析里的 br（给缩进视图用的换行）不用
    chip.pauses = layout ? layout.pauses.map((pause, i) => (manual.has(chip.wordIds[i]) ? PAUSE_FORCED : pause)) : chipPauses(chipWords, isOT, isOT ? new Set() : manual);
    if (layout?.indents.some((indent) => indent > 0)) {
      chip.indents = layout.indents;
    }
  }
  markFronted(clause, chips, byId, isOT);
  return chips;
}

/**
 * 旧约：子句里有不定式独立形（`HVqaa`），又有同词根的限定动词（qatal、yiqtol、wayyiqtol、weqatal、祈使、jussive、cohortative），
 * 不论前后，都是强调动词本身（“必定”“痛…”）。返回这几个词的 id。
 */
export function cognateInfinitive(words: Array<Pick<Token, 'id' | 'strong' | 'morph'>>): string[] {
  const root = (strong: string) => strong.replace(/[A-Za-z]+$/, '');
  const absolutes = words.filter((word) => /^[HA]V\wa/.test(word.morph));
  const finite = words.filter((word) => /^[HA]V\w[pqiwhjv]/.test(word.morph));
  const pairs = absolutes.flatMap((inf) => {
    const verbs = finite.filter((verb) => root(verb.strong) === root(inf.strong));
    return verbs.length > 0 ? [inf.id, ...verbs.map((verb) => verb.id)] : [];
  });
  return words.map((word) => word.id).filter((id) => pairs.includes(id));
}

/** 旧约限定动词句（qatal、yiqtol、祈使）：动词前的成分才算前置；分词句、名词句、不定式另有常序，不标。 */
const FINITE_OT = /^(XQtl|QtlX|Qtl0|XYqt|YqtX|Yqt0|Impv|qatal|yiqtol|imperative)$/;

/**
 * 旧约限定动词句：谓语块之前、含名词性词（名词、形容词、代词、介词后缀）的成分块记为前置。
 * 疑问代词（מָה、מִי）本就居首，挂在否定词、小品词上的后缀（אֵינֶנּוּ）也不算；连接词不含名词性词，自然不算。新约暂不标。
 */
function markFronted(clause: ClauseEntity, chips: DiagramChip[], byId: Map<string, Token>, isOT: boolean): void {
  const verbAt = chips.findIndex((chip) => chip.role === 'v');
  if (!isOT || verbAt < 0 || !FINITE_OT.test(clause.type)) {
    return;
  }
  const weighty = (ids: string[]) => ids.some((id, i) => {
    const { morph } = byId.get(id)!;
    const host = i > 0 ? byId.get(ids[i - 1]) : undefined;
    return isNominal(byId.get(id)!, true) && !/^[HA]Pi/.test(morph) && !(/^[HA]S/.test(morph) && host?.after === '' && /^[HA]T/.test(host.morph));
  });
  for (const chip of chips.slice(0, verbAt)) {
    if (chip.role !== 'conj' && weighty(chip.wordIds)) {
      chip.fronted = true;
    }
  }
}

/**
 * 把嵌入子句的占位符放进成分块：空洞两侧是同一块就放在块内；否则放进含被修饰词的那一块（前一块的末尾或后一块的开头）；
 * 都不是就在两块之间单独成一块。
 */
function placeSlots(chips: DiagramChip[], own: Token[], slots: Array<{ at: number; clauseIds: string[] }>, containerId: string,
  modifiesOf: (clauseId: string) => string | null): DiagramChip[] {
  const result = [...chips];
  for (const { at, clauseIds } of slots) {
    const [before, after] = [own[at - 1]?.id, own[at]?.id];
    const prev = result.findIndex((chip) => before !== undefined && chip.wordIds.includes(before));
    const next = result.findIndex((chip) => after !== undefined && chip.wordIds.includes(after));
    const targets = clauseIds.map(modifiesOf).filter(Boolean);
    const holds = (index: number) => index >= 0 && result[index].wordIds.some((id) => targets.includes(id));
    const slot: DiagramSlot = { id: `${containerId}@${at}`, at: 0, clauseIds };
    let chip: DiagramChip;
    if (prev >= 0 && prev === next) {
      chip = result[prev];
      slot.at = chip.wordIds.indexOf(after!);
    } else if (holds(prev)) {
      chip = result[prev];
      slot.at = chip.wordIds.length;
    } else if (holds(next)) {
      chip = result[next];
    } else {
      chip = { role: null, wordIds: [] };
      result.splice(prev >= 0 ? prev + 1 : Math.max(next, 0), 0, chip);
    }
    if (chip.pauses && slot.at > 0) {
      slot.pause = chip.pauses[slot.at - 1];
      chip.pauses[slot.at - 1] = PAUSE_JOINED;
    }
    chip.slots = [...chip.slots ?? [], slot];
  }
  return result;
}

/** 逻辑关联：target 是单个子句或「首-末」一段，取范围内落在其间的子句。 */
function logicOf(clause: ClauseEntity, all: ClauseEntity[]): DiagramClause['logic'] {
  if (!clause.logic) {
    return null;
  }
  const [first, last = first] = clause.logic.target.split('-');
  const key = (id: string) => {
    const { bcv, sub } = parseClauseId(id);
    return `${String(bcv).padStart(9, '0')}${sub.padStart(4, ' ')}`;
  };
  const targetIds = all.map((item) => item.id).filter((id) => key(id) >= key(first) && key(id) <= key(last));
  const short = (id: string) => {
    const { bcv, sub } = parseClauseId(id);
    return `${bcv % 1000}${sub}`;
  };
  return {
    relation: clause.logic.relation,
    label: LOGIC_LABELS[clause.logic.relation],
    targetIds,
    targetText: first === last ? short(first) : `${short(first)}–${short(last)}`,
    note: clause.logic.note ?? null,
  };
}

export function buildDiagram(input: DiagramInput): Omit<DiagramData, 'lexicon'> {
  const { isOT, tokens } = input;
  const textByKey = new Map(input.texts.map((text) => [`${text.bcv}${text.sub}`, text]));
  const tokenById = new Map(tokens.map((token) => [token.id, token]));

  const renderings = new Map<string, string>();
  for (const text of input.texts) {
    for (const rendering of text.renderings) {
      const [first, last] = parseTokenRange(rendering.tokens);
      for (const token of tokens) {
        if (token.id >= first && token.id <= last) {
          renderings.set(token.id, renderings.has(token.id) ? `${renderings.get(token.id)}；${rendering.zh}` : rendering.zh);
        }
      }
    }
  }

  const words: Record<string, DiagramWord> = {};
  for (const token of tokens) {
    words[token.id] = {
      id: token.id, bcv: token.bcv, text: token.surface, after: token.after, lemma: token.lemma, translit: token.translit,
      strong: token.strong, morph: token.morph, morphExp: input.morphExpansion(token.morph), glossEn: token.glossEn,
      glossZh: token.glossZh, sense: token.sense, rendering: renderings.get(token.id) ?? null, variant: variantOf(token, isOT),
      ...(isOT ? { gcase: null, tense: null, mood: null } : greekMorph(token.morph)),
      stem: isOT ? hebrewStem(token.morph) : null,
    };
  }
  const covered = input.syntax ? nodeWords(input.syntax) : undefined;

  const clauseIds = new Set(input.clauses.map((clause) => clause.id));
  const wordsOf = clauseWords(input.clauses, tokens);
  const slotsOf = new Map(input.clauses.map((clause) => [clause.id, embedSlots(clause, input.clauses, wordsOf.get(clause.id) ?? [])]));
  const modifiesOf = new Map(input.clauses.map((clause) => [clause.id, clause.modifies]));
  // 子句重新切分后，首末词对不上的说明作废
  const noteOf = new Map(input.notes
    .filter((note) => input.clauses.some((clause) => clause.id === note.clauseId && clause.firstWordId === note.firstWordId && clause.lastWordId === note.lastWordId))
    .map((note) => [note.clauseId, note]));

  const clauses = input.clauses.map((clause): DiagramClause => {
    const own = wordsOf.get(clause.id) ?? [];
    const parentId = clause.parentId && clauseIds.has(clause.parentId) ? clause.parentId : null;
    const parent = parentId ? input.clauses.find((item) => item.id === parentId) : undefined;
    const parentWords = parent ? wordsOf.get(parent.id) ?? [] : [];
    let targetWordId: string | null = null;
    if (parent) {
      targetWordId = clause.modifies && parentWords.some((word) => word.id === clause.modifies)
        ? clause.modifies
        : [...idsInRange(parent.verbRange, parentWords)][0] ?? parent.firstWordId;
    }
    const target = targetWordId ? tokenById.get(targetWordId) : undefined;
    // 嵌在母句中间：连线指向母句里的占位符
    const container = parent ? containerOf(clause, input.clauses) : undefined;
    const slot = container && container.id === parent!.id ? slotsOf.get(container.id)?.find((item) => item.clauseIds.includes(clause.id)) : undefined;
    const note = noteOf.get(clause.id);
    const verbWord = words[[...idsInRange(clause.verbRange, own)][0] ?? ''];

    const text = textByKey.get(clause.id);
    const segments = text ? parseFormatted(text.formatted) : [];
    let gist = note?.gist ?? '';
    if (!gist && text) {
      gist = text.translationSpan === 0 ? '（译文并入前句）' : plainText(segments).replace(/\s*\n\s*/g, '') + (text.translationSpan > 1 ? '（合译）' : '');
    }

    const records: DiagramRecord[] = [];
    if (clause.note) {
      records.push({ tag: '分析', text: clause.note });
    }
    for (const alternative of clause.alternatives) {
      records.push({ tag: '另一种分析', text: alternative.basis ? `${alternative.summary}（${alternative.basis}）` : alternative.summary });
    }
    const reason = clauseNote(segments);
    if (reason) {
      records.push({ tag: '译注', text: reason });
    }
    for (const alternative of text?.alternatives ?? []) {
      records.push({ tag: `其他译法·${KIND_ZH[alternative.kind] ?? alternative.kind}`, text: `${alternative.text.replace(/\n/g, '')}（${alternative.basis}）` });
    }
    for (const word of own) {
      const variant = words[word.id]?.variant;
      if (variant) {
        records.push({ tag: '异文', text: `${word.surface}：${variant}` });
      }
    }
    for (const variant of input.variants) {
      if (clauseOfWord(variant.posId, input.clauses)?.id === clause.id) {
        records.push({ tag: '异文', text: `${variant.surface}（${variant.editions ?? variant.textType}，${variant.glossEn}）` });
      }
    }

    const targetZh = target ? words[target.id]?.rendering ?? target.glossZh ?? target.surface : null;
    return {
      id: clause.id,
      parentId,
      label: note?.label ?? (clause.parentId === null ? '主句' : target && isNominal(target, isOT) ? '定语从句' : '从句'),
      link: note?.link ?? (targetZh ? `修饰“${targetZh}”` : null),
      gist,
      status: clause.status,
      type: clause.type,
      ntForm: verbWord?.tense && verbWord.mood ? `${verbWord.tense}-${verbWord.mood}` : null,
      chips: placeSlots(chipsOf(clause, own, isOT, input.syntax, covered), own, slotsOf.get(clause.id) ?? [], clause.id,
        (id) => modifiesOf.get(id) ?? null),
      fromWordId: clause.firstWordId,
      targetWordId,
      targetSlot: slot ? `${container!.id}@${slot.at}` : null,
      logic: logicOf(clause, input.clauses),
      cognate: isOT ? cognateInfinitive(own) : [],
      annotated: note !== undefined,
      points: note?.notes ?? [],
      records,
    };
  });

  const verses: DiagramVerse[] = [];
  for (const token of tokens) {
    let verse = verses.at(-1);
    if (!verse || verse.bcv !== token.bcv) {
      const texts = input.texts.filter((text) => text.bcv === token.bcv && text.translationSpan > 0).sort((a, b) => a.sub.localeCompare(b.sub));
      verse = { bcv: token.bcv, verse: token.bcv % 1000, wordIds: [], translation: texts.map((text) => plainText(parseFormatted(text.formatted))).join('').replace(/\s*\n\s*/g, '') };
      verses.push(verse);
    }
    verse.wordIds.push(token.id);
  }

  const level = input.texts.find((text) => text.translationSpan > 0)?.literalness;
  const literalness = input.texts.some((text) => text.translationSpan > 0)
    ? `第 ${level ?? 2} 档「${LITERALNESS_LEVELS[(level ?? 2) as keyof typeof LITERALNESS_LEVELS].name}」`
    : null;

  return { title: input.title, isOT, narrative: !isOT && input.narrative === true, literalness, verses, words, clauses };
}

/** 经文范围的简写：`7`、`7:17`、`7:17-18`、`7:17-8:3`。 */
export function rangeLabel(range: ScriptureRange): string {
  const startChapter = chapterFromBcv(range.startBcv);
  const endChapter = chapterFromBcv(range.endBcv);
  const startVerse = range.startBcv % 1000;
  const endVerse = range.endBcv % 1000;
  if (endVerse === 999 && startVerse <= 1) {
    return startChapter === endChapter ? `${startChapter}` : `${startChapter}-${endChapter}`;
  }
  if (startChapter === endChapter) {
    return startVerse === endVerse ? `${startChapter}:${startVerse}` : `${startChapter}:${startVerse}-${endVerse}`;
  }
  return `${startChapter}:${startVerse}-${endChapter}:${endVerse}`;
}

/** 新约叙事书卷：马太福音至使徒行传、启示录。书信的主线另作处理。 */
const NARRATIVE_BOOKS = new Set([40, 41, 42, 43, 44, 66]);

/** 词典释义很长时截断，单个页面不至于过大。 */
const DEFINITION_LIMIT = 3000;

export async function loadDiagram(db: BibleDb, store: WorkFileStore, range: ScriptureRange): Promise<DiagramData> {
  const clauses: ClauseEntity[] = [];
  const texts: ClauseText[] = [];
  const notes: DiagramNote[] = [];
  for (let chapter = chapterFromBcv(range.startBcv); chapter <= chapterFromBcv(range.endBcv); chapter += 1) {
    const startBcv = Math.max(toBcv(range.bookId, chapter, 0), range.startBcv);
    const endBcv = Math.min(toBcv(range.bookId, chapter, 999), range.endBcv);
    const inRange = (bcv: number) => bcv >= startBcv && bcv <= endBcv;
    clauses.push(...(await store.readClauseEntities(range.bookName, chapter)).filter((clause) => inRange(parseClauseId(clause.id).bcv)));
    texts.push(...(await store.readClauseTexts(range.bookName, chapter)).filter((text) => inRange(text.bcv)));
    notes.push(...await store.readDiagramNotes(range.bookName, chapter));
  }
  const tokens = db.tokensInRange(range.startBcv, range.endBcv);
  const data = buildDiagram({
    syntax: db.syntaxForTokens(tokens.map((token) => token.id)),
    narrative: NARRATIVE_BOOKS.has(range.bookId),
    title: `${range.bookName} ${rangeLabel(range)}`,
    isOT: range.isOT,
    clauses,
    texts,
    tokens,
    variants: db.variantsInRange(range.startBcv, range.endBcv),
    notes,
    morphExpansion: (code) => db.morphExpansion(code),
  });
  const lexicon: Record<string, DiagramLexiconEntry[]> = {};
  for (const strong of new Set(tokens.map((token) => token.strong))) {
    const entries = db.lookupLexicon(strong);
    // 每个来源取第一条：UBS 中文词典在前，其次 STEPBible 简明词典
    const bySource = new Map<string, DiagramLexiconEntry>();
    for (const entry of entries) {
      if (!bySource.has(entry.source)) {
        bySource.set(entry.source, {
          source: entry.source, lemma: entry.lemma, gloss: entry.gloss,
          definition: entry.definition.length > DEFINITION_LIMIT ? `${entry.definition.slice(0, DEFINITION_LIMIT)}…` : entry.definition,
        });
      }
    }
    lexicon[strong] = [...bySource.values()];
  }
  return { ...data, lexicon };
}
