#!/usr/bin/env node
/**
 * 用扩展配置里声明的 NA28 原文工具（ext.json 的 criticalText）逐章取新约原文，存成本地 JSON，供 data:build 挑主干词行。
 *
 *   node scripts/fetch-critical-text.mjs [--ext ~/.config/bibleskill/ext.json] [--out data/critical-text.json]
 *   pnpm data:build … --critical-text data/critical-text.json
 *
 * 工具按 { range: '<书名> <章>', ...criticalText.args } 调用，返回 `bcv,经文` 的 CSV（首行表头）。
 * 输出文件含受版权保护的原文，只留在本机（已在 .gitignore 里），不进仓库、不分发。
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { listBooks } from '../packages/core/dist/index.js';

const { values } = parseArgs({
  options: {
    ext: { type: 'string', default: path.join(homedir(), '.config/bibleskill/ext.json') },
    out: { type: 'string', default: 'data/critical-text.json' },
  },
});

const ext = JSON.parse(readFileSync(values.ext, 'utf8'));
const { server: name, tool, args = {} } = ext.criticalText ?? {};
const server = name ? ext.mcpServers?.[name] : undefined;
if (!server || !tool) {
  console.error(`${values.ext} 里没有 criticalText（{"server", "tool", "args"}）或对应的 mcpServers 配置`);
  process.exit(1);
}

// 扩展的工作目录（${EXT_DIR}、${WORKDIR}）给一个临时目录：这里只读原文，不留下文件
const scratch = mkdtempSync(path.join(tmpdir(), 'bibleskill-critical-'));
const resolved = JSON.parse(JSON.stringify(server).replaceAll('${EXT_DIR}', scratch).replaceAll('${WORKDIR}', scratch));
const transport = new StdioClientTransport({
  command: resolved.command, args: resolved.args ?? [], env: { ...process.env, ...resolved.env }, cwd: scratch, stderr: 'ignore',
});
const client = new Client({ name: 'bibleskill-fetch-critical-text', version: '0' });
await client.connect(transport);

/** `bcv,经文` CSV：经文含逗号时整段加引号，引号写成 ""。 */
function parseRows(text) {
  const rows = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^(\d{7,8}),(.*)$/);
    if (match) {
      const quoted = match[2].match(/^"(.*)"$/);
      rows[match[1]] = quoted ? quoted[1].replaceAll('""', '"') : match[2];
    }
  }
  return rows;
}

const verses = {};
try {
  for (const book of listBooks().filter((item) => item.id >= 40)) {
    let count = 0;
    for (let chapter = 1; ; chapter += 1) {
      const result = await client.callTool({ name: tool, arguments: { range: `${book.name} ${chapter}`, ...args } });
      const rows = result.isError ? {} : parseRows(result.content.map((item) => item.text ?? '').join('\n'));
      if (Object.keys(rows).length === 0) {
        break;
      }
      Object.assign(verses, rows);
      count += Object.keys(rows).length;
    }
    process.stderr.write(`${book.name} ${count} 节\n`);
  }
} finally {
  await client.close();
  rmSync(scratch, { recursive: true, force: true });
}
writeFileSync(values.out, `${JSON.stringify(verses)}\n`);
process.stderr.write(`已写入 ${path.resolve(values.out)}（${Object.keys(verses).length} 节）\n`);
