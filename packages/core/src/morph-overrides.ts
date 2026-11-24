/**
 * 词法覆盖：工作目录的 morph-overrides.json 按词 id 改掉数据库里的词法标注。
 *
 * 同形而两读都成立的词（创 30:32 הָסֵר 既可作 Hiphil 不定式独立格 HVhaa，也可作命令式 HVhv2ms），
 * Macula 只标一种。覆盖后 BibleDb 读出的词就带新词法，briefing、校验、结构图（字色、底色）都照新的来；
 * 原标注留在 morphOriginal，理由在 morphNote，词卡与 briefing 都列出来。原始数据库不动。
 */
import { readFileSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { z } from 'zod';
import type { Token } from './db.js';

export const MORPH_OVERRIDES_FILE = 'morph-overrides.json';

export const MorphOverrideSchema = z.object({
  /** 主干词 id（如 o010300320051）。 */
  token: z.string().regex(/^[on]\d{11,12}$/),
  /** 新的词法代码，须是数据库 morph_code 里有的（如 HVhv2ms）。 */
  morph: z.string().min(1),
  /** 为什么改：依据哪个译本、注释或上下文。 */
  note: z.string().default(''),
});
export type MorphOverride = z.infer<typeof MorphOverrideSchema>;

/** 套用覆盖：有覆盖时换掉 morph，原标注记在 morphOriginal。 */
export function applyMorphOverride(token: Token, overrides: ReadonlyMap<string, MorphOverride>): Token {
  const override = overrides.get(token.id);
  if (!override || override.morph === token.morph) {
    return token;
  }
  return { ...token, morph: override.morph, morphOriginal: token.morph, morphNote: override.note };
}

/**
 * 覆盖文件：按修改时间缓存，文件改了下次读取就生效（MCP server 不必重启）。
 * 没有文件时为空；格式不对时抛错，免得悄悄用回原标注。
 */
export class MorphOverrideFile {
  private cache: { mtimeMs: number; map: Map<string, MorphOverride> } | undefined;

  constructor(readonly filePath: string) {}

  current(): ReadonlyMap<string, MorphOverride> {
    let mtimeMs: number;
    try {
      mtimeMs = statSync(this.filePath).mtimeMs;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.cache = undefined;
        return new Map();
      }
      throw error;
    }
    if (this.cache?.mtimeMs !== mtimeMs) {
      this.cache = { mtimeMs, map: new Map(this.list().map((item) => [item.token, item])) };
    }
    return this.cache.map;
  }

  list(): MorphOverride[] {
    let raw: string;
    try {
      raw = readFileSync(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    const result = z.array(MorphOverrideSchema).safeParse(JSON.parse(raw));
    if (!result.success) {
      throw new Error(`${this.filePath} 格式不对: ${z.prettifyError(result.error)}`);
    }
    return result.data;
  }

  /** 写入或删除一条（morph 为 null 时删除），按词 id 排序。 */
  set(token: string, morph: string | null, note = ''): MorphOverride[] {
    const map = new Map(this.list().map((item) => [item.token, item]));
    if (morph === null) {
      map.delete(token);
    } else {
      map.set(token, MorphOverrideSchema.parse({ token, morph, note }));
    }
    const list = [...map.values()].sort((a, b) => a.token.localeCompare(b.token));
    const temp = `${this.filePath}.tmp`;
    writeFileSync(temp, `${JSON.stringify(list, null, 2)}\n`);
    renameSync(temp, this.filePath);
    this.cache = undefined;
    return list;
  }
}

/** 比较用的字形：去掉元音、重音与标点，希腊文再转小写。 */
function bareForm(text: string): string {
  return text.normalize('NFD').replace(/[^\p{L}]/gu, '').toLowerCase();
}

/**
 * 在一节的词里按词 id 或字形找词（只比辅音 / 字母，不管元音与重音）。
 * 字形对上多个时取第 nth 个（从 1 起）；不给 nth 就全部返回，由调用方决定。
 */
export function findTokens(tokens: Token[], query: string, nth?: number): Token[] {
  const byId = tokens.filter((token) => token.id === query);
  if (byId.length > 0) {
    return byId;
  }
  const form = bareForm(query);
  const matches = tokens.filter((token) => form !== '' && bareForm(token.surface) === form);
  if (nth === undefined) {
    return matches;
  }
  return matches[nth - 1] ? [matches[nth - 1]] : [];
}
