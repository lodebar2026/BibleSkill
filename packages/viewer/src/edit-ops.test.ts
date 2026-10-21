import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ClauseEntity, ClauseText } from '@bs/core';
import {
  changedClauseVerses,
  finalizeClauses,
  mergeTranslationWithNext,
  mergeWithNext,
  setParent,
  setRange,
  setRendering,
  splitClause,
  splitTranslation,
  textRowOfWord,
  toggleBr,
  updateRendering,
} from './edit-ops.js';

const V1 = 1001001;
const V2 = 1001002;
const w = (verse: number, word: number) => `o01001${String(verse).padStart(3, '0')}${String(word).padStart(3, '0')}1`;
const words = [1, 2, 3, 4, 5, 6].map((n) => ({ id: w(1, n) })).concat([1, 2].map((n) => ({ id: w(2, n) })));

function clause(bcv: number, sub: string, first: string, last: string, extra: Partial<ClauseEntity> = {}): ClauseEntity {
  return {
    id: `${bcv}${sub}`, type: 'WayX', parentId: null, modifies: null, firstWordId: first, lastWordId: last,
    verbRange: null, verbPerson: null, verbStem: null, subjectRange: null, br: null, alone: false,
    status: 'accepted', alternatives: [], seedDiff: null, sources: ['ai'], note: '', version: 3, ...extra,
  };
}

// 1:1a = w1-w3（谓词 w1，主语 w2），1:1b = w4-w6（挂在 1a 的 w3 上），1:2a 挂在 1:1b
const chapter = [
  clause(V1, 'a', w(1, 1), w(1, 3), { verbRange: w(1, 1), verbPerson: '3ms', subjectRange: w(1, 2) }),
  clause(V1, 'b', w(1, 4), w(1, 6), { type: 'NmCl', parentId: `${V1}a`, modifies: w(1, 3), br: w(1, 5) }),
  clause(V2, 'a', w(2, 1), w(2, 2), { parentId: `${V1}b`, modifies: w(1, 6) }),
];

test('拆分：范围字段按落点分配，后续子句改名，全章 parentId 跟着改', () => {
  const after = splitClause(chapter, w(1, 3), words);
  assert.deepEqual(after.map((c) => [c.id, c.firstWordId, c.lastWordId]), [
    [`${V1}a`, w(1, 1), w(1, 2)],
    [`${V1}b`, w(1, 3), w(1, 3)],
    [`${V1}c`, w(1, 4), w(1, 6)],
    [`${V2}a`, w(2, 1), w(2, 2)],
  ]);
  assert.equal(after[0].verbRange, w(1, 1));
  assert.equal(after[0].type, 'WayX');
  assert.equal(after[1].type, 'nominal');
  assert.equal(after[1].verbRange, null);
  // 原来挂在 1a 的 w3 上的子句，w3 切到了新句，改挂新句
  assert.equal(after[2].parentId, `${V1}b`);
  assert.equal(after[3].parentId, `${V1}c`);
  assert.throws(() => splitClause(chapter, w(1, 4), words), /首词前不能拆/);
});

test('拆分出谓词的一段沿用句型，另一段变名词句', () => {
  const after = splitClause([clause(V1, 'a', w(1, 1), w(1, 6), { verbRange: w(1, 5), subjectRange: `${w(1, 2)}-${w(1, 4)}`, br: `${w(1, 2)},${w(1, 5)}` })], w(1, 4), words);
  assert.equal(after[0].type, 'nominal');
  assert.equal(after[0].subjectRange, `${w(1, 2)}-${w(1, 3)}`);
  assert.equal(after[0].br, w(1, 2));
  assert.equal(after[1].type, 'WayX');
  assert.equal(after[1].verbRange, w(1, 5));
  assert.equal(after[1].br, w(1, 5));
});

test('合并：后句的子句改挂合并句，后面的子句改名', () => {
  const after = mergeWithNext(chapter, `${V1}a`);
  assert.equal(after.length, 2);
  assert.deepEqual([after[0].id, after[0].lastWordId, after[0].br], [`${V1}a`, w(1, 6), w(1, 5)]);
  assert.equal(after[1].parentId, `${V1}a`);
  assert.throws(() => mergeWithNext(chapter, `${V1}b`), /没有下一句/);
});

test('挂接、换行、主语谓词范围', () => {
  assert.equal(setParent(chapter, `${V1}b`, null, w(1, 3))[1].modifies, null);
  assert.throws(() => setParent(chapter, `${V1}a`, `${V1}a`, null), /自己/);
  assert.equal(toggleBr(chapter, w(1, 5))[1].br, null);
  assert.equal(toggleBr(chapter, w(1, 4))[1].br, `${w(1, 4)},${w(1, 5)}`);
  assert.equal(setRange(chapter, `${V1}a`, 'subjectRange', w(1, 3), w(1, 2))[0].subjectRange, `${w(1, 2)}-${w(1, 3)}`);
  assert.equal(setRange(chapter, `${V1}a`, 'verbRange', null)[0].verbRange, null);
});

