#!/usr/bin/env node
/**
 * 词法覆盖：改掉数据库里某个词的词法标注，写进工作目录的 morph-overrides.json（见 core/morph-overrides.ts）。
 *
 *   pnpm morph 创 30:32 הסר HVhv2ms --note "七十士译本作命令式；35 节由拉班动手"   设置
 *   pnpm morph 创 30:32 הסר --clear                                                 删除
 *   pnpm morph --list                                                                列出全部
 *
 * 词可写词 id 或字形（只比辅音 / 字母）；一节里同形的词有几个时用 --nth 指定第几个。
 * 改完重新生成结构图、重新取 briefing 即生效；MCP server 不必重启。
 */
import { parseArgs } from 'node:util';
import { BibleDb, WorkFileStore, findTokens, parseScriptureRange, resolveConfig } from '@bs/core';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    workdir: { type: 'string' },
    note: { type: 'string', default: '' },
    nth: { type: 'string' },
    clear: { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
  },
});

const config = resolveConfig({ ...process.env, ...(values.workdir ? { BS_WORKDIR: values.workdir } : {}) });
const db = new BibleDb(config.dataDb);
const store = new WorkFileStore(config.workdir);
const fail = (message: string): never => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};
const describe = (code: string) => code.split('/').map((part) => db.morphExpansion(part)?.replace(/\b[A-Za-z]+=/g, '').replace(/\s*;\s*/g, '; ') ?? '？').join(' / ');

if (values.list) {
  const list = store.morphOverrides.list();
  const tokens = db.tokensByIds(list.map((item) => item.token));
  for (const item of list) {
    const token = tokens.get(item.token);
    process.stdout.write(`${token?.ref ?? '?'} ${item.token} ${token?.surface ?? '?'}  ${item.morph}${item.note ? `  ${item.note}` : ''}\n`);
  }
  process.exit(0);
}

// 最后一个位置参数之前的是经节、词；设置时最后一个是新词法
const args = [...positionals];
const morph = values.clear ? null : args.pop();
const word = args.pop();
if (!word || args.length === 0 || (!values.clear && !morph)) {
  fail('用法: pnpm morph <经节> <词或词 id> <新词法> [--note 理由] [--nth N] [--workdir 目录]\n      pnpm morph <经节> <词或词 id> --clear\n      pnpm morph --list');
}
const range = parseScriptureRange(args.join(' '));
const verse = db.tokensInRange(range.startBcv, range.endBcv);
const found = findTokens(verse, word!, values.nth ? Number(values.nth) : undefined);
if (found.length === 0) {
  fail(`${args.join(' ')} 里找不到 ${word}`);
}
if (found.length > 1) {
  fail(`${word} 在这节出现 ${found.length} 次，用 --nth 或词 id 指定：\n${found.map((token, i) => `  ${i + 1}. ${token.id} ${token.surface} ${token.morph}`).join('\n')}`);
}
const token = found[0];
const original = token.morphOriginal ?? token.morph;
if (morph) {
  const unknown = morph.split('/').filter((part) => db.morphExpansion(part) === null);
  if (unknown.length > 0) {
    fail(`数据库里没有词法代码 ${unknown.join('、')}（旧约如 HVhv2ms、新约如 V-AAM-2S）`);
  }
  if (morph === original) {
    store.morphOverrides.set(token.id, null);
    process.stdout.write(`${token.id} ${token.surface} 与原标注 ${original} 相同，已删除覆盖\n`);
  } else {
    store.morphOverrides.set(token.id, morph, values.note);
    process.stdout.write(`${token.id} ${token.surface}\n  原标注 ${original}：${describe(original)}\n  改为   ${morph}：${describe(morph)}\n`);
  }
} else {
  store.morphOverrides.set(token.id, null);
  process.stdout.write(`${token.id} ${token.surface} 已删除覆盖，恢复 ${original}\n`);
}
