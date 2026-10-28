import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ClauseEntity, SeedClause, Token } from '@bs/core';
import { checkRenderings, buildConsistencyReport, type RenderingMemory } from './consistency.js';
import { SubmittedClauseSchema, SubmittedTranslationSchema, checkClauseAnalysis, checkTranslations } from './validate.js';

const BCV = 1001001;

function token(word: number, morph: string, strong: string, sense: string | null = null): Token {
  return {
    id: `o01001001${String(word).padStart(3, '0')}1`, ref: `Gen.1.1#${word}`, bcv: BCV, ord: word - 1,
    surface: `w${word}`, after: ' ', translit: '', lemma: `l${word}`, strong, morph, glossEn: `g${word}`,
    glossZh: null, sense, editions: null, textType: 'L', variantNote: null, significant: false, naBracket: false,
  };
}

// 4 个词：介词、动词、名词、名词
const tokens = [token(1, 'HR', 'H9003'), token(2, 'HVqp3ms', 'H1254A'), token(3, 'HNcmpa', 'H0430G'), token(4, 'HNcfsa', 'H0776G', 'S1')];
const verses = new Map([[BCV, tokens]]);
const id = (word: number) => tokens[word - 1].id;

function clause(sub: string, first: number, last: number, extra: Record<string, unknown> = {}) {
  return { id: `${BCV}${sub}`, firstWordId: id(first), lastWordId: id(last), type: 'qatal', verbRange: id(2), ...extra };
}

test('子句首尾相接覆盖全节时通过，并换算展示码、回填动词信息', () => {
  const result = checkClauseAnalysis([clause('a', 1, 4, { subjectRange: id(3) })], verses, []);
  assert.deepEqual(result.errors, []);
  assert.equal(result.accepted[0].type, 'QtlX');
  assert.equal(result.accepted[0].verbStem, 'qal');
  assert.equal(result.accepted[0].verbPerson, '3ms');
});

test('漏词、重叠、跳字母都按节报错', () => {
  assert.match(checkClauseAnalysis([clause('a', 1, 3)], verses, []).errors[0].messages.join(), /节末漏了词/);
  assert.match(checkClauseAnalysis([clause('a', 1, 3), clause('b', 3, 4)], verses, []).errors[0].messages.join(), /重叠/);
  assert.match(checkClauseAnalysis([clause('a', 1, 2), clause('c', 3, 4, { type: 'nominal', verbRange: null })], verses, []).errors[0].messages.join(), /应为 1001001b/);
});

test('parentId 找不到、modifies 不在父句内、成环都被拒', () => {
  const missing = checkClauseAnalysis([clause('a', 1, 4, { parentId: '1001001z' })], verses, []);
  assert.match(missing.errors[0].messages.join(), /找不到/);
  const badModifies = checkClauseAnalysis(
    [clause('a', 1, 2), clause('b', 3, 4, { type: 'nominal', verbRange: null, parentId: '1001001a', modifies: id(4) })],
    verses, [],
  );
  assert.match(badModifies.errors[0].messages.join(), /不在父句/);
  const cycle = checkClauseAnalysis(
    [clause('a', 1, 2, { parentId: '1001001b' }), clause('b', 3, 4, { type: 'nominal', verbRange: null, parentId: '1001001a' })],
    verses, [],
  );
  assert.match(cycle.errors[0].messages.join(), /成环/);
});

test('ambiguous 必须带 alternatives；句型错约别被拒', () => {
  assert.match(checkClauseAnalysis([clause('a', 1, 4, { status: 'ambiguous' })], verses, []).errors[0].messages.join(), /alternatives/);
  assert.match(checkClauseAnalysis([clause('a', 1, 4, { type: 'aorist_ind' })], verses, []).errors[0].messages.join(), /旧约基础句型/);
});

