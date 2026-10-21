/**
 * 工作文件读写：
 * - 原子写（temp + rename）
 * - 内容不变 version 不动，内容变化 version + 1，新记录 0
 * - 传入 expectedVersion 时做乐观锁比对（编辑器用；AI 整节重提不带）
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { parseClauseId } from './ref.js';
import {
  ClauseEntitySchema,
  ClauseTextSchema,
  GlossaryEntrySchema,
  RuleSchema,
  type ClauseEntity,
  type ClauseText,
  type GlossaryEntry,
  type Rule,
} from './schemas.js';

export class ConflictError extends Error {
  constructor(message: string, readonly conflictKeys: string[]) {
    super(message);
    this.name = 'ConflictError';
  }
}

const FILE_NAMES = {
  clause_entities: 'clause_entities.json',
  clauses: 'clauses.json',
} as const;

type ChapterFile = keyof typeof FILE_NAMES;

async function readJsonArray<T>(filePath: string, schema: z.ZodType<T>): Promise<T[]> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  const result = z.array(schema).safeParse(JSON.parse(raw));
  if (!result.success) {
    throw new Error(`${filePath} 格式不对: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}

async function atomicWrite(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tempPath, filePath);
}

function sameContent<T extends { version: number }>(previous: T, next: T): boolean {
  const { version: _a, ...left } = previous;
  const { version: _b, ...right } = next;
  return JSON.stringify(left) === JSON.stringify(right);
}

function nextVersion<T extends { version: number }>(previous: T | undefined, next: T): number {
  if (!previous) {
    return 0;
  }
  return sameContent(previous, next) ? previous.version : previous.version + 1;
}

function clauseEntityOrder(a: ClauseEntity, b: ClauseEntity): number {
  const left = parseClauseId(a.id);
  const right = parseClauseId(b.id);
  return (left.bcv - right.bcv) || left.sub.localeCompare(right.sub);
}

function clauseTextOrder(a: ClauseText, b: ClauseText): number {
  return (a.bcv - b.bcv) || a.sub.localeCompare(b.sub);
}

export type VersionExpectation = Map<string, number>;

function assertExpected(existing: Map<string, { version: number }>, expected: VersionExpectation | undefined): void {
  if (!expected) {
    return;
  }
  const conflicts = [...expected].filter(([key, version]) => (existing.get(key)?.version ?? 0) !== version);
  if (conflicts.length > 0) {
    throw new ConflictError(
      `版本冲突: ${conflicts.map(([key, version]) => `${key} 期望 ${version}，实际 ${existing.get(key)?.version ?? '无'}`).join('；')}`,
      conflicts.map(([key]) => key),
    );
  }
}

export class WorkFileStore {
  constructor(readonly projectRoot: string) {}

  chapterDir(bookName: string, chapter: number): string {
    return path.join(this.projectRoot, bookName, `ch${String(chapter).padStart(2, '0')}`);
  }

  private chapterFile(bookName: string, chapter: number, kind: ChapterFile): string {
    return path.join(this.chapterDir(bookName, chapter), FILE_NAMES[kind]);
  }

  readClauseEntities(bookName: string, chapter: number): Promise<ClauseEntity[]> {
    return readJsonArray(this.chapterFile(bookName, chapter, 'clause_entities'), ClauseEntitySchema);
  }

  readClauseTexts(bookName: string, chapter: number): Promise<ClauseText[]> {
    return readJsonArray(this.chapterFile(bookName, chapter, 'clauses'), ClauseTextSchema);
  }

  /** 用 incoming 整体替换 verses 中各节的子句（整节为单位，不做节内合并）。 */
  async replaceClauseEntitiesForVerses(
    bookName: string,
    chapter: number,
    verses: Set<number>,
    incoming: ClauseEntity[],
    expected?: VersionExpectation,
  ): Promise<ClauseEntity[]> {
    const filePath = this.chapterFile(bookName, chapter, 'clause_entities');
    const existing = await readJsonArray(filePath, ClauseEntitySchema);
    const byId = new Map(existing.map((item) => [item.id, item]));
    assertExpected(byId, expected);
    const preserved = existing.filter((item) => !verses.has(parseClauseId(item.id).bcv));
    const replaced = incoming.map((item) => ClauseEntitySchema.parse({ ...item, version: nextVersion(byId.get(item.id), item) }));
    const merged = [...preserved, ...replaced].sort(clauseEntityOrder);
    await atomicWrite(filePath, merged);
    return replaced;
  }

  async replaceClauseTextsForVerses(
    bookName: string,
    chapter: number,
    verses: Set<number>,
    incoming: ClauseText[],
    expected?: VersionExpectation,
  ): Promise<ClauseText[]> {
    const filePath = this.chapterFile(bookName, chapter, 'clauses');
    const existing = await readJsonArray(filePath, ClauseTextSchema);
    const byKey = new Map(existing.map((item) => [`${item.bcv}${item.sub}`, item]));
    assertExpected(byKey, expected);
    const preserved = existing.filter((item) => !verses.has(item.bcv));
    const replaced = incoming.map((item) => ClauseTextSchema.parse({ ...item, version: nextVersion(byKey.get(`${item.bcv}${item.sub}`), item) }));
    const merged = [...preserved, ...replaced].sort(clauseTextOrder);
    await atomicWrite(filePath, merged);
    return replaced;
  }

  readGlossary(): Promise<GlossaryEntry[]> {
    return readJsonArray(path.join(this.projectRoot, 'glossary.json'), GlossaryEntrySchema);
  }

  /** 按 strong + scope 合并术语条目。 */
  async upsertGlossary(entries: Omit<GlossaryEntry, 'version'>[]): Promise<GlossaryEntry[]> {
    const filePath = path.join(this.projectRoot, 'glossary.json');
    const existing = await readJsonArray(filePath, GlossaryEntrySchema);
    const key = (entry: { strong: string; senseKey: string | null; scope: string }) => `${entry.senseKey ?? entry.strong}|${entry.scope}`;
    const merged = new Map(existing.map((entry) => [key(entry), entry]));
    const written = entries.map((entry) => {
      const previous = merged.get(key(entry));
      const next = GlossaryEntrySchema.parse({ ...entry, version: 0 });
      next.version = nextVersion(previous, next);
      merged.set(key(entry), next);
      return next;
    });
    await atomicWrite(filePath, [...merged.values()].sort((a, b) => key(a).localeCompare(key(b))));
    return written;
  }

  readRules(): Promise<Rule[]> {
    return readJsonArray(path.join(this.projectRoot, 'rules.json'), RuleSchema);
  }
}
