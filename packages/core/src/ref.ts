/**
 * 经文引用解析：中英简繁书名、`创 1:31-2:3` 式范围。每卷带 STEPBible 书卷缩写（`step`，USFM 代码即其大写）。
 */

export type BookMeta = {
  id: number;
  /** STEPBible 书卷缩写，如 Gen / Mrk / Jhn。 */
  step: string;
  /** 规范简体全名，用于输出与工作目录名。 */
  name: string;
  /** 该卷所有可接受写法：英文全称+缩写、简体全称+缩写、繁体全称+缩写。 */
  names: string[];
};

export type ScriptureRange = {
  bookId: number;
  bookName: string;
  isOT: boolean;
  startBcv: number;
  /** 整章范围以 999 作为节号上界哨兵。 */
  endBcv: number;
};

const BOOKS: BookMeta[] = [
  { id: 1, step: 'Gen', name: '创世记', names: ['Genesis', 'Gen', 'Ge', 'Gn', '创世记', '创', '創世記', '創'] },
  { id: 2, step: 'Exo', name: '出埃及记', names: ['Exodus', 'Exod', 'Ex', '出埃及记', '出', '出埃及記', 'Exo'] },
  { id: 3, step: 'Lev', name: '利未记', names: ['Leviticus', 'Lev', 'Le', '利未记', '利', '利未記'] },
  { id: 4, step: 'Num', name: '民数记', names: ['Numbers', 'Num', 'Nu', 'Nm', '民数记', '民', '民數記'] },
  { id: 5, step: 'Deu', name: '申命记', names: ['Deuteronomy', 'Deut', 'Dt', 'Deu', '申命记', '申', '申命記'] },
  { id: 6, step: 'Jos', name: '约书亚记', names: ['Joshua', 'Josh', 'Jos', '约书亚记', '书', '书亚', '約書亞記', '書', '書亞'] },
  { id: 7, step: 'Jdg', name: '士师记', names: ['Judges', 'Judg', 'Jdg', 'Jgs', '士师记', '士', '士師記'] },
  { id: 8, step: 'Rut', name: '路得记', names: ['Ruth', 'Ru', '路得记', '得', '路得記', 'Rut'] },
  { id: 9, step: '1Sa', name: '撒母耳记上', names: ['1 Samuel', '1Sam', '1Sa', '撒母耳记上', '撒上', '撒母耳記上'] },
  { id: 10, step: '2Sa', name: '撒母耳记下', names: ['2 Samuel', '2Sam', '2Sa', '撒母耳记下', '撒下', '撒母耳記下'] },
  { id: 11, step: '1Ki', name: '列王纪上', names: ['1 Kings', '1Kgs', '1Ki', '列王纪上', '王上', '列王紀上'] },
  { id: 12, step: '2Ki', name: '列王纪下', names: ['2 Kings', '2Kgs', '2Ki', '列王纪下', '王下', '列王紀下'] },
  { id: 13, step: '1Ch', name: '历代志上', names: ['1 Chronicles', '1Chr', '历代志上', '代上', '歷代志上', '1Ch'] },
  { id: 14, step: '2Ch', name: '历代志下', names: ['2 Chronicles', '2Chr', '历代志下', '代下', '歷代志下', '2Ch'] },
  { id: 15, step: 'Ezr', name: '以斯拉记', names: ['Ezra', 'Ezr', '以斯拉记', '拉', '以斯拉記'] },
  { id: 16, step: 'Neh', name: '尼希米记', names: ['Nehemiah', 'Neh', 'Ne', '尼希米记', '尼', '尼希米記'] },
  { id: 17, step: 'Est', name: '以斯帖记', names: ['Esther', 'Esth', 'Est', '以斯帖记', '斯', '以斯帖記'] },
  { id: 18, step: 'Job', name: '约伯记', names: ['Job', '约伯记', '伯', '約伯記'] },
  { id: 19, step: 'Psa', name: '诗篇', names: ['Psalms', 'Ps', 'Psa', 'Psalm', '诗篇', '诗', '詩篇', '詩'] },
  { id: 20, step: 'Pro', name: '箴言', names: ['Proverbs', 'Prov', 'Pr', '箴言', '箴', 'Pro'] },
  { id: 21, step: 'Ecc', name: '传道书', names: ['Ecclesiastes', 'Eccl', 'Ecc', 'Qoheleth', '传道书', '传', '傳道書', '傳'] },
  { id: 22, step: 'Sng', name: '雅歌', names: ['Song of Songs', 'Song', 'Song of Solomon', 'SOS', '雅歌', '歌', 'Sng'] },
  { id: 23, step: 'Isa', name: '以赛亚书', names: ['Isaiah', 'Isa', 'Is', '以赛亚书', '赛', '以賽亞書', '賽'] },
  { id: 24, step: 'Jer', name: '耶利米书', names: ['Jeremiah', 'Jer', 'Je', '耶利米书', '耶', '耶利米書'] },
  { id: 25, step: 'Lam', name: '耶利米哀歌', names: ['Lamentations', 'Lam', 'La', '耶利米哀歌', '哀'] },
  { id: 26, step: 'Ezk', name: '以西结书', names: ['Ezekiel', 'Ezek', 'Eze', 'Ezk', '以西结书', '结', '以西結書', '結'] },
  { id: 27, step: 'Dan', name: '但以理书', names: ['Daniel', 'Dan', 'Da', 'Dn', '但以理书', '但', '但以理書'] },
  { id: 28, step: 'Hos', name: '何西阿书', names: ['Hosea', 'Hos', 'Ho', '何西阿书', '何', '何西阿書'] },
  { id: 29, step: 'Jol', name: '约珥书', names: ['Joel', 'Joe', '约珥书', '珥', '約珥書', 'Jol'] },
  { id: 30, step: 'Amo', name: '阿摩司书', names: ['Amos', 'Am', '阿摩司书', '摩', '阿摩司書', 'Amo'] },
  { id: 31, step: 'Oba', name: '俄巴底亚书', names: ['Obadiah', 'Obad', 'Ob', '俄巴底亚书', '俄', '俄巴底亞書', 'Oba'] },
  { id: 32, step: 'Jon', name: '约拿书', names: ['Jonah', 'Jon', '约拿书', '拿', '約拿書'] },
  { id: 33, step: 'Mic', name: '弥迦书', names: ['Micah', 'Mic', 'Mi', '弥迦书', '弥', '彌迦書', '彌'] },
  { id: 34, step: 'Nam', name: '那鸿书', names: ['Nahum', 'Nah', 'Na', '那鸿书', '鸿', '那鴻書', '鴻', 'Nam'] },
  { id: 35, step: 'Hab', name: '哈巴谷书', names: ['Habakkuk', 'Hab', 'Hb', '哈巴谷书', '哈', '哈巴谷書'] },
  { id: 36, step: 'Zep', name: '西番雅书', names: ['Zephaniah', 'Zeph', 'Zep', 'Zp', '西番雅书', '番', '西番雅書'] },
  { id: 37, step: 'Hag', name: '哈该书', names: ['Haggai', 'Hag', 'Hg', '哈该书', '该', '哈該書', '該'] },
  { id: 38, step: 'Zec', name: '撒迦利亚书', names: ['Zechariah', 'Zech', 'Zec', 'Zc', '撒迦利亚书', '亚', '撒迦利亞書', '亞'] },
  { id: 39, step: 'Mal', name: '玛拉基书', names: ['Malachi', 'Mal', 'Ml', '玛拉基书', '玛', '瑪拉基書', '瑪'] },
  { id: 40, step: 'Mat', name: '马太福音', names: ['Matthew', 'Matt', 'Mt', '马太福音', '太', '馬太福音', 'Mat'] },
  { id: 41, step: 'Mrk', name: '马可福音', names: ['Mark', 'Mk', 'Mrk', '马可福音', '可', '馬可福音'] },
  { id: 42, step: 'Luk', name: '路加福音', names: ['Luke', 'Lk', '路加福音', '路', 'Luk'] },
  { id: 43, step: 'Jhn', name: '约翰福音', names: ['John', 'Jn', 'Jhn', '约翰福音', '约', '約翰福音', '約'] },
  { id: 44, step: 'Act', name: '使徒行传', names: ['Acts', 'Ac', '使徒行传', '徒', '使徒行傳', 'Act'] },
  { id: 45, step: 'Rom', name: '罗马书', names: ['Romans', 'Rom', 'Ro', 'Rm', '罗马书', '罗', '羅馬書', '羅'] },
  { id: 46, step: '1Co', name: '哥林多前书', names: ['1 Corinthians', '1Cor', '1Co', '哥林多前书', '林前', '哥林多前書'] },
  { id: 47, step: '2Co', name: '哥林多后书', names: ['2 Corinthians', '2Cor', '2Co', '哥林多后书', '林后', '哥林多後書', '林後'] },
  { id: 48, step: 'Gal', name: '加拉太书', names: ['Galatians', 'Gal', 'Ga', '加拉太书', '加', '加拉太書'] },
  { id: 49, step: 'Eph', name: '以弗所书', names: ['Ephesians', 'Eph', 'Ep', '以弗所书', '弗', '以弗所書'] },
  { id: 50, step: 'Php', name: '腓立比书', names: ['Philippians', 'Phil', 'Php', 'Pp', '腓立比书', '腓', '腓立比書'] },
  { id: 51, step: 'Col', name: '歌罗西书', names: ['Colossians', 'Col', '歌罗西书', '西', '歌羅西書'] },
  { id: 52, step: '1Th', name: '帖撒罗尼迦前书', names: ['1 Thessalonians', '1Thess', '1Th', '帖撒罗尼迦前书', '帖前', '帖撒羅尼迦前書'] },
  { id: 53, step: '2Th', name: '帖撒罗尼迦后书', names: ['2 Thessalonians', '2Thess', '2Th', '帖撒罗尼迦后书', '帖后', '帖撒羅尼迦後書', '帖後'] },
  { id: 54, step: '1Ti', name: '提摩太前书', names: ['1 Timothy', '1Tim', '提摩太前书', '提前', '提摩太前書', '1Ti'] },
  { id: 55, step: '2Ti', name: '提摩太后书', names: ['2 Timothy', '2Tim', '提摩太后书', '提后', '提摩太後書', '提後', '2Ti'] },
  { id: 56, step: 'Tit', name: '提多书', names: ['Titus', 'Tit', '提多书', '多', '提多書'] },
  { id: 57, step: 'Phm', name: '腓利门书', names: ['Philemon', 'Phlm', 'Phm', '腓利门书', '门', '腓利門書', '門'] },
  { id: 58, step: 'Heb', name: '希伯来书', names: ['Hebrews', 'Heb', 'He', '希伯来书', '来', '希伯來書', '來'] },
  { id: 59, step: 'Jas', name: '雅各书', names: ['James', 'Jas', 'Jm', '雅各书', '雅', '雅各書'] },
  { id: 60, step: '1Pe', name: '彼得前书', names: ['1 Peter', '1Pet', '1Pe', '彼得前书', '彼前', '彼得前書'] },
  { id: 61, step: '2Pe', name: '彼得后书', names: ['2 Peter', '2Pet', '2Pe', '彼得后书', '彼后', '彼得後書', '彼後'] },
  { id: 62, step: '1Jn', name: '约翰一书', names: ['1 John', '1John', '1Jn', '约翰一书', '约一', '約翰一書', '約一'] },
  { id: 63, step: '2Jn', name: '约翰二书', names: ['2 John', '2John', '2Jn', '约翰二书', '约二', '約翰二書', '約二'] },
  { id: 64, step: '3Jn', name: '约翰三书', names: ['3 John', '3John', '3Jn', '约翰三书', '约三', '約翰三書', '約三'] },
  { id: 65, step: 'Jud', name: '犹大书', names: ['Jude', 'Jud', '犹大书', '犹', '猶大書', '猶'] },
  { id: 66, step: 'Rev', name: '启示录', names: ['Revelation', 'Rev', 'Re', 'Rv', '启示录', '启', '啟示錄', '啟'] },
];

