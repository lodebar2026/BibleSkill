import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SyntaxNode, Token, TokenSyntax } from './db.js';
import { PAUSE_COORD, PAUSE_EMBED, PAUSE_FORCED, PAUSE_JOINED, buildDiagram, chipPauses, cognateInfinitive, greekMorph, hebrewStem, rangeLabel } from './diagram.js';
import { parseScriptureRange } from './ref.js';
import type { ClauseEntity, ClauseText } from './schemas.js';

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
  { bcv: 44007018, sub: 'b', translationSpan: 1, formatted: JSON.stringify([{ text: '他', styleName: 'added', note: '补出主语' }, { text: '不认识约瑟。' }]), paraTitle: null,
    renderings: [], alternatives: [{ text: '他不顾念约瑟。', kind: 'lexical', basis: 'οἶδα 的顾念义' }], sources: ['ai'], version: 0, literalness: 3 },
];

function build() {
  return buildDiagram({ title: '使徒行传 7:18', isOT: false, clauses: CLAUSES, texts: TEXTS, tokens: TOKENS, variants: [], morphExpansion: () => null });
}

test('成分块：主语、谓语取自分析，句首“介词 + 关系代名词”算连词，其余相邻的词合成一块', () => {
  const [main, relative] = build().clauses;
  const show = (chips: typeof main.chips) => chips.map((chip) => `${chip.role ?? '-'}:${chip.wordIds.map((id) => Number(id.slice(-3))).join(',')}`);
  assert.deepEqual(show(main.chips), ['conj:1,2', 'v:3', 's:4,5', '-:6,7']);
  assert.deepEqual(show(relative.chips), ['s:8', '-:9', 'v:10', '-:11,12']);
});

test('挂接：连线从首词指到母句里被修饰的词；修饰名词的连线上标「定语」，大意取译文（补词带标记与说明）', () => {
  const data = build();
  const [main, relative] = data.clauses;
  assert.equal(main.parentId, null);
  assert.equal(main.label, '主句');
  assert.deepEqual(main.gist, [{ text: '直到另一个王兴起治理埃及，' }]);
  assert.deepEqual(relative.gist, [{ text: '他', added: true, note: '补出主语' }, { text: '不认识约瑟。' }]);
  assert.equal(relative.parentId, '44007018a');
  assert.equal(relative.targetWordId, 'n44007018004');
  assert.equal(relative.label, '从句');
  assert.equal(relative.wireLabel, '定语');
  assert.equal(main.wireLabel, null);
  assert.equal(relative.link, '修饰“王”');
  assert.deepEqual(relative.records.map((record) => record.tag), ['另一种分析', '其他译法·词义']);
  assert.equal(data.literalness, '第 3 档「平衡」');
  assert.deepEqual(data.verses.map((verse) => verse.translation), [[{ text: '直到另一个王兴起治理埃及，' }, { text: '他', added: true, note: '补出主语' }, { text: '不认识约瑟。' }]]);
});

test('挂接：modifies 是一段（并列的先行词）时，全段都是被修饰的词，连线指向首词', () => {
  const data = buildDiagram({
    title: '测试', isOT: false, texts: TEXTS, tokens: TOKENS, variants: [], morphExpansion: () => null,
    clauses: [CLAUSES[0], { ...CLAUSES[1], modifies: 'n44007018004-n44007018005' }],
  });
  const relative = data.clauses[1];
  assert.equal(relative.targetWordId, 'n44007018004');
  assert.deepEqual(relative.targetWordIds, ['n44007018004', 'n44007018005']);
  assert.equal(relative.link, '修饰“王ἕτερος”');
});

test('异文：只标影响翻译的；拼写差异不标', () => {
  const { words } = build();
  assert.equal(words.n44007018006.variant, 'TR、Byz 此处无此词');
  assert.equal(words.n44007018012.variant, null);
});

test('范围简写', () => {
  assert.equal(rangeLabel(parseScriptureRange('徒 7:17-18')), '7:17-18');
  assert.equal(rangeLabel(parseScriptureRange('徒 7')), '7');
  assert.equal(rangeLabel(parseScriptureRange('徒 7:17')), '7:17');
});

