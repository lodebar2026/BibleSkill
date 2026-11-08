/**
 * TAHOT / TAGNT 逐词行解析。
 *
 * 只认以经文引用开头的数据行（`Gen.1.1#01=L\t...`），其余是说明、节摘要（`# Gen.1.2`）与表头。
 * 引用里的括号是别的版本体系的节号：TAHOT `( )` 为希伯来节号；TAGNT `[ ]` KJV、`( )` NA、`{ }` 其他。
 * 主干节号一律取括号外（NRSV/英文）的节号。
 */
import { readFileSync } from 'node:fs';
import { bookByStepCode, editionNames, ntTokenId, otTokenId, toBcv } from '@bs/core';

export type Report = (kind: string, ref: string, detail: string) => void;

export type ParsedRef = {
  raw: string;
  book: number;
  chapter: number;
  verse: number;
  /** 括号里的另一版本体系节号，没有则为 null。 */
  alt: { bracket: '(' | '[' | '{'; chapter: number; verse: number } | null;
  word: number;
  type: string;
};

const REF_RE = /^([1-3][A-Z][a-z]|[A-Z][a-z]{2})\.(\d+)\.(\d+)(?:([(\[{])(\d+)\.(\d+)[)\]}])?#(\d+)=(\S+)$/;
const DATA_LINE_RE = /^(?:[1-3][A-Z][a-z]|[A-Z][a-z]{2})\.\d+\.\d+[^\t]*#\d+=/;

export function parseRef(raw: string): ParsedRef | null {
  const match = raw.match(REF_RE);
  if (!match) {
    return null;
  }
  return {
    raw,
    book: bookByStepCode(match[1]).id,
    chapter: Number(match[2]),
    verse: Number(match[3]),
    alt: match[4]
      ? { bracket: match[4] as '(' | '[' | '{', chapter: Number(match[5]), verse: Number(match[6]) }
      : null,
    word: Number(match[7]),
    type: match[8],
  };
}

export function* dataLines(filePath: string, report: Report): Generator<{ ref: ParsedRef; cols: string[] }> {
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!DATA_LINE_RE.test(line)) {
      continue;
    }
    const cols = line.split('\t');
    const ref = parseRef(cols[0]);
    if (!ref) {
      report('unparsed-ref', cols[0], '引用格式无法识别，整行跳过');
      continue;
    }
    yield { ref, cols };
  }
}

export type TokenRow = {
  id: string;
  ref: string;
  bcv: number;
  ord: number;
  surface: string;
  after: string;
  translit: string;
  lemma: string;
  strong: string;
  morph: string;
  glossEn: string;
  glossZh: string | null;
  /** Macula 义项（旧约 sdbh、新约 ln），映射时回填。 */
  sense: string | null;
  editions: string | null;
  textType: string;
  /** 拼写异文与影响词义的异文说明（原样保留 STEPBible 的写法）。 */
  variantNote: string | null;
  /** 是否有影响翻译的异文（STEPBible 用大写字母标出）。 */
  significant: boolean;
  /** 是否在 NA28 双括号 [[ ]] 内（编者判为后加、但印在正文中的经文）。 */
  naBracket: boolean;
  /** 映射 Macula 时用的节号（旧约希伯来节号、新约 NA 节号）。 */
  maculaBcv: number;
  /** 词行本身的版本（NA28 读法顶替进主干时与 editions 不同）；对齐 Macula（SBLGNT）看这个词位在不在 SBL。 */
  slotEditions?: string;
};

export type VariantRow = {
  ref: string;
  bcv: number;
  wordNo: number;
  /** 该异文词在主干词序中的位置（同格式词 id，用来判断落在哪个子句）。 */
  posId: string;
  significant: boolean;
  surface: string;
  strong: string;
  morph: string;
  glossEn: string;
  editions: string | null;
  textType: string;
};

/**
 * STEPBible 以大写标出影响翻译的异文：类型码括号里的大写（Q(K)、N(K)O、L(AH+B)），
 * TAGNT 意义异文里的 `T=`（小写 `t=` 不影响翻译）。
 */
