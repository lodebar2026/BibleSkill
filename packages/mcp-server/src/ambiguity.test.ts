import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SeedClause, Token } from '@bs/core';
import { ambiguityHints } from './ambiguity.js';

const BCV = 1030033;

function token(word: number, surface: string, morph: string, strong: string, lemma = ''): Token {
  return {
    id: `o01030033${String(word).padStart(3, '0')}1`, ref: `Gen.30.33#${word}`, bcv: BCV, ord: word - 1,
    surface, after: ' ', translit: '', lemma, strong, morph, glossEn: '',
    glossZh: null, sense: null, editions: null, textType: 'L', variantNote: null, significant: false, naBracket: false,
  };
}

function seed(predicate: Token, subject: Token[] = []): SeedClause {
  return {
    seedId: predicate.id, bcvFirst: BCV, bcvLast: BCV, parentSeedId: null, rule: null, role: null, attributive: false,
    predicateToken: predicate.id, subjectTokens: subject.map((item) => item.id), tokens: [predicate.id],
  };
}

function hints(tokens: Token[], seeds: SeedClause[] = []): string[] {
  return ambiguityHints(new Map([[BCV, tokens]]), seeds) ?? [];
}

// 创 30:33 的骨架：作证 / כִּי 你来……面前（athnach）/ 凡……是偷的
const answer = token(1, 'עָֽנְתָה', 'HVqq3fs', 'H6030B');
const ki = token(2, 'כִּֽי', 'HTc', 'H3588A');
const come = token(3, 'תָב֥וֹא', 'HVqi2ms', 'H0935G', 'בּוֹא');
const face = token(4, 'פָנֶ֑י', 'HNcmpc', 'H6440L');
const stolen = token(5, 'גָּנ֥וּב', 'HVqsmsa', 'H1589');

test('athnach 前半节末尾的 כִּי 从句提示可改挂下半节', () => {
  const result = hints([answer, ki, come, face, stolen]);
  assert.ok(result.some((hint) => hint.includes('כִּֽי') && hint.includes('改挂下半节')));
});

test('下半节以 wayyiqtol 接续叙事时不提示', () => {
  const said = token(5, 'יֹּאמְרוּ', 'HVqw3mp', 'H0559');
  assert.ok(!hints([answer, ki, come, face, said]).some((hint) => hint.includes('改挂下半节')));
});

test('前缀式 2ms/3fs 同形：没有明示主语才提示', () => {
  assert.ok(hints([answer, ki, come, face, stolen]).some((hint) => hint.includes('תָב֥וֹא') && hint.includes('2ms 与 3fs')));
  const subject = token(6, 'צִדְקָתִ', 'HNcfsc', 'H6666');
  assert.ok(!hints([come, subject], [seed(come, [subject])]).some((hint) => hint.includes('2ms 与 3fs')));
});

test('Hiphil 不定式独立式与祈使式同形', () => {
  const remove = token(1, 'הָסֵ֨ר', 'HVhaa', 'H5493G', 'סוּר');
  assert.ok(hints([remove]).some((hint) => hint.includes('Hiphil 不定式独立式与阳性单数祈使式同形')));
});

test('中空动词 Qal 完成式与分词同形，不含 היה', () => {
  const returned = token(1, 'שָׁ֣בָה', 'HVqp3fs', 'H7725', 'שׁוּב');
  const was = token(2, 'הָיָה', 'HVqp3ms', 'H1961', 'הָיָה');
  const result = hints([returned, was]);
  assert.equal(result.filter((hint) => hint.includes('中空动词')).length, 1);
  assert.ok(result[0].includes('שָׁ֣בָה'));
});

test('新约不出线索', () => {
  const greek = { ...come, id: 'n44007016002' };
  assert.equal(ambiguityHints(new Map([[BCV, [greek]]]), []), undefined);
});
