#!/usr/bin/env node
/**
 * BibleSkill MCP server（stdio）。只用开放数据（STEPBible / Macula / UBS），见 README。
 *
 * 入参 schema 一律宽松（optional + loose），真正的校验在 handler 内，
 * 失败作为 isError 文本返回——理由见 args.ts。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BibleDb, HISTORY_ORIGINS, WorkFileStore, findBookByName, resolveConfig, type HistoryOrigin, type ScriptureRange } from '@bs/core';
import { z } from 'zod';
import { optionalString, resolveArray, resolveRange } from './args.js';
import {
  buildAnalysisBriefing,
  buildTranslationBriefing,
  consistencyReport,
  createDeps,
  getPassage,
  lookupLexicon,
  replaceRendering,
  renderDiagram,
  reviewReport,
  revisionReport,
  submitClauseAnalysis,
  submitTranslation,
  updateStyle,
  updateTermPreferences,
  upsertGlossary,
  upsertRules,
  viewClauses,
  type Deps,
} from './service.js';

let deps: Deps | undefined;

function getDeps(): Deps {
  if (!deps) {
    const config = resolveConfig();
    deps = createDeps(new BibleDb(config.dataDb), new WorkFileStore(config.workdir), config.criticalText, config.models);
  }
  return deps;
}

function json(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] };
}

function text(value: string) {
  return { content: [{ type: 'text' as const, text: value }] };
}

/** range 可以是书卷名（整卷）或经文范围；不给为全部。 */
function bookOrRange(args: Record<string, unknown>): { range?: ScriptureRange; books?: Set<string> } {
  const raw = optionalString(args, ['range', 'book', 'passage', 'reference', 'ref']);
  if (!raw) {
    return {};
  }
  const book = findBookByName(raw);
  return book ? { books: new Set([book.name]) } : { range: resolveRange({ range: raw }) };
}

const range = z.string().optional().describe("经文范围，如 '创 1'（整章）、'创 1:1-5'、'约 3:16'。中英文书名与缩写均可。");
const loose = (shape: z.ZodRawShape) => z.object(shape).loose();

const server = new McpServer(
  { name: 'bibleskill', version: '0.1.0' },
  {
    instructions:
      '圣经原文中文翻译工作流：analyze（子句切分）→ translate（按工作目录设定的档位翻译，1 逐字…2 直译…5 意译，见 briefing 的 approach）。每步先调 build_*_briefing，再 submit_*。'
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
    '提交子句切分。clauses 为 JSON 数组，每项 {id, firstWordId, lastWordId, type（仅旧约）, parentId, modifies, '
    + 'subjectRange?, verbRange?, verbPerson?, verbStem?, br?, alone?, status?, alternatives?, seedDiff?, sources?, note?}。'
    + '按节校验，通过的节写入 clause_entities.json，未通过的节在 errors 返回。',
  inputSchema: loose({ range, clauses: z.any().optional() }),
}, async (args) => json(await submitClauseAnalysis(getDeps(), resolveRange(args), resolveArray(args, ['clauses', 'clauseEntities', 'items']))));

server.registerTool('build_translation_briefing', {
  description: '翻译任务简报：翻译档位（approach）、缩进结构、子句与实词、每个实词义项的术语表条目与既有译法、前文译文。',
  inputSchema: loose({ range }),
  annotations: { readOnlyHint: true },
}, async (args) => json(await buildTranslationBriefing(getDeps(), resolveRange(args))));

server.registerTool('submit_translation', {
  description:
    '提交译文。translations 为 JSON 数组，每个子句一项 {clauseId, span, text, renderings:[{tokens, zh, note?}], supplied?:[{text, note}], paraTitle?}。'
    + 'text 里补出的词用 [ ] 标出（第 4、5 档不用），supplied 给补词写说明。'
    + '按节校验结构与用词统一；未通过的节在 errors / consistency 返回，需整节重提。',
  inputSchema: loose({ range, translations: z.any().optional() }),
}, async (args) => json(await submitTranslation(getDeps(), resolveRange(args), resolveArray(args, ['translations', 'clauses', 'items']))));

server.registerTool('view_clauses', {
  description: '以缩进树形文本查看子句结构与已有译文。',
  inputSchema: loose({ range }),
  annotations: { readOnlyHint: true },
}, async (args) => text(await viewClauses(getDeps(), resolveRange(args))));

