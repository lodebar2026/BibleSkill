import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Token } from './db.js';
import { PAUSE_FORCED, PAUSE_JOINED, buildDiagram, chipPauses, rangeLabel } from './diagram.js';
import { parseScriptureRange } from './ref.js';
import type { ClauseEntity, ClauseText, DiagramNote } from './schemas.js';

const ALL = 'NA28+NA27+Tyn+SBL+WH+Treg+TR+Byz';

function token(word: number, surface: string, morph: string, extra: Partial<Token> = {}): Token {
  return {
    id: `n44007018${String(word).padStart(3, '0')}`, ref: '', bcv: 44007018, ord: word - 1, surface, after: ' ', translit: '',
    lemma: surface, strong: 'G0001', morph, glossEn: surface, glossZh: null, sense: null, editions: ALL, textType: 'NKO',
    variantNote: null, significant: false, naBracket: false, ...extra,
  };
}

// 徒 7:18：ἄχρι οὗ ἀνέστη βασιλεὺς ἕτερος ἐπ᾽ Αἴγυπτον, ὃς οὐκ ᾔδει τὸν Ἰωσήφ.
const TOKENS = [
  token(1, 'ἄχρι', 'PREP'), token(2, 'οὗ', 'R-GSM'), token(3, 'ἀνέστη', 'V-2AAI-3S'), token(4, 'βασιλεὺς', 'N-NSM'),
  token(5, 'ἕτερος', 'A-NSM'), token(6, 'ἐπ', 'PREP', { editions: 'NA28+NA27+Tyn+SBL+WH+Treg' }), token(7, 'Αἴγυπτον', 'N-ASF-L', { after: ', ' }),
  token(8, 'ὃς', 'R-NSM'), token(9, 'οὐκ', 'PRT-N'), token(10, 'ᾔδει', 'V-2LAI-3S'), token(11, 'τὸν', 'T-ASM'),
  token(12, 'Ἰωσήφ', 'N-ASM-P', { after: '. ', significant: false, variantNote: 'Tyn: Ἰωσήφ ;' }),
];

function clause(id: string, first: number, last: number, extra: Partial<ClauseEntity> = {}): ClauseEntity {
  const word = (n: number) => `n44007018${String(n).padStart(3, '0')}`;
  return {
    id, type: '', parentId: null, modifies: null, firstWordId: word(first), lastWordId: word(last), verbRange: null, verbPerson: null,
    verbStem: null, subjectRange: null, br: null, alone: false, status: 'accepted', alternatives: [], seedDiff: null, sources: ['ai'],
    note: '', version: 0, ...extra,
  };
}

const CLAUSES = [
  clause('44007018a', 1, 7, { verbRange: 'n44007018003', subjectRange: 'n44007018004-n44007018005' }),
  clause('44007018b', 8, 12, { parentId: '44007018a', modifies: 'n44007018004', verbRange: 'n44007018010', subjectRange: 'n44007018008', status: 'ambiguous',
    alternatives: [{ summary: 'ᾔδει 作“顾念”', basis: '出 1:8' }] }),
];

const TEXTS: ClauseText[] = [
  { bcv: 44007018, sub: 'a', translationSpan: 1, formatted: JSON.stringify([{ text: '直到另一个王\n兴起治理埃及，', note: '取状语' }]), paraTitle: null,
    renderings: [{ tokens: 'n44007018004', zh: '王' }], alternatives: [], sources: ['ai'], version: 0, literalness: 3 },
  { bcv: 44007018, sub: 'b', translationSpan: 1, formatted: JSON.stringify([{ text: '他不认识约瑟。' }]), paraTitle: null,
    renderings: [], alternatives: [{ text: '他不顾念约瑟。', kind: 'lexical', basis: 'οἶδα 的顾念义' }], sources: ['ai'], version: 0, literalness: 3 },
];

function build(notes: DiagramNote[] = []) {
  return buildDiagram({ title: '使徒行传 7:18', isOT: false, clauses: CLAUSES, texts: TEXTS, tokens: TOKENS, variants: [], notes, morphExpansion: () => null });
}

test('成分块：主语、谓语取自分析，句首“介词 + 关系代名词”算连接词，其余相邻的词合成一块', () => {
  const [main, relative] = build().clauses;
  const show = (chips: typeof main.chips) => chips.map((chip) => `${chip.role ?? '-'}:${chip.wordIds.map((id) => Number(id.slice(-3))).join(',')}`);
  assert.deepEqual(show(main.chips), ['conj:1,2', 'v:3', 's:4,5', '-:6,7']);
  assert.deepEqual(show(relative.chips), ['s:8', '-:9', 'v:10', '-:11,12']);
});

