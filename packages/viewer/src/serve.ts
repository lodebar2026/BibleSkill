/**
 * 可编辑的缩进视图：本地 HTTP 服务（只监听 127.0.0.1）。
 *
 * 保存走 MCP 提交的同一套校验（editClauseAnalysis / submitTranslation），带乐观锁版本号；
 * 页面里嵌一个随机 token，API 要求 X-BS-Token 头，防止别的网页跨站写工作目录。
 * 编辑以整章为单位：拆分 / 合并会给本节子句重新编号，需要看到全章的 parentId 才能一起改。
 */
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  ConflictError,
  WorkFileStore,
  loadChapterViews,
  parseScriptureRange,
  type BibleDb,
  type ChapterView,
  type ClauseEntity,
  type ClauseText,
} from '@bs/core';
import { chapterReviewIssues, createDeps, editClauseAnalysis, submitTranslation, toSubmission, type Deps } from '@bs/mcp-server/service';
import { renderPage } from './page.js';

export type EditableChapter = ChapterView & { issues: Array<{ bcv: number; kind: string; message: string }> };

type ServeOptions = {
  db: BibleDb;
  store: WorkFileStore;
  chapters: Array<{ bookName: string; chapter: number }>;
  title: string;
  subtitle: string;
  script: string;
  port: number;
};

async function loadChapter(deps: Deps, bookName: string, chapter: number): Promise<EditableChapter> {
  const [view] = await loadChapterViews(deps.db, deps.store, parseScriptureRange(`${bookName} ${chapter}`));
  const issues = (await chapterReviewIssues(deps, bookName, chapter)).map(({ bcv, kind, message }) => ({ bcv, kind, message }));
  return { ...view, issues };
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function send(response: ServerResponse, status: number, payload: unknown, type = 'application/json; charset=utf-8'): void {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  response.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
}

type SaveBody = { bookName: string; chapter: number; expected: Record<string, number> };

export function serve(options: ServeOptions): void {
  const deps = createDeps(options.db, options.store);
  const token = randomBytes(16).toString('hex');
  const allowed = new Set(options.chapters.map(({ bookName, chapter }) => `${bookName}|${chapter}`));
  const checkChapter = (body: SaveBody) => {
    if (!allowed.has(`${body.bookName}|${body.chapter}`)) {
      throw new Error(`${body.bookName} ${body.chapter} 章不在本次打开的范围内`);
    }
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    try {
      if (request.method === 'GET' && url.pathname === '/') {
        const chapters = await Promise.all(options.chapters.map(({ bookName, chapter }) => loadChapter(deps, bookName, chapter)));
        send(response, 200, renderPage({
          title: options.title,
          subtitle: options.subtitle,
          data: { chapters, editable: true, token },
          script: options.script,
        }), 'text/html; charset=utf-8');
        return;
      }
      if (url.pathname === '/favicon.ico') {
        response.writeHead(204).end();
        return;
      }
      if (!url.pathname.startsWith('/api/')) {
        send(response, 404, { error: '没有这个地址' });
        return;
      }
      if (request.headers['x-bs-token'] !== token) {
        send(response, 403, { error: 'token 不对：请从 pnpm view --serve 打印的地址打开页面' });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/clauses') {
        const body = await readBody(request) as SaveBody & { clauses: ClauseEntity[] };
        checkChapter(body);
        const result = await editClauseAnalysis(deps, body.bookName, body.chapter, body.clauses, new Map(Object.entries(body.expected)));
        send(response, 200, { result, chapter: await loadChapter(deps, body.bookName, body.chapter) });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/translations') {
        const body = await readBody(request) as SaveBody & { texts: ClauseText[] };
        checkChapter(body);
        const bcvs = body.texts.map((text) => text.bcv);
        if (bcvs.length === 0) {
          throw new Error('没有要保存的译文');
        }
        const range = { ...parseScriptureRange(`${body.bookName} ${body.chapter}`), startBcv: Math.min(...bcvs), endBcv: Math.max(...bcvs) };
        const result = await submitTranslation(deps, range, body.texts.map(toSubmission), { expected: new Map(Object.entries(body.expected)), origin: 'human' });
        send(response, 200, { result, chapter: await loadChapter(deps, body.bookName, body.chapter) });
        return;
      }
      send(response, 404, { error: '没有这个接口' });
    } catch (error) {
      if (error instanceof ConflictError) {
        send(response, 409, { error: `${error.message}。文件已在别处改过，请刷新页面` });
      } else {
        send(response, 400, { error: (error as Error).message });
      }
    }
  });
  server.listen(options.port, '127.0.0.1', () => {
    process.stderr.write(`可编辑视图：http://127.0.0.1:${options.port}/   （Ctrl+C 退出）\n`);
  });
}