test('切行停顿：旧约按停顿重音分强弱（远分强于近分），词缀相连处不能断，br 必断；新约按标点', () => {
  const hw = (n: number, surface: string, after = ' ') => ({ id: `o0100103200${n}1`, surface, after });
  // 创 30:32b：כָּל־ 与下词相连；טָל֗וּא 带 revia，בַּכְּשָׂבִ֔ים 带 zaqef，בָּעִזִּ֑ים 带 atnach
  const words = [hw(1, 'כָּל־', ''), hw(2, 'שֶׂ֣ה'), hw(3, 'טָל֗וּא'), hw(4, 'בַּכְּשָׂבִ֔ים'), hw(5, 'בָּעִזִּ֑ים')];
  assert.deepEqual(chipPauses(words, true), [PAUSE_JOINED, 0, 2.5, 3.5, 4]);
  assert.deepEqual(chipPauses(words, true, new Set([words[1].id])), [PAUSE_JOINED, PAUSE_FORCED, 2.5, 3.5, 4]);
  // tipcha（atnach 前的近分）低于 zaqef，pashta（zaqef 前的近分）低于 revia
  assert.deepEqual(chipPauses([hw(1, 'ח֖וּם'), hw(2, 'הָעִזִּים֙'), hw(3, 'x')], true), [3, 2, 0]);
  // 重音按整个单位算：בּ֔ + וֹ 的 zaqef 记在 וֹ 后；maqqef 后不断
  assert.deepEqual(chipPauses([hw(1, 'בּ֔', ''), hw(2, 'וֹ'), hw(3, 'וְ', ''), hw(4, 'כָל', '־'), hw(5, 'ח֖וּם'), hw(6, 'x')], true),
    [PAUSE_JOINED, 3.5, PAUSE_JOINED, PAUSE_JOINED, 3, 0]);
  const gw = (n: number, after = ' ') => ({ id: `n4400701800${n}`, surface: `w${n}`, after });
  assert.deepEqual(chipPauses([gw(1), gw(2, ', '), gw(3, '. ')], false), [0, 5, 6]);
});

test('逻辑关系：结构图给出关系名与关联子句，一段时列出范围内的子句', () => {
  const logic = { relation: 'cause' as const, target: '44007018a', note: '理由' };
  const data = buildDiagram({ title: '使徒行传 7:18', isOT: false, clauses: [CLAUSES[0], { ...CLAUSES[1], logic }], texts: TEXTS, tokens: TOKENS, variants: [], morphExpansion: () => null });
  assert.deepEqual(data.clauses[1].logic, { relation: 'cause', label: '原因', targetIds: ['44007018a'], targetText: '18a', note: '理由' });
  assert.equal(data.clauses[0].logic, null);
});

test('Robinson 词法：格、时态、语气', () => {
  assert.deepEqual(greekMorph('N-DSF'), { gcase: 'dat', tense: null, mood: null });
  assert.deepEqual(greekMorph('P-1GP'), { gcase: 'gen', tense: null, mood: null });
  assert.deepEqual(greekMorph('S-1SGSN'), { gcase: 'gen', tense: null, mood: null });
  assert.deepEqual(greekMorph('N-NSM-P'), { gcase: 'nom', tense: null, mood: null });
  assert.deepEqual(greekMorph('A-NUI'), { gcase: null, tense: null, mood: null });
  assert.deepEqual(greekMorph('V-2AAP-NSM'), { gcase: 'nom', tense: 'aor', mood: 'ptcp' });
  assert.deepEqual(greekMorph('V-2AAI-3S'), { gcase: null, tense: 'aor', mood: 'ind' });
  assert.deepEqual(greekMorph('V-2LAI-3S'), { gcase: null, tense: 'plpf', mood: 'ind' });
  assert.deepEqual(greekMorph('V-AAM-2S'), { gcase: null, tense: 'aor', mood: 'impv' });
  assert.deepEqual(greekMorph('V-PAN'), { gcase: null, tense: 'pres', mood: 'inf' });
});

/** 手写的短语树：nodes 按从根到叶给出，词挂在最后一个结点下。 */
function syntaxOf(entries: Array<[number, string | null, SyntaxNode[]]>): Map<string, TokenSyntax> {
  return new Map(entries.map(([word, role, path]) => [`n44007018${String(word).padStart(3, '0')}`, { role, path }]));
}
const node = (id: number, cls: string | null, role: string | null = null, rule: string | null = null): SyntaxNode => ({ id, cls, role, rule, clauseType: null });

test('成分分块：新约按 Macula 短语树分出间接宾语、宾语，主语谓语仍以分析为准', () => {
  // 徒 7:40 ποίησον ἡμῖν θεοὺς
  const tokens = [token(1, 'ποίησον', 'V-AAM-2S'), token(2, 'ἡμῖν', 'P-1DP'), token(3, 'θεοὺς', 'N-APM', { after: '. ' })];
  const c = node(1, 'cl', null, 'V-IO-O');
  const syntax = syntaxOf([[1, 'v', [c]], [2, 'io', [c]], [3, null, [c, node(2, 'np', 'o')]]]);
  const data = buildDiagram({ title: '', isOT: false, clauses: [clause('44007018a', 1, 3, { verbRange: 'n44007018001' })], texts: [], tokens,
    variants: [], morphExpansion: () => null, syntax, narrative: true });
  assert.deepEqual(data.clauses[0].chips.map((chip) => chip.role), ['v', 'io', 'o']);
  assert.equal(data.clauses[0].ntForm, 'aor-impv');
  assert.equal(data.narrative, true);
  assert.equal(data.words.n44007018003.gcase, 'acc');
});

