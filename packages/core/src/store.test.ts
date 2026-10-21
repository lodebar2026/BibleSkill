import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { effectiveClauseOrder, type ClauseText } from './schemas.js';
import { WorkFileStore, parseStyle } from './store.js';

const BCV = 1001001;

function text(sub: string, value: string, zh: string): ClauseText {
  return {
    bcv: BCV, sub, translationSpan: 1, formatted: JSON.stringify([{ text: value }]), paraTitle: null,
    renderings: [{ tokens: 'o010010010021', zh }], alternatives: [], sources: ['ai'], version: 0,
  };
}

async function tempStore(): Promise<WorkFileStore> {
  return new WorkFileStore(await mkdtemp(path.join(tmpdir(), 'bs-store-')));
}

test('整节替换只把有变化的子句记进 history.jsonl，并带上来源', async () => {
  const store = await tempStore();
  await store.replaceClauseTextsForVerses('创世记', 1, new Set([BCV]), [text('a', '起初', '起初'), text('b', '神创造', '创造')]);
  await store.replaceClauseTextsForVerses('创世记', 1, new Set([BCV]), [text('a', '起初', '起初'), text('b', '神造了', '造')], undefined, 'human');
  await store.replaceClauseTextsForVerses('创世记', 1, new Set([BCV]), [text('a', '起初', '起初')], undefined, 'human');
  const history = await store.readHistory('创世记', 1);
  assert.deepEqual(history.map((entry) => [entry.origin, entry.sub, entry.before === null, entry.after === null]), [
    ['ai', 'a', true, false],
    ['ai', 'b', true, false],
    ['human', 'b', false, false],
    ['human', 'b', false, true],
  ]);
});

test('style.md 的 frontmatter 选项与正文', () => {
  const style = parseStyle('---\nclauseOrder: source  # 保留原文语序\n---\n## 用语\n- 用现代口语词\n');
  assert.deepEqual(style.options, { clauseOrder: 'source', literalness: 2 });
  assert.equal(style.text, '## 用语\n- 用现代口语词');
  assert.deepEqual(parseStyle('只有正文').options, { clauseOrder: 'fluent', literalness: 2 });
  assert.throws(() => parseStyle('---\nclauseOrder: maybe\n---\n'), /选项不对/);
});

test('style.md 的翻译档位', () => {
  assert.equal(parseStyle('---\nliteralness: 4  # 意义对等\n---\n').options.literalness, 4);
  assert.throws(() => parseStyle('---\nliteralness: 0\n---\n'), /选项不对/);
  assert.throws(() => parseStyle('---\nliteralness: 6\n---\n'), /选项不对/);
  const order = (text: string) => effectiveClauseOrder(parseStyle(text).options);
  assert.equal(order('---\nliteralness: 1\nclauseOrder: fluent\n---\n'), 'source');
  assert.equal(order('---\nliteralness: 3\nclauseOrder: source\n---\n'), 'source');
  assert.equal(order('---\nliteralness: 5\nclauseOrder: source\n---\n'), 'fluent');
});

test('terms.yaml 合并条目时保留注释', async () => {
  const store = await tempStore();
  const file = path.join(store.projectRoot, 'terms.yaml');
  await writeFile(file, '# 我的术语偏好\n- lemma: עָבַד  # 服事 / 事奉\n  zh: 事奉\n');
  await store.upsertTermPreferences([
    { lemma: 'עָבַד', zh: '服事', avoid: ['事奉'] },
    { lemma: 'לָקַח', strong: 'H3947', zh: '取', avoid: [] },
  ]);
  const raw = await readFile(file, 'utf8');
  assert.match(raw, /# 我的术语偏好/);
  assert.match(raw, /# 服事 \/ 事奉/);
  assert.match(raw, /avoid: \[ 事奉 \]/);
  assert.deepEqual((await store.readTermPreferences()).map((item) => item.zh), ['服事', '取']);

  // 带后缀的 Strong 并进已有的基本号条目，avoid 取并集
  await store.upsertTermPreferences([{ lemma: 'לָקַח', strong: 'H3947G', zh: '取', avoid: ['拿'] }]);
  await store.upsertTermPreferences([{ lemma: 'לָקַח', strong: 'H3947G', zh: '取', avoid: ['带'] }]);
  const merged = await store.readTermPreferences();
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[1], { lemma: 'לָקַח', strong: 'H3947', zh: '取', avoid: ['拿', '带'] });
});
