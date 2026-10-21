import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ClauseEntity, ClauseText, GlossaryEntry, Token } from '@bs/core';
import { reviewChapter, verseRanges } from './review.js';

const BCV = 1001001;

function token(word: number, morph: string, strong: string): Token {
  return {
    id: `o01001001${String(word).padStart(3, '0')}1`, ref: `Gen.1.1#${word}`, bcv: BCV, ord: word - 1,
    surface: `w${word}`, after: ' ', translit: '', lemma: `l${word}`, strong, morph, glossEn: `g${word}`,
    glossZh: null, sense: null, editions: null, textType: 'L', variantNote: null, significant: false, naBracket: false,
  };
}

// 介词、动词、名词、名词
const tokens = [token(1, 'HR', 'H9003'), token(2, 'HVqp3ms', 'H1254A'), token(3, 'HNcmpa', 'H0430G'), token(4, 'HNcfsa', 'H0776G')];
const id = (word: number) => tokens[word - 1].id;

function entity(sub: string, first: number, last: number, extra: Partial<ClauseEntity> = {}): ClauseEntity {
  return {
    id: `${BCV}${sub}`, type: 'QtlX', parentId: null, modifies: null, firstWordId: id(first), lastWordId: id(last),
    verbRange: null, verbPerson: null, verbStem: null, subjectRange: null, br: null, alone: false,
    status: 'accepted', alternatives: [], seedDiff: null, sources: [], note: '', version: 0, ...extra,
  };
}

function text(sub: string, value: string, renderings: ClauseText['renderings'], extra: Partial<ClauseText> = {}): ClauseText {
  return {
    bcv: BCV, sub, translationSpan: 1, formatted: JSON.stringify([{ text: value }]), paraTitle: null,
    renderings, alternatives: [], sources: ['ai'], version: 0, ...extra,
  };
}

const twoClauses = [entity('a', 1, 2), entity('b', 3, 4)];
const cleanTexts = [
  text('a', '创造', [{ tokens: id(2), zh: '创造' }]),
  text('b', '神大地', [{ tokens: id(3), zh: '神' }, { tokens: id(4), zh: '大地' }]),
];

function review(entities: ClauseEntity[], texts: ClauseText[], glossary: GlossaryEntry[] = []) {
  return reviewChapter({ bookName: '创世记', entities, texts, tokensByVerse: new Map([[BCV, tokens]]), variants: [], glossary });
}

test('与当前分析、术语表一致时没有问题', () => {
  const result = review(twoClauses, cleanTexts);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.humanReview, []);
  assert.deepEqual(result.untranslated, []);
});

test('术语表后来锁定了别的译法 → glossary', () => {
  const glossary: GlossaryEntry[] = [{ strong: 'H0430G', senseKey: null, lemma: '', zh: '上帝', level: 'locked', note: '', scope: 'all', version: 0 }];
  const result = review(twoClauses, cleanTexts, glossary);
  assert.deepEqual(result.issues.map((issue) => issue.kind), ['glossary']);
  assert.match(result.issues[0].message, /锁定译为「上帝」/);
});

test('子句重新切分后译文对不上 → structure', () => {
  const result = review([entity('a', 1, 4)], cleanTexts);
  assert.ok(result.issues.length > 0);
  assert.ok(result.issues.every((issue) => issue.kind === 'structure'));
});

test('有译文但没有子句分析 → structure；有分析没译文 → untranslated', () => {
  assert.match(review([], cleanTexts).issues[0].message, /没有子句分析/);
  assert.deepEqual(review(twoClauses, []).untranslated, [BCV]);
});

test('子句后来改成 ambiguous、译文没给 alternatives → dispute，并列入人工复核', () => {
  const ambiguous = [entity('a', 1, 2, { status: 'ambiguous', alternatives: [{ summary: '另一断句' }] }), entity('b', 3, 4)];
  const result = review(ambiguous, cleanTexts);
  assert.ok(result.issues.length > 0);
  assert.ok(result.issues.every((issue) => issue.kind === 'dispute'));
  assert.deepEqual(result.humanReview, [{ clauseId: '1001001a', status: 'ambiguous', detail: '另一断句' }]);
});

test('needs-review 子句列入人工复核；已处理的争议不报', () => {
  const entities = [entity('a', 1, 2, { status: 'needs-review', seedDiff: 'Macula 主语有误' }), entity('b', 3, 4)];
  assert.deepEqual(review(entities, cleanTexts).humanReview, [{ clauseId: '1001001a', status: 'needs-review', detail: 'Macula 主语有误' }]);
  const ambiguous = [entity('a', 1, 2, { status: 'ambiguous', alternatives: [{ summary: '另一断句' }] }), entity('b', 3, 4)];
  const handled = [
    text('a', '创造', [{ tokens: id(2), zh: '创造' }], {
      formatted: JSON.stringify([{ text: '创造', note: '取 a 读法' }]),
      alternatives: [{ text: '造', kind: 'punctuation', basis: '另一断句传统' }],
    }),
    cleanTexts[1],
  ];
  assert.deepEqual(review(ambiguous, handled).issues, []);
});

test('verseRanges 合并连续节', () => {
  assert.deepEqual(verseRanges('创世记', [1001003, 1001001, 1001002, 1001005, 1002001, 1001002]), ['创世记 1:1-3', '创世记 1:5', '创世记 2:1']);
  assert.deepEqual(verseRanges('创世记', []), []);
});
