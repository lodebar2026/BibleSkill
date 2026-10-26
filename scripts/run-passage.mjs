#!/usr/bin/env node
/**
 * 按工作目录配置的模型，先做子句分析、再翻译一段经文。
 *
 *   pnpm passage 创 30:32-33 --workdir ~/圣经翻译
 *   pnpm passage 创 30:32-33 --workdir ~/圣经翻译 --step translate --translate claude:opus@high
 *
 * 模型来自 <workdir>/config.json 的 models（缺省见 core 的 DEFAULT_MODELS），写法 `<cli>:<模型>[@思考级别]`：
 *   claude:<模型>[@思考级别]   用 Claude Code CLI（claude -p），思考级别传给 --effort
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
  analyze: `用 bible-analyze skill 切分 ${range}。完成后用一段话总结切分结果与标为 ambiguous 的地方。`,
  translate: `用 bible-translate skill 翻译 ${range}。完成后用一段话总结译文、争议与取舍。`,
};

/** Claude Code 只放行本项目与扩展的 MCP 工具，外加读 skill 文件。 */
function claudeArgs(spec, prompt) {
  const mcp = JSON.parse(readFileSync(path.join(workdir, '.mcp.json'), 'utf8')).mcpServers ?? {};
  const allowed = [...Object.keys(mcp).map((name) => `mcp__${name}`), 'Read', 'Skill'];
  return ['-p', prompt, '--model', spec.model, ...(spec.effort ? ['--effort', spec.effort] : []), '--allowedTools', ...allowed];
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
    result = spawnSync('claude', claudeArgs(spec, prompts[task]), { cwd: workdir, stdio: ['ignore', 'inherit', 'inherit'] });
  } else {
    if (spec.effort) {
      console.warn(`agy 的思考级别写在模型名里（如 gemini-4-argon-high），忽略 @${spec.effort}`);
    }
    const dir = mkdtempSync(path.join(tmpdir(), 'bibleskill-run-'));
    const promptFile = path.join(dir, 'prompt.txt');
    writeFileSync(promptFile, prompts[task]);
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
