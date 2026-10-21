/**
 * 工作文件读写：
 * - 原子写（temp + rename）
 * - 内容不变 version 不动，内容变化 version + 1，新记录 0
 * - 传入 expectedVersion 时做乐观锁比对（编辑器用；AI 整节重提不带）
 * - 译文有变化时，把改前改后追加到该章的 history.jsonl（修改历史，供学习术语偏好与风格）
 */
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Document, isMap, isNode, isScalar, isSeq, parseDocument } from 'yaml';
import { z } from 'zod';
import { parseClauseId } from './ref.js';
import {
  ClauseEntitySchema,
  ClauseTextSchema,
  GlossaryEntrySchema,
  HistoryEntrySchema,
  RuleSchema,
  StyleOptionsSchema,
  TermPreferenceSchema,
  strongMatches,
  type ClauseEntity,
  type ClauseText,
  type GlossaryEntry,
  type HistoryEntry,
  type HistoryOrigin,
  type Rule,
  type Style,
  type TermPreference,
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
  history: 'history.jsonl',
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

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function atomicWriteText(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempPath, content, 'utf8');
  await rename(tempPath, filePath);
}

async function atomicWrite(filePath: string, value: unknown): Promise<void> {
  await atomicWriteText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

/** style.md：可选的 `---` frontmatter（每行 `key: value`，# 后为注释）+ Markdown 正文。 */
export function parseStyle(raw: string): Style {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const options: Record<string, string> = {};
  for (const line of (match?.[1] ?? '').split(/\r?\n/)) {
    const pair = line.replace(/#.*$/, '').match(/^\s*([A-Za-z]\w*)\s*:\s*(.*?)\s*$/);
    if (pair && pair[2]) {
      options[pair[1]] = pair[2];
    }
  }
  const parsed = StyleOptionsSchema.safeParse(options);
  if (!parsed.success) {
    throw new Error(`style.md 的选项不对: ${z.prettifyError(parsed.error)}`);
  }
  return { options: parsed.data, text: (match ? raw.slice(match[0].length) : raw).trim() };
}

type TermIdentity = Pick<TermPreference, 'lemma' | 'strong' | 'senseKey'>;

/** 去掉希伯来点符与希腊重音，比较 lemma 用。 */
export function bareLemma(lemma: string): string {
  return lemma.normalize('NFD').replace(/[\u0591-\u05C7\u0300-\u036f]/g, '').replace(/[\u05BE\s]/g, '');
}

/**
 * 是否同一条术语偏好：都有 senseKey 时比 senseKey；否则比 Strong（基本号与其后缀变体算同一条，
 * 如已有 H3947、新写 H3947G）；都没有 Strong 时比 lemma。
 */
function sameTerm(a: TermIdentity, b: TermIdentity): boolean {
  if (a.senseKey || b.senseKey) {
    return a.senseKey === b.senseKey;
  }
  if (a.strong && b.strong) {
    return strongMatches(a.strong, b.strong) || strongMatches(b.strong, a.strong);
  }
  return bareLemma(a.lemma) === bareLemma(b.lemma);
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
    origin: HistoryOrigin = 'ai',
  ): Promise<ClauseText[]> {
    const filePath = this.chapterFile(bookName, chapter, 'clauses');
    const existing = await readJsonArray(filePath, ClauseTextSchema);
    const byKey = new Map(existing.map((item) => [`${item.bcv}${item.sub}`, item]));
    assertExpected(byKey, expected);
    const preserved = existing.filter((item) => !verses.has(item.bcv));
    const replaced = incoming.map((item) => ClauseTextSchema.parse({ ...item, version: nextVersion(byKey.get(`${item.bcv}${item.sub}`), item) }));
    const merged = [...preserved, ...replaced].sort(clauseTextOrder);
    await atomicWrite(filePath, merged);
    await this.appendHistory(bookName, chapter, historyEntries(existing.filter((item) => verses.has(item.bcv)), replaced, origin));
    return replaced;
  }

  async appendHistory(bookName: string, chapter: number, entries: HistoryEntry[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }
    const filePath = this.chapterFile(bookName, chapter, 'history');
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(filePath, entries.map((entry) => `${JSON.stringify(HistoryEntrySchema.parse(entry))}\n`).join(''), 'utf8');
  }

  async readHistory(bookName: string, chapter: number): Promise<HistoryEntry[]> {
    const filePath = this.chapterFile(bookName, chapter, 'history');
    const raw = await readOptional(filePath);
    if (raw === null) {
      return [];
    }
    return raw.split('\n').filter((line) => line.trim()).map((line, index) => {
      const result = HistoryEntrySchema.safeParse(JSON.parse(line));
      if (!result.success) {
        throw new Error(`${filePath} 第 ${index + 1} 行格式不对: ${z.prettifyError(result.error)}`);
      }
      return result.data;
    });
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

  /** 按 id 合并规则。 */
  async upsertRules(rules: Rule[]): Promise<Rule[]> {
    const filePath = path.join(this.projectRoot, 'rules.json');
    const merged = new Map((await readJsonArray(filePath, RuleSchema)).map((rule) => [rule.id, rule]));
    const written = rules.map((rule) => {
      const next = RuleSchema.parse({ ...rule, version: 0 });
      next.version = nextVersion(merged.get(rule.id), next);
      merged.set(rule.id, next);
      return next;
    });
    await atomicWrite(filePath, [...merged.values()]);
    return written;
  }

  /** 工作目录的 style.md；没有时为 null。 */
  async readStyle(): Promise<Style | null> {
    const raw = await readOptional(path.join(this.projectRoot, 'style.md'));
    return raw === null ? null : parseStyle(raw);
  }

  async writeStyle(content: string): Promise<Style> {
    const style = parseStyle(content);
    await atomicWriteText(path.join(this.projectRoot, 'style.md'), content.endsWith('\n') ? content : `${content}\n`);
    return style;
  }

  async readTermPreferences(): Promise<TermPreference[]> {
    const filePath = path.join(this.projectRoot, 'terms.yaml');
    const raw = await readOptional(filePath);
    if (raw === null) {
      return [];
    }
    const result = z.array(TermPreferenceSchema).safeParse(parseDocument(raw).toJS() ?? []);
    if (!result.success) {
      throw new Error(`${filePath} 格式不对: ${z.prettifyError(result.error)}`);
    }
    return result.data;
  }

  /**
   * 按 senseKey / strong / lemma 合并条目（见 sameTerm）。改的是 YAML 文档本身，文件里的注释保留。
   * 合并时 avoid 取并集；已有条目的 strong 比新写的宽（基本号）时保留宽的。
   */
  async upsertTermPreferences(entries: TermPreference[]): Promise<TermPreference[]> {
    const filePath = path.join(this.projectRoot, 'terms.yaml');
    const raw = await readOptional(filePath);
    const doc = raw === null ? new Document([]) : parseDocument(raw);
    if (!isSeq(doc.contents)) {
      throw new Error(`${filePath} 顶层应为列表`);
    }
    const seq = doc.contents;
    const written = entries.map((entry) => TermPreferenceSchema.parse(entry));
    for (const entry of written) {
      const existing = seq.items.find((item) => isMap(item) && sameTerm(TermPreferenceSchema.parse(item.toJSON()), entry));
      if (existing && isMap(existing)) {
        const previous = TermPreferenceSchema.parse(existing.toJSON());
        entry.avoid = [...new Set([...previous.avoid, ...entry.avoid])].filter((zh) => zh !== entry.zh);
        if (previous.strong && entry.strong && previous.strong !== entry.strong && strongMatches(previous.strong, entry.strong)) {
          entry.strong = previous.strong;
        }
      }
      const plain = Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined && !(Array.isArray(value) && value.length === 0)));
      if (existing && isMap(existing)) {
        for (const [key, value] of Object.entries(plain)) {
          const current = existing.get(key, true);
          if (isScalar(current) && !Array.isArray(value)) {
            current.value = value; // 原地改值，行尾注释留在节点上
          } else if (JSON.stringify(isNode(current) ? current.toJSON() : current) !== JSON.stringify(value)) {
            existing.set(key, doc.createNode(value, { flow: Array.isArray(value) }));
          }
        }
      } else {
        const node = doc.createNode(plain);
        const avoid = isMap(node) ? node.get('avoid', true) : undefined;
        if (isSeq(avoid)) {
          avoid.flow = true;
        }
        seq.items.push(node);
      }
    }
    await atomicWriteText(filePath, doc.toString({ lineWidth: 0 }));
    return written;
  }
}

/** 一节整体替换时的修改记录：内容变了的子句、新增的子句、删掉的子句。 */
function historyEntries(previous: ClauseText[], next: ClauseText[], origin: HistoryOrigin): HistoryEntry[] {
  const at = new Date().toISOString();
  const before = new Map(previous.map((item) => [`${item.bcv}${item.sub}`, item]));
  const entries: HistoryEntry[] = [];
  for (const item of next) {
    const key = `${item.bcv}${item.sub}`;
    const old = before.get(key);
    before.delete(key);
    if (!old || !sameContent(old, item)) {
      entries.push({ bcv: item.bcv, sub: item.sub, at, origin, before: old ?? null, after: item });
    }
  }
  for (const old of before.values()) {
    entries.push({ bcv: old.bcv, sub: old.sub, at, origin, before: old, after: null });
  }
  return entries;
}
