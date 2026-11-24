import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { Token } from './db.js';
import { applyMorphOverride, findTokens, MORPH_OVERRIDES_FILE } from './morph-overrides.js';
import { WorkFileStore } from './store.js';

function token(id: string, surface: string, morph: string): Token {
  return {
    id, ref: '', bcv: 1030032, ord: 0, surface, after: ' ', translit: '', lemma: surface, strong: 'H5493G', morph, glossEn: '',
    glossZh: null, sense: null, editions: null, textType: '', variantNote: null, significant: false, naBracket: false,
  };
}

// 创 30:32 הָסֵר：Macula 标 Hiphil 不定式独立格，七十士译本读作命令式
const HASER = token('o010300320051', 'הָסֵ֨ר', 'HVhaa');

test('词法覆盖：有覆盖时换掉 morph，原标注与理由留在 morphOriginal、morphNote；与原标注相同或没有覆盖时原样返回', () => {
  const overrides = new Map([[HASER.id, { token: HASER.id, morph: 'HVhv2ms', note: '七十士译本作命令式' }]]);
  const changed = applyMorphOverride(HASER, overrides);
  assert.equal(changed.morph, 'HVhv2ms');
  assert.equal(changed.morphOriginal, 'HVhaa');
  assert.equal(changed.morphNote, '七十士译本作命令式');
  assert.equal(applyMorphOverride(HASER, new Map()), HASER);
  assert.equal(applyMorphOverride(HASER, new Map([[HASER.id, { token: HASER.id, morph: 'HVhaa', note: '' }]])), HASER);
});

test('词法覆盖文件：没有文件时为空；写入后按词 id 排序，改了文件下次读取就生效；--clear 删除', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bs-morph-'));
  const store = new WorkFileStore(dir);
  assert.equal(store.morphOverrides.current().size, 0);
  store.morphOverrides.set('o010300350011', 'HVhv2ms');
  store.morphOverrides.set(HASER.id, 'HVhv2ms', '七十士译本作命令式');
  assert.deepEqual(store.morphOverrides.list().map((item) => item.token), [HASER.id, 'o010300350011']);
  assert.equal(store.morphOverrides.current().get(HASER.id)?.note, '七十士译本作命令式');
  // 手工改文件：缓存按修改时间刷新
  await new Promise((resolve) => setTimeout(resolve, 20));
  await writeFile(path.join(dir, MORPH_OVERRIDES_FILE), JSON.stringify([{ token: HASER.id, morph: 'HVhaa' }]));
  assert.deepEqual([...store.morphOverrides.current().keys()], [HASER.id]);
  assert.equal(store.morphOverrides.current().get(HASER.id)?.note, '');
  store.morphOverrides.set(HASER.id, null);
  assert.equal(store.morphOverrides.current().size, 0);
  // 格式不对时报错，不悄悄用回原标注
  await writeFile(path.join(dir, MORPH_OVERRIDES_FILE), JSON.stringify([{ token: 'x', morph: '' }]));
  assert.throws(() => store.morphOverrides.current(), /格式不对/);
});

test('按字形找词：只比辅音 / 字母，不管元音与重音；同形多处时按 nth 取，也可直接给词 id', () => {
  const words = [token('o010300320011', 'אֶֽעֱבֹ֨ר', 'HVqi1cs'), HASER, token('o010300320099', 'הָסֵר', 'HVhaa')];
  assert.deepEqual(findTokens(words, 'הסר').map((item) => item.id), [HASER.id, 'o010300320099']);
  assert.deepEqual(findTokens(words, 'הסר', 2).map((item) => item.id), ['o010300320099']);
  assert.deepEqual(findTokens(words, 'הסר', 3), []);
  assert.deepEqual(findTokens(words, HASER.id), [HASER]);
  assert.deepEqual(findTokens([token('n44007018004', 'βασιλεὺς', 'N-NSM')], 'Βασιλευς').length, 1);
});
