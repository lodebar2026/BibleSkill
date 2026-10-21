#!/usr/bin/env node
/**
 * 缩进查看。
 *
 *   pnpm view 创 1:1-5 [--workdir <翻译工作目录>]            终端文本
 *   pnpm view 创 1 --html out.html [--workdir <目录>]        单文件 HTML（只读）
 *   pnpm view 创 1 --serve [--port 4310] [--workdir <目录>]  本地服务，可在页面里编辑（按整章打开）
 *
 * 工作目录与数据库的解析同 MCP server：--workdir / BS_WORKDIR / 当前目录，数据库取 config.json 或 BS_DATA_DB。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { renderClausesText } from '@bs/clause-tree';
import { BibleDb, WorkFileStore, chapterFromBcv, loadChapterViews, formattedMarkup, parseScriptureRange, resolveConfig } from '@bs/core';
import { renderPage } from './page.js';
import { serve } from './serve.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    workdir: { type: 'string' },
    html: { type: 'string' },
    serve: { type: 'boolean' },
    port: { type: 'string', default: '4310' },
  },
});

if (positionals.length === 0) {
  process.stderr.write('用法: pnpm view <经文范围> [--workdir 目录] [--html 输出.html | --serve [--port 4310]]\n');
  process.exit(1);
}

const range = parseScriptureRange(positionals.join(' '));
const config = resolveConfig({ ...process.env, ...(values.workdir ? { BS_WORKDIR: values.workdir } : {}) });
const db = new BibleDb(config.dataDb);
const store = new WorkFileStore(config.workdir);
const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'browser.bundle.js');

if (values.serve) {
  const chapters = [];
  for (let chapter = chapterFromBcv(range.startBcv); chapter <= chapterFromBcv(range.endBcv); chapter += 1) {
    chapters.push({ bookName: range.bookName, chapter });
  }
  const firstChapter = chapters[0].chapter;
  const lastChapter = chapters.at(-1)!.chapter;
  serve({
    db,
    store,
    chapters,
    title: `${range.bookName} ${firstChapter === lastChapter ? firstChapter : `${firstChapter}-${lastChapter}`}`,
    subtitle: `子句缩进视图（可编辑） · ${config.workdir}`,
    script: readFileSync(scriptPath, 'utf8'),
    port: Number(values.port),
  });
} else if (values.html) {
  const views = await loadChapterViews(db, store, range);
  const html = renderPage({
    title: `${range.bookName} ${positionals.join(' ').replace(/^\S+\s*/, '')}`.trim(),
    subtitle: `子句缩进视图 · ${config.workdir}`,
    data: { chapters: views },
    script: readFileSync(scriptPath, 'utf8'),
  });
  writeFileSync(values.html, html);
  process.stderr.write(`已写入 ${path.resolve(values.html)}\n`);
  db.close();
} else {
  const views = await loadChapterViews(db, store, range);
  for (const view of views) {
    process.stdout.write(`${view.bookName} ${view.chapter} 章\n\n`);
    if (view.clauses.length === 0) {
      process.stdout.write('范围内还没有子句分析\n\n');
      continue;
    }
    const byKey = new Map(view.texts.map((text) => [`${text.bcv}${text.sub}`, text]));
    const clauses = view.clauses.map((clause) => {
      const text = byKey.get(clause.id);
      return { ...clause, translation: text && text.translationSpan > 0 ? formattedMarkup(text.formatted) : null, alternatives: text?.alternatives };
    });
    const paragraphStarts = new Set(view.texts.filter((text) => text.paraTitle !== null).map((text) => `${text.bcv}${text.sub}`));
    process.stdout.write(`${renderClausesText(clauses, view.words, { leftToRight: !view.isOT, paragraphStarts })}\n\n`);
  }
  db.close();
}
