#!/usr/bin/env node
/**
 * MCP 冒烟验证：用真实 MCP client 拉起 server，在临时工作目录里走一遍
 * get_passage → analyze → view → translate → 用词统一检查 → consistency_report。
 *
 *   pnpm verify:passage            （默认 创 1:1-2 与 约 1:1）
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workdir = mkdtempSync(path.join(tmpdir(), 'bibleskill-verify-'));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'packages/mcp-server/dist/server.js')],
  env: { ...process.env, BS_WORKDIR: workdir, BS_DATA_DB: path.join(root, 'data/bible.sqlite') },
});
const client = new Client({ name: 'verify', version: '0' });
await client.connect(transport);

let failures = 0;
async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  const body = result.content.map((item) => item.text).join('\n');
  if (result.isError) {
    throw new Error(`${name} 返回错误: ${body}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
function check(label, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures += 1;
}

try {
  const passage = await call('get_passage', { range: '创 1:1' });
  const rows = passage.tokens.split('\n').filter((line) => line.startsWith('o'));
  check('创 1:1 有 11 个语素', rows.length === 11, `${rows.length}`);

  const briefing = await call('build_analysis_briefing', { range: '创世记 1:1-2' });
  check('analysis briefing 带 Macula 种子', briefing.maculaSeeds.split('\n').length > 1);

  // 创 1:1 一句；1:2 三句（地是空虚混沌 / 渊面黑暗 / 神的灵运行在水面上）
  const analysis = await call('submit_clause_analysis', {
    range: '创 1:1-2',
    clauses: [
      { id: '1001001a', firstWordId: 'o010010010011', lastWordId: 'o010010010072', type: 'qatal', verbRange: 'o010010010021', subjectRange: 'o010010010031', parentId: null, modifies: null },
      { id: '1001002a', firstWordId: 'o010010020011', lastWordId: 'o010010020042', type: 'qatal', verbRange: 'o010010020021', subjectRange: 'o010010020012-o010010020013', parentId: null, modifies: null },
      { id: '1001002b', firstWordId: 'o010010020051', lastWordId: 'o010010020081', type: 'nominal', subjectRange: 'o010010020052', parentId: '1001002a', modifies: null },
      { id: '1001002c', firstWordId: 'o010010020091', lastWordId: 'o010010020142', type: 'participle', verbRange: 'o010010020111', subjectRange: 'o010010020092-o010010020101', parentId: '1001002a', modifies: null },
    ],
  });
  check('analysis 两节均写入', analysis.writtenVerses.length === 2, JSON.stringify(analysis.errors));

  const bad = await call('submit_clause_analysis', {
    range: '创 1:1',
    clauses: [{ id: '1001001a', firstWordId: 'o010010010011', lastWordId: 'o010010010052', type: 'qatal', verbRange: 'o010010010021' }],
  });
  check('漏词被拒', bad.errors.length === 1 && bad.writtenVerses.length === 0, bad.errors[0]?.messages[0]);

  const stored = JSON.parse(readFileSync(path.join(workdir, '创世记/ch01/clause_entities.json'), 'utf8'));
  check('句型换算为展示码并回填动词信息', stored[0].type === 'QtlX' && stored[0].verbStem === 'qal' && stored[0].verbPerson === '3ms' && stored[1].type === 'XQtl',
    `${stored[0].type} ${stored[0].verbStem} ${stored[0].verbPerson} / ${stored[1].type}`);

  const view = await call('view_clauses', { range: '创 1:1-2' });
  check('view_clauses 有树形前缀', /[┐┤┘]/.test(view));
  console.log(view);

  const tBriefing = await call('build_translation_briefing', { range: '创 1:1' });
  check('translation briefing 列出实词义项', tBriefing.terms.length >= 4, `${tBriefing.terms.length}`);

  const missing = await call('submit_translation', {
    range: '创 1:1',
    translations: [{ clauseId: '1001001a', span: 1, text: '起初神创造了诸天与大地', renderings: [{ tokens: 'o010010010012', zh: '起初' }] }],
  });
  check('实词缺 rendering 被拒', missing.errors.length === 1, missing.errors[0]?.messages[0]?.slice(0, 80));

  const ok = await call('submit_translation', {
    range: '创 1:1',
    translations: [{
      clauseId: '1001001a', span: 1, text: '起初神创造了诸天与大地',
      renderings: [
        { tokens: 'o010010010012', zh: '起初' },
        { tokens: 'o010010010021', zh: '创造' },
        { tokens: 'o010010010031', zh: '神' },
        { tokens: 'o010010010052', zh: '诸天' },
        { tokens: 'o010010010072', zh: '大地' },
      ],
    }],
  });
  check('创 1:1 译文写入', ok.writtenVerses.length === 1, JSON.stringify(ok.errors ?? ok.consistency));

  await call('upsert_glossary', { entries: [{ strong: 'H0430G', zh: '神', level: 'locked', lemma: 'אֱלֹהִים' }] });
  const full = (zh101, zh013, note) => [
    { clauseId: '1001002a', span: 1, text: `${zh013}是空虚混沌`, renderings: [
      { tokens: 'o010010020013', zh: zh013, ...(note ? { note } : {}) }, { tokens: 'o010010020021', zh: '是' },
      { tokens: 'o010010020031', zh: '空虚' }, { tokens: 'o010010020042', zh: '混沌' }] },
    { clauseId: '1001002b', span: 1, text: '渊面黑暗', renderings: [
      { tokens: 'o010010020052', zh: '黑暗' }, { tokens: 'o010010020071', zh: '面' }, { tokens: 'o010010020081', zh: '渊' }] },
    { clauseId: '1001002c', span: 1, text: `${zh101}的灵运行在水面上`, renderings: [
      { tokens: 'o010010020092', zh: '灵' }, { tokens: 'o010010020101', zh: zh101 }, { tokens: 'o010010020111', zh: '运行' },
      { tokens: 'o010010020131', zh: '面' }, { tokens: 'o010010020142', zh: '水' }] },
  ];
  const locked = await call('submit_translation', { range: '创 1:2', translations: full('上帝', '大地') });
  check('违反 locked 术语被拦', locked.writtenVerses.length === 0 && String(JSON.stringify(locked.consistency)).includes('锁定'), JSON.stringify(locked.consistency ?? locked.errors).slice(0, 120));
  const drift = await call('submit_translation', { range: '创 1:2', translations: full('神', '地') });
  check('偏离既有译法「大地」被拦', drift.writtenVerses.length === 0 && String(JSON.stringify(drift.consistency)).includes('大地'), JSON.stringify(drift.consistency ?? drift.errors).slice(0, 120));
  const reasoned = await call('submit_translation', { range: '创 1:2', translations: full('神', '地', '此处指尚未成形的地，与 1:1 的「大地」区分') });
  check('写明理由后放行', reasoned.writtenVerses.length === 1, JSON.stringify(reasoned.consistency ?? reasoned.errors).slice(0, 120));

  const report = await call('consistency_report', { range: '创世记' });
  check('consistency_report 报出 אֶרֶץ 一词多译', report.oneToMany.some((item) => item.strong === 'H0776G'), `${report.senses} 个义项`);

  // 审校：术语表或子句分析在翻译之后变了，review_report 应列出受影响的节
  const clean = await call('review_report', { range: '创世记' });
  check('review_report 初始无需改译', clean.retranslate.length === 0, JSON.stringify(clean.verses).slice(0, 120));
  await call('upsert_glossary', { entries: [{ strong: 'H0776G', zh: '大地', level: 'locked', lemma: 'אֶרֶץ' }] });
  const afterGlossary = await call('review_report', { range: '创世记' });
  check('锁定术语后 review_report 要求改译 1:2', afterGlossary.retranslate.join() === '创世记 1:2' && afterGlossary.counts.glossary === 1,
    JSON.stringify(afterGlossary.retranslate));
  const reanalyzed = await call('submit_clause_analysis', {
    range: '创 1:1',
    clauses: [{ id: '1001001a', firstWordId: 'o010010010011', lastWordId: 'o010010010072', type: 'qatal', verbRange: 'o010010010021', subjectRange: 'o010010010031', parentId: null, modifies: null,
      status: 'ambiguous', alternatives: [{ summary: '1:1 作 1:2 的时间状语从句', basis: '测试' }] }],
  });
  check('重新分析已译的节时提示 review_report', /review_report/.test(reanalyzed.translatedVerses ?? ''), reanalyzed.translatedVerses);
  const afterAnalysis = await call('review_report', { range: '创 1:1-2' });
  check('子句改为 ambiguous 后报未处理的争议并列入人工复核',
    afterAnalysis.retranslate.join() === '创世记 1:1-2' && afterAnalysis.counts.dispute > 0 && afterAnalysis.humanReview?.[0]?.clauseId === '1001001a',
    JSON.stringify(afterAnalysis.counts));

  // 约 1:1 / 1:3：主语检查（Macula 主语为证据）
  const john11 = (subject, extra = {}) => [
    { id: '43001001a', firstWordId: 'n43001001001', lastWordId: 'n43001001005', type: 'imperfect_ind', verbRange: 'n43001001003', subjectRange: 'n43001001004-n43001001005' },
    { id: '43001001b', firstWordId: 'n43001001006', lastWordId: 'n43001001012', type: 'imperfect_ind', verbRange: 'n43001001009', subjectRange: 'n43001001007-n43001001008' },
    { id: '43001001c', firstWordId: 'n43001001013', lastWordId: 'n43001001017', type: 'imperfect_ind', verbRange: 'n43001001015', subjectRange: subject, ...extra },
  ];
  const noSubject = await call('submit_clause_analysis', { range: '约 1:1', clauses: john11(null) });
  check('约 1:1c 漏标主语被拦', noSubject.writtenVerses.length === 0 && /没有填 subjectRange/.test(JSON.stringify(noSubject.errors)), noSubject.errors[0]?.messages[0]?.slice(0, 60));
  const wrongSubject = await call('submit_clause_analysis', { range: '约 1:1', clauses: john11('n43001001014') });
  check('约 1:1c 把 θεὸς 当主语被拦', wrongSubject.writtenVerses.length === 0 && /不重叠/.test(JSON.stringify(wrongSubject.errors)), wrongSubject.errors[0]?.messages[0]?.slice(0, 60));
  const rightSubject = await call('submit_clause_analysis', { range: '约 1:1', clauses: john11('n43001001016-n43001001017') });
  check('约 1:1c 主语 ὁ λόγος 通过，展示码 IpfX', rightSubject.writtenVerses.length === 1, JSON.stringify(rightSubject.errors).slice(0, 120));
  const arguedSubject = await call('submit_clause_analysis', { range: '约 1:1', clauses: john11('n43001001014', { seedDiff: '测试：写明理由即放行' }) });
  check('写明 seedDiff 后放行但标为待复核', arguedSubject.writtenVerses.length === 1 && arguedSubject.needsReview?.length === 1);
  const wideSubject = await call('submit_clause_analysis', { range: '约 1:1', clauses: john11('n43001001014-n43001001017', { seedDiff: '整句作主语' }) });
  check('主语包含谓词被拦（seedDiff 不豁免）', wideSubject.writtenVerses.length === 0 && /包含了谓词/.test(JSON.stringify(wideSubject.errors)));
  const split = await call('submit_clause_analysis', {
    range: '约 1:3',
    clauses: [
      { id: '43001003a', firstWordId: 'n43001003001', lastWordId: 'n43001003004', type: 'aorist_ind', verbRange: 'n43001003004', subjectRange: 'n43001003001' },
      { id: '43001003b', firstWordId: 'n43001003005', lastWordId: 'n43001003008', type: 'aorist_ind', verbRange: 'n43001003008' },
      { id: '43001003c', firstWordId: 'n43001003009', lastWordId: 'n43001003012', type: 'perfect_ind', verbRange: 'n43001003012', subjectRange: 'n43001003011' },
    ],
  });
  check('约 1:3 把 οὐδὲ ἓν 切离谓词被拦', split.writtenVerses.length === 0 && /切走/.test(JSON.stringify(split.errors)), split.errors[0]?.messages[0]?.slice(0, 70));

  // 争议：约一 5:7 只见于 TR 的整段应出现在 disputes 里
  await call('submit_clause_analysis', {
    range: '约一 5:7',
    clauses: [{ id: '62005007a', firstWordId: 'n62005007001', lastWordId: 'n62005007005', type: 'present_ind', verbRange: 'n62005007003', subjectRange: 'n62005007004-n62005007005', seedDiff: '测试' }],
  });
  const comma = await call('build_translation_briefing', { range: '约一 5:7' });
  check('约一 5:7 的 TR 异文列入 disputes', JSON.stringify(comma.clauses[0].disputes ?? {}).includes('TR'), JSON.stringify(comma.clauses[0].disputes ?? {}).slice(0, 90));

  const nt = await call('get_passage', { range: 'John 1:1' });
  const ntRows = nt.tokens.split('\n').filter((line) => line.startsWith('n'));
  check('约 1:1 有 17 个词', ntRows.length === 17, `${ntRows.length}`);
} finally {
  await client.close();
  rmSync(workdir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} 项未通过`);
  process.exit(1);
}
console.log('\n全部通过');
