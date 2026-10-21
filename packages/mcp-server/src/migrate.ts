/**
 * 旧格式迁移：补词原来以 `[ ]` 字符留在普通段里，改存为 styleName=added 的补词段。
 * 文字内容不变；rendering 的 at 按删掉的括号前移，再用 resolveAlignment 核对。
 */
import {
  clauseNote,
  hasLegacyBrackets,
  markupToSegments,
  parseSegments,
  resolveAlignment,
  segmentsMarkup,
  type ClauseText,
  type WorkFileStore,
} from '@bs/core';
import { listChapterDirs } from './consistency.js';

/** 一条旧译文 → 新分段；不是旧格式返回 null，括号不成对时抛出 Error。 */
export function migrateClauseText(text: ClauseText): ClauseText | null {
  const segments = parseSegments(text.formatted);
  if (!hasLegacyBrackets(segments)) {
    return null;
  }
  const markup = segmentsMarkup(segments);
  const next = markupToSegments(markup, clauseNote(segments));
  const plain = next.map((segment) => segment.text).join('');
  // 旧位置 → 新位置：减去它前面的括号数
  const shift = (at: number) => at - [...markup.slice(0, at)].filter((char) => char === '[' || char === ']').length;
  const renderings = text.renderings.map((rendering) => (rendering.at === undefined ? rendering : { ...rendering, at: shift(rendering.at) }));
  const positions = resolveAlignment(plain, renderings);
  return {
    ...text,
    formatted: JSON.stringify(next),
    renderings: renderings.map(({ at: _, ...rendering }, index) => (positions[index] === null ? rendering : { ...rendering, at: positions[index]! })),
  };
}

export type MigrateResult = { migrated: number; chapters: string[]; failed: Array<{ clause: string; error: string }> };

export async function migrateSegments(store: WorkFileStore, apply: boolean): Promise<MigrateResult> {
  const result: MigrateResult = { migrated: 0, chapters: [], failed: [] };
  for (const { bookName, chapter } of listChapterDirs(store)) {
    const texts = await store.readClauseTexts(bookName, chapter);
    let changed = 0;
    const rows = texts.map((text) => {
      try {
        const next = migrateClauseText(text);
        if (next) {
          changed += 1;
          return next;
        }
      } catch (error) {
        result.failed.push({ clause: `${bookName} ${text.bcv}${text.sub}`, error: (error as Error).message });
      }
      return text;
    });
    if (changed > 0) {
      result.migrated += changed;
      result.chapters.push(`${bookName} ${chapter}`);
      if (apply) {
        await store.rewriteClauseTexts(bookName, chapter, rows);
      }
    }
  }
  return result;
}
