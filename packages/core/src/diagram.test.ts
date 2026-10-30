import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SyntaxNode, Token, TokenSyntax } from './db.js';
import { PAUSE_COORD, PAUSE_EMBED, PAUSE_FORCED, PAUSE_JOINED, buildDiagram, chipPauses, cognateInfinitive, greekMorph, hebrewStem, rangeLabel } from './diagram.js';
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
  const data = buildDiagram({ title: '使徒行传 7:18', isOT: false, clauses: [CLAUSES[0], { ...CLAUSES[1], logic }], texts: TEXTS, tokens: TOKENS, variants: [], notes: [], morphExpansion: () => null });
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
    variants: [], notes: [], morphExpansion: () => null, syntax, narrative: true });
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
    variants: [], notes: [], morphExpansion: () => null, syntax });
  const [verb, predicate] = data.clauses[0].chips;
  assert.equal(verb.role, 'v');
  assert.equal(predicate.role, 'p');
  // 优先断点（断在这些词之后）：嵌入短语之前（PAUSE_EMBED）、之后也就是 καί 之前（PAUSE_COORD）；没有必断处
  const cuts = predicate.pauses!.flatMap((pause, i) => (pause >= PAUSE_EMBED ? [`${words[i + 1]}:${pause}`] : []));
  assert.deepEqual(cuts, [`ἀγγέλου:${PAUSE_EMBED}`, `αὐτῷ:${PAUSE_COORD}`]);
  assert.ok(predicate.pauses!.every((pause) => pause < PAUSE_FORCED));
  assert.deepEqual(predicate.indents, [0, 0, 0, 1, 1, 1, 0, 0, 0]);
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
  const data = buildDiagram({ title: '', isOT: true, clauses: [entity], texts: [], tokens: words, variants: [], notes: [], morphExpansion: () => null, syntax });
  const [verb, place, object] = data.clauses[0].chips;
  assert.deepEqual([verb.role, place.role, object.role], ['v', 'adv', 'o']);
  // 并列的 וְ 前不另加强度：与只按重音算的结果相同
  assert.deepEqual(object.pauses, chipPauses(object.wordIds.map((wordId) => words.find((word) => word.id === wordId)!), true));
  assert.equal(object.indents, undefined);
});

test('嵌入：母句只含自身的词，嵌入处放占位符（同一块就放在块内，否则随被修饰词），连线指向占位符', () => {
  const nested = (subjectRange: string) => buildDiagram({
    title: '测试', isOT: false, texts: [], tokens: TOKENS, variants: [], notes: [], morphExpansion: () => null,
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

test('旧约前置：限定动词句里谓语前含名词性词的成分块标出；连接词、否定词、疑问代词、分词句不算；新约不标', () => {
  const ot = (word: number, surface: string, morph: string, after = ' '): Token => ({
    ...token(word, surface, morph), id: `o01001001${String(word).padStart(3, '0')}1`, bcv: 1001001, after,
  });
  const id = (n: number) => `o01001001${String(n).padStart(3, '0')}1`;
  // וְ אֶת־הָאָרֶץ לֹא נָתַן אֱלֹהִים
  const words = [ot(1, 'וְ', 'HC', ''), ot(2, 'אֶת', 'HTo', '־'), ot(3, 'הָ', 'HTd', ''), ot(4, 'אָרֶץ', 'HNcbsa'), ot(5, 'לֹא', 'HTn'),
    ot(6, 'נָתַן', 'HVqp3ms'), ot(7, 'אֱלֹהִים', 'HNcmpa')];
  const base = { ...clause('1001001a', 1, 7), firstWordId: id(1), lastWordId: id(7), verbRange: id(6), subjectRange: id(7) };
  const run = (entity: ClauseEntity, isOT = true) => buildDiagram({ title: '', isOT, clauses: [entity], texts: [], tokens: words, variants: [], notes: [], morphExpansion: () => null })
    .clauses[0].chips.map((chip) => `${chip.role ?? '-'}:${chip.wordIds.map((wordId) => Number(wordId.slice(-4, -1))).join(',')}${chip.fronted ? '!' : ''}`);
  assert.deepEqual(run({ ...base, type: 'QtlX' }), ['conj:1', '-:2,3,4,5!', 'v:6', 's:7']);
  // 否定词单独成块时不算前置
  assert.deepEqual(run({ ...base, firstWordId: id(5), type: 'QtlX' }).slice(0, 1), ['-:5']);
  // 分词句：成分在前是常序
  assert.ok(run({ ...base, type: 'Ptcp' }).every((chip) => !chip.endsWith('!')));
  // 疑问代词居首不算
  const what = [ot(1, 'וְ', 'HC', ''), ot(2, 'מָה', 'HPi'), ot(3, 'נָתַן', 'HVqp3ms'), ot(4, 'אֱלֹהִים', 'HNcmpa')];
  const asked = buildDiagram({ title: '', isOT: true, clauses: [{ ...base, type: 'QtlX', firstWordId: id(1), lastWordId: id(4), verbRange: id(3), subjectRange: id(4) }],
    texts: [], tokens: what, variants: [], notes: [], morphExpansion: () => null });
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
