#!/usr/bin/env node
/**
 * 按工作目录配置的模型，先做子句分析、再翻译一段经文。
 *
 *   pnpm passage 创 30:32-33 --workdir ~/圣经翻译
 *   pnpm passage 创 30:32-33 --workdir ~/圣经翻译 --step translate --translate claude:opus@high
 *
 * 模型来自 <workdir>/config.json 的 models（缺省见 core 的 DEFAULT_MODELS），写法 `<cli>:<模型>[@思考级别]`：
 *   claude:<模型>[@思考级别]   用 Claude Code CLI（claude -p，只带 Read 与工作目录的 MCP），思考级别传给 --effort
 *   agy:<模型>                 用 agy（经 scripts/agy-pty.py），思考级别已含在模型名里，见 `agy models`
 *
 * 选项：
 *   --step analyze|translate|all   只跑一步（默认 all）
 *   --analyze <spec> / --translate <spec>   本次临时换模型
 *   --no-skip-permissions          agy 不加 --dangerously-skip-permissions（需已在 agy 设置里放行 bibleskill 工具）
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MODELS, parseModelSpec } from '../packages/core/dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function usage(message) {
  if (message) {
    console.error(message);
  }
  console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(2, 15).map((line) => line.replace(/^ \* ?/, '')).join('\n'));
  process.exit(1);
}

const options = { step: 'all', skipPermissions: true };
const words = [];
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === '--workdir') options.workdir = argv[++index];
  else if (arg === '--step') options.step = argv[++index];
  else if (arg === '--analyze') options.analyze = argv[++index];
  else if (arg === '--translate') options.translate = argv[++index];
  else if (arg === '--no-skip-permissions') options.skipPermissions = false;
  else if (arg.startsWith('--')) usage(`未知选项 ${arg}`);
  else words.push(arg);
}
const range = words.join(' ').trim();
if (!range || !options.workdir) usage('需要经文范围与 --workdir');
if (!['analyze', 'translate', 'all'].includes(options.step)) usage(`--step 只能是 analyze、translate 或 all`);

const workdir = path.resolve(options.workdir.replace(/^~(?=\/|$)/, process.env.HOME ?? '~'));
const configPath = path.join(workdir, 'config.json');
if (!existsSync(configPath)) usage(`${workdir} 下没有 config.json：先运行 scripts/install.sh`);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const models = { ...DEFAULT_MODELS, ...(config.models ?? {}) };

const prompts = {
  analyze: `切分 ${range}。完成后用一段话总结切分结果与标为 ambiguous 的地方。`,
  translate: `翻译 ${range}。完成后用一段话总结译文、争议与取舍。`,
};

const skills = { analyze: 'bible-analyze', translate: 'bible-translate' };

/** SKILL.md 去掉 frontmatter 直接作提示词：关掉 skill 列表，也省一轮 Skill 调用。 */
function skillPrompt(task) {
  const dir = path.join(workdir, '.claude/skills', skills[task]);
  const body = readFileSync(path.join(dir, 'SKILL.md'), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  return `${body}\n\n（skill 目录：${dir}；文中 references/ 等相对路径都相对这个目录。）\n\n${prompts[task]}`;
}

/**
 * Claude Code 只带 Read 一个内置工具和工作目录 .mcp.json 里的 MCP（不加载用户级 MCP、claude.ai 连接器与 skill 列表），
 * 关掉 tool search，MCP 工具一开始就在，省掉 ToolSearch 那一轮；config.json 的 hideTools（来自 ext.json）不放进上下文。
 */
function claudeArgs(spec, task) {
  const mcpConfig = path.join(workdir, '.mcp.json');
  const mcp = JSON.parse(readFileSync(mcpConfig, 'utf8')).mcpServers ?? {};
  const allowed = [...Object.keys(mcp).map((name) => `mcp__${name}`), 'Read'];
  const hidden = Object.entries(config.hideTools ?? {}).flatMap(([server, tools]) => tools.map((tool) => `mcp__${server}__${tool}`));
  return [
    '-p', skillPrompt(task),
    '--model', spec.model, ...(spec.effort ? ['--effort', spec.effort] : []),
    '--tools', 'Read',
    '--strict-mcp-config', '--mcp-config', mcpConfig,
    '--disable-slash-commands',
    ...(hidden.length > 0 ? ['--disallowedTools', ...hidden] : []),
    '--allowedTools', ...allowed,
  ];
}

const tasks = options.step === 'all' ? ['analyze', 'translate'] : [options.step];
const specs = {};
for (const task of tasks) {
  try {
    specs[task] = parseModelSpec(options[task] ?? models[task]);
  } catch (error) {
    usage(error.message);
  }
}

function run(task) {
  const spec = specs[task];
  console.log(`\n=== ${task}：${spec.cli}:${spec.model}${spec.effort ? `@${spec.effort}` : ''} ===\n`);
  let result;
  if (spec.cli === 'claude') {
    result = spawnSync('claude', claudeArgs(spec, task), {
      cwd: workdir,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, ENABLE_TOOL_SEARCH: 'false' },
    });
  } else {
    if (spec.effort) {
      console.warn(`agy 的思考级别写在模型名里（如 gemini-4-argon-high），忽略 @${spec.effort}`);
    }
    const dir = mkdtempSync(path.join(tmpdir(), 'bibleskill-run-'));
    const promptFile = path.join(dir, 'prompt.txt');
    writeFileSync(promptFile, `用 ${skills[task]} skill ${prompts[task]}`);
    result = spawnSync('python3', [path.join(root, 'scripts/agy-pty.py')], {
      cwd: workdir,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: {
        ...process.env,
        AGY_MODEL: spec.model,
        AGY_PROMPT_FILE: promptFile,
        AGY_IDLE: process.env.AGY_IDLE ?? '150',
        AGY_HARD: process.env.AGY_HARD ?? '3600',
        AGY_ARGS: options.skipPermissions ? '--dangerously-skip-permissions' : (process.env.AGY_ARGS ?? ''),
      },
    });
    rmSync(dir, { recursive: true, force: true });
  }
  if (result.error || result.status !== 0) {
    console.error(`${task} 失败：${result.error?.message ?? `退出码 ${result.status}`}`);
    process.exit(result.status || 1);
  }
}

for (const task of tasks) {
  run(task);
}
