/**
 * 运行配置：工作目录（翻译项目）与数据库路径。
 *
 * - 工作目录：环境变量 BS_WORKDIR；未设置时用当前目录（CLI 启动 MCP 时 cwd 即项目目录）
 * - 数据库：环境变量 BS_DATA_DB，否则读 `<workdir>/config.json` 的 `dataDb`
 * - 模型：`config.json` 的 `models`，缺的项用 DEFAULT_MODELS
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** 能取新约校勘本（NA28/UBS）原文的扩展工具，由私有扩展配置声明（install.sh --ext）。 */
export type CriticalTextTool = { server: string; tool: string; args?: Record<string, unknown> };

/** 各任务用哪个 CLI 与模型，写法 `<cli>:<模型>[@思考级别]`，cli 为 claude 或 agy（scripts/run-passage.mjs 按它调用）。 */
export type TaskModels = { analyze: string; translate: string };

/** 测试中 Argon 找争议最全，Opus 译文最好（创 30:32-33、徒 7:16 对比）。 */
export const DEFAULT_MODELS: TaskModels = { analyze: 'agy:gemini-4-argon-medium', translate: 'claude:opus' };

export type ModelSpec = { cli: 'claude' | 'agy'; model: string; effort?: string };

export function parseModelSpec(spec: string): ModelSpec {
  const match = /^(claude|agy):([^@\s]+)(?:@(low|medium|high|xhigh|max))?$/.exec(spec.trim());
  if (!match) {
    throw new Error(`模型写法不对：${spec}（应为 claude:<模型>[@思考级别] 或 agy:<模型>，如 claude:opus@high、agy:gemini-4-argon-medium）`);
  }
  return { cli: match[1] as ModelSpec['cli'], model: match[2], effort: match[3] };
}

export type RuntimeConfig = { workdir: string; dataDb: string; criticalText?: CriticalTextTool; models: TaskModels };

function taskModels(value: unknown): TaskModels {
  const given = (value ?? {}) as Partial<Record<keyof TaskModels, unknown>>;
  const pick = (key: keyof TaskModels) => (typeof given[key] === 'string' && given[key] ? given[key] as string : DEFAULT_MODELS[key]);
  return { analyze: pick('analyze'), translate: pick('translate') };
}

export function resolveConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const workdir = path.resolve(env.BS_WORKDIR ?? process.cwd());
  const configPath = path.join(workdir, 'config.json');
  const config = existsSync(configPath)
    ? JSON.parse(readFileSync(configPath, 'utf8')) as { dataDb?: unknown; criticalText?: CriticalTextTool; models?: unknown }
    : {};
  const criticalText = config.criticalText?.server && config.criticalText.tool ? config.criticalText : undefined;
  const models = taskModels(config.models);
  if (env.BS_DATA_DB) {
    return { workdir, dataDb: path.resolve(env.BS_DATA_DB), criticalText, models };
  }
  if (!existsSync(configPath)) {
    throw new Error(`工作目录 ${workdir} 下没有 config.json，也没有设置 BS_DATA_DB：请先运行 scripts/install.sh`);
  }
  if (typeof config.dataDb !== 'string' || config.dataDb.length === 0) {
    throw new Error(`${configPath} 缺少 dataDb`);
  }
  return { workdir, dataDb: path.resolve(workdir, config.dataDb), criticalText, models };
}