test('块内按短语树折行：嵌入的分词短语连同冠词自成一行并缩进，并列的 καί 另起一行', () => {
  // 徒 7:38 γενόμενος μετὰ τοῦ ἀγγέλου τοῦ λαλοῦντος αὐτῷ καὶ τῶν πατέρων
  const words = ['γενόμενος', 'μετὰ', 'τοῦ', 'ἀγγέλου', 'τοῦ', 'λαλοῦντος', 'αὐτῷ', 'καὶ', 'τῶν', 'πατέρων'];
  const morphs = ['V-2ADP-NSM', 'PREP', 'T-GSM', 'N-GSM', 'T-GSM', 'V-PAP-GSM', 'P-DSM', 'CONJ', 'T-GPM', 'N-GPM'];
  const tokens = words.map((surface, i) => token(i + 1, surface, morphs[i]));
  const c = node(1, 'cl');
  const pp = node(2, 'pp', 'p', 'PrepNp');
  const both = node(3, 'np', null, 'NpaNp');
  const appos = node(4, 'np', null, 'Np-Appos');
  const angel = node(5, 'np', null, 'DetNP');
  const detcl = node(6, 'np', null, 'DetCL');
  const speaking = node(7, 'cl', null, 'V-IO');
  const coord = node(8, null);
  const fathers = node(9, 'np', null, 'DetNP');
  const syntax = syntaxOf([
    [1, 'vc', [c]], [2, null, [c, pp]], [3, null, [c, pp, both, appos, angel]], [4, null, [c, pp, both, appos, angel]],
    [5, null, [c, pp, both, appos, detcl]], [6, 'v', [c, pp, both, appos, detcl, speaking]], [7, 'io', [c, pp, both, appos, detcl, speaking]],
    [8, null, [c, pp, both, coord]], [9, null, [c, pp, both, coord, fathers]], [10, null, [c, pp, both, coord, fathers]],
  ]);
  const data = buildDiagram({ title: '', isOT: false, clauses: [clause('44007018a', 1, 10, { verbRange: 'n44007018001' })], texts: [], tokens,
    variants: [], morphExpansion: () => null, syntax });
  const [verb, predicate] = data.clauses[0].chips;
  assert.equal(verb.role, 'v');
  assert.equal(predicate.role, 'p');
  // 优先断点（断在这些词之后）：嵌入短语之前（PAUSE_EMBED）、之后也就是 καί 之前（PAUSE_COORD）；没有必断处
  const cuts = predicate.pauses!.flatMap((pause, i) => (pause >= PAUSE_EMBED ? [`${words[i + 1]}:${pause}`] : []));
  assert.deepEqual(cuts, [`ἀγγέλου:${PAUSE_EMBED}`, `αὐτῷ:${PAUSE_COORD}`]);
  assert.ok(predicate.pauses!.every((pause) => pause < PAUSE_FORCED));
  assert.deepEqual(predicate.indents, [0, 0, 0, 1, 1, 1, 0, 0, 0]);
  // 冠词之后不断
  assert.deepEqual([1, 3, 7].map((i) => predicate.pauses![i]), [PAUSE_JOINED, PAUSE_JOINED, PAUSE_JOINED]);
});

test('旧约也按短语树分成分块（介词短语按状语），但块内折行只看停顿重音、不缩进', () => {
  // 创 30:32 הָסֵר מִשָּׁם כָּל־שֶׂה נָקֹד וְטָלוּא וְכָל־שֶׂה חוּם（简化）
  const ot = (word: number, surface: string, morph: string, after = ' '): Token => ({
    ...token(word, surface, morph), id: `o01030032${String(word).padStart(3, '0')}1`, bcv: 1030032, after,
  });
  const words = [ot(1, 'הָסֵר', 'HVhaa'), ot(2, 'מִ', 'HR', ''), ot(3, 'שָּׁם', 'HD'), ot(4, 'כָּל', 'HNcmsc', '־'), ot(5, 'שֶׂה', 'HNcbsa'),
    ot(6, 'נָקֹד', 'HAamsa'), ot(7, 'וְ', 'HC', ''), ot(8, 'טָלוּא', 'HVqsmsa'), ot(9, 'וְ', 'HC', ''), ot(10, 'כָל', 'HNcmsc', '־'), ot(11, 'שֶׂה', 'HNcbsa'), ot(12, 'חוּם', 'HAamsa')];
  const c = node(1, 'cl');
  const pp = node(2, 'pp', 'pp');
  const obj = node(3, 'np', 'o');
  const spotted = node(4, 'np');
  const brown = node(5, 'np');
  const paths: SyntaxNode[][] = [[c], [c, pp], [c, pp], [c, obj, spotted], [c, obj, spotted], [c, obj, spotted], [c, obj, spotted], [c, obj, spotted], [c, obj], [c, obj, brown], [c, obj, brown], [c, obj, brown]];
  const syntax = new Map(words.map((word, i) => [word.id, { role: i === 0 ? 'v' : null, path: paths[i] }]));
  const entity = { ...clause('1030032b', 1, 12), firstWordId: words[0].id, lastWordId: words.at(-1)!.id, verbRange: words[0].id };
  const data = buildDiagram({ title: '', isOT: true, clauses: [entity], texts: [], tokens: words, variants: [], morphExpansion: () => null, syntax });
  const [verb, place, object] = data.clauses[0].chips;
  assert.deepEqual([verb.role, place.role, object.role], ['v', 'adv', 'o']);
  // 并列的 וְ 前不另加强度：与只按重音算的结果相同
  assert.deepEqual(object.pauses, chipPauses(object.wordIds.map((wordId) => words.find((word) => word.id === wordId)!), true));
  assert.equal(object.indents, undefined);
});

