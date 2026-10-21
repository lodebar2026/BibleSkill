import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ClauseText, Token } from '@bs/core';
import { diffHunks, replaceInClause, replaceInSegments } from './revisions.js';

const BCV = 9005008;

function token(word: number, morph: string, strong: string): Token {
  return {
    id: `o09005008${String(word).padStart(3, '0')}1`, ref: `1Sa.5.8#${word}`, bcv: BCV, ord: word - 1,
    surface: `w${word}`, after: ' ', translit: '', lemma: `l${word}`, strong, morph, glossEn: `g${word}`,
    glossZh: null, sense: null, editions: null, textType: 'L', variantNote: null, significant: false, naBracket: false,
  };
}

const tokens = [token(1, 'HVqw3mp', 'H7971'), token(2, 'HNcmpa', 'H5650'), token(3, 'HVqp3ms', 'H5647')];
const id = (word: number) => tokens[word - 1].id;

function clause(segments: Array<{ text: string; note?: string }>, renderings: ClauseText['renderings']): ClauseText {
  return {
    bcv: BCV, sub: 'a', translationSpan: 1, formatted: JSON.stringify(segments), paraTitle: null,
    renderings, alternatives: [], sources: ['ai'], version: 0,
  };
}

test('字符 diff 把相邻增删合成一段', () => {
  assert.deepEqual(diffHunks('他们事奉耶和华', '他们服事耶和华').map(({ from, to }) => [from, to]), [['事奉', '服事']]);
  assert.deepEqual(diffHunks('要赐给你', '要给你。').map(({ from, to }) => [from, to]), [['赐', ''], ['', '。']]);
});

test('跨段替换并入第一段，空段删掉', () => {
  const segments = [{ text: '仆人事' }, { text: '奉' }, { text: '他', note: 'n' }];
  assert.deepEqual(replaceInSegments(segments, 2, 2, '服事'), [{ text: '仆人服事' }, { text: '他', note: 'n' }]);
});

test('按 strong 替换译词，改写译文并重新定位 renderings', () => {
  const text = clause([{ text: '差遣仆人' }, { text: '事奉神，又事奉王' }], [
    { tokens: id(1), zh: '差遣', at: 0 },
    { tokens: id(2), zh: '仆人', at: 2 },
    { tokens: id(3), zh: '事奉', at: 4 },
  ]);
  const result = replaceInClause(text, tokens, { strong: 'H5647', from: '事奉', to: '服事' });
  assert.ok(result && !result.skipped);
  assert.equal(JSON.parse(result.next.formatted).map((segment: { text: string }) => segment.text).join(''), '差遣仆人服事神，又事奉王');
  assert.deepEqual(result.next.renderings.map((rendering) => [rendering.zh, rendering.at]), [['差遣', 0], ['仆人', 2], ['服事', 4]]);
});

test('别的词或别的译法不动；找不到位置的列为 skipped', () => {
  const text = clause([{ text: '仆人' }], [{ tokens: id(2), zh: '仆人' }, { tokens: id(3), zh: '事奉' }]);
  assert.equal(replaceInClause(text, tokens, { strong: 'H5650', from: '臣仆', to: '仆人' }), null);
  assert.match(replaceInClause(text, tokens, { strong: 'H5647', from: '事奉', to: '服事' })!.skipped!, /找不到/);
  assert.equal(replaceInClause(text, tokens, { strong: 'H5647G', from: '事奉', to: '服事' }), null);
});