const bookByName = new Map<string, BookMeta>();
const bookByStep = new Map<string, BookMeta>();

function normalizeBookName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[.．'’"“”\-–—_:：]/g, '');
}

for (const book of BOOKS) {
  for (const alias of book.names) {
    bookByName.set(normalizeBookName(alias), book);
  }
  bookByStep.set(book.step.toLowerCase(), book);
}

export function toBcv(bookId: number, chapter: number, verse: number): number {
  return bookId * 1_000_000 + chapter * 1_000 + verse;
}

/** 新旧约分界：书卷号 1-39 为旧约，40-66 为新约。 */
export const LAST_OT_BOOK_ID = 39;

export function isOldTestamentBook(bookId: number): boolean {
  return bookId >= 1 && bookId <= LAST_OT_BOOK_ID;
}

export function chapterFromBcv(bcv: number): number {
  return Math.floor((bcv % 1_000_000) / 1_000);
}

export function bookFromBcv(bcv: number): number {
  return Math.floor(bcv / 1_000_000);
}

function matchAliasAtStart(input: string, normalizedAlias: string): number | null {
  let normalized = '';
  for (let index = 0; index < input.length; index += 1) {
    normalized += normalizeBookName(input[index] ?? '');
    if (!normalizedAlias.startsWith(normalized)) {
      return null;
    }
    if (normalized === normalizedAlias) {
      return index + 1;
    }
  }
  return null;
}