const entities: ClauseEntity[] = [
  { id: '1001001a', type: 'Qtl0', parentId: null, modifies: null, firstWordId: id(1), lastWordId: id(2), verbRange: id(2), verbPerson: null, verbStem: null, subjectRange: null, br: null, alone: false, status: 'accepted', alternatives: [], seedDiff: null, sources: [], note: '', version: 0 },
  { id: '1001001b', type: 'NmCl', parentId: null, modifies: null, firstWordId: id(3), lastWordId: id(4), verbRange: null, verbPerson: null, verbStem: null, subjectRange: null, br: null, alone: false, status: 'accepted', alternatives: [], seedDiff: null, sources: [], note: '', version: 0 },
];
const clausesByVerse = new Map([[BCV, entities]]);
const allRendered = [{ tokens: id(2), zh: '创造' }, { tokens: id(3), zh: '神' }, { tokens: id(4), zh: '大地' }];

test('合并两句：首句 span=2、次句 span=0 通过', () => {
  const result = checkTranslations([
    { clauseId: '1001001a', span: 2, text: '神创造了大地', renderings: allRendered },
    { clauseId: '1001001b', span: 0, text: '' },
  ], clausesByVerse, verses);
  assert.deepEqual(result.errors, []);
  assert.equal(result.accepted[0].translationSpan, 2);
  assert.deepEqual(result.accepted[0].renderings.map((rendering) => rendering.at), [1, 0, 4]);
});

test('span 不合法、实词缺 rendering、rendering 不在译文里都被拒', () => {
  const badSpan = checkTranslations([
    { clauseId: '1001001a', span: 2, text: '神创造了大地', renderings: allRendered },
    { clauseId: '1001001b', span: 1, text: 'x' },
  ], clausesByVerse, verses);
  assert.match(badSpan.errors[0].messages.join(), /必须为 span=0/);
  const missing = checkTranslations([
    { clauseId: '1001001a', span: 1, text: '创造', renderings: [{ tokens: id(2), zh: '创造' }] },
    { clauseId: '1001001b', span: 1, text: '神大地', renderings: [{ tokens: id(3), zh: '神' }] },
  ], clausesByVerse, verses);
  assert.match(missing.errors[0].messages.join(), /实词缺 rendering/);
  const absent = checkTranslations([
    { clauseId: '1001001a', span: 1, text: '创造', renderings: [{ tokens: id(2), zh: '造' }, { tokens: id(2), zh: '做' }] },
    { clauseId: '1001001b', span: 1, text: '神大地', renderings: [{ tokens: id(3), zh: '神' }, { tokens: id(4), zh: '大地' }] },
  ], clausesByVerse, verses);
  assert.match(absent.errors[0].messages.join(), /没有出现在译文里/);
});

test('格式错误附上出错字段的正确写法', () => {
  assert.throws(
    () => checkTranslations([{ clauseId: '1001001a', span: 'καὶ', text: '神', renderings: [{ tokens: `${id(2)},${id(3)}`, zh: '神' }] }], clausesByVerse, verses),
    (error: Error) => /span 是整数/.test(error.message) && /不连续的几个词分成几条 rendering/.test(error.message),
  );
  assert.throws(() => checkClauseAnalysis([{ id: '1001001a', firstWordId: 1 }], verses, []), /firstWordId \/ lastWordId 是/);
});

test('用词统一：locked 违反为 error，偏离既有译法无 note 为 warning，有 note 放行', () => {
  const glossary = [{ strong: 'H0430G', senseKey: null, lemma: '', zh: '神', level: 'locked' as const, note: '', scope: 'all', version: 0 }];
  const memory: RenderingMemory = new Map([['H0776G|S1', { key: 'H0776G|S1', strong: 'H0776G', lemma: '', glossEn: '', uses: [{ zh: '大地', clauseKey: '1001002a' }] }]]);
  const issues = checkRenderings({ renderings: [{ tokens: id(3), zh: '上帝' }, { tokens: id(4), zh: '地' }] }, tokens, '创世记', glossary, memory);
  assert.deepEqual(issues.map((issue) => issue.severity), ['error', 'warning']);
  const reasoned = checkRenderings({ renderings: [{ tokens: id(4), zh: '地', note: '此处另有所指' }] }, tokens, '创世记', glossary, memory);
  assert.deepEqual(reasoned, []);
});

