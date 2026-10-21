/**
 * 运行配置：工作目录（翻译项目）与数据库路径。
 *
 * - 工作目录：环境变量 BS_WORKDIR；未设置时用当前目录（CLI 启动 MCP 时 cwd 即项目目录）
 * - 数据库：环境变量 BS_DATA_DB，否则读 `<workdir>/config.json` 的 `dataDb`
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** 能取新约校勘本（NA28/UBS）原文的扩展工具，由私有扩展配置声明（install.sh --ext）。 */
export type CriticalTextTool = { server: string; tool: string; args?: Record<string, unknown> };

export type RuntimeConfig = { workdir: string; dataDb: string; criticalText?: CriticalTextTool };

export function resolveConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const workdir = path.resolve(env.BS_WORKDIR ?? process.cwd());
  const configPath = path.join(workdir, 'config.json');
  const config = existsSync(configPath)
    ? JSON.parse(readFileSync(configPath, 'utf8')) as { dataDb?: unknown; criticalText?: CriticalTextTool }
    : {};
  const criticalText = config.criticalText?.server && config.criticalText.tool ? config.criticalText : undefined;
  if (env.BS_DATA_DB) {
    return { workdir, dataDb: path.resolve(env.BS_DATA_DB), criticalText };
  }
  if (!existsSync(configPath)) {
    throw new Error(`工作目录 ${workdir} 下没有 config.json，也没有设置 BS_DATA_DB：请先运行 scripts/install.sh`);
  }
  if (typeof config.dataDb !== 'string' || config.dataDb.length === 0) {
    throw new Error(`${configPath} 缺少 dataDb`);
  }
  return { workdir, dataDb: path.resolve(workdir, config.dataDb), criticalText };
}
