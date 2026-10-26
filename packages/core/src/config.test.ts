import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_MODELS, parseModelSpec, resolveConfig } from './config.js';

test('模型写法：cli、模型、可选思考级别', () => {
  assert.deepEqual(parseModelSpec('claude:opus@high'), { cli: 'claude', model: 'opus', effort: 'high' });
  assert.deepEqual(parseModelSpec('agy:gemini-4-argon-medium'), { cli: 'agy', model: 'gemini-4-argon-medium', effort: undefined });
  assert.throws(() => parseModelSpec('gpt:x'), /模型写法不对/);
  assert.throws(() => parseModelSpec('claude:opus@huge'), /模型写法不对/);
});

test('config.json 的 models 缺项时用默认', () => {
  const workdir = mkdtempSync(path.join(tmpdir(), 'bs-config-'));
  try {
    writeFileSync(path.join(workdir, 'config.json'), JSON.stringify({ dataDb: 'bible.sqlite', models: { translate: 'claude:opus@high' } }));
    const config = resolveConfig({ BS_WORKDIR: workdir });
    assert.deepEqual(config.models, { analyze: DEFAULT_MODELS.analyze, translate: 'claude:opus@high' });
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
});