test('嵌入：母句只含自身的词，嵌入处放占位符（同一块就放在块内，否则随被修饰词），连线指向占位符', () => {
  const nested = (subjectRange: string) => buildDiagram({
    title: '测试', isOT: false, texts: [], tokens: TOKENS, variants: [], morphExpansion: () => null,
    clauses: [
      clause('44007018a', 1, 12, { verbRange: 'n44007018003', subjectRange }),
      clause('44007018b', 8, 10, { parentId: '44007018a', modifies: 'n44007018004', verbRange: 'n44007018010' }),
    ],
  });
  const show = (chips: ReturnType<typeof nested>['clauses'][number]['chips']) => chips.map((chip) =>
    `${chip.role ?? '-'}:${chip.wordIds.map((id) => Number(id.slice(-3))).join(',')}${(chip.slots ?? []).map((slot) => `[${slot.at}:${slot.clauseIds}]`).join('')}`);
  const loose = nested('n44007018004');
  assert.deepEqual(show(loose.clauses[0].chips), ['conj:1,2', 'v:3', 's:4', '-:5,6,7,11,12[3:44007018b]']);
  assert.equal(loose.clauses[1].targetSlot, '44007018a@7');
  assert.equal(loose.clauses[1].targetWordId, 'n44007018004');
  const split = nested('n44007018004-n44007018007');
  assert.deepEqual(show(split.clauses[0].chips), ['conj:1,2', 'v:3', 's:4,5,6,7[4:44007018b]', '-:11,12']);
  assert.equal(split.clauses[0].chips[2].pauses?.at(-1), PAUSE_JOINED);
});

test('嵌入：修饰母句谓语的状语子句不放占位符，连线直接指到动词', () => {
  const data = buildDiagram({
    title: '测试', isOT: false, texts: [], tokens: TOKENS, variants: [], morphExpansion: () => null,
    clauses: [
      clause('44007018a', 1, 12, { verbRange: 'n44007018003', subjectRange: 'n44007018004' }),
      clause('44007018b', 8, 10, { parentId: '44007018a', modifies: 'n44007018003', verbRange: 'n44007018010' }),
    ],
  });
  assert.equal(data.clauses[0].chips.some((chip) => chip.slots?.length), false);
  assert.equal(data.clauses[1].targetSlot, null);
  assert.equal(data.clauses[1].targetWordId, 'n44007018003');
});

test('旧约词干：qal 主动不标，其余按词干类归并，被动另记', () => {
  assert.equal(hebrewStem('HVqp3ms'), null);
  assert.deepEqual(hebrewStem('HVpp3ms'), { name: 'piel', family: 'piel', passive: false });
  assert.deepEqual(hebrewStem('HVPp3ms'), { name: 'pual', family: 'piel', passive: true });
  assert.deepEqual(hebrewStem('HVhi3ms'), { name: 'hiphil', family: 'hiphil', passive: false });
  assert.deepEqual(hebrewStem('HVHp3ms'), { name: 'hophal', family: 'hiphil', passive: true });
  assert.deepEqual(hebrewStem('HVNp3ms'), { name: 'niphal', family: 'niphal', passive: false });
  assert.deepEqual(hebrewStem('HVtp3ms'), { name: 'hithpael', family: 'hithpael', passive: false });
  assert.deepEqual(hebrewStem('AVpp3ms'), { name: 'piel', family: 'piel', passive: false });
  assert.equal(hebrewStem('HNcmsa'), null);
  assert.equal(hebrewStem('V-AAI-3S'), null);
});