function extractBookAndRest(input: string): { book: BookMeta; rest: string } {
  const trimmed = input.trim();
  let best: { book: BookMeta; rest: string; matchedAliasLength: number } | null = null;
  for (const [alias, book] of bookByName.entries()) {
    const matchedLength = matchAliasAtStart(trimmed, alias);
    if (matchedLength == null) {
      continue;
    }
    const rest = trimmed.slice(matchedLength).trim();
    if (!best || alias.length > best.matchedAliasLength) {
      best = { book, rest, matchedAliasLength: alias.length };
    }
  }
  if (!best) {
    throw new Error(`无法识别书卷: ${input}`);
  }
  return { book: best.book, rest: best.rest };
}

type ParsedReference =
  | { kind: 'point'; chapter: number; verse: number }
  | { kind: 'chapter'; chapter: number };

function hasExplicitVerseDelimiter(raw: string): boolean {
  return /[.:：\s]/.test(raw.trim());
}

function parseReference(raw: string, options?: { defaultChapter?: number; preferChapterOnly?: boolean }): ParsedReference {
  const normalized = raw.trim().replace(/：/g, ':').replace(/\s+/g, '.');
  const parts = normalized.split(/[.:]/).filter(Boolean);
  if (parts.length === 1) {
    const value = Number(parts[0]);
    if (options?.defaultChapter != null && !options.preferChapterOnly) {
      return { kind: 'point', chapter: options.defaultChapter, verse: value };
    }
    return { kind: 'chapter', chapter: value };
  }
  if (parts.length !== 2) {
    throw new Error(`无法解析经文位置: ${raw}`);
  }
  return { kind: 'point', chapter: Number(parts[0]), verse: Number(parts[1]) };
}

