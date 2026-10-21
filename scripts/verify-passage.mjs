#!/usr/bin/env node
/**
 * MCP 冒烟验证：用真实 MCP client 拉起 server，在临时工作目录里走一遍
 * get_passage → analyze → view → translate → 用词统一检查 → consistency_report → review_report，
 * 最后拉起 pnpm view --serve，通过它的 HTTP 接口做拆分 / 撤销 / 译文合并拆开 / 改对齐。
 *
 *   pnpm verify:passage            （默认 创 1:1-2 与 约 1:1）
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { finalizeClauses, mergeTranslationWithNext, setRendering, splitClause, splitTranslation } from '../packages/viewer/dist/edit-ops.js';

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
  const aligned = JSON.parse(readFileSync(path.join(workdir, '创世记/ch01/clauses.json'), 'utf8'))[0].renderings;
  check('存盘的对照带上译文位置 at', aligned.map((rendering) => rendering.at).join() === '0,3,2,6,9', JSON.stringify(aligned));

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
    { id: '43001001a', firstWordId: 'n43001001001', lastWordId: 'n43001001005', verbRange: 'n43001001003', subjectRange: 'n43001001004-n43001001005' },
    { id: '43001001b', firstWordId: 'n43001001006', lastWordId: 'n43001001012', verbRange: 'n43001001009', subjectRange: 'n43001001007-n43001001008' },
    { id: '43001001c', firstWordId: 'n43001001013', lastWordId: 'n43001001017', verbRange: 'n43001001015', subjectRange: subject, ...extra },
  ];
  const noSubject = await call('submit_clause_analysis', { range: '约 1:1', clauses: john11(null) });
  check('约 1:1c 漏标主语被拦', noSubject.writtenVerses.length === 0 && /没有填 subjectRange/.test(JSON.stringify(noSubject.errors)), noSubject.errors[0]?.messages[0]?.slice(0, 60));
  const wrongSubject = await call('submit_clause_analysis', { range: '约 1:1', clauses: john11('n43001001014') });
  check('约 1:1c 把 θεὸς 当主语被拦', wrongSubject.writtenVerses.length === 0 && /不重叠/.test(JSON.stringify(wrongSubject.errors)), wrongSubject.errors[0]?.messages[0]?.slice(0, 60));
  const rightSubject = await call('submit_clause_analysis', { range: '约 1:1', clauses: john11('n43001001016-n43001001017') });
  check('约 1:1c 主语 ὁ λόγος 通过', rightSubject.writtenVerses.length === 1, JSON.stringify(rightSubject.errors).slice(0, 120));
  const arguedSubject = await call('submit_clause_analysis', { range: '约 1:1', clauses: john11('n43001001014', { seedDiff: '测试：写明理由即放行' }) });
  check('写明 seedDiff 后放行但标为待复核', arguedSubject.writtenVerses.length === 1 && arguedSubject.needsReview?.length === 1);
  const wideSubject = await call('submit_clause_analysis', { range: '约 1:1', clauses: john11('n43001001014-n43001001017', { seedDiff: '整句作主语' }) });
  check('主语包含谓词被拦（seedDiff 不豁免）', wideSubject.writtenVerses.length === 0 && /包含了谓词/.test(JSON.stringify(wideSubject.errors)));
  const split = await call('submit_clause_analysis', {
    range: '约 1:3',
    clauses: [
      { id: '43001003a', firstWordId: 'n43001003001', lastWordId: 'n43001003004', verbRange: 'n43001003004', subjectRange: 'n43001003001' },
      { id: '43001003b', firstWordId: 'n43001003005', lastWordId: 'n43001003008', verbRange: 'n43001003008' },
      { id: '43001003c', firstWordId: 'n43001003009', lastWordId: 'n43001003012', verbRange: 'n43001003012', subjectRange: 'n43001003011' },
    ],
  });
  check('约 1:3 把 οὐδὲ ἓν 切离谓词被拦', split.writtenVerses.length === 0 && /切走/.test(JSON.stringify(split.errors)), split.errors[0]?.messages[0]?.slice(0, 70));

  // 争议：约一 5:7 只见于 TR 的整段应出现在 disputes 里
  await call('submit_clause_analysis', {
    range: '约一 5:7',
    clauses: [{ id: '62005007a', firstWordId: 'n62005007001', lastWordId: 'n62005007005', verbRange: 'n62005007003', subjectRange: 'n62005007004-n62005007005', seedDiff: '测试' }],
  });
  const comma = await call('build_translation_briefing', { range: '约一 5:7' });
  check('约一 5:7 的 TR 异文列入 disputes', JSON.stringify(comma.clauses[0].disputes ?? {}).includes('TR'), JSON.stringify(comma.clauses[0].disputes ?? {}).slice(0, 90));

  const nt = await call('get_passage', { range: 'John 1:1' });
  const ntRows = nt.tokens.split('\n').filter((line) => line.startsWith('n'));
  check('约 1:1 有 17 个词', ntRows.length === 17, `${ntRows.length}`);

  // 可编辑视图：1:2 的「地」放宽为 preferred（已写理由），译文整节才能重提
  await call('upsert_glossary', { entries: [{ strong: 'H0776G', zh: '大地', level: 'preferred', lemma: 'אֶרֶץ' }] });
  await verifyEditor();
} finally {
  await client.close();
  rmSync(workdir, { recursive: true, force: true });
}

async function verifyEditor() {
  const port = 43100 + Math.floor(Math.random() * 800);
  const viewer = spawn(process.execPath, [path.join(root, 'packages/viewer/dist/cli.js'), '创', '1', '--serve', '--port', String(port)], {
    env: { ...process.env, BS_WORKDIR: workdir, BS_DATA_DB: path.join(root, 'data/bible.sqlite') },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  try {
    await new Promise((resolve, reject) => {
      viewer.stderr.on('data', (chunk) => String(chunk).includes('127.0.0.1') && resolve());
      viewer.on('exit', (code) => reject(new Error(`viewer 退出 ${code}`)));
    });
    const base = `http://127.0.0.1:${port}`;
    const html = await (await fetch(`${base}/`)).text();
    const data = JSON.parse(html.match(/window\.__BIBLESKILL__ = (.*);<\/script>/)[1]);
    const chapter = data.chapters[0];
    check('serve 页面带 token 与整章数据', data.editable === true && data.token.length > 0 && chapter.clauses.length >= 4);
    const post = async (route, body, token = data.token) => {
      const response = await fetch(`${base}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bs-token': token }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    const forVerse = (items, bcv) => items.filter((item) => (item.bcv ?? Number(item.id.slice(0, 7))) === bcv);
    const versions = (items) => Object.fromEntries(items.map((item) => [item.id ?? `${item.bcv}${item.sub}`, item.version]));

    check('没有 token 被拒', (await post('/api/clauses', {}, 'x')).status === 403);

    // 在 1:2b「渊面黑暗」的「面」前拆开：1:2c 改名为 1:2d
    const before = chapter.clauses;
    const { entities, verses } = finalizeClauses(before, splitClause(before, 'o010010020061', chapter.words));
    const saveSplit = { bookName: '创世记', chapter: 1, clauses: forVerse(entities, verses[0]), expected: versions(forVerse(before, verses[0])) };
    const split = await post('/api/clauses', saveSplit);
    const stored = JSON.parse(readFileSync(path.join(workdir, '创世记/ch01/clause_entities.json'), 'utf8'));
    check('编辑器拆分子句写入', split.status === 200 && split.body.result.writtenVerses.join() === '1:2' && stored.some((c) => c.id === '1001002d'),
      JSON.stringify(split.body.result?.errors ?? split.body).slice(0, 160));
    check('人工改过的子句标 human、改名后 parentId 仍对', stored.find((c) => c.id === '1001002c')?.sources.includes('human') && stored.find((c) => c.id === '1001002d')?.parentId === '1001002a');
    check('拆分后本节译文标为需要重译', split.body.chapter?.issues.some((issue) => issue.bcv === 1001002 && issue.kind === 'structure'));
    check('拿旧版本号再提交是冲突', (await post('/api/clauses', saveSplit)).status === 409);

    // 撤销：把拆分前的子句当作新编辑提交
    const undo = await post('/api/clauses', { bookName: '创世记', chapter: 1, clauses: forVerse(before, 1001002), expected: versions(forVerse(split.body.chapter.clauses, 1001002)) });
    check('撤销拆分', undo.status === 200 && undo.body.chapter.clauses.filter((c) => c.id.startsWith('1001002')).length === 3 && !undo.body.chapter.issues.some((issue) => issue.bcv === 1001002 && issue.kind === 'structure'),
      JSON.stringify(undo.body.result?.errors ?? undo.body).slice(0, 160));

    // 译文：1:2b 与 1:2c 合成一行，再拆开
    const texts = undo.body.chapter.texts;
    const merged = forVerse(mergeTranslationWithNext(texts, '1001002b'), 1001002);
    const mergeSave = await post('/api/translations', { bookName: '创世记', chapter: 1, texts: merged, expected: versions(forVerse(texts, 1001002)) });
    const mergedRows = mergeSave.body.chapter?.texts.filter((text) => text.bcv === 1001002) ?? [];
    check('译文合并写入（span 2 + 0）', mergeSave.status === 200 && mergedRows.map((text) => text.translationSpan).join() === '1,2,0',
      JSON.stringify(mergeSave.body.result?.errors ?? mergeSave.body).slice(0, 160));
    const unmerged = forVerse(splitTranslation(mergeSave.body.chapter.texts, mergeSave.body.chapter.clauses, '1001002b', '渊面黑暗', '神的灵运行在水面上'), 1001002);
    const splitSave = await post('/api/translations', { bookName: '创世记', chapter: 1, texts: unmerged, expected: versions(mergedRows) });
    check('译文拆开写入', splitSave.status === 200 && splitSave.body.chapter.texts.filter((text) => text.bcv === 1001002).map((text) => text.translationSpan).join() === '1,1,1',
      JSON.stringify(splitSave.body.result?.errors ?? splitSave.body).slice(0, 160));

    // 对齐：1:2c「神的灵运行在水面上」把「水」(o010010020142) 改对到「水面」上，再试一次违反 locked 的「神的」
    const realigned = forVerse(setRendering(splitSave.body.chapter.texts, '1001002c', { tokens: 'o010010020142', zh: '水面', at: 6, note: '人工对齐' }), 1001002);
    const alignSave = await post('/api/translations', { bookName: '创世记', chapter: 1, texts: realigned, expected: versions(forVerse(splitSave.body.chapter.texts, 1001002)) });
    const water = alignSave.body.chapter?.texts.find((text) => `${text.bcv}${text.sub}` === '1001002c')?.renderings.find((rendering) => rendering.tokens === 'o010010020142');
    check('编辑器改对齐写入', alignSave.status === 200 && water?.zh === '水面' && water?.at === 6, JSON.stringify(alignSave.body.result?.errors ?? alignSave.body).slice(0, 160));
    const lockedAlign = forVerse(setRendering(alignSave.body.chapter.texts, '1001002c', { tokens: 'o010010020101', zh: '神的', at: 0 }), 1001002);
    const lockedSave = await post('/api/translations', { bookName: '创世记', chapter: 1, texts: lockedAlign, expected: versions(forVerse(alignSave.body.chapter.texts, 1001002)) });
    check('对齐改成违反 locked 的译词被拒', lockedSave.status === 200 && lockedSave.body.result.writtenVerses.length === 0, JSON.stringify(lockedSave.body.result).slice(0, 160));
  } finally {
    viewer.kill();
  }
}

if (failures > 0) {
  console.error(`\n${failures} 项未通过`);
  process.exit(1);
}
console.log('\n全部通过');
