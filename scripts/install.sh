#!/usr/bin/env bash
# 把 BibleSkill 的 skills 与 MCP 配置安装到一个翻译工作目录。
#
#   ./scripts/install.sh /path/to/workdir [--data /path/to/bible.sqlite] [--ext /path/to/ext.json | --no-ext]
#                        [--style /path/to/style.md] [--terms /path/to/terms.yaml]
#                        [--analyze-model <spec>] [--translate-model <spec>]
#
# --ext：私有扩展 MCP 的配置（{"mcpServers": {...}}，格式同 .mcp.json），合并进各 CLI 的配置；
#        不给时若 ~/.config/bibleskill/ext.json 存在则自动使用。每个扩展分到一个隔离目录
#        <workdir>/.ext/<名字>/，配置里的 ${EXT_DIR} 会替换成它（扩展自带写工作文件的工具时，
#        让它写到这里，不会碰本项目的工作文件）；${WORKDIR} 替换成工作目录。
#        可选顶层字段 "criticalText": {"server", "tool", "args"} 声明能取新约 NA28/UBS 原文的扩展工具；
#        "hideTools": {"<服务器>": [工具名…]} 列出扩展里用不到的工具，不放进模型上下文。
# --style / --terms：个人风格（style.md）与术语偏好（terms.yaml），拷进工作目录（覆盖已有的）。
#        不给时若 ~/.config/bibleskill/ 下有同名文件、且工作目录里还没有，就拷过去。
# --analyze-model / --translate-model：子句分析、翻译用的模型（写进 config.json 的 models，pnpm passage 按它调用），
#        写法 claude:<模型>[@思考级别] 或 agy:<模型>。不给时沿用 config.json 已有的；都没有时用
#        ~/.config/bibleskill/models.json（{"analyze": …, "translate": …}），再没有就用默认（agy:gemini-4-argon-medium、claude:opus）。
#
# 安装内容：
#   Claude Code   .claude/skills/<skill>/、.mcp.json
#   agy / Gemini  .agents/skills/<skill>/、.agents/mcp_config.json、.gemini/settings.json、.gemini/policies/
#   Codex         .agents/skills/<skill>/（MCP 需写入 ~/.codex/config.toml，脚本打印片段）
#   通用          AGENTS.md、config.json（dataDb、models）、style.md / terms.yaml（有个人设置时）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MCP_NAME="bibleskill"
MCP_SERVER="${REPO_ROOT}/packages/mcp-server/dist/server.js"
DATA_DB="${REPO_ROOT}/data/bible.sqlite"
EXT_CONFIG=""
[ -f "${HOME}/.config/bibleskill/ext.json" ] && EXT_CONFIG="${HOME}/.config/bibleskill/ext.json"

STYLE_FILE=""
TERMS_FILE=""
ANALYZE_MODEL=""
TRANSLATE_MODEL=""

usage() {
  sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
}

if [ "$#" -lt 1 ]; then
  usage >&2
  exit 1
fi
WORKDIR="$1"
shift
while [ "$#" -gt 0 ]; do
  case "$1" in
    --data) DATA_DB="$2"; shift 2 ;;
    --ext) EXT_CONFIG="$2"; shift 2 ;;
    --no-ext) EXT_CONFIG=""; shift ;;
    --style) STYLE_FILE="$2"; shift 2 ;;
    --terms) TERMS_FILE="$2"; shift 2 ;;
    --analyze-model) ANALYZE_MODEL="$2"; shift 2 ;;
    --translate-model) TRANSLATE_MODEL="$2"; shift 2 ;;
    *) usage >&2; exit 1 ;;
  esac
done

[ -f "${MCP_SERVER}" ] || { echo "找不到 ${MCP_SERVER}：先运行 pnpm build" >&2; exit 1; }
[ -f "${DATA_DB}" ] || { echo "找不到数据库 ${DATA_DB}：先运行 pnpm data:build（见 README）" >&2; exit 1; }

mkdir -p "${WORKDIR}"
WORKDIR="$(cd "${WORKDIR}" && pwd)"
DATA_DB="$(cd "$(dirname "${DATA_DB}")" && pwd)/$(basename "${DATA_DB}")"

