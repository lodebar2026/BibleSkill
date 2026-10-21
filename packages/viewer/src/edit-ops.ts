/**
 * 缩进视图的编辑操作：对一章的子句 / 译文做纯变换，不读写文件。浏览器端与单测共用。
 *
 * 只从 @bs/core 引类型：core 的运行时代码依赖 node:sqlite，不能打进浏览器包。
 * 拆分 / 合并后按词序把本节子句重排为 a、b、c…，并按改名表重写全章的 parentId。
 */
import type { ClauseEntity, ClauseText, Rendering, TranslationSegment } from '@bs/core';

type Word = { id: string };

export function verseOf(clauseId: string): number {
  return Number(clauseId.match(/^(\d{7,})[a-z~]+$/)![1]);
}

function letterOf(index: number): string {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(97 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function rangeStart(range: string): string {
  return range.split('-')[0];
}

function rangeEnd(range: string): string {
  return range.split('-')[1] ?? range;
}

function makeRange(first: string, last: string): string {
  return first === last ? first : `${first}-${last}`;
}

function byWordOrder(a: ClauseEntity, b: ClauseEntity): number {
  return a.firstWordId < b.firstWordId ? -1 : a.firstWordId > b.firstWordId ? 1 : 0;
}

/** 范围字段分到 [first, last] 这一段：起点落在段内就保留（末端截到段尾），否则为 null。 */
function clipRange(range: string | null, first: string, last: string): string | null {
  if (!range) {
    return null;
  }
  const start = rangeStart(range);
  if (start < first || start > last) {
    return null;
  }
  const end = rangeEnd(range);
  return makeRange(start, end > last ? last : end);
}

function clipBr(br: string | null, first: string, last: string): string | null {
  const ids = (br ?? '').split(',').map((id) => id.trim()).filter((id) => id && id >= first && id <= last);
  return ids.length > 0 ? ids.join(',') : null;
}

/** 本节子句按词序重新编号，全章 parentId / alternatives[].parentId 按改名表重写。 */
function renumberVerse(entities: ClauseEntity[], bcv: number): ClauseEntity[] {
  const renamed = new Map<string, string>();
  entities.filter((clause) => verseOf(clause.id) === bcv).sort(byWordOrder).forEach((clause, index) => {
    renamed.set(clause.id, `${bcv}${letterOf(index)}`);
  });
  const rename = (id: string | null | undefined) => (id ? renamed.get(id) ?? id : id);
  return entities.map((clause) => ({
    ...clause,
    id: rename(clause.id)!,
    parentId: rename(clause.parentId) ?? null,
    alternatives: clause.alternatives.map((alt) => (alt.parentId ? { ...alt, parentId: rename(alt.parentId) } : alt)),
  }));
}

function sortClauses(entities: ClauseEntity[]): ClauseEntity[] {
  return [...entities].sort((a, b) => (verseOf(a.id) - verseOf(b.id)) || byWordOrder(a, b));
}

/** 在 wordId 前把所在子句切成两句。后一句作为前一句的兄弟句（沿用 parentId / modifies）。 */
export function splitClause(entities: ClauseEntity[], wordId: string, words: Word[]): ClauseEntity[] {
  const clause = entities.find((item) => item.firstWordId < wordId && wordId <= item.lastWordId);
  if (!clause) {
    throw new Error('要在子句中间的词上拆分（子句的首词前不能拆）');
  }
  const index = words.findIndex((word) => word.id === wordId);
  const previous = words[index - 1].id;
  const tempId = `${verseOf(clause.id)}~`;
  const verbInLeft = clause.verbRange !== null && rangeStart(clause.verbRange) < wordId;
  const verbInRight = clause.verbRange !== null && !verbInLeft;
  const left: ClauseEntity = {
    ...clause,
    lastWordId: previous,
    type: verbInRight ? 'nominal' : clause.type,
    verbRange: clipRange(clause.verbRange, clause.firstWordId, previous),
    subjectRange: clipRange(clause.subjectRange, clause.firstWordId, previous),
    br: clipBr(clause.br, clause.firstWordId, previous),
  };
  const right: ClauseEntity = {
    ...clause,
    id: tempId,
    firstWordId: wordId,
    type: verbInLeft ? 'nominal' : clause.type,
    verbRange: clipRange(clause.verbRange, wordId, clause.lastWordId),
    subjectRange: clipRange(clause.subjectRange, wordId, clause.lastWordId),
    br: clipBr(clause.br, wordId, clause.lastWordId),
    alternatives: [],
    seedDiff: null,
    note: '',
    version: 0,
  };
  if (!verbInLeft) {
    left.verbPerson = null;
    left.verbStem = null;
  }
  if (!verbInRight) {
    right.verbPerson = null;
    right.verbStem = null;
  }
  const next = entities.flatMap((item) => {
    if (item === clause) {
      return [left, right];
    }
    // 挂在被切走那段词上的子句改挂后一句
    if (item.parentId === clause.id && item.modifies !== null && item.modifies >= wordId) {
      return [{ ...item, parentId: tempId }];
    }
    return [item];
  });
  return sortClauses(renumberVerse(next, verseOf(clause.id)));
}

/** 与同节的下一句合并。 */
export function mergeWithNext(entities: ClauseEntity[], clauseId: string): ClauseEntity[] {
  const bcv = verseOf(clauseId);
  const verse = entities.filter((item) => verseOf(item.id) === bcv).sort(byWordOrder);
  const index = verse.findIndex((item) => item.id === clauseId);
  const first = verse[index];
  const second = verse[index + 1];
  if (!first || !second) {
    throw new Error('本节没有下一句可合并');
  }
  const brIds = [first.br, second.br].filter(Boolean).join(',');
  const merged: ClauseEntity = {
    ...first,
    lastWordId: second.lastWordId,
    type: first.verbRange || !second.verbRange ? first.type : second.type,
    verbRange: first.verbRange ?? second.verbRange,
    verbPerson: first.verbRange ? first.verbPerson : second.verbPerson,
    verbStem: first.verbRange ? first.verbStem : second.verbStem,
    subjectRange: first.subjectRange ?? second.subjectRange,
    br: brIds || null,
    note: [first.note, second.note].filter(Boolean).join('；'),
  };
  // 前句原本挂在后句上：合并后改挂后句的父句，避免自指
  if (first.parentId === second.id) {
    merged.parentId = second.parentId;
    merged.modifies = second.modifies;
  }
  const next = entities.flatMap((item) => {
    if (item === first) {
      return [merged];
    }
    if (item === second) {
      return [];
    }
    return item.parentId === second.id ? [{ ...item, parentId: first.id }] : [item];
  });
  return sortClauses(renumberVerse(next, bcv));
}

function patchClause(entities: ClauseEntity[], clauseId: string, patch: Partial<ClauseEntity>): ClauseEntity[] {
  if (!entities.some((item) => item.id === clauseId)) {
    throw new Error(`找不到子句 ${clauseId}`);
  }
  return entities.map((item) => (item.id === clauseId ? { ...item, ...patch } : item));
}

/** 改挂接：parentId 为 null 时 modifies 也清空。 */
export function setParent(entities: ClauseEntity[], clauseId: string, parentId: string | null, modifies: string | null): ClauseEntity[] {
  if (parentId === clauseId) {
    throw new Error('子句不能挂在自己身上');
  }
  return patchClause(entities, clauseId, { parentId, modifies: parentId === null ? null : modifies });
}

/** 在 wordId 之后换行 / 取消换行。 */
export function toggleBr(entities: ClauseEntity[], wordId: string): ClauseEntity[] {
  const clause = entities.find((item) => item.firstWordId <= wordId && wordId <= item.lastWordId);
  if (!clause) {
    throw new Error('这个词不在任何子句里');
  }
  const ids = (clause.br ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  const next = ids.includes(wordId) ? ids.filter((id) => id !== wordId) : [...ids, wordId].sort();
  return patchClause(entities, clause.id, { br: next.length > 0 ? next.join(',') : null });
}

/** 设定主语 / 谓词范围；first 为 null 时清除。 */
export function setRange(
  entities: ClauseEntity[],
  clauseId: string,
  field: 'subjectRange' | 'verbRange',
  first: string | null,
  last: string | null = first,
): ClauseEntity[] {
  if (first === null) {
    return patchClause(entities, clauseId, { [field]: null });
  }
  const [start, end] = first <= last! ? [first, last!] : [last!, first];
  return patchClause(entities, clauseId, { [field]: makeRange(start, end) });
}

export type ClauseFields = Partial<Pick<ClauseEntity, 'type' | 'status' | 'note' | 'seedDiff'>>;

export function setFields(entities: ClauseEntity[], clauseId: string, fields: ClauseFields): ClauseEntity[] {
  return patchClause(entities, clauseId, fields);
}

function withoutVersion<T extends { version: number; sources: string[] }>(item: T): string {
  const { version: _version, sources: _sources, ...rest } = item;
  return JSON.stringify(rest);
}

function changedVerses<T extends { version: number; sources: string[] }>(before: T[], after: T[], keyOf: (item: T) => string, bcvOf: (item: T) => number): number[] {
  const previous = new Map(before.map((item) => [keyOf(item), item]));
  const verses = new Set<number>();
  for (const item of after) {
    const old = previous.get(keyOf(item));
    if (!old || withoutVersion(old) !== withoutVersion(item)) {
      verses.add(bcvOf(item));
    }
  }
  const remaining = new Set(after.map(keyOf));
  before.filter((item) => !remaining.has(keyOf(item))).forEach((item) => verses.add(bcvOf(item)));
  return [...verses].sort((a, b) => a - b);
}

/** 内容（不计 version / sources）有变化的节。 */
export function changedClauseVerses(before: ClauseEntity[], after: ClauseEntity[]): number[] {
  return changedVerses(before, after, (item) => item.id, (item) => verseOf(item.id));
}

export function changedTextVerses(before: ClauseText[], after: ClauseText[]): number[] {
  return changedVerses(before, after, (item) => `${item.bcv}${item.sub}`, (item) => item.bcv);
}

/**
 * 比较编辑前后，返回内容有变化的节；变化的子句 sources 追加 human（人工复核的标记）。
 */
export function finalizeClauses(before: ClauseEntity[], after: ClauseEntity[]): { entities: ClauseEntity[]; verses: number[] } {
  const previous = new Map(before.map((item) => [item.id, item]));
  const entities = after.map((item) => {
    const old = previous.get(item.id);
    if ((old && withoutVersion(old) === withoutVersion(item)) || item.sources.includes('human')) {
      return item;
    }
    return { ...item, sources: [...item.sources, 'human'] };
  });
  return { entities, verses: changedClauseVerses(before, entities) };
}

// ---------------------------------------------------------------- 译文 translationSpan

function segmentsOf(formatted: string): TranslationSegment[] {
  return JSON.parse(formatted) as TranslationSegment[];
}

function textOf(formatted: string): string {
  return segmentsOf(formatted).map((segment) => segment.text).join('');
}

function noteOf(formatted: string): string {
  return segmentsOf(formatted).map((segment) => segment.note ?? '').filter(Boolean).join('；');
}

function formattedOf(text: string, note: string): string {
  return JSON.stringify([note ? { text, note } : { text }]);
}

function verseTexts(texts: ClauseText[], bcv: number): ClauseText[] {
  return texts.filter((item) => item.bcv === bcv).sort((a, b) => a.sub.localeCompare(b.sub));
}

function replaceTexts(texts: ClauseText[], bcv: number, rows: ClauseText[]): ClauseText[] {
  return [...texts.filter((item) => item.bcv !== bcv), ...rows].sort((a, b) => (a.bcv - b.bcv) || a.sub.localeCompare(b.sub));
}

function shiftAt(rendering: Rendering, offset: number): Rendering {
  return rendering.at === undefined ? rendering : { ...rendering, at: rendering.at + offset };
}

/** 拆开时译文是人工重填的，旧位置作废，交给服务端重新定位。 */
function withoutAt({ at: _, ...rendering }: Rendering): Rendering {
  return rendering;
}

/** 把下一行译文并入本行：文字直接相接，对照 / 其他译法合并，note 用「；」相连。 */
export function mergeTranslationWithNext(texts: ClauseText[], key: string): ClauseText[] {
  const bcv = verseOf(key);
  const rows = verseTexts(texts, bcv);
  const index = rows.findIndex((item) => `${item.bcv}${item.sub}` === key);
  const head = rows[index];
  if (!head || head.translationSpan === 0) {
    throw new Error('只能从一行译文的首句合并');
  }
  const nextIndex = index + head.translationSpan;
  const next = rows[nextIndex];
  if (!next || next.translationSpan === 0) {
    throw new Error('本节没有下一行译文可合并');
  }
  const merged: ClauseText = {
    ...head,
    translationSpan: head.translationSpan + next.translationSpan,
    formatted: formattedOf(textOf(head.formatted) + textOf(next.formatted), [noteOf(head.formatted), noteOf(next.formatted)].filter(Boolean).join('；')),
    renderings: [...head.renderings, ...next.renderings.map((rendering) => shiftAt(rendering, textOf(head.formatted).length))],
    alternatives: [...head.alternatives, ...next.alternatives],
    sources: [...new Set([...head.sources, ...next.sources, 'human'])],
  };
  const folded = rows.map((item, i) => {
    if (i === index) {
      return merged;
    }
    if (i >= nextIndex && i < nextIndex + next.translationSpan) {
      return { ...item, translationSpan: 0, formatted: '[]', renderings: [], alternatives: [], sources: [...new Set([...item.sources, 'human'])] };
    }
    return item;
  });
  return replaceTexts(texts, bcv, folded);
}

/**
 * 把合并行的最后一句拆出来单独成行：kept 留给前面几句，detached 给拆出的那句；
 * 落在拆出子句里的对照随之移过去，其他译法与 note 留在首句。
 */
export function splitTranslation(texts: ClauseText[], entities: ClauseEntity[], key: string, kept: string, detached: string): ClauseText[] {
  const bcv = verseOf(key);
  const rows = verseTexts(texts, bcv);
  const index = rows.findIndex((item) => `${item.bcv}${item.sub}` === key);
  const head = rows[index];
  if (!head || head.translationSpan < 2) {
    throw new Error('这一行只覆盖一个子句，没有可拆的');
  }
  const lastIndex = index + head.translationSpan - 1;
  const last = rows[lastIndex];
  const lastClause = entities.find((item) => item.id === `${last.bcv}${last.sub}`);
  if (!lastClause) {
    throw new Error(`子句 ${last.bcv}${last.sub} 已不在子句分析里，先重译本节`);
  }
  const moves = (tokens: string) => rangeStart(tokens) >= lastClause.firstWordId;
  const sources = [...new Set([...head.sources, 'human'])];
  const split = rows.map((item, i) => {
    if (i === index) {
      return {
        ...head,
        translationSpan: head.translationSpan - 1,
        formatted: formattedOf(kept.trim(), noteOf(head.formatted)),
        renderings: head.renderings.filter((rendering) => !moves(rendering.tokens)).map(withoutAt),
        sources,
      };
    }
    if (i === lastIndex) {
      return {
        ...item,
        translationSpan: 1,
        formatted: formattedOf(detached.trim(), ''),
        renderings: head.renderings.filter((rendering) => moves(rendering.tokens)).map(withoutAt),
        alternatives: [],
        sources,
      };
    }
    return item;
  });
  return replaceTexts(texts, bcv, split);
}

// ---------------------------------------------------------------- 词级对齐

/** 词所在子句的译文行（合并时是首句）的 key；该节还没有译文为 null。 */
export function textRowOfWord(texts: ClauseText[], entities: ClauseEntity[], wordId: string): string | null {
  const clause = entities.find((item) => item.firstWordId <= wordId && wordId <= item.lastWordId);
  if (!clause) {
    return null;
  }
  const rows = verseTexts(texts, verseOf(clause.id));
  const index = rows.findIndex((item) => `${item.bcv}${item.sub}` === clause.id);
  for (let i = index; i >= 0; i -= 1) {
    if (rows[i].translationSpan > 0) {
      return i + rows[i].translationSpan > index ? `${rows[i].bcv}${rows[i].sub}` : null;
    }
  }
  return null;
}

function overlaps(a: string, b: string): boolean {
  return rangeStart(a) <= rangeEnd(b) && rangeStart(b) <= rangeEnd(a);
}

function updateRow(texts: ClauseText[], key: string, update: (row: ClauseText) => Rendering[]): ClauseText[] {
  const row = texts.find((item) => `${item.bcv}${item.sub}` === key);
  if (!row || row.translationSpan === 0) {
    throw new Error('这一句还没有自己的译文行');
  }
  return texts.map((item) => (item === row
    ? { ...item, renderings: update(item), sources: [...new Set([...item.sources, 'human'])] }
    : item));
}

/** 设定一条对齐：与它词范围重叠的旧对照被替换（词范围完全相同时保留旧 note），按词序插入。 */
export function setRendering(texts: ClauseText[], key: string, rendering: Rendering): ClauseText[] {
  return updateRow(texts, key, (row) => {
    const same = row.renderings.find((item) => item.tokens === rendering.tokens);
    const next = same?.note && rendering.note === undefined ? { ...rendering, note: same.note } : rendering;
    return [...row.renderings.filter((item) => !overlaps(item.tokens, rendering.tokens)), next]
      .sort((a, b) => rangeStart(a.tokens).localeCompare(rangeStart(b.tokens)));
  });
}

/** 改一条对照的 note / zh（设为 ∅ 时去掉位置）；patch 为 null 删除这条。 */
export function updateRendering(texts: ClauseText[], key: string, tokens: string, patch: Partial<Pick<Rendering, 'zh' | 'note'>> | null): ClauseText[] {
  return updateRow(texts, key, (row) => {
    if (!row.renderings.some((item) => item.tokens === tokens)) {
      throw new Error(`没有 ${tokens} 的对照`);
    }
    if (patch === null) {
      return row.renderings.filter((item) => item.tokens !== tokens);
    }
    return row.renderings.map((item) => {
      if (item.tokens !== tokens) {
        return item;
      }
      const next: Rendering = { ...item, ...patch };
      if (!next.note) {
        delete next.note;
      }
      return patch.zh !== undefined && patch.zh !== item.zh ? withoutAt(next) : next;
    });
  });
}
