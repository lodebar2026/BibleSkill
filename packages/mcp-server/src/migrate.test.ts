import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ClauseText } from '@bs/core';
import { migrateClauseText } from './migrate.js';

function text(value: string, renderings: ClauseText['renderings'], note?: string): ClauseText {
  return {
    bcv: 1001001, sub: 'a', translationSpan: 1, formatted: JSON.stringify([note ? { text: value, note } : { text: value }]), paraTitle: null,
    renderings, alternatives: [], sources: ['ai'], version: 0,
  };
}

test('迁移：括号拆成补词段，at 前移，note 保留', () => {
  const next = migrateClauseText(text('[他]说：[你们]去', [{ tokens: 'o010010010011', zh: '说', at: 3 }, { tokens: 'o010010010021', zh: '去', at: 8 }], '理由'))!;
  assert.deepEqual(JSON.parse(next.formatted), [
    { text: '他', styleName: 'added' }, { text: '说：' }, { text: '你们', styleName: 'added' }, { text: '去', note: '理由' },
  ]);
  assert.deepEqual(next.renderings.map((rendering) => rendering.at), [1, 5]);
});

test('迁移：没有括号的不动，括号不成对的报错', () => {
  assert.equal(migrateClauseText(text('起初神创造', [])), null);
  assert.throws(() => migrateClauseText(text('他[说', [])), /不成对/);
});
