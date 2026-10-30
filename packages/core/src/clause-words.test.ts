import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clauseOfWord, clauseWords, containerOf, embedSlots } from './clause-words.js';

const word = (n: number) => `w${String(n).padStart(2, '0')}`;
const tokens = Array.from({ length: 10 }, (_, i) => ({ id: word(i + 1) }));
const span = (id: string, first: number, last: number) => ({ id, firstWordId: word(first), lastWordId: word(last) });

// a = 1-10，b = 3-7 嵌在 a 中，c = 5-6 嵌在 b 中，d = 8 紧接 b 也嵌在 a 中
const clauses = [span('a', 1, 10), span('b', 3, 7), span('c', 5, 6), span('d', 8, 8)];

test('自身的词去掉嵌在其中的子句；词归最内层子句', () => {
  const own = clauseWords(clauses, tokens);
  assert.deepEqual(own.get('a')!.map((item) => item.id), [word(1), word(2), word(9), word(10)]);
  assert.deepEqual(own.get('b')!.map((item) => item.id), [word(3), word(4), word(7)]);
  assert.equal(clauseOfWord(word(5), clauses)?.id, 'c');
  assert.equal(clauseOfWord(word(4), clauses)?.id, 'b');
  assert.equal(containerOf(clauses[2], clauses)?.id, 'b');
  assert.equal(containerOf(clauses[0], clauses), undefined);
});

test('空洞：同一处相邻的嵌入子句合成一个占位符，更深一层不列', () => {
  const own = clauseWords(clauses, tokens);
  assert.deepEqual(embedSlots(clauses[0], clauses, own.get('a')!), [{ at: 2, clauseIds: ['b', 'd'] }]);
  assert.deepEqual(embedSlots(clauses[1], clauses, own.get('b')!), [{ at: 2, clauseIds: ['c'] }]);
});