function significantType(type: string): boolean {
  return /\([^)]*[A-Z]/.test(type);
}

/** 不进主干的异文词：括号外有大写字母即在主要译本中有翻译（K = KJV 底本、O = 其他版本、X = LXX 补文）。 */
function significantVariantWord(type: string): boolean {
  return /[A-Z]/.test(type.replace(/\([^)]*\)/g, ''));
}

/** 四位词号 1401 = 插在第 14 词之后。 */
function anchorWord(word: number): number {
  return word > 999 ? Math.floor(word / 100) : word;
}

function joinNotes(...notes: (string | undefined)[]): string | null {
  const kept = notes.map((note) => note?.trim()).filter((note): note is string => Boolean(note));
  return kept.length > 0 ? kept.join(' | ') : null;
}

// ---------------------------------------------------------------- 旧约

/** TAHOT 主干文本类型：L 列宁格勒抄本、Q 读型（Qere）、R 恢复文本；K 与 X（LXX 补入）不进主干。 */
function isOtBaseType(type: string): boolean {
  return /^[LQR]/.test(type);
}

const MAQAF = '־';

/**
 * 把一个希伯来词拆成语素。`/` 分前后缀，`//` 是读型把两个词写在一格（创 30:11），同样按语素拆；
 * `\` 之后是标点（maqaf、sof pasuq 等），并入前一语素的 after。
 */
function splitHebrewWord(text: string): { parts: string[]; trailing: string } {
  const [body, ...punct] = text.split('\\');
  const trailing = punct.join('');
  return { parts: body.split(/\/+/).filter((part) => part.length > 0), trailing };
}

function splitParallel(value: string, count: number): string[] | null {
  const parts = value.split(/\/+/).map((part) => part.trim());
  return parts.length === count ? parts : null;
}

/** dStrongs 列：`H9003/{H7225G}`、`H9009/{H0776G}\H9016`；花括号标记词根。 */
function parseHebrewStrongs(value: string): { strongs: string[]; rootIndex: number } {
  const body = value.split('\\')[0];
  const strongs: string[] = [];
  let rootIndex = -1;
  for (const raw of body.split(/\/+/)) {
    const isRoot = raw.includes('{');
    const strong = raw.replace(/[{}]/g, '').replace(/\+$/, '').trim();
    if (!strong) {
      continue;
    }
    if (isRoot) {
      rootIndex = strongs.length;
    }
    strongs.push(strong);
  }
  return { strongs, rootIndex };
}

/** Grammar 列：`HR/Ncfsa`，首字母为语言（H 希伯来 / A 亚兰），其后各语素按 `/` 分。 */
function parseHebrewGrammar(value: string): string[] {
  const lang = value.charAt(0);
  return value.slice(1).split(/\/+/).filter(Boolean).map((part) => `${lang}${part}`);
}

/** Expanded Strong 列：`H9003=ב=in/{H7225G=רֵאשִׁית=: beginning»first:1_beginning}`，取各语素的词条形。 */
function parseHebrewLemmas(value: string): Map<string, string> {
  const lemmas = new Map<string, string>();
  for (const raw of value.replace(/[{}]/g, '').split(/[/\\]/)) {
    const [strong, lemma] = raw.split('=');
    if (strong && lemma) {
      lemmas.set(strong.trim(), lemma.trim());
    }
  }
  return lemmas;
}

/**
 * 英文一节由两个原文节合成时（民 26:1 = 希伯来 25:19 + 26:1；诗篇标题两节都是英文第 0 节），
 * 两段词号会撞。后一段的词号接在前一段之后续编，原始引用仍保留在 ref 里。
 */
class VerseWordNumbering {
  private bcv = 0;
  private source = '';
  private offset = 0;
  private max = 0;

  constructor(private readonly report: Report) {}

