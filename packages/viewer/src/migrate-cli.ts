#!/usr/bin/env node
/**
 * 补词格式迁移。
 *
 *   pnpm migrate:segments [--workdir <翻译工作目录>] [--dry-run]
 *
 * 旧译文里的补词以 `[ ]` 字符写在正文里；这里把它们拆成 styleName=added 的补词段（文字不变，对齐位置随之调整），
 * 不记修改历史。--dry-run 只统计不写入。工作目录的解析同 pnpm view。
 */
import { parseArgs } from 'node:util';
import { WorkFileStore, resolveConfig } from '@bs/core';
import { migrateSegments } from '@bs/mcp-server/service';

const { values } = parseArgs({
  options: { workdir: { type: 'string' }, 'dry-run': { type: 'boolean' } },
});

const config = resolveConfig({ ...process.env, ...(values.workdir ? { BS_WORKDIR: values.workdir } : {}) });
const apply = !values['dry-run'];
const result = await migrateSegments(new WorkFileStore(config.workdir), apply);
process.stderr.write(`${apply ? '已迁移' : '待迁移'} ${result.migrated} 条子句译文，涉及 ${result.chapters.length} 章（${config.workdir}）\n`);
for (const item of result.failed) {
  process.stderr.write(`  未迁移 ${item.clause}：${item.error}\n`);
}