function referenceToStart(spec: ParsedReference): { chapter: number; verse: number } {
  // 整章从第 0 节起：诗篇标题在英文节号体系里是第 0 节
  return spec.kind === 'chapter' ? { chapter: spec.chapter, verse: 0 } : spec;
}

function referenceToEnd(spec: ParsedReference): { chapter: number; verse: number } {
  return spec.kind === 'chapter' ? { chapter: spec.chapter, verse: 999 } : spec;
}

export function parseScriptureRange(input: string): ScriptureRange {
  const { book, rest } = extractBookAndRest(input);
  const normalizedRest = rest.replace(/：/g, ':').replace(/\s*-\s*/g, '-').trim();
  const [startRaw, endRaw] = normalizedRest.split('-');
  if (!startRaw) {
    throw new Error(`缺少起始经文: ${input}`);
  }
  const startRef = parseReference(startRaw);
  const start = referenceToStart(startRef);
  const endRef = endRaw
    ? parseReference(endRaw, {
        defaultChapter: start.chapter,
        preferChapterOnly: startRef.kind === 'chapter' && !hasExplicitVerseDelimiter(endRaw),
      })
    : startRef;
  const end = referenceToEnd(endRef);
  for (const value of [start.chapter, start.verse, end.chapter, end.verse]) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`经文范围必须是非负整数: ${input}`);
    }
  }
  const range: ScriptureRange = {
    bookId: book.id,
    bookName: book.name,
    isOT: isOldTestamentBook(book.id),
    startBcv: toBcv(book.id, start.chapter, start.verse),
    endBcv: toBcv(book.id, end.chapter, end.verse),
  };
  if (range.startBcv > range.endBcv) {
    throw new Error(`起始经文不能晚于结束经文: ${input}`);
  }
  return range;
}

/** 范围覆盖的章号（含首尾）。 */
export function chaptersOfRange(range: ScriptureRange): number[] {
  const first = chapterFromBcv(range.startBcv);
  const last = chapterFromBcv(range.endBcv);
  const chapters: number[] = [];
  for (let chapter = first; chapter <= last; chapter += 1) {
    chapters.push(chapter);
  }
  return chapters;
}

export function bcvToLabel(bcv: number): string {
  return `${bookById(bookFromBcv(bcv)).name} ${chapterFromBcv(bcv)}:${bcv % 1_000}`;
}

export function bookById(bookId: number): BookMeta {
  const book = BOOKS[bookId - 1];
  if (!book || book.id !== bookId) {
    throw new Error(`未知书卷编号: ${bookId}`);
  }
  return book;
}

export function bookByStepCode(code: string): BookMeta {
  const book = bookByStep.get(code.toLowerCase());
  if (!book) {
    throw new Error(`未知 STEPBible/USFM 书卷代码: ${code}`);
  }
  return book;
}

/** 只有书名（无章节）时查书卷；认不出返回 undefined。 */
export function findBookByName(name: string): BookMeta | undefined {
  return bookByName.get(normalizeBookName(name));
}

export function listBooks(): readonly BookMeta[] {
  return BOOKS;
}

export function buildClauseId(bcv: number, sub: string): string {
  if (!Number.isInteger(bcv) || bcv <= 0 || !/^[a-z]+$/.test(sub)) {
    throw new Error(`无法构造子句 id: ${bcv}:${sub}`);
  }
  return `${bcv}${sub}`;
}

export function parseClauseId(id: string): { bcv: number; sub: string } {
  const match = id.trim().match(/^(\d{7,})([a-z]+)$/);
  if (!match) {
    throw new Error(`子句 id 必须是完整 bcv+sub 格式（如 1001001a）: ${id}`);
  }
  return { bcv: Number(match[1]), sub: match[2] };
}