  wordNo(bcv: number, ref: ParsedRef): number {
    const source = ref.alt ? `${ref.alt.chapter}.${ref.alt.verse}` : '';
    if (bcv !== this.bcv) {
      this.bcv = bcv;
      this.source = source;
      this.offset = 0;
      this.max = 0;
    } else if (source !== this.source) {
      this.source = source;
      this.offset = this.max;
      this.report('verse-merge', ref.raw, `与同一英文节的前一段原文节合并，词号续编 +${this.offset}`);
    }
    const word = ref.word + this.offset;
    this.max = Math.max(this.max, word);
    return word;
  }
}

export function parseTahot(filePath: string, report: Report, onToken: (row: TokenRow) => void, onVariant: (row: VariantRow) => void): void {
  let currentBcv = 0;
  let ord = 0;
  const numbering = new VerseWordNumbering(report);
  for (const { ref, cols } of dataLines(filePath, report)) {
    const bcv = toBcv(ref.book, ref.chapter, ref.verse);
    const [, hebrew = '', translit = '', translation = '', dStrongs = '', grammar = '', meaningVar, spellingVar, , , , expanded = ''] = cols;
    // 四位词号（#1401）是插在第 14 词之后的补入文本（LXX 补文 X、尼 7:68 恢复文本 R），
    // 在列宁格勒抄本的词序里没有位置，与非主干类型一并归入异文
    if (!isOtBaseType(ref.type) || ref.word > 999) {
      onVariant({
        ref: ref.raw, bcv, wordNo: ref.word, posId: otTokenId(ref.book, ref.chapter, ref.verse, anchorWord(ref.word), 9),
        significant: significantVariantWord(ref.type), surface: hebrew.replace(/[/\\]/g, ''),
        strong: dStrongs, morph: grammar, glossEn: translation, editions: null, textType: ref.type,
      });
      report('ot-not-base', ref.raw, ref.word > 999 ? `补入文本（词号 ${ref.word}）不进主干` : `文本类型 ${ref.type} 不进主干`);
      continue;
    }
    if (bcv !== currentBcv) {
      currentBcv = bcv;
      ord = 0;
    }
    const wordNo = numbering.wordNo(bcv, ref);
    const { parts, trailing } = splitHebrewWord(hebrew);
    const { strongs, rootIndex } = parseHebrewStrongs(dStrongs);
    const morphs = parseHebrewGrammar(grammar);
    if (parts.length !== strongs.length || parts.length !== morphs.length || parts.length > 9) {
      report('ot-morpheme-count', ref.raw, `语素数不一致: 文本 ${parts.length} / Strong ${strongs.length} / 词法 ${morphs.length}；整词作一个语素`);
    }
    const aligned = parts.length === strongs.length && parts.length === morphs.length && parts.length <= 9;
    const pieces = aligned ? parts : [parts.join('')];
    const translitParts = aligned ? splitParallel(translit, pieces.length) : null;
    const glossParts = aligned ? splitParallel(translation, pieces.length) : null;
    const lemmas = parseHebrewLemmas(expanded);
    const root = aligned ? (rootIndex >= 0 ? rootIndex : pieces.length - 1) : 0;
    const maculaBcv = ref.alt ? toBcv(ref.book, ref.alt.chapter, ref.alt.verse) : bcv;
    const variantNote = joinNotes(meaningVar, spellingVar);

    pieces.forEach((piece, index) => {
      const isLast = index === pieces.length - 1;
      const strong = aligned ? strongs[index] : (strongs[rootIndex >= 0 ? rootIndex : 0] ?? '');
      onToken({
        id: otTokenId(ref.book, ref.chapter, ref.verse, wordNo, index + 1),
        ref: ref.raw,
        bcv,
        ord: ord++,
        surface: piece,
        // maqaf 连写不加空格；其余（含 sof pasuq）词后补一个空格
        after: isLast ? (trailing.endsWith(MAQAF) ? trailing : `${trailing} `) : '',
        translit: translitParts?.[index] ?? (index === root ? translit : ''),
        lemma: lemmas.get(strong) ?? '',
        strong,
        morph: aligned ? morphs[index] : grammar,
        glossEn: glossParts?.[index] ?? (index === root ? translation : ''),
        glossZh: null,
        sense: null,
        editions: null,
        textType: ref.type,
        variantNote,
        significant: significantType(ref.type),
        naBracket: false,
        maculaBcv,
      });
    });
  }
}