test('旧约前置：限定动词句里谓语前含名词性词的成分块标出；连词、否定词、疑问代词、分词句不算；新约不标', () => {
  const ot = (word: number, surface: string, morph: string, after = ' '): Token => ({
    ...token(word, surface, morph), id: `o01001001${String(word).padStart(3, '0')}1`, bcv: 1001001, after,
  });
  const id = (n: number) => `o01001001${String(n).padStart(3, '0')}1`;
  // וְ אֶת־הָאָרֶץ לֹא נָתַן אֱלֹהִים
  const words = [ot(1, 'וְ', 'HC', ''), ot(2, 'אֶת', 'HTo', '־'), ot(3, 'הָ', 'HTd', ''), ot(4, 'אָרֶץ', 'HNcbsa'), ot(5, 'לֹא', 'HTn'),
    ot(6, 'נָתַן', 'HVqp3ms'), ot(7, 'אֱלֹהִים', 'HNcmpa')];
  const base = { ...clause('1001001a', 1, 7), firstWordId: id(1), lastWordId: id(7), verbRange: id(6), subjectRange: id(7) };
  const run = (entity: ClauseEntity, isOT = true) => buildDiagram({ title: '', isOT, clauses: [entity], texts: [], tokens: words, variants: [], morphExpansion: () => null })
    .clauses[0].chips.map((chip) => `${chip.role ?? '-'}:${chip.wordIds.map((wordId) => Number(wordId.slice(-4, -1))).join(',')}${chip.fronted ? '!' : ''}`);
  assert.deepEqual(run({ ...base, type: 'QtlX' }), ['conj:1', '-:2,3,4,5!', 'v:6', 's:7']);
  // 否定词单独成块时不算前置
  assert.deepEqual(run({ ...base, firstWordId: id(5), type: 'QtlX' }).slice(0, 1), ['-:5']);
  // 分词句：成分在前是常序
  assert.ok(run({ ...base, type: 'Ptcp' }).every((chip) => !chip.endsWith('!')));
  // 疑问代词居首不算
  const what = [ot(1, 'וְ', 'HC', ''), ot(2, 'מָה', 'HPi'), ot(3, 'נָתַן', 'HVqp3ms'), ot(4, 'אֱלֹהִים', 'HNcmpa')];
  const asked = buildDiagram({ title: '', isOT: true, clauses: [{ ...base, type: 'QtlX', firstWordId: id(1), lastWordId: id(4), verbRange: id(3), subjectRange: id(4) }],
    texts: [], tokens: what, variants: [], morphExpansion: () => null });
  assert.ok(asked.clauses[0].chips.every((chip) => !chip.fronted));
  assert.ok(run({ ...base, type: '' }, false).every((chip) => !chip.endsWith('!')));
});

test('旧约同根不定式强调：不定式独立形与同根限定动词，前后都算；不定式附属形、不同词根不算', () => {
  const w = (id: string, strong: string, morph: string) => ({ id, strong, morph });
  // 创 2:17 מ֥וֹת תָּמֽוּת
  assert.deepEqual(cognateInfinitive([w('a', 'H4191', 'HVqaa'), w('b', 'H4191', 'HVqi2ms')]), ['a', 'b']);
  // 撒上 1:10 וַתִּבְכֶּה בָכֹה：wayyiqtol 在前
  assert.deepEqual(cognateInfinitive([w('a', 'H9001', 'HC'), w('b', 'H1058', 'HVqw3fs'), w('c', 'H1058', 'HVqaa')]), ['b', 'c']);
  assert.deepEqual(cognateInfinitive([w('a', 'H0398', 'HVqcc'), w('b', 'H0398', 'HVqi2ms')]), []);
  assert.deepEqual(cognateInfinitive([w('a', 'H4191', 'HVqaa'), w('b', 'H1058', 'HVqi3fs')]), []);
});