test('变化的节与 human 标记', () => {
  const after = setParent(chapter, `${V2}a`, null, null);
  const { entities, verses } = finalizeClauses(chapter, after);
  assert.deepEqual(verses, [V2]);
  assert.deepEqual(entities[2].sources, ['ai', 'human']);
  assert.deepEqual(entities[0].sources, ['ai']);
  // 撤销回原样：只差 sources / version 不算变化
  assert.deepEqual(changedClauseVerses(entities, chapter), [V2]);
  assert.deepEqual(changedClauseVerses(chapter.map((c) => ({ ...c, version: 9, sources: [] })), chapter), []);
});

function text(sub: string, value: string, extra: Partial<ClauseText> = {}): ClauseText {
  return {
    bcv: V1, sub, translationSpan: 1, formatted: JSON.stringify([{ text: value }]), paraTitle: null,
    renderings: [], alternatives: [], sources: ['ai'], version: 1, ...extra,
  };
}

test('译文合并与拆开', () => {
  const texts = [
    text('a', '起初神创造', { renderings: [{ tokens: w(1, 1), zh: '创造', at: 3 }] }),
    text('b', '天地', { renderings: [{ tokens: w(1, 5), zh: '天', at: 0 }], formatted: JSON.stringify([{ text: '天地', note: '理由' }]) }),
  ];
  const merged = mergeTranslationWithNext(texts, `${V1}a`);
  assert.equal(merged[0].translationSpan, 2);
  assert.equal(merged[0].formatted, JSON.stringify([{ text: '起初神创造天地', note: '理由' }]));
  // 后一行的位置挪到合并后的译文里
  assert.deepEqual(merged[0].renderings.map((rendering) => rendering.at), [3, 5]);
  assert.deepEqual([merged[1].translationSpan, merged[1].formatted, merged[1].renderings], [0, '[]', []]);
  assert.throws(() => mergeTranslationWithNext(merged, `${V1}a`), /没有下一行/);

  const split = splitTranslation(merged, chapter, `${V1}a`, '起初神创造', '天地');
  assert.equal(split[0].translationSpan, 1);
  assert.deepEqual(split[0].renderings, [{ tokens: w(1, 1), zh: '创造' }]);
  assert.equal(split[1].translationSpan, 1);
  assert.equal(split[1].formatted, JSON.stringify([{ text: '天地' }]));
  assert.deepEqual(split[1].renderings, [{ tokens: w(1, 5), zh: '天' }]);
  assert.throws(() => splitTranslation(texts, chapter, `${V1}a`, '', ''), /没有可拆/);
});

test('词级对齐：找译文行、设定 / 修改 / 删除对照', () => {
  const texts = [
    text('a', '起初神创造天地', { translationSpan: 2, renderings: [{ tokens: w(1, 1), zh: '创造', at: 3 }, { tokens: w(1, 5), zh: '天', note: '理由' }] }),
    text('b', '', { translationSpan: 0, formatted: '[]' }),
  ];
  assert.equal(textRowOfWord(texts, chapter, w(1, 5)), `${V1}a`);
  assert.equal(textRowOfWord(texts, chapter, w(2, 1)), null);

  // 同一词范围：换位置、保留 note；重叠的区间整条被替换；按词序排
  const moved = setRendering(texts, `${V1}a`, { tokens: w(1, 5), zh: '天地', at: 5 });
  assert.deepEqual(moved[0].renderings[1], { tokens: w(1, 5), zh: '天地', at: 5, note: '理由' });
  assert.deepEqual(moved[0].sources, ['ai', 'human']);
  const phrase = setRendering(moved, `${V1}a`, { tokens: `${w(1, 4)}-${w(1, 6)}`, zh: '天地', at: 5 });
  assert.deepEqual(phrase[0].renderings.map((rendering) => rendering.tokens), [w(1, 1), `${w(1, 4)}-${w(1, 6)}`]);
  assert.throws(() => setRendering(texts, `${V1}b`, { tokens: w(1, 5), zh: '天' }), /没有自己的译文行/);

  const untranslated = updateRendering(texts, `${V1}a`, w(1, 1), { zh: '∅', note: '与前词合译' });
  assert.deepEqual(untranslated[0].renderings[0], { tokens: w(1, 1), zh: '∅', note: '与前词合译' });
  const cleared = updateRendering(texts, `${V1}a`, w(1, 5), { note: '' });
  assert.deepEqual(cleared[0].renderings[1], { tokens: w(1, 5), zh: '天' });
  assert.equal(updateRendering(texts, `${V1}a`, w(1, 5), null)[0].renderings.length, 1);
});
