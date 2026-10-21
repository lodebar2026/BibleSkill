/**
 * 缩进视图所需的章节数据：子句、译文、范围内的词。MCP 的 view_clauses 与 viewer 共用。
 */
import { chapterFromBcv, toBcv, type ScriptureRange } from './ref.js';
import { parseClauseId } from './ref.js';
import type { BibleDb } from './db.js';
import type { ClauseEntity, ClauseText } from './schemas.js';
import type { WorkFileStore } from './store.js';

export type ViewWord = { id: string; text: string; after: string; gloss: string; zh: string | null; morph: string; naBracket: boolean };

export type ChapterView = {
  bookName: string;
  chapter: number;
  isOT: boolean;
  clauses: ClauseEntity[];
  texts: ClauseText[];
  words: ViewWord[];
};

export async function loadChapterViews(db: BibleDb, store: WorkFileStore, range: ScriptureRange): Promise<ChapterView[]> {
  const views: ChapterView[] = [];
  for (let chapter = chapterFromBcv(range.startBcv); chapter <= chapterFromBcv(range.endBcv); chapter += 1) {
    const startBcv = Math.max(toBcv(range.bookId, chapter, 0), range.startBcv);
    const endBcv = Math.min(toBcv(range.bookId, chapter, 999), range.endBcv);
    const inRange = (bcv: number) => bcv >= startBcv && bcv <= endBcv;
    const clauses = (await store.readClauseEntities(range.bookName, chapter)).filter((clause) => inRange(parseClauseId(clause.id).bcv));
    const texts = (await store.readClauseTexts(range.bookName, chapter)).filter((text) => inRange(text.bcv));
    const words = db.tokensInRange(startBcv, endBcv).map((token) => ({
      id: token.id,
      text: token.surface,
      after: token.after,
      gloss: token.glossEn,
      zh: token.glossZh,
      morph: token.morph,
      naBracket: token.naBracket,
    }));
    views.push({ bookName: range.bookName, chapter, isOT: range.isOT, clauses, texts, words });
  }
  return views;
}
