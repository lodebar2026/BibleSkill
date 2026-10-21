#!/usr/bin/env node
/**
 * 从本地开放数据构建 data/bible.sqlite。
 *
 *   pnpm data:build --step <STEPBible-Data> --macula-hebrew <macula-hebrew> \
 *     --macula-greek <macula-greek> --ubs <ubs-open-license> [--out data/bible.sqlite]
 *
 * 四个数据目录都必须显式给出；构建产物不进仓库、不分发。
 */
import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { SCHEMA_SQL, SCHEMA_VERSION } from '@bs/core';
import { readMorphCodes, readStepLexicon, readUbsLexicon } from './lexicon.js';
import { processMacula } from './macula.js';
import { parseTagnt, parseTahot, type Report, type TokenRow, type VariantRow } from './stepbible.js';

const { values } = parseArgs({
  options: {
    step: { type: 'string' },
    'macula-hebrew': { type: 'string' },
    'macula-greek': { type: 'string' },
    ubs: { type: 'string' },
    out: { type: 'string', default: 'data/bible.sqlite' },
  },
});

function requireDir(name: keyof typeof values): string {
  const value = values[name];
  if (typeof value !== 'string' || !existsSync(value)) {
    throw new Error(`缺少或找不到 --${name} 目录: ${value ?? '(未给出)'}`);
  }
  return path.resolve(value);
}

const stepDir = requireDir('step');
const maculaHebrewDir = requireDir('macula-hebrew');
const maculaGreekDir = requireDir('macula-greek');
const ubsDir = requireDir('ubs');
const outPath = path.resolve(values.out ?? 'data/bible.sqlite');

const reportRows: Array<[string, string, string]> = [];
const report: Report = (kind, ref, detail) => {
  reportRows.push([kind, ref, detail]);
};

function amalgamatedFiles(prefix: 'TAHOT' | 'TAGNT'): string[] {
  const dir = path.join(stepDir, 'Translators Amalgamated OT+NT');
  const files = readdirSync(dir).filter((name) => name.startsWith(prefix) && name.endsWith('.txt'));
  // 按书卷顺序：文件名里的首卷（Gen-Deu、Jos-Est、Job-Sng、Isa-Mal；Mat-Jhn、Act-Rev）
  const order = ['Gen', 'Jos', 'Job', 'Isa', 'Mat', 'Act'];
  return files
    .sort((a, b) => order.findIndex((book) => a.includes(` ${book}-`)) - order.findIndex((book) => b.includes(` ${book}-`)))
    .map((name) => path.join(dir, name));
}

function log(message: string): void {
  process.stderr.write(`${message}\n`);
}

const otTokens: TokenRow[] = [];
const ntTokens: TokenRow[] = [];
const variants: VariantRow[] = [];

for (const file of amalgamatedFiles('TAHOT')) {
  log(`读取 ${path.basename(file)}`);
  parseTahot(file, report, (row) => otTokens.push(row), (row) => variants.push(row));
}
for (const file of amalgamatedFiles('TAGNT')) {
  log(`读取 ${path.basename(file)}`);
  parseTagnt(file, report, (row) => ntTokens.push(row), (row) => variants.push(row));
}

function assertUniqueIds(rows: TokenRow[]): void {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) {
      throw new Error(`主干词 id 重复: ${row.id}（${row.ref}）`);
    }
    seen.add(row.id);
  }
}
assertUniqueIds(otTokens);
assertUniqueIds(ntTokens);

log('对齐 Macula Hebrew…');
const ot = processMacula('OT', path.join(maculaHebrewDir, 'WLC/lowfat'), otTokens, report);
log('对齐 Macula Greek (SBLGNT)…');
const nt = processMacula('NT', path.join(maculaGreekDir, 'SBLGNT/lowfat'), ntTokens, report);

log('读取词典…');
const lexicon = [...readStepLexicon(stepDir, 'TBESH'), ...readStepLexicon(stepDir, 'TBESG'), ...readUbsLexicon(ubsDir)];
const morphCodes = readMorphCodes(stepDir);