test('徒 8:28a 迂说结构：ἦν τε ὑποστρέφων καὶ καθήμενος ἐπὶ τοῦ ἅρματος αὐτοῦ 整个是一个谓语块，介词短语跟着 καθήμενος，只在 καί 前折行', () => {
  // 短语树照抄 Macula（syntax_node 390727…390752）；改分块、折行逻辑时这一句的展示不能变
  const surfaces: Array<[string, string, string]> = [
    ['ἦν', 'V-IAI-3S', 'εἰμί'], ['τε', 'CONJ', 'τε'], ['ὑποστρέφων', 'V-PAP-NSM', 'ὑποστρέφω'], ['καὶ', 'CONJ', 'καί'],
    ['καθήμενος', 'V-PNP-NSM', 'κάθημαι'], ['ἐπὶ', 'PREP', 'ἐπί'], ['τοῦ', 'T-GSN', 'ὁ'], ['ἅρματος', 'N-GSN', 'ἅρμα'], ['αὐτοῦ', 'P-GSM', 'αὐτός'],
  ];
  const tokens = surfaces.map(([surface, morph, lemma], i) => token(i + 1, surface, morph, { lemma }));
  const top = [node(1, 'cl', null, 'Conj-CL'), node(2, 'cl', null, 'ClCl2'), node(3, 'cl', null, 'S-V')];
  const beVerb = [...top, node(4, 'vp', 'v', 'BeVerb')];
  const either = [...beVerb, node(5, 'vp', null, 'EitherOrVp')];
  const first = [...either, node(6, null)];
  const second = [...either, node(7, null)];
  const sitting = [...second, node(8, 'cl', null, 'V-ADV')];
  const pp = [...sitting, node(9, 'pp', 'adv', 'PrepNp')];
  const det = [...pp, node(10, 'np', null, 'DetNP')];
  const ofNp = [...det, node(11, 'np', null, 'NPofNP')];
  const syntax = syntaxOf([
    [1, null, beVerb], [2, null, first], [3, null, first], [4, null, second], [5, 'v', sitting],
    [6, null, pp], [7, null, det], [8, null, ofNp], [9, null, ofNp],
  ]);
  const data = buildDiagram({ title: '', isOT: false, tokens, variants: [], morphExpansion: () => null, syntax, texts: [],
    clauses: [clause('44007018a', 1, 9, { verbRange: 'n44007018001-n44007018005' })] });
  const chips = data.clauses[0].chips;
  assert.deepEqual(chips.map((chip) => `${chip.role}:${chip.wordIds.map((id) => Number(id.slice(-3))).join(',')}`), ['v:1,2,3,4,5,6,7,8,9']);
  // 块太宽要折行时，最强的断点只有 καί 之前一处：ἦν τε ὑποστρέφων ｜ καὶ καθήμενος ἐπὶ τοῦ ἅρματος αὐτοῦ（后置的 τε 前不断）
  const pauses = chips[0].pauses!;
  const strongest = Math.max(...pauses.slice(0, -1));
  assert.deepEqual(pauses.slice(0, -1).flatMap((pause, i) => (pause === strongest ? [surfaces[i + 1][0]] : [])), ['καὶ']);
  assert.ok(pauses.every((pause) => pause < PAUSE_FORCED));
  // καθήμενος 与它的介词短语之间、冠词之后都不是断点
  assert.ok(pauses[4] < pauses[2] && pauses[6] === PAUSE_JOINED);
});

test('论元子句：徒 8:30b αὐτοῦ ἀναγινώσκοντος … 是 30a ἤκουσεν 的宾语，连线上标「宾语」；以上点引出的直接引语标「引语」；框头仍是「从句」', () => {
  // 徒 8:30 προσδραμὼν δὲ ὁ Φίλιππος ἤκουσεν αὐτοῦ ἀναγινώσκοντος Ἠσαΐαν … καὶ εἶπεν· ἆρά γε γινώσκεις…（短语树照抄 Macula，略去无关成分）
  const surfaces: Array<[string, string]> = [
    ['ἤκουσεν', 'V-AAI-3S'], ['αὐτοῦ', 'P-GSM'], ['ἀναγινώσκοντος', 'V-PAP-GSM'], ['καὶ', 'CONJ'], ['εἶπεν·', 'V-2AAI-3S'], ['γινώσκεις', 'V-PAI-2S'],
  ];
  const tokens = surfaces.map(([surface, morph], i) => token(i + 1, surface, morph));
  const heard = node(1, 'cl', null, 'ADV-S-V-O');
  const reading = node(2, 'cl', 'o', 'S-V-O');
  const said = node(3, 'cl', null, 'ClCl');
  const question = node(4, 'cl', 'o', 'V-O');
  const syntax = syntaxOf([[1, 'v', [heard]], [2, 's', [heard, reading]], [3, 'v', [heard, reading]], [4, null, []], [5, 'v', [said]], [6, 'v', [said, question]]]);
  const texts: ClauseText[] = [{ bcv: 44007018, sub: 'a', translationSpan: 1, formatted: JSON.stringify([{ text: '听见' }]), paraTitle: null,
    renderings: [{ tokens: 'n44007018001', zh: '听见' }, { tokens: 'n44007018005', zh: '说' }], alternatives: [], sources: ['ai'], version: 0, literalness: 3 }];
  const data = buildDiagram({ title: '', isOT: false, tokens, variants: [], morphExpansion: () => null, syntax, texts, clauses: [
    clause('44007018a', 1, 1, { verbRange: 'n44007018001' }),
    clause('44007018b', 2, 3, { parentId: '44007018a', modifies: 'n44007018001', verbRange: 'n44007018003', subjectRange: 'n44007018002' }),
    clause('44007018c', 4, 5, { verbRange: 'n44007018005' }),
    clause('44007018d', 6, 6, { parentId: '44007018c', modifies: 'n44007018005', verbRange: 'n44007018006' }),
  ] });
  // 框头标签|说明行|连线上的标签
  const show = (id: string) => { const c = data.clauses.find((item) => item.id === id)!; return `${c.label}|${c.link}|${c.wireLabel}`; };
  assert.equal(show('44007018b'), '从句|作“听见”的宾语|宾语');
  assert.equal(show('44007018d'), '从句|“说”的内容|引语');
  assert.equal(data.clauses.find((item) => item.id === '44007018a')!.wireLabel, null);
});

