import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addedRanges, clauseNote, hasLegacyBrackets, markupToSegments, plainText, segmentsMarkup, suppliedNotes } from './segments.js';

test('补词：标记文本拆成补词段，再拼回原样', () => {
  const segments = markupToSegments('他[就]说：[你们]去吧', '取叙事语气');
  assert.deepEqual(segments, [
    { text: '他' },
    { text: '就', styleName: 'added' },
    { text: '说：' },
    { text: '你们', styleName: 'added' },
    { text: '去吧', note: '取叙事语气' },
  ]);
  assert.equal(plainText(segments), '他就说：你们去吧');
  assert.equal(segmentsMarkup(segments), '他[就]说：[你们]去吧');
  assert.equal(clauseNote(segments), '取叙事语气');
  assert.deepEqual(addedRanges(segments).map(({ start, end }) => [start, end]), [[1, 2], [4, 6]]);
  assert.equal(hasLegacyBrackets(segments), false);
  assert.equal(hasLegacyBrackets([{ text: '他[就]说' }]), true);
});

test('补词：没有括号时只有一段；note 挂在最后一个普通段上', () => {
  assert.deepEqual(markupToSegments('起初神创造了诸天与大地'), [{ text: '起初神创造了诸天与大地' }]);
  assert.deepEqual(markupToSegments('起初', '理由'), [{ text: '起初', note: '理由' }]);
  assert.deepEqual(markupToSegments('神说[要有]', '理由'), [{ text: '神说', note: '理由' }, { text: '要有', styleName: 'added' }]);
  assert.deepEqual(markupToSegments('[他]', '理由'), [{ text: '他', styleName: 'added' }, { text: '', note: '理由' }]);
});

test('补词：括号不成对、嵌套、跨行、为空都报错', () => {
  assert.throws(() => markupToSegments('他[就说'), /不成对/);
  assert.throws(() => markupToSegments('他就]说'), /不成对/);
  assert.throws(() => markupToSegments('他[[就]]说'), /不成对/);
  assert.throws(() => markupToSegments('他[就\n]说'), /不成对/);
  assert.throws(() => markupToSegments('他[ ]说'), /空的/);
  assert.equal(markupToSegments('〚耶稣说〛').length, 1);
});

test('补词说明：supplied 挂到对应补词段，重复补词用 at 区分', () => {
  const segments = markupToSegments('[他]说，[他]看', '', [{ text: '他', note: '指扫罗', at: 3 }]);
  assert.deepEqual(segments.filter((segment) => segment.styleName).map((segment) => segment.note), [undefined, '指扫罗']);
  assert.deepEqual(suppliedNotes(segments), [{ text: '他', note: '指扫罗', at: 3 }]);
  assert.deepEqual(markupToSegments('[他]说', '', [{ text: '他', note: '指扫罗' }])[0].note, '指扫罗');
  assert.throws(() => markupToSegments('他说', '', [{ text: '他', note: 'x' }]), /没有对应/);
});
