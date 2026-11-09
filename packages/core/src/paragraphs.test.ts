import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paraTitleText, paragraphStarts } from './paragraphs.js';

// 徒 8:1：8:1a 结束上一段，8:1b（Ἐγένετο）起新段、带小标题；8:1c 嵌在 8:1b 里
const clauses = [
  { id: '44008001a', firstWordId: 'n44008001001', lastWordId: 'n44008001007' },
  { id: '44008001b', firstWordId: 'n44008001008', lastWordId: 'n44008001030' },
  { id: '44008001c', firstWordId: 'n44008001020', lastWordId: 'n44008001025' },
  { id: '44008002a', firstWordId: 'n44008002001', lastWordId: 'n44008002010' },
];

test('段首落到以段首词开头的子句；节首、节中都行', () => {
  const starts = paragraphStarts(clauses, [
    { tokenId: 'n44008001001', bcv: 44008001, heading: null },
    { tokenId: 'n44008001008', bcv: 44008001, heading: 'Saul Persecutes the Church' },
  ]);
  assert.deepEqual([...starts], [
    ['44008001a', { heading: null, tokenId: 'n44008001001', exact: true }],
    ['44008001b', { heading: 'Saul Persecutes the Church', tokenId: 'n44008001008', exact: true }],
  ]);
});

test('段首词落在子句中间：退到其后第一个子句，标 exact: false；范围外的不管', () => {
  const starts = paragraphStarts(clauses, [
    { tokenId: 'n44008001005', bcv: 44008001, heading: 'Mid' },
    { tokenId: 'n44009001001', bcv: 44009001, heading: 'Outside' },
  ]);
  assert.deepEqual([...starts], [['44008001b', { heading: 'Mid', tokenId: 'n44008001005', exact: false }]]);
});

test('paraTitleText：null 非段首，"[]" 段首无标题', () => {
  assert.equal(paraTitleText(null), undefined);
  assert.equal(paraTitleText('[]'), null);
  assert.equal(paraTitleText(JSON.stringify([{ text: '扫罗迫害教会' }])), '扫罗迫害教会');
});