// ---------------------------------------------------------------- 新约

const GREEK_TRAILING_PUNCT_RE = /([,.;·:;᾽’]+)$/u;

/** `Βίβλος (Biblos)` → 词形 + 音译；词尾标点拆进 after。 */
function splitGreekCell(cell: string): { surface: string; after: string; translit: string; opens: boolean; closes: boolean } {
  const match = cell.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  // ¶ 是 STEPBible 的分段标记；[[ ]] 是 NA28 的双括号（后加经文），都不是词形的一部分
  const raw = (match ? match[1] : cell).replace(/¶/g, '').trim();
  const opens = raw.startsWith('[[');
  const closes = raw.includes(']]');
  const word = raw.replace(/\[\[|\]\]/g, '').trim();
  const translit = match ? match[2] : '';
  const punct = word.match(GREEK_TRAILING_PUNCT_RE);
  if (punct && punct[1].length < word.length) {
    return { surface: word.slice(0, -punct[1].length), after: `${punct[1]} `, translit, opens, closes };
  }
  return { surface: word, after: ' ', translit, opens, closes };
}

type GreekReading = { surface: string; translit: string; gloss: string; strong: string; morph: string; editions: string };

const GREEK_READING_RE = /^(.*?)\s*\([A-Za-z]=([^)]*)\)\s*(.*?)\s+-\s+(G\d+\w*)=(\S+)\s+in:\s*(\S+)$/u;

/** 意义异文列的各读法：`ὁδηγήσῃ (t=hodēgēsē) shall guide - G3594=V-AAS-3S in: NA28+TR+Byz`，多个以 ¦ 分隔。 */
function parseGreekReadings(value: string): (GreekReading | string)[] {
  return value.split('¦').map((part) => part.trim()).filter(Boolean).map((part) => {
    const match = part.match(GREEK_READING_RE);
    return match
      ? { surface: match[1], translit: match[2], gloss: match[3], strong: match[4], morph: match[5], editions: match[6] }
      : part;
  });
}

/**
 * 词行本身不属 NA28、NA28 的读法只写在意义异文列里时（徒 8:31 ὁδηγήσει，NA28 作 ὁδηγήσῃ），
 * 取出 NA28 读法顶替进主干，其余读法（含词行本身）记入 variantNote。
 */
function na28Alternative(meaningVar: string | undefined, main: string): { reading: GreekReading; note: string } | null {
  if (!meaningVar?.includes('NA28')) {
    return null;
  }
  const readings = parseGreekReadings(meaningVar);
  const index = readings.findIndex((reading) => typeof reading !== 'string' && editionNames(reading.editions).includes('NA28'));
  if (index < 0) {
    return null;
  }
  const others = readings.filter((_, other) => other !== index).map((reading) => typeof reading === 'string' ? reading : `${reading.surface} (${reading.translit}) ${reading.gloss} - ${reading.strong}=${reading.morph} in: ${reading.editions}`);
  return { reading: readings[index] as GreekReading, note: [main, ...others].join(' ¦ ') };
}

/** 顶替进主干的 NA28 读法没有词条形：按同一 Strong 在主干其他词上的词条形补上。 */
export function fillMissingLemmas(rows: TokenRow[], report: Report): void {
  // 主干多用扩展 Strong（G1135G），异文列只给基本编号（G1135）：完全相同的找不到时按基本编号找
  const lemmas = new Map<string, string>();
  for (const row of rows) {
    for (const key of [row.strong, row.strong.match(/^G\d+/)?.[0]]) {
      if (row.lemma && key && !lemmas.has(key)) {
        lemmas.set(key, row.lemma);
      }
    }
  }
  for (const row of rows) {
    if (!row.lemma) {
      row.lemma = lemmas.get(row.strong) ?? lemmas.get(row.strong.match(/^G\d+/)?.[0] ?? '') ?? '';
      if (!row.lemma) {
        report('nt-lemma-missing', row.ref, `${row.strong} 在主干里找不到词条形`);
      }
    }
  }
}

