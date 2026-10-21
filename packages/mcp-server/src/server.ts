#!/usr/bin/env node
/**
 * BibleSkill MCP server（stdio）。只用开放数据（STEPBible / Macula / UBS），见 README。
 *
 * 入参 schema 一律宽松（optional + loose），真正的校验在 handler 内，
 * 失败作为 isError 文本返回——理由见 args.ts。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BibleDb, WorkFileStore, findBookByName, resolveConfig } from '@bs/core';
import { z } from 'zod';
import { optionalString, resolveArray, resolveRange } from './args.js';
import {
  buildAnalysisBriefing,
  buildTranslationBriefing,
  consistencyReport,
  createDeps,
  getPassage,
  lookupLexicon,
  reviewReport,
  submitClauseAnalysis,
  submitTranslation,
  upsertGlossary,
  viewClauses,
  type Deps,
} from './service.js';

let deps: Deps | undefined;

function getDeps(): Deps {
  if (!deps) {
    const config = resolveConfig();
    deps = createDeps(new BibleDb(config.dataDb), new WorkFileStore(config.workdir), config.criticalText);
  }
  return deps;
}

function json(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

function text(value: string) {
  return { content: [{ type: 'text' as const, text: value }] };
}

const range = z.string().optional().describe("经文范围，如 '创 1'（整章）、'创 1:1-5'、'约 3:16'。中英文书名与缩写均可。");
const loose = (shape: z.ZodRawShape) => z.object(shape).loose();

const server = new McpServer(
  { name: 'bibleskill', version: '0.1.0' },
  {
    instructions:
      '圣经原文直译工作流：analyze（子句切分）→ translate（中文直译）。每步先调 build_*_briefing，再 submit_*。'
      + '数据来自 STEPBible（TAHOT/TAGNT）与 Macula；词 id 只用 briefing 里给出的 id。',
  },
);

server.registerTool('get_passage', {
  description: '取经文逐词数据（TSV：id、原文、词条、扩展 Strong、词法、英文语境译词、Macula 中文简义、是否实词）与词法说明、异文。',
  inputSchema: loose({ range }),
  annotations: { readOnlyHint: true },
}, async (args) => json(getPassage(getDeps(), resolveRange(args))));

server.registerTool('lookup_lexicon', {
  description: '查词典：UBS 中文词典 + STEPBible 简明词典（TBESH/TBESG）。给 strong（如 H7225G、G0976）或 tokenId。',
  inputSchema: loose({
    strong: z.string().optional(),
    tokenId: z.string().optional().describe('词 id，如 o010010010012'),
  }),
  annotations: { readOnlyHint: true },
}, async (args) => json(lookupLexicon(getDeps(), {
  strong: optionalString(args, ['strong', 'strongs', 'strongNumber']),
  tokenId: optionalString(args, ['tokenId', 'wordId', 'id']),
})));

server.registerTool('build_analysis_briefing', {
  description: '子句切分任务简报：逐词数据、Macula 子句种子（第二意见，不是标准答案）、已有分析与规则。',
  inputSchema: loose({ range }),
  annotations: { readOnlyHint: true },
}, async (args) => json(await buildAnalysisBriefing(getDeps(), resolveRange(args))));

server.registerTool('submit_clause_analysis', {
  description:
    '提交子句切分。clauses 为 JSON 数组，每项 {id, firstWordId, lastWordId, type, parentId, modifies, '
    + 'subjectRange?, verbRange?, verbPerson?, verbStem?, br?, alone?, status?, alternatives?, seedDiff?, sources?, note?}。'
    + '按节校验，通过的节写入 clause_entities.json，未通过的节在 errors 返回。',
  inputSchema: loose({ range, clauses: z.any().optional() }),
}, async (args) => json(await submitClauseAnalysis(getDeps(), resolveRange(args), resolveArray(args, ['clauses', 'clauseEntities', 'items']))));

server.registerTool('build_translation_briefing', {
  description: '直译任务简报：缩进结构、子句与实词、每个实词义项的术语表条目与既有译法、前文译文。',
  inputSchema: loose({ range }),
  annotations: { readOnlyHint: true },
}, async (args) => json(await buildTranslationBriefing(getDeps(), resolveRange(args))));

server.registerTool('submit_translation', {
  description:
    '提交直译。translations 为 JSON 数组，每个子句一项 {clauseId, span, text, renderings:[{tokens, zh, note?}], paraTitle?}。'
    + '按节校验结构与用词统一；未通过的节在 errors / consistency 返回，需整节重提。',
  inputSchema: loose({ range, translations: z.any().optional() }),
}, async (args) => json(await submitTranslation(getDeps(), resolveRange(args), resolveArray(args, ['translations', 'clauses', 'items']))));

server.registerTool('view_clauses', {
  description: '以缩进树形文本查看子句结构与已有直译。',
  inputSchema: loose({ range }),
  annotations: { readOnlyHint: true },
}, async (args) => text(await viewClauses(getDeps(), resolveRange(args))));

server.registerTool('upsert_glossary', {
  description:
    '写入术语表。entries 为 JSON 数组，每项 {strong, zh, level: locked|preferred, senseKey?, lemma?, note?, scope?}。'
    + 'locked 必须照用（专名宜 locked）；preferred 为默认译法，偏离须写理由。',
  inputSchema: loose({ entries: z.any().optional() }),
}, async (args) => json(await upsertGlossary(getDeps(), resolveArray(args, ['entries', 'terms', 'glossary']))));

server.registerTool('consistency_report', {
  description: '用词统一报告：一词多译（同一义项多种译法）与多词一译（不同原文实词同一译法）。range 给出书卷即可；不给则统计全部。',
  inputSchema: loose({ range }),
  annotations: { readOnlyHint: true },
}, async (args) => {
  const raw = optionalString(args, ['range', 'book', 'passage', 'reference', 'ref']);
  if (!raw) {
    return json(await consistencyReport(getDeps(), null));
  }
  const book = findBookByName(raw);
  return json(await consistencyReport(getDeps(), book ? resolveRange({ range: `${book.name} 1` }) : resolveRange({ range: raw })));
});

server.registerTool('review_report', {
  description:
    '审校报告：按当前子句分析与术语表复查已写入的译文，列出需要整节改译的范围（retranslate：译文与子句对不上、未处理的争议、违反术语表）'
    + '和需要人工复核的子句（needs-review / ambiguous）。range 给书卷名审整卷，给经文范围只审该范围，不给审全部。',
  inputSchema: loose({ range }),
  annotations: { readOnlyHint: true },
}, async (args) => {
  const raw = optionalString(args, ['range', 'book', 'passage', 'reference', 'ref']);
  if (!raw) {
    return json(await reviewReport(getDeps(), {}));
  }
  const book = findBookByName(raw);
  return json(await reviewReport(getDeps(), book ? { books: new Set([book.name]) } : { range: resolveRange({ range: raw }) }));
});

await server.connect(new StdioServerTransport());
