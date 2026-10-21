import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alignmentSpans, resolveAlignment } from './align.js';

test('对齐：长词先占位，短词不落进长词里', () => {
  // 「地」先出现在「大地」里，应落到后面单独的「地」
  const renderings = [{ tokens: 'o1', zh: '地' }, { tokens: 'o2', zh: '大地' }];
  assert.deepEqual(resolveAlignment('大地与地', renderings), [3, 0]);
});

test('对齐：重复字串按词序分配，有效 at 优先，过期 at 重新定位', () => {
  const text = '神说，神看';
  assert.deepEqual(resolveAlignment(text, [{ tokens: 'o2', zh: '神' }, { tokens: 'o1', zh: '神' }]), [3, 0]);
  assert.deepEqual(resolveAlignment(text, [{ tokens: 'o1', zh: '神', at: 3 }, { tokens: 'o2', zh: '神' }]), [3, 0]);
  assert.deepEqual(resolveAlignment(text, [{ tokens: 'o1', zh: '神', at: 1 }]), [0]);
});

test('对齐：∅ 与找不到的为 null；都重叠时取第一处', () => {
  assert.deepEqual(resolveAlignment('起初', [{ tokens: 'o1', zh: '∅' }, { tokens: 'o2', zh: '神' }]), [null, null]);
  assert.deepEqual(resolveAlignment('大地', [{ tokens: 'o1', zh: '大地' }, { tokens: 'o2', zh: '地' }]), [0, 1]);
});

test('对齐片段：相同覆盖的相邻字合并，未对齐的字 tokens 为空', () => {
  const spans = alignmentSpans('神创造了天', [{ tokens: 'o1', zh: '神' }, { tokens: 'o2', zh: '创造' }, { tokens: 'o3-o4', zh: '天' }]);
  assert.deepEqual(spans, [
    { text: '神', tokens: ['o1'] },
    { text: '创造', tokens: ['o2'] },
    { text: '了', tokens: [] },
    { text: '天', tokens: ['o3-o4'] },
  ]);
  assert.deepEqual(alignmentSpans('𠀀地', [{ tokens: 'o1', zh: '地' }]), [{ text: '𠀀', tokens: [] }, { text: '地', tokens: ['o1'] }]);
});
