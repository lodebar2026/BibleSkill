#!/usr/bin/env node
/**
 * 修改历史。
 *
 *   pnpm revisions import <历史.jsonl> [--workdir <翻译工作目录>]
 *
 * 导入别处的译文修改历史（每行一个 JSON：{ref 或 bcv, sub?, before, after, time?}，before/after 为改前改后的纯文本，
 * 可以按子句也可以按整节），写进各章的 history.jsonl（origin = import），之后用 bible-learn skill 从中学习术语偏好与风格。
 * 工作目录的解析同 pnpm view。
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { WorkFileStore, parseScriptureRange, resolveConfig } from '@bs/core';
import { importRevisions, type ImportLine } from '@bs/mcp-server/service';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { workdir: { type: 'string' } },
});

const [command, file] = positionals;
if (command !== 'import' || !file) {
  process.stderr.write('用法: pnpm revisions import <历史.jsonl> [--workdir 目录]\n');
  process.exit(1);
}

const config = resolveConfig({ ...process.env, ...(values.workdir ? { BS_WORKDIR: values.workdir } : {}) });
const lines: ImportLine[] = readFileSync(file, 'utf8').split('\n').filter((line) => line.trim()).map((line, index) => {
  const raw = JSON.parse(line) as { ref?: string; bcv?: number; sub?: string; before?: unknown; after?: unknown; time?: string };
  const bcv = raw.bcv ?? (raw.ref ? parseScriptureRange(raw.ref).startBcv : undefined);
  if (!bcv || typeof raw.before !== 'string' || typeof raw.after !== 'string') {
    throw new Error(`第 ${index + 1} 行要有 ref 或 bcv，以及字符串 before、after`);
  }
  return { bcv, sub: raw.sub, before: raw.before, after: raw.after, time: raw.time };
});
const result = await importRevisions(new WorkFileStore(config.workdir), lines);
process.stderr.write(`已导入 ${result.written} 条，涉及 ${result.chapters.length} 章（${config.workdir}）\n`);