export function parseTagnt(filePath: string, report: Report, onToken: (row: TokenRow) => void, onVariant: (row: VariantRow) => void): void {
  let currentBcv = 0;
  let ord = 0;
  let lastWord = 0;
  const numbering = new VerseWordNumbering(report);
  // NA28 双括号区段；源数据里马可福音长结尾没有收尾的 ]]（它在书末结束），所以换书卷时强制关闭
  let inBracket = false;
  let bracketBook = 0;
  for (const { ref, cols } of dataLines(filePath, report)) {
    const bcv = toBcv(ref.book, ref.chapter, ref.verse);
    const [, greek = '', english = '', strongGrammar = '', lemmaGloss = '', editions = '', meaningVar, spellingVar] = cols;
    const [strong = '', morph = ''] = strongGrammar.split('=');
    const [lemma = ''] = lemmaGloss.split('=');
    const { surface, after, translit, opens, closes } = splitGreekCell(greek);
    const bookKey = ref.book;
    if (inBracket && bookKey !== bracketBook) {
      report('na-bracket', ref.raw, '双括号区段到书末未见 ]]，按书末收尾');
      inBracket = false;
    }
    const inNa28 = editionNames(editions).includes('NA28');
    const alternative = inNa28 ? null : na28Alternative(meaningVar, `${surface} (${translit}) ${english.trim()} - ${strong.trim()}=${morph.trim()} in: ${editions}`);
    if (opens && (inNa28 || alternative)) {
      inBracket = true;
      bracketBook = bookKey;
      report('na-bracket', ref.raw, 'NA28 双括号区段开始');
    }
    const naBracket = inBracket;
    if (closes) {
      inBracket = false;
    }
    if (bcv !== currentBcv) {
      currentBcv = bcv;
      ord = 0;
      lastWord = 0;
    }
    if (!inNa28) {
      onVariant({
        ref: ref.raw, bcv, wordNo: ref.word, posId: ntTokenId(ref.book, ref.chapter, ref.verse, anchorWord(ref.word)),
        significant: significantVariantWord(ref.type), surface, strong, morph, glossEn: english, editions, textType: ref.type,
      });
      if (!alternative) {
        continue;
      }
      report('nt-na28-alternative', ref.raw, `NA28 读法 ${alternative.reading.surface} 只在异文列，顶替 ${surface} 进主干`);
    }
    const wordNo = numbering.wordNo(bcv, ref);
    if (wordNo <= lastWord) {
      report('nt-word-order', ref.raw, `词号 ${wordNo} 不大于前一主干词 ${lastWord}，id 字典序将与行序不符`);
    }
    lastWord = wordNo;
    const maculaBcv = ref.alt?.bracket === '(' ? toBcv(ref.book, ref.alt.chapter, ref.alt.verse) : bcv;
    const reading = alternative?.reading;
    onToken({
      id: ntTokenId(ref.book, ref.chapter, ref.verse, wordNo),
      ref: ref.raw,
      bcv,
      ord: ord++,
      surface: reading?.surface ?? surface,
      after,
      translit: reading?.translit ?? translit,
      lemma: reading && reading.strong !== strong.trim() ? '' : lemma.trim(),
      strong: reading?.strong ?? strong.trim(),
      morph: reading?.morph ?? morph.trim(),
      glossEn: reading?.gloss ?? english.trim(),
      glossZh: null,
      sense: null,
      editions: reading?.editions ?? editions,
      slotEditions: reading ? editions : undefined,
      textType: ref.type,
      variantNote: joinNotes(alternative?.note ?? meaningVar, spellingVar),
      significant: significantType(ref.type) || /\(T=/.test(meaningVar ?? ''),
      naBracket,
      maculaBcv,
    });
  }
}
