/**
 * 入参归一："宽松进、内部校验"。
 *
 * 实测（agy 等 CLI 的会话统计）：模型常把参数名/形状猜错而正文是对的。
 * inputSchema 校验失败是 MCP 协议错误（-32602），模型很难自纠；handler 里抛的普通 Error
 * 会作为 isError 文本返回，模型能照着改。所以入口 schema 全部 optional + loose，这里再严格校验。
 */
import { parseScriptureRange, toBcv, bookFromBcv, chapterFromBcv, bookById, type ScriptureRange } from '@bs/core';

const RANGE_ALIASES = ['range', 'passage', 'reference', 'ref', 'scripture'];

function coerceInt(value: unknown): number | undefined {
  if (value == null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/** range 字符串优先（含别名），其次 startBcv/endBcv，其次 bcv。 */
export function resolveRange(input: Record<string, unknown>): ScriptureRange {
  for (const key of RANGE_ALIASES) {
    const raw = input[key];
    if (typeof raw === 'string' && raw.trim()) {
      return parseScriptureRange(raw);
    }
  }
  const startBcv = coerceInt(input.startBcv) ?? coerceInt(input.bcv);
  const endBcv = coerceInt(input.endBcv) ?? startBcv;
  if (startBcv == null || endBcv == null) {
    throw new Error("缺少经文范围：请传 range，如 range='创 1:1-5' 或 range='约 1'（中英文书名、缩写均可）。");
  }
  if (bookFromBcv(startBcv) !== bookFromBcv(endBcv)) {
    throw new Error('经文范围不能跨书卷');
  }
  if (startBcv > endBcv) {
    throw new Error(`起始经文不能晚于结束经文：${startBcv} > ${endBcv}`);
  }
  const bookId = bookFromBcv(startBcv);
  return {
    bookId,
    bookName: bookById(bookId).name,
    isOT: bookId <= 39,
    startBcv,
    endBcv,
  };
}

/** 数组参数：接受数组本身、JSON 字符串，以及若干别名。 */
export function resolveArray(input: Record<string, unknown>, names: string[]): unknown[] {
  for (const name of names) {
    const raw = input[name];
    if (Array.isArray(raw)) {
      return raw;
    }
    if (typeof raw === 'string' && raw.trim().startsWith('[')) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  }
  throw new Error(`缺少数组参数 ${names[0]}（JSON 数组）`);
}

export function optionalString(input: Record<string, unknown>, names: string[]): string | undefined {
  for (const name of names) {
    const raw = input[name];
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
  }
  return undefined;
}

/** 一章的 bcv 范围（含第 0 节诗篇标题）。 */
export function chapterRange(bookId: number, chapter: number): { startBcv: number; endBcv: number } {
  return { startBcv: toBcv(bookId, chapter, 0), endBcv: toBcv(bookId, chapter, 999) };
}

export function chaptersBetween(startBcv: number, endBcv: number): number[] {
  const chapters: number[] = [];
  for (let chapter = chapterFromBcv(startBcv); chapter <= chapterFromBcv(endBcv); chapter += 1) {
    chapters.push(chapter);
  }
  return chapters;
}