test('定语与引文：徒 8:32b ἣν ἀνεγίνωσκεν 在名词短语里，标「定语」；αὕτη· 引出的经文 32c ὡς πρόβατον … ἤχθη 标「引语」，同一主干上的后续句（33b τὴν γενεὰν … διηγήσεται）也是引语，不算定语', () => {
  // 徒 8:32 ἡ δὲ περιοχὴ τῆς γραφῆς ἣν ἀνεγίνωσκεν ἦν αὕτη· ὡς πρόβατον … ἤχθη …；33b τὴν γενεὰν αὐτοῦ τίς διηγήσεται（短语树照抄 Macula，略去无关成分）
  const surfaces: Array<[string, string]> = [
    ['περιοχὴ', 'N-NSF'], ['γραφῆς', 'N-GSF'], ['ἣν', 'R-ASF'], ['ἀνεγίνωσκεν', 'V-IAI-3S'], ['ἦν', 'V-IAI-3S'], ['αὕτη·', 'D-NSF'],
    ['ὡς', 'ADV'], ['ἤχθη', 'V-API-3S'], ['τὴν', 'T-ASF'], ['γενεὰν', 'N-ASF'], ['διηγήσεται', 'V-FDI-3S'],
  ];
  const tokens = surfaces.map(([surface, morph], i) => token(i + 1, surface, morph));
  const top = node(1, 'cl', null, 'ClCl');
  const main = node(2, 'cl', 'adv', 'S-VC-P');
  const subject = node(3, 'np', 's', 'DetNP');
  const npCl = node(4, 'np', null, 'NP-CL');
  const relative = node(5, 'cl', null, 'O-V');
  const sheep = node(6, 'cl', null, 'sub-CL');
  const generation = node(7, 'cl', null, 'O-S-V');
  const syntax = syntaxOf([
    [1, null, [top, main, subject]], [2, null, [top, main, subject, npCl]], [3, 'o', [top, main, subject, npCl, relative]], [4, 'v', [top, main, subject, npCl, relative]],
    [5, 'vc', [top, main]], [6, 'p', [top, main]], [7, null, [top, sheep]], [8, 'v', [top, sheep]],
    [9, null, [generation]], [10, null, [generation]], [11, 'v', [generation]],
  ]);
  const data = buildDiagram({ title: '', isOT: false, tokens, variants: [], morphExpansion: () => null, syntax, texts: [], clauses: [
    clause('44007018a', 1, 6, { verbRange: 'n44007018005' }),
    clause('44007018b', 3, 4, { parentId: '44007018a', modifies: 'n44007018002', verbRange: 'n44007018004' }),
    clause('44007018c', 7, 8, { parentId: '44007018a', modifies: 'n44007018006', verbRange: 'n44007018008' }),
    clause('44007018d', 9, 11, { parentId: '44007018a', modifies: 'n44007018006', verbRange: 'n44007018011' }),
  ] });
  const wire = (id: string) => data.clauses.find((item) => item.id === id)!.wireLabel;
  assert.equal(wire('44007018b'), '定语');
  assert.equal(wire('44007018c'), '引语');
  assert.equal(wire('44007018d'), '引语');
  assert.ok(data.clauses.every((item) => item.label === '主句' || item.label === '从句'));
});

test('引语：徒 9:5c ὁ δέ 省去说话动词换人说话，指向 ὁ 的 5d ἐγώ εἰμι Ἰησοῦς 与后续的 6a ἀλλὰ ἀνάστηθι 都标「引语」，没有上点也算；5e ὃν σὺ διώκεις 仍是定语', () => {
  const surfaces: Array<[string, string]> = [
    ['ὁ', 'T-NSM'], ['δέ', 'CONJ'], ['ἐγώ', 'P-1NS'], ['εἰμι', 'V-PAI-1S'], ['Ἰησοῦς', 'N-NSM-P'], ['ὃν', 'R-ASM'], ['σὺ', 'P-2NS'], ['διώκεις·', 'V-PAI-2S'],
    ['ἀλλὰ', 'CONJ'], ['ἀνάστηθι', 'V-2AAM-2S'],
  ];
  const tokens = surfaces.map(([surface, morph], i) => token(i + 1, surface, morph));
  const data = buildDiagram({ title: '', isOT: false, tokens, variants: [], morphExpansion: () => null, texts: [], clauses: [
    clause('44007018a', 1, 2, { subjectRange: 'n44007018001' }),
    clause('44007018b', 3, 5, { parentId: '44007018a', modifies: 'n44007018001', verbRange: 'n44007018004' }),
    clause('44007018c', 6, 8, { parentId: '44007018b', modifies: 'n44007018005', verbRange: 'n44007018008' }),
    clause('44007018d', 9, 10, { parentId: '44007018a', modifies: 'n44007018001', verbRange: 'n44007018010' }),
  ] });
  const wire = (id: string) => data.clauses.find((item) => item.id === id)!.wireLabel;
  assert.equal(wire('44007018b'), '引语');
  assert.equal(wire('44007018c'), '定语');
  assert.equal(wire('44007018d'), '引语');
});