test('一致性报告：一词多译与多词一译', () => {
  const memory: RenderingMemory = new Map([
    ['A|1', { key: 'A|1', strong: 'H0001', lemma: 'a', glossEn: '', uses: [{ zh: '父', clauseKey: 'x' }, { zh: '父亲', clauseKey: 'y' }] }],
    ['B|1', { key: 'B|1', strong: 'H0002', lemma: 'b', glossEn: '', uses: [{ zh: '父亲', clauseKey: 'z' }] }],
  ]);
  const report = buildConsistencyReport(memory);
  assert.equal(report.oneToMany.length, 1);
  assert.equal(report.manyToOne[0].zh, '父亲');
});

const seed: SeedClause = {
  seedId: 's', bcvFirst: BCV, bcvLast: BCV, parentSeedId: null, rule: null, role: null, attributive: false,
  predicateToken: id(2), subjectTokens: [id(3)], tokens: [id(1), id(2), id(3), id(4)],
};

test('主语检查：漏标、标错、主语被切走都拒绝，写 seedDiff 放行', () => {
  const run = (clauses: unknown[]) => checkClauseAnalysis(clauses, verses, [], [seed]).errors.map((e) => e.messages.join()).join();
  assert.match(run([clause('a', 1, 4)]), /没有填 subjectRange/);
  assert.match(run([clause('a', 1, 4, { subjectRange: id(4) })]), /不重叠/);
  assert.match(run([clause('a', 1, 2), clause('b', 3, 4, { type: 'nominal', verbRange: null })]), /切走/);
  assert.equal(run([clause('a', 1, 4, { subjectRange: id(3) })]), '');
  const overridden = checkClauseAnalysis([clause('a', 1, 4, { seedDiff: '此处 Macula 把表语标成了主语' })], verses, [], [seed]);
  assert.deepEqual(overridden.errors, []);
  assert.equal(overridden.accepted[0].status, 'needs-review');
  assert.equal(overridden.overrides.length, 1);
  // 人工改过的子句即是复核结论，不再降为 needs-review
  const human = checkClauseAnalysis([clause('a', 1, 4, { seedDiff: '人工复核：表语', sources: ['ai', 'human'] })], verses, [], [seed]);
  assert.equal(human.accepted[0].status, 'accepted');
  // 主语包含谓词：写 seedDiff 也不放行
  assert.match(run([clause('a', 1, 4, { subjectRange: `${id(2)}-${id(3)}`, seedDiff: 'x' })]), /包含了谓词/);
});

test('争议：ambiguous 子句须给 alternatives 与 note；异文须给 textual alternative 或 note', () => {
  const ambiguous = new Map([
    ['1001001a', { analysis: [{ summary: '另一断句' }], textual: [] }],
    ['1001001b', { analysis: [], textual: ['w4：异文'] }],
  ]);
  const base = [
    { clauseId: '1001001a', span: 1, text: '创造', renderings: [{ tokens: id(2), zh: '创造' }] },
    { clauseId: '1001001b', span: 1, text: '神大地', renderings: [{ tokens: id(3), zh: '神' }, { tokens: id(4), zh: '大地' }] },
  ];
  const bare = checkTranslations(base, clausesByVerse, verses, ambiguous).errors[0].messages.join();
  assert.match(bare, /alternatives 给出另一读法/);
  assert.match(bare, /经文异文/);
  const handled = checkTranslations([
    { ...base[0], note: '取 a 读法，因 …', alternatives: [{ text: '另一译法', kind: 'punctuation', basis: '另一断句传统' }] },
    { ...base[1], note: '异文只是拼写差异，不影响译文' },
  ], clausesByVerse, verses, ambiguous);
  assert.deepEqual(handled.errors, []);
  assert.equal(handled.accepted[0].alternatives.length, 1);
  assert.match(handled.accepted[0].formatted, /取 a 读法/);
});