install_skills() {
  local target_root="$1"
  for skill_dir in "${REPO_ROOT}"/skills/*/; do
    local name
    name="$(basename "${skill_dir}")"
    rm -rf "${target_root:?}/${name}"
    mkdir -p "${target_root}/${name}/references"
    cp "${skill_dir}SKILL.md" "${target_root}/${name}/SKILL.md"
    cp "${REPO_ROOT}"/prompts/*.md "${target_root}/${name}/references/"
    echo "installed skill ${target_root}/${name}"
  done
}

# 合并写入 JSON 配置里的 mcpServers.<name>，保留文件中其他服务器
write_mcp_json() {
  local target_file="$1"
  local extra="$2"
  mkdir -p "$(dirname "${target_file}")"
  node - "${target_file}" "${MCP_NAME}" "${MCP_SERVER}" "${WORKDIR}" "${DATA_DB}" "${extra}" <<'NODE'
const fs = require('fs');
const [file, name, server, workdir, dataDb, extra] = process.argv.slice(2);
const config = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
config.mcpServers = config.mcpServers || {};
config.mcpServers[name] = {
  command: 'node',
  args: [server],
  env: { BS_WORKDIR: workdir, BS_DATA_DB: dataDb },
  ...(extra === 'cwd' ? { cwd: workdir } : {}),
  ...(extra === 'trust' ? { trust: true } : {}),
};
fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
NODE
  echo "installed MCP ${MCP_NAME} in ${target_file}"
}

install_skills "${WORKDIR}/.claude/skills"
install_skills "${WORKDIR}/.agents/skills"

write_mcp_json "${WORKDIR}/.mcp.json" ""
write_mcp_json "${WORKDIR}/.agents/mcp_config.json" "cwd"
write_mcp_json "${WORKDIR}/.gemini/settings.json" "trust"

if [ -n "${EXT_CONFIG}" ]; then
  [ -f "${EXT_CONFIG}" ] || { echo "找不到扩展配置 ${EXT_CONFIG}" >&2; exit 1; }
  node - "${EXT_CONFIG}" "${WORKDIR}" <<'NODE'
const fs = require('fs');
const path = require('path');
const [extFile, workdir] = process.argv.slice(2);
const extConfig = JSON.parse(fs.readFileSync(extFile, 'utf8'));
const ext = extConfig.mcpServers || {};
// 可选：声明哪个扩展工具能取新约校勘本原文，briefing 会点名让模型调用
if (extConfig.criticalText) {
  const configFile = path.join(workdir, 'config.json');
  const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
  config.criticalText = extConfig.criticalText;
  fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`configured criticalText: ${extConfig.criticalText.server}/${extConfig.criticalText.tool}`);
}
// 可选：hideTools {"<服务器>": [工具名…]} 把扩展里用不到的工具（写入、校验、自有工作流）从模型上下文里拿掉：
// agy 写成 disabledTools、Gemini 写成 excludeTools；Claude Code 的 .mcp.json 没有这个字段，记进 config.json 由 pnpm passage 转成 --disallowedTools
const hideTools = extConfig.hideTools || {};
{
  const configFile = path.join(workdir, 'config.json');
  const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
  if (Object.keys(hideTools).length > 0) {
    config.hideTools = hideTools;
  } else {
    delete config.hideTools;
  }
  fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
}
const targets = [
  ['.mcp.json', {}],
  ['.agents/mcp_config.json', { cwd: true, hideAs: 'disabledTools' }],
  ['.gemini/settings.json', { trust: true, hideAs: 'excludeTools' }],
];
for (const [name, server] of Object.entries(ext)) {
  const extDir = path.join(workdir, '.ext', name);
  fs.mkdirSync(extDir, { recursive: true });
  const resolved = JSON.parse(JSON.stringify(server).replaceAll('${EXT_DIR}', extDir).replaceAll('${WORKDIR}', workdir));
  for (const [file, opts] of targets) {
    const target = path.join(workdir, file);
    const config = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : {};
    config.mcpServers = config.mcpServers || {};
    config.mcpServers[name] = {
      ...resolved,
      ...(opts.cwd ? { cwd: extDir } : {}),
      ...(opts.trust ? { trust: true } : {}),
      ...(opts.hideAs && hideTools[name]?.length ? { [opts.hideAs]: hideTools[name] } : {}),
    };
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`);
  }
  console.log(`installed extension MCP ${name}（隔离目录 ${extDir}${hideTools[name]?.length ? `，隐藏 ${hideTools[name].length} 个工具` : ''}）`);
}
NODE
fi

mkdir -p "${WORKDIR}/.gemini/policies"
cp "${REPO_ROOT}/settings/gemini-policy.toml" "${WORKDIR}/.gemini/policies/bibleskill.toml"
echo "installed ${WORKDIR}/.gemini/policies/bibleskill.toml"

cp "${REPO_ROOT}/settings/workdir-AGENTS.md" "${WORKDIR}/AGENTS.md"
echo "installed ${WORKDIR}/AGENTS.md"

node - "${WORKDIR}/config.json" "${DATA_DB}" "${ANALYZE_MODEL}" "${TRANSLATE_MODEL}" "${HOME}/.config/bibleskill/models.json" <<'NODE'
const fs = require('fs');
const [file, dataDb, analyze, translate, fallback] = process.argv.slice(2);
const config = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
config.dataDb = dataDb;
// 模型：命令行给的覆盖；工作目录已有的不动；都没有时取用户级默认
if (!config.models && fs.existsSync(fallback)) {
  config.models = JSON.parse(fs.readFileSync(fallback, 'utf8'));
}
if (analyze || translate) {
  config.models = { ...(config.models ?? {}), ...(analyze ? { analyze } : {}), ...(translate ? { translate } : {}) };
}
fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
NODE
echo "installed ${WORKDIR}/config.json"

# 个人设置：显式给出的覆盖；默认的只在工作目录里还没有时拷入（工作目录里改过的不动）
install_personal() {
  local given="$1" name="$2"
  local target="${WORKDIR}/${name}" fallback="${HOME}/.config/bibleskill/${name}"
  if [ -n "${given}" ]; then
    [ -f "${given}" ] || { echo "找不到 ${given}" >&2; exit 1; }
    cp "${given}" "${target}"
    echo "installed ${target}"
  elif [ -f "${fallback}" ] && [ ! -f "${target}" ]; then
    cp "${fallback}" "${target}"
    echo "installed ${target}（来自 ${fallback}）"
  fi
}
install_personal "${STYLE_FILE}" style.md
install_personal "${TERMS_FILE}" terms.yaml

cat <<EOF

Codex：把下面片段加到 ~/.codex/config.toml
[mcp_servers.${MCP_NAME}]
command = "node"
args = ["${MCP_SERVER}"]
env = { BS_WORKDIR = "${WORKDIR}", BS_DATA_DB = "${DATA_DB}" }
EOF