test('同位语：徒 8:38c 主语是 ἀμφότεροι，Macula 另标作主语的 ὅ τε Φίλιππος καὶ ὁ εὐνοῦχος 显示为同位语；与主语同一成分里没标进主语的词不算', () => {
  // κατέβησαν ἀμφότεροι εἰς τὸ ὕδωρ, ὅ τε Φίλιππος καὶ ὁ εὐνοῦχος（短语树照抄 Macula：ἀμφότεροι 是 adv，句末一串是 s）
  const surfaces: Array<[string, string]> = [
    ['κατέβησαν', 'V-2AAI-3P'], ['ἀμφότεροι', 'A-NPM'], ['εἰς', 'PREP'], ['τὸ', 'T-ASN'], ['ὕδωρ,', 'N-ASN'],
    ['ὅ', 'T-NSM'], ['τε', 'CONJ'], ['Φίλιππος', 'N-NSM-P'], ['καὶ', 'CONJ'], ['ὁ', 'T-NSM'], ['εὐνοῦχος', 'N-NSM'],
  ];
  const tokens = surfaces.map(([surface, morph], i) => token(i + 1, surface, morph));
  const c = node(1, 'cl', null, 'V-ADV-ADV-S');
  const pp = node(2, 'pp', 'adv', 'PrepNp');
  const both = node(3, 'np', 's', 'aNpaNp');
  const syntax = syntaxOf([[1, 'v', [c]], [2, 'adv', [c]], [3, null, [c, pp]], [4, null, [c, pp]], [5, null, [c, pp]],
    ...[6, 7, 8, 9, 10, 11].map((n): [number, string | null, SyntaxNode[]] => [n, null, [c, both]])]);
  const run = (subjectRange: string) => buildDiagram({ title: '', isOT: false, tokens, variants: [], morphExpansion: () => null, syntax, texts: [],
    clauses: [clause('44007018a', 1, 11, { verbRange: 'n44007018001', subjectRange })] }).clauses[0].chips
    .map((chip) => `${chip.role}:${chip.wordIds.map((id) => Number(id.slice(-3))).join(',')}`);
  assert.deepEqual(run('n44007018002'), ['v:1', 's:2', 'adv:3,4,5', 'appos:6,7,8,9,10,11']);
  // 同位语配给主语块（结构图用双线连起来）
  const chips = buildDiagram({ title: '', isOT: false, tokens, variants: [], morphExpansion: () => null, syntax, texts: [],
    clauses: [clause('44007018a', 1, 11, { verbRange: 'n44007018001', subjectRange: 'n44007018002' })] }).clauses[0].chips;
  assert.equal(chips[3].apposOf, 1);
  // 主语只标了 Φίλιππος 这类与 Macula 主语同一成分的情形：其余词不当同位语
  assert.ok(!run('n44007018008').some((chip) => chip.startsWith('appos')));
});

test('同位语：一个成分整个是 Macula 的同位结构（Np-Appos）时拆开成对，徒 8:28 宾语 τὸν προφήτην ＝ Ἠσαΐαν；带冠词分词这类定语部分不拆', () => {
  const surfaces: Array<[string, string]> = [['ἀνεγίνωσκεν', 'V-IAI-3S'], ['τὸν', 'T-ASM'], ['προφήτην', 'N-ASM'], ['Ἠσαΐαν', 'N-ASM-P']];
  const tokens = surfaces.map(([surface, morph], i) => token(i + 1, surface, morph));
  const c = node(1, 'cl', null, 'V-O');
  const appos = node(2, 'np', 'o', 'Np-Appos');
  const prophet = node(3, 'np', null, 'DetNP');
  const run = (second: SyntaxNode) => buildDiagram({ title: '', isOT: false, tokens, variants: [], morphExpansion: () => null, texts: [],
    syntax: syntaxOf([[1, 'v', [c]], [2, null, [c, appos, prophet]], [3, null, [c, appos, prophet]], [4, null, [c, appos, second]]]),
    clauses: [clause('44007018a', 1, 4, { verbRange: 'n44007018001' })] }).clauses[0].chips;
  const chips = run(node(4, 'np', null, 'NP'));
  assert.deepEqual(chips.map((chip) => `${chip.role}:${chip.wordIds.map((id) => Number(id.slice(-3))).join(',')}`), ['v:1', 'o:2,3', 'appos:4']);
  assert.equal(chips[2].apposOf, 1);
  assert.deepEqual(run(node(4, 'np', null, 'DetCL')).map((chip) => chip.role), ['v', 'o']);
});