log(`写入 ${outPath}`);
for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${outPath}${suffix}`, { force: true });
}
const db = new DatabaseSync(outPath);
db.exec('pragma journal_mode = off; pragma synchronous = off;');
db.exec(SCHEMA_SQL);
db.exec('begin');

const insertMeta = db.prepare('insert into meta (key, value) values (?, ?)');
insertMeta.run('schema_version', String(SCHEMA_VERSION));
insertMeta.run('built_at', new Date().toISOString());
insertMeta.run('sources', JSON.stringify({ stepDir, maculaHebrewDir, maculaGreekDir, ubsDir }));

const insertToken = db.prepare(`insert into token
  (id, ref, bcv, ord, surface, after, translit, lemma, strong, morph, gloss_en, gloss_zh, sense, editions, text_type, variant_note, significant, na_bracket)
  values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
for (const row of [...otTokens, ...ntTokens]) {
  insertToken.run(row.id, row.ref, row.bcv, row.ord, row.surface, row.after, row.translit, row.lemma, row.strong, row.morph,
    row.glossEn, row.glossZh, row.sense, row.editions, row.textType, row.variantNote, row.significant ? 1 : 0, row.naBracket ? 1 : 0);
}

const insertVariant = db.prepare(`insert into variant_token
  (ref, bcv, word_no, pos_id, significant, surface, strong, morph, gloss_en, editions, text_type) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
for (const row of variants) {
  insertVariant.run(row.ref, row.bcv, row.wordNo, row.posId, row.significant ? 1 : 0, row.surface, row.strong, row.morph, row.glossEn, row.editions, row.textType);
}

const insertLink = db.prepare('insert or ignore into token_macula (token_id, macula_id) values (?, ?)');
for (const [tokenId, maculaId] of [...ot.links, ...nt.links]) {
  insertLink.run(tokenId, maculaId);
}

const insertSeed = db.prepare(`insert into seed_clause
  (seed_id, bcv_first, bcv_last, parent_seed_id, rule, role, attributive, predicate_token, subject_tokens, tokens)
  values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
for (const seed of [...ot.seeds, ...nt.seeds]) {
  insertSeed.run(seed.seedId, seed.bcvFirst, seed.bcvLast, seed.parentSeedId, seed.rule, seed.role,
    seed.attributive ? 1 : 0, seed.predicateToken, seed.subjectTokens.length > 0 ? seed.subjectTokens.join(',') : null, seed.tokens.join(','));
}

const insertLexicon = db.prepare('insert into lexicon (strong, source, lemma, translit, pos, gloss, definition) values (?, ?, ?, ?, ?, ?, ?)');
for (const row of lexicon) {
  insertLexicon.run(row.strong, row.source, row.lemma, row.translit, row.pos, row.gloss, row.definition);
}

const insertMorph = db.prepare('insert into morph_code (code, expansion) values (?, ?)');
for (const [code, expansion] of morphCodes) {
  insertMorph.run(code, expansion);
}

const insertReport = db.prepare('insert into build_report (kind, ref, detail) values (?, ?, ?)');
for (const row of reportRows) {
  insertReport.run(...row);
}
db.exec('commit');
db.close();

function percent(part: number, whole: number): string {
  return whole === 0 ? '-' : `${((part / whole) * 100).toFixed(2)}%`;
}

const kinds = new Map<string, number>();
for (const [kind] of reportRows) {
  kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
}
log('');
log(`旧约主干 ${otTokens.length} 语素，映射 Macula ${percent(ot.stats.mappedTokens, ot.stats.baseTokens)}；Macula 词覆盖 ${percent(ot.stats.mappedWords, ot.stats.maculaWords)}；子句种子 ${ot.seeds.length}`);
log(`新约主干 ${ntTokens.length} 词（含 SBL ${nt.stats.baseTokens}），映射 Macula ${percent(nt.stats.mappedTokens, nt.stats.baseTokens)}；Macula 词覆盖 ${percent(nt.stats.mappedWords, nt.stats.maculaWords)}；子句种子 ${nt.seeds.length}`);
log(`异文词 ${variants.length}；词典条目 ${lexicon.length}；词法代码 ${morphCodes.length}`);
log(`build_report: ${[...kinds].map(([kind, count]) => `${kind}=${count}`).join(', ')}`);
