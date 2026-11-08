import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type CandidateRow, type RowChoice, selectRows } from './critical-text.js';

/** 词行：own 本行读法；alt 异文列里的 NA28 读法；fallback 照 TAGNT 版本列的选择；universal 八个版本都有。 */
const row = (own: string, fallback: RowChoice = 'own', extra: Partial<CandidateRow> = {}): CandidateRow => ({ own, alt: null, fallback, universal: false, ...extra });

test('NA28 单括号里的词 TAGNT 不算 NA28（徒 9:12 [ἐν ὁράματι]）：按 NA28 挑进主干', () => {
  const rows = [row('εἶδεν'), row('ἄνδρα'), row('ἐν', null), row('ὁράματι', null), row('Ἁνανίαν')];
  assert.deepEqual(selectRows(rows, 'εἶδεν ⸂ἄνδρα [ἐν ὁράματι]⸃ Ἁνανίαν'), { kind: 'changed', choices: ['own', 'own', 'own', 'own', 'own'] });
});

test('TAGNT 把 ECM 读法当 NA28、本行读法其实是 NA28 的（徒 9:8 οὐδένα / οὐδὲν）：改用本行读法', () => {
  const rows = [row('αὐτοῦ'), row('οὐδὲν', 'alt', { alt: 'οὐδένα' }), row('ἔβλεπεν·')];
  assert.deepEqual(selectRows(rows, 'αὐτοῦ ⸀οὐδὲν ἔβλεπεν·'), { kind: 'changed', choices: ['own', 'own', 'own'] });
});

test('NA28 没有的 ECM 词移出主干（可 1:2 ἐγώ）；同词重复时优先留 TAGNT 原来选的那行', () => {
  const rows = [row('ἰδοὺ'), row('ἐγὼ'), row('ἀποστέλλω'), row('τὸν', null), row('τὸν')];
  assert.deepEqual(selectRows(rows, 'ἰδοὺ ἀποστέλλω τὸν'), { kind: 'changed', choices: ['own', null, 'own', null, 'own'] });
});

test('与 TAGNT 一致（含可移动的 ν、校勘符号与标点）时不改', () => {
  const rows = [row('ἐν'), row('ἐσθήσεσι'), row('λευκαῖς,')];
  assert.deepEqual(selectRows(rows, 'ἐν ⸂ἐσθήσεσιν λευκαῖς⸃,*'), { kind: 'same' });
});

test('分节不同（NA28 把八个版本都有的词算在邻节）、或有词对不上时，本节照 TAGNT', () => {
  const rows = [row('καὶ', 'own', { universal: true }), row('ἀπὸ', 'own', { universal: true }), row('πάντων', 'own', { universal: true }), row('ἐν')];
  assert.deepEqual(selectRows(rows, 'ἐν'), { kind: 'renumbered', words: ['καὶ', 'ἀπὸ', 'πάντων'] });
  assert.deepEqual(selectRows([row('ἐπὶ')], 'εἰς'), { kind: 'unmatched', missing: 1 });
});