test('子句 id 的前导零在提交时去掉', () => {
  const parsed = SubmittedClauseSchema.parse({ id: '09009011a', firstWordId: 'o090090110011', lastWordId: 'o090090110011', parentId: '09009011b' });
  assert.equal(parsed.id, '9009011a');
  assert.equal(parsed.parentId, '9009011b');
  assert.equal(SubmittedTranslationSchema.parse({ clauseId: '09009011a' }).clauseId, '9009011a');
  assert.equal(SubmittedClauseSchema.parse({ id: '1001001a', firstWordId: 'x', lastWordId: 'x' }).id, '1001001a');
});

test('补词：[ ] 拆成补词段，renderings 按去掉括号的译文定位；supplied 写进补词说明', () => {
  const result = checkTranslations([
    { clauseId: '1001001a', span: 1, text: '[他]创造', renderings: [{ tokens: id(2), zh: '创造' }], supplied: [{ text: '他', note: '原文只有动词' }] },
    { clauseId: '1001001b', span: 1, text: '神[和]大地', renderings: [{ tokens: id(3), zh: '神' }, { tokens: id(4), zh: '大地' }] },
  ], clausesByVerse, verses);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(JSON.parse(result.accepted[0].formatted), [{ text: '他', styleName: 'added', note: '原文只有动词' }, { text: '创造' }]);
  assert.deepEqual(result.accepted[1].renderings.map((rendering) => rendering.at), [0, 2]);
  assert.deepEqual(result.accepted.map((row) => row.literalness), [2, 2]);
  const unpaired = checkTranslations([
    { clauseId: '1001001a', span: 1, text: '[他创造', renderings: [{ tokens: id(2), zh: '创造' }] },
    { clauseId: '1001001b', span: 1, text: '神大地', renderings: [{ tokens: id(3), zh: '神' }, { tokens: id(4), zh: '大地' }] },
  ], clausesByVerse, verses);
  assert.match(unpaired.errors[0].messages.join(), /不成对/);
});

test('档位：第 1 档不合并子句；第 4 档不用 [ ]、∅ 可不写 note；〚 〛 各档都可用', () => {
  const merged = [
    { clauseId: '1001001a', span: 2, text: '神创造了大地', renderings: allRendered },
    { clauseId: '1001001b', span: 0, text: '' },
  ];
  assert.match(checkTranslations(merged, clausesByVerse, verses, new Map(), { level: 1 }).errors[0].messages.join(), /第 1 档/);
  assert.deepEqual(checkTranslations(merged, clausesByVerse, verses, new Map(), { level: 3 }).errors, []);
  const bracketed = [
    { clauseId: '1001001a', span: 1, text: '[他]创造', renderings: [{ tokens: id(2), zh: '创造' }] },
    { clauseId: '1001001b', span: 1, text: '〚神大地〛', renderings: [{ tokens: id(3), zh: '神' }, { tokens: id(4), zh: '∅' }] },
  ];
  const level4 = checkTranslations(bracketed, clausesByVerse, verses, new Map(), { level: 4 }).errors[0].messages;
  assert.equal(level4.length, 1);
  assert.match(level4[0], /1001001a: 第 4 档（意义对等）不用 \[ \]/);
  assert.match(checkTranslations(bracketed, clausesByVerse, verses).errors[0].messages.join(), /∅）时必须写 note/);
  // 编辑器提交：按每条自带的档位校验
  const legacy = bracketed.map((item) => ({ ...item, literalness: 2 }));
  assert.match(checkTranslations(legacy, clausesByVerse, verses, new Map(), { level: 4, itemLevels: true }).errors[0].messages.join(), /∅）时必须写 note/);
  assert.doesNotMatch(checkTranslations(legacy, clausesByVerse, verses, new Map(), { level: 4, itemLevels: true }).errors[0].messages.join(), /第 4 档/);
});