server.registerTool('render_diagram', {
  description:
    '生成原文结构图（单文件交互 HTML，写到工作目录的 图示/ 下）：按子句分析分层画出主句、从句与挂接关系，点开看词义、要点与词典。'
    + 'annotations 为 JSON 数组，每个子句一项 {clauseId, label?（子句功能，如 时间状语从句）, link?（与母句的关系，如 当…时、直到、修饰“王”）, '
    + 'gist?（中文大意）, notes?:[要点]}，按 clauseId 存进 diagram.json，之后重画沿用；不给则只用已存的说明。open: true 时用浏览器打开。',
  inputSchema: loose({ range, annotations: z.any().optional(), open: z.any().optional() }),
}, async (args) => json(await renderDiagram(
  getDeps(),
  resolveRange(args),
  args.annotations === undefined && args.clauses === undefined ? [] : resolveArray(args, ['annotations', 'clauses', 'notes', 'items']),
  args.open === true || args.open === 'true',
)));

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
    + '和需要人工复核的子句（needs-review / ambiguous）。每节按它写入时的档位复查，按别的档位译的节列在 otherLevel。'
    + 'range 给书卷名审整卷，给经文范围只审该范围，不给审全部。',
  inputSchema: loose({ range }),
  annotations: { readOnlyHint: true },
}, async (args) => json(await reviewReport(getDeps(), bookOrRange(args))));

server.registerTool('update_style', {
  description:
    '整体改写工作目录的个人风格 style.md（content 为完整 Markdown，可带 --- frontmatter 选项 literalness: 1-5（翻译档位，默认 2 直译）、clauseOrder: fluent|source）。'
    + '风格是偏好级：原文两种译法都成立时才采用。先 build_translation_briefing 或 review_report 看 style 现状，在其基础上增改。',
  inputSchema: loose({ content: z.string().optional() }),
}, async (args) => {
  const content = optionalString(args, ['content', 'style', 'text', 'markdown']);
  if (!content) {
    throw new Error('缺少 content：style.md 的完整内容');
  }
  return json(await updateStyle(getDeps(), content));
});

server.registerTool('update_term_preferences', {
  description:
    '写入术语偏好 terms.yaml（保留文件里的注释）。entries 为 JSON 数组，每项 {lemma, zh, strong?, senseKey?, avoid?:[不要用的译法], note?}；'
    + '按 senseKey / strong / lemma 合并。偏好只在 briefing 里提示，不强制；要强制用 upsert_glossary。',
  inputSchema: loose({ entries: z.any().optional() }),
}, async (args) => json(await updateTermPreferences(getDeps(), resolveArray(args, ['entries', 'terms', 'preferences']))));

server.registerTool('upsert_rule', {
  description:
    '写入项目规则 rules.json（按 id 合并），会出现在对应任务的 briefing 里。rules 为 JSON 数组，每项 '
    + '{id, task: analyze|translate, pattern（原文现象）, resolution（怎么译/怎么切）, examples?:[经文出处与改前改后]}。',
  inputSchema: loose({ rules: z.any().optional() }),
}, async (args) => json(await upsertRules(getDeps(), resolveArray(args, ['rules', 'entries', 'items']))));

server.registerTool('revision_report', {
  description:
    '修改历史报告：汇总译文的人工修改（默认 origin 为 human 与 import），按原文义项列出译词改动（renderingChanges，含当前仍用旧译法的子句），'
    + '以及只有文本的导入历史里的替换片段（textChanges）。range 给书卷名、经文范围或不给（全部）。',
  inputSchema: loose({ range, origins: z.any().optional().describe('要统计的来源：human / import / ai / replace，默认 human,import') }),
  annotations: { readOnlyHint: true },
}, async (args) => {
  const raw = args.origins;
  const list = (Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,\s]+/) : []).filter(Boolean) as string[];
  const unknown = list.filter((item) => !(HISTORY_ORIGINS as readonly string[]).includes(item));
  if (unknown.length > 0) {
    throw new Error(`未知来源：${unknown.join('、')}；可用 ${HISTORY_ORIGINS.join(' / ')}`);
  }
  return json(await revisionReport(getDeps(), bookOrRange(args), list.length > 0 ? list as HistoryOrigin[] : undefined));
});

server.registerTool('replace_rendering', {
  description:
    '批量替换某个原文词的译法：把 strong（不带后缀的基本号含所有后缀变体）或 senseKey 的 rendering 从 from 改成 to，同时改写译文文本。默认只预览（dry-run），'
    + 'apply: true 才写入。range 给书卷名、经文范围或不给（全部）。定位不到的子句列在 skipped，需人工改。',
  inputSchema: loose({
    range,
    strong: z.string().optional(),
    senseKey: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    apply: z.any().optional(),
  }),
}, async (args) => json(await replaceRendering(getDeps(), bookOrRange(args), {
  strong: optionalString(args, ['strong', 'strongs']),
  senseKey: optionalString(args, ['senseKey', 'sense']),
  from: optionalString(args, ['from', 'old']) ?? '',
  to: optionalString(args, ['to', 'new']) ?? '',
}, args.apply === true || args.apply === 'true')));

await server.connect(new StdioServerTransport());
