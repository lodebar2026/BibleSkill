#!/usr/bin/env node
/**
 * 原文结构图。
 *
 *   pnpm view 创 1:1-5 --diagram out.html [--workdir <翻译工作目录>]   单文件交互 HTML，旁边写共用的 diagram.css、diagram.js
 *
 * 工作目录与数据库的解析同 MCP server：--workdir / BS_WORKDIR / 当前目录，数据库取 config.json 或 BS_DATA_DB。
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { DIAGRAM_ASSETS, renderDiagramPage } from '@bs/clause-tree';
import { BibleDb, WorkFileStore, loadDiagram, parseScriptureRange, resolveConfig } from '@bs/core';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    workdir: { type: 'string' },
    diagram: { type: 'string' },
  },
});

if (positionals.length === 0 || !values.diagram) {
  process.stderr.write('用法: pnpm view <经文范围> --diagram 输出.html [--workdir 目录]\n');
  process.exit(1);
}

const range = parseScriptureRange(positionals.join(' '));
const config = resolveConfig({ ...process.env, ...(values.workdir ? { BS_WORKDIR: values.workdir } : {}) });
const db = new BibleDb(config.dataDb);
const store = new WorkFileStore(config.workdir);

const data = await loadDiagram(db, store, range);
if (data.clauses.length === 0) {
  process.stderr.write(`${data.title} 还没有子句分析\n`);
  process.exit(1);
}
writeFileSync(values.diagram, renderDiagramPage(data, `结构以子句分析为准 · ${config.workdir}`));
for (const [name, content] of Object.entries(DIAGRAM_ASSETS)) {
  writeFileSync(path.join(path.dirname(path.resolve(values.diagram)), name), content);
}
process.stderr.write(`已写入 ${path.resolve(values.diagram)}\n`);
db.close();
