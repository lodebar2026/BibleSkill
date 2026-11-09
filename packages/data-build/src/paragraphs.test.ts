import assert from 'node:assert/strict';
import { test } from 'node:test';
import { letterCount, locateParagraphs } from './paragraphs.js';

const tokens = [
  { id: 'n44008001001', bcv: 44008001, maculaBcv: 44008001, surface: 'Σαῦλος' },
  { id: 'n44008001002', bcv: 44008001, maculaBcv: 44008001, surface: 'δὲ' },
  { id: 'n44008001003', bcv: 44008001, maculaBcv: 44008001, surface: 'Ἐγένετο' },
  { id: 'n44008002001', bcv: 44008002, maculaBcv: 44008002, surface: 'συνεκόμισαν' },
  // 英文节号与原文节号不同的词：按原文节号（maculaBcv）定位
  { id: 'n44008003001', bcv: 44008003, maculaBcv: 44008004, surface: 'οἱ' },
];

test('letterCount 不计重音、标点、空格', () => {
  assert.equal(letterCount('Σαῦλος δὲ,'), 8);
});

test('按节内字母数落到词上：节首、节中、节末、原文节号', () => {
  const report: string[] = [];
  const rows = locateParagraphs(tokens, [
    { book: 44, chapter: 8, verse: 1, letters: 0 },
    { book: 44, chapter: 8, verse: 1, letters: 8, heading: 'Saul Persecutes the Church' },
    { book: 44, chapter: 8, verse: 2, letters: 11, heading: 'At End' },
    { book: 44, chapter: 8, verse: 4, letters: 0 },
  ], (kind, ref, detail) => report.push(`${kind} ${ref} ${detail}`));
  assert.deepEqual(rows, [
    { tokenId: 'n44008001001', bcv: 44008001, heading: null },
    { tokenId: 'n44008001003', bcv: 44008001, heading: 'Saul Persecutes the Church' },
    { tokenId: 'n44008003001', bcv: 44008003, heading: 'At End' },
  ]);
  assert.deepEqual(report, []);
});

test('落在词中间、超出本节、没有这一节：记 report 跳过', () => {
  const report: string[] = [];
  const rows = locateParagraphs(tokens, [
    { book: 44, chapter: 8, verse: 1, letters: 3 },
    { book: 44, chapter: 8, verse: 1, letters: 99 },
    { book: 44, chapter: 9, verse: 1, letters: 0 },
  ], (kind, ref, detail) => report.push(`${kind} ${ref} ${detail}`));
  assert.deepEqual(rows, []);
  assert.equal(report.length, 3);
});