test('挂接：连线从首词指到母句里被修饰的词；默认标签按被修饰词的词类，大意取译文', () => {
  const data = build();
  const [main, relative] = data.clauses;
  assert.equal(main.parentId, null);
  assert.equal(main.label, '主句');
  assert.equal(main.gist, '直到另一个王兴起治理埃及，');
  assert.equal(relative.parentId, '44007018a');
  assert.equal(relative.targetWordId, 'n44007018004');
  assert.equal(relative.label, '定语从句');
  assert.equal(relative.link, '修饰“王”');
  assert.deepEqual(relative.records.map((record) => record.tag), ['另一种分析', '其他译法·词义']);
  assert.equal(data.literalness, '第 3 档「平衡」');
  assert.deepEqual(data.verses.map((verse) => verse.translation), ['直到另一个王兴起治理埃及，他不认识约瑟。']);
});

test('异文：只标影响翻译的；拼写差异不标', () => {
  const { words } = build();
  assert.equal(words.n44007018006.variant, 'TR、Byz 此处无此词');
  assert.equal(words.n44007018012.variant, null);
});

test('说明：首末词与当前子句对得上才用，对不上（重新切分过）的作废', () => {
  const current: DiagramNote = { clauseId: '44007018b', firstWordId: 'n44007018008', lastWordId: 'n44007018012', label: '关系从句', link: '修饰“王”', gist: '这王不认识约瑟', notes: ['ὅς 作主语'] };
  const stale: DiagramNote = { clauseId: '44007018a', firstWordId: 'n44007018002', lastWordId: 'n44007018007', label: '时间从句', notes: [] };
  const [main, relative] = build([current, stale]).clauses;
  assert.equal(relative.label, '关系从句');
  assert.equal(relative.gist, '这王不认识约瑟');
  assert.deepEqual(relative.points, ['ὅς 作主语']);
  assert.equal(relative.annotated, true);
  assert.equal(main.label, '主句');
  assert.equal(main.annotated, false);
});

test('范围简写', () => {
  assert.equal(rangeLabel(parseScriptureRange('徒 7:17-18')), '7:17-18');
  assert.equal(rangeLabel(parseScriptureRange('徒 7')), '7');
  assert.equal(rangeLabel(parseScriptureRange('徒 7:17')), '7:17');
});

test('切行停顿：旧约按停顿重音分强弱，词缀相连处不能断，br 必断；新约按标点', () => {
  const hw = (n: number, surface: string, after = ' ') => ({ id: `o0100103200${n}1`, surface, after });
  // 创 30:32b：כָּל־ 与下词相连；טָל֗וּא 带 revia，בַּכְּשָׂבִ֔ים 带 zaqef，בָּעִזִּ֑ים 带 atnach
  const words = [hw(1, 'כָּל־', ''), hw(2, 'שֶׂ֣ה'), hw(3, 'טָל֗וּא'), hw(4, 'בַּכְּשָׂבִ֔ים'), hw(5, 'בָּעִזִּ֑ים')];
  assert.deepEqual(chipPauses(words, true), [PAUSE_JOINED, 0, 2, 3, 4]);
  assert.deepEqual(chipPauses(words, true, new Set([words[1].id])), [PAUSE_JOINED, PAUSE_FORCED, 2, 3, 4]);
  const gw = (n: number, after = ' ') => ({ id: `n4400701800${n}`, surface: `w${n}`, after });
  assert.deepEqual(chipPauses([gw(1), gw(2, ', '), gw(3, '. ')], false), [0, 5, 6]);
});

test('逻辑关系：结构图给出关系名与关联子句，一段时列出范围内的子句', () => {
  const logic = { relation: 'cause' as const, target: '44007018a', note: '理由' };
  const data = buildDiagram({ title: '使徒行传 7:18', isOT: false, clauses: [CLAUSES[0], { ...CLAUSES[1], logic }], texts: TEXTS, tokens: TOKENS, variants: [], notes: [], morphExpansion: () => null });
  assert.deepEqual(data.clauses[1].logic, { relation: 'cause', label: '原因', targetIds: ['44007018a'], targetText: '18a', note: '理由' });
  assert.equal(data.clauses[0].logic, null);
});
