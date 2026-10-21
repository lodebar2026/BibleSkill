import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bookByStepCode, parseScriptureRange } from './ref.js';
import { otTokenId, ntTokenId, parseTokenId } from './ids.js';
import { isContentWord } from './content-word.js';
import { BASIC_TYPES_NT, BASIC_TYPES_OT, basicClauseType, displayClauseType, verbInfoFromMorph } from './clause-type.js';

test('经文范围：中英文书名、整章从第 0 节起', () => {
  assert.deepEqual(parseScriptureRange('创 1:1-5'), { bookId: 1, bookName: '创世记', isOT: true, startBcv: 1001001, endBcv: 1001005 });
  assert.equal(parseScriptureRange('John 3:16').startBcv, 43003016);
  assert.equal(parseScriptureRange('诗 51').startBcv, 19051000);
  assert.equal(parseScriptureRange('撒上 1').bookId, 9);
  assert.equal(bookByStepCode('1Sa').id, 9);
  assert.equal(bookByStepCode('JHN').id, 43);
});

test('词 id 定宽、可往返', () => {
  assert.equal(otTokenId(1, 1, 1, 7, 2), 'o010010010072');
  assert.equal(ntTokenId(40, 1, 1, 3), 'n40001001003');
  assert.equal(parseTokenId('o190510000011').verse, 0);
  assert.throws(() => parseTokenId('n400010010031'));
});

test('实词判定', () => {
  assert.ok(isContentWord('HNcfsa', 'H7225G'));
  assert.ok(isContentWord('HVqp3ms', 'H1254A'));
  assert.ok(!isContentWord('HR', 'H9003'));
  assert.ok(!isContentWord('HTo', 'H0853'));
  assert.ok(isContentWord('N-NSF', 'G0976'));
  assert.ok(!isContentWord('T-NSM', 'G3588'));
});

test('句型展示码与动词信息', () => {
  assert.equal(displayClauseType('OT', { type: 'wayyiqtol', subjectRange: null, verbRange: 'o010010030011' }), 'Way0');
  assert.equal(displayClauseType('OT', { type: 'qatal', subjectRange: 'o010010020012', verbRange: 'o010010020021' }), 'XQtl');
  assert.equal(displayClauseType('NT', { type: 'aorist_ind', subjectRange: 'n43001001005', verbRange: 'n43001001002' }), 'AorX');
  assert.deepEqual(verbInfoFromMorph('HVhi3ms'), { stem: 'hiphil', person: '3ms' });
  assert.deepEqual(verbInfoFromMorph('V-AAI-3S'), { stem: null, person: '3s' });
});

test('展示码可反推基础句型', () => {
  const ranges = [
    { subjectRange: null, verbRange: 'x' },
    { subjectRange: 'n40001001001', verbRange: 'n40001001002' },
    { subjectRange: 'n40001001003', verbRange: 'n40001001002' },
  ];
  for (const [testament, types] of [['OT', BASIC_TYPES_OT], ['NT', BASIC_TYPES_NT]] as const) {
    for (const type of types) {
      for (const range of ranges) {
        assert.equal(basicClauseType(testament, displayClauseType(testament, { type, ...range })), type);
      }
    }
  }
  assert.equal(basicClauseType('OT', 'wayyiqtol'), 'wayyiqtol');
  assert.equal(basicClauseType('OT', 'Aor0'), null);
});
