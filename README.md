# BibleSkill

圣经原文**中文直译**的 AI 工作流：一组可公开的 skill，加一个基于开放数据的 MCP server。同一份 skill 可在 Claude Code、Gemini CLI、agy（Google Antigravity CLI）、Codex 中使用，因此可以选用 Claude、Gemini、GPT 等模型。

工作流分四步：

1. **analyze**：把经文切分为子句并确定从属关系。Macula 句法树作为第二意见，不当作标准答案。
2. **translate**：逐子句直译，同时给出实词的译法对照，并强制检查用词统一。
3. **consistency**：汇总一词多译、多词一译，把判定结果固化进术语表。
4. **review**：按当前子句分析与术语表复查已写入的译文，列出需要整节改译的范围和需要人工复核的子句。

结果用缩进树形视图查看，可在终端显示，也可生成单文件 HTML；人工复核时可以起本地服务，直接在视图里改。

## 数据来源

只使用开放许可的数据：

| 数据 | 用途 | 许可 |
|---|---|---|
| [STEPBible-Data](https://github.com/STEPBible/STEPBible-Data)：TAHOT / TAGNT / TBESH / TBESG / TEHMC / TEGMC | 主干词流（原文、扩展 Strong、词法、英文语境译词、版本异文）、简明词典、词法说明 | CC BY 4.0 |
| [Macula Hebrew](https://github.com/Clear-Bible/macula-hebrew) / [Macula Greek](https://github.com/Clear-Bible/macula-greek) | 句法树（子句种子）、中文简义、义项（SDBH / Louw-Nida） | CC BY 4.0 |
| [UBS Open License](https://github.com/ubsicap/ubs-open-license) 希伯来文 / 希腊文新约词典简体中文版 | 中文词典 | CC BY-SA 4.0 |

数据库由本地数据**构建**，不随仓库分发。署名见 [NOTICE.md](NOTICE.md)。

### 主干选择

- **新约**：以最新的 NA/UBS 为主要参考，主干是 TAGNT 中版本列含 NA28 的词，共 137,890 词（UBS5 正文与 NA28 相同）。NA28 双括号 `[[ ]]` 内的经文（可 16:8 短结尾和 16:9-20 长结尾、路 22:43-44、路 23:34a、约 7:53–8:11）在主干内，并带有标记；翻译时列为异文争议，译文用 `〚 〛` 标出。数据里的标点来自 THGNT，断句以 NA28/UBS 为准。
- **旧约**：TAHOT 的 L（列宁格勒抄本）、Q（读型，Qere）、R（恢复文本）。写型（Ketiv）、LXX 补入文本（X）以及插入的补文进异文表。
- **节号**：用英文（NRSV）节号体系，与和合本基本一致。原文节号保留在 `ref` 列，用于对齐 Macula。
- **词 id**：定宽格式。旧约为 `o` + 书(2) 章(3) 节(3) 词(3) 语素(1)，新约为 `n` + 书(2) 章(3) 节(3) 词(3)，字典序即词序。格式与 Macula 相同，但编号不同；Macula 的 id 只出现在映射表里。

## 安装

需要 Node ≥ 22.13（使用内置 `node:sqlite`）和 pnpm。

```bash
# 1. 取得数据（放在任意位置）
git clone https://github.com/STEPBible/STEPBible-Data
git clone https://github.com/Clear-Bible/macula-hebrew
git clone https://github.com/Clear-Bible/macula-greek
git clone https://github.com/ubsicap/ubs-open-license

# 2. 构建
pnpm install
pnpm build
pnpm data:build --step ../STEPBible-Data --macula-hebrew ../macula-hebrew \
  --macula-greek ../macula-greek --ubs ../ubs-open-license
# 约 30 秒；输出各约映射率与 build_report 统计

# 3. 安装到一个翻译工作目录
./scripts/install.sh ~/圣经直译
```

`install.sh` 写入以下内容：

| CLI | 内容 |
|---|---|
| Claude Code | `.claude/skills/`、`.mcp.json` |
| agy / Gemini CLI | `.agents/skills/`、`.agents/mcp_config.json`、`.gemini/settings.json`、`.gemini/policies/` |
| Codex | `.agents/skills/`；MCP 片段由脚本打印，需手动加入 `~/.codex/config.toml` |
| 通用 | `AGENTS.md`、`config.json`（数据库路径） |

**agy 无头模式**（`agy -p`）不能弹出权限确认。需要在 `~/.gemini/antigravity-cli/settings.json` 的 `permissions.allow` 里加入 `mcp(bibleskill/<工具名>)`，工具名见下表。

## 使用

在工作目录里启动任一 CLI：

```text
/bible-analyze 创 1:1-5
/bible-translate 创 1:1-5
/bible-consistency 创世记
/bible-review 创世记
```

查看结果：

```bash
pnpm view 创 1 --workdir ~/圣经直译                    # 终端文本
pnpm view 创 1 --workdir ~/圣经直译 --html gen1.html   # 单文件 HTML（canvas 精确对齐分支位置）
pnpm view 创 1 --workdir ~/圣经直译 --serve            # 可编辑视图：http://127.0.0.1:4310/（--port 改端口）
```

### 在缩进视图里编辑

`--serve` 按整章打开（拆分、合并会给本节子句重新编号，要连带改全章的 parentId），只监听本机。工具条选模式后点原文的词：

| 模式 | 操作 |
|---|---|
| 拆分 | 点词，在它前面把子句切开。谓词、主语、br 按落点分给两段，没有谓词的一段句型改为 nominal |
| 挂接 | 先选中子句，再点父句里被它修饰的词：同时设定 parentId 与 modifies |
| 主语 / 谓词 | 先选中子句，再依次点首词、末词（单个词点两次） |
| 换行 | 点词，在它后面换行或取消 |
| 对齐 | 依次点原文首词、末词（单个词点两次），再在译文里划选对应的中文：设为这几个词的对照，与它们重叠的旧对照被替换 |

右侧详情栏可以改句型、状态、说明、seedDiff，也可以设为独立、清除 modifies / 主语 / 谓词、与下一句合并；「译法对照」表可以改 note、把某个词设为不译（∅，须写 note）或删掉对照。译文区可以把下一行译文并进来（translationSpan 合并），或者把合并行的最后一句拆出来另填译文。撤销、重做用工具条按钮或 Ctrl/⌘+Z、Ctrl/⌘+Shift+Z。

- **保存**：每步操作后立即提交，走与 `submit_clause_analysis` / `submit_translation` 相同的校验（含主语检查与术语表检查）。没通过的节留作草稿，节号标红，并在表中显示错误，可以接着改或撤销。
- **乐观锁**：提交时带上读到的版本号。文件已在别处改过（例如模型同时在提交），返回冲突，刷新页面即可。
- **人工标记**：改过的子句 `sources` 追加 `human`。人工写 seedDiff 推翻 Macula 时，状态不会再自动降为 needs-review，因为人工修改本身就是复核结论。
- **词级对齐**：HTML 和 `--serve` 视图里，鼠标悬停原文词会高亮它在译文里的译词，悬停译文也会反过来高亮原文词；原文词的提示里也带着译词。
- **重译提示**：结构改动导致已有译文对不上的节，节号后显示 ↻，悬停可看到原因。这些节交给 `/bible-review` 整节重译。

### 在 agy 下跑端到端测试

```bash
cd ~/圣经直译
printf '%s' '/bible-analyze 创 1:1-3' > /tmp/p.txt
AGY_MODEL="Gemini 3.8 Flash (Medium)" AGY_PROMPT_FILE=/tmp/p.txt AGY_IDLE=120 AGY_HARD=900 \
  python3 /path/to/BibleSkill/scripts/agy-pty.py
```

`agy -p` 在管道下不输出、在 pty 里也不会自己退出，所以用 `scripts/agy-pty.py` 包装。

## MCP 工具

| 工具 | 作用 |
|---|---|
| `get_passage` | 逐词数据（TSV）、词法说明、异文 |
| `lookup_lexicon` | UBS 中文词典 + TBESH/TBESG |
| `build_analysis_briefing` / `submit_clause_analysis` | 子句切分 |
| `build_translation_briefing` / `submit_translation` | 直译 |
| `view_clauses` | 缩进文本视图 |
| `upsert_glossary` / `consistency_report` | 术语表与用词统一报告 |
| `review_report` | 审校：复查已写入的译文，列出需要改译的范围与需要人工复核的子句 |

入参都用 `range`（如 `创 1:1-5`、`John 3`），schema 写得宽松，校验在工具内部进行：校验失败作为工具错误返回，模型能照着改。

## 存储

### 只读数据库 `data/bible.sqlite`

表结构见 [packages/core/src/db-schema.ts](packages/core/src/db-schema.ts)：

| 表 | 内容 |
|---|---|
| `token` | 主干词 |
| `variant_token` | 异文词 |
| `token_macula` | 主干词与 Macula 词的映射 |
| `seed_clause` | Macula 子句种子 |
| `lexicon` | 词典 |
| `morph_code` | 词法代码说明 |
| `build_report` | 构建记录：对不上的地方和所作的判断 |

### 工作目录

```
config.json                        数据库路径
glossary.json                      术语表 {strong, senseKey, lemma, zh, level: locked|preferred, note, scope}
rules.json                         分析/翻译规则 {id, task, pattern, resolution, examples}（手工维护）
<中文书名>/chNN/clause_entities.json  子句分析
<中文书名>/chNN/clauses.json          直译
```

`clause_entities.json`（`ClauseEntity`）与 `clauses.json`（`ClauseText`）的字段保持稳定，新功能只追加字段：

- 子句：`status`（accepted / ambiguous / needs-review）、`alternatives`（其他切法与依据）、`seedDiff`、`sources`、`note`
- 译文：`renderings`（每条可带 `at`：译词在本行译文中的位置，存盘时自动定位）、`alternatives`（其他译法 `{text, kind, basis}`）、`sources`；主译的取舍理由存在 `formatted` 的 note 里

两个文件都有 `version` 字段，按节整体替换，写入是原子的（先写临时文件再 rename）。

## 用词统一

- **归并键**：`senseKey` = 扩展 Strong + Macula 义项（旧约 SDBH，新约 Louw-Nida）。扩展 Strong 已经区分同形词和专名个体。
- **译法对照**：提交译文时，每个实词（名词、动词、形容词）都要给出 `renderings`。这些对照构成译法记忆，不另外落盘，扫描工作目录实时汇总。它们同时就是词级对齐：`zh` 在译文里出现不止一处、或落在别的译词里（「地」在「大地」里）时，存盘时按「给定的 `at` → 长词优先 → 词序」定到具体位置，视图据此做原文与译文的双向高亮。
- **提交检查**：
  - 违反 `locked` 术语 → 拒绝该节。
  - 偏离 `preferred` 术语或既有主导译法、又没写 `note` → 拒绝该节，并列出既有译法。
  - 写了理由 → 放行。
- **用词审校**：`consistency_report` 列出一词多译和多词一译，供 `bible-consistency` skill 判定后写入术语表。

## 审校

提交时的检查只在提交那一刻生效。之后术语表改了，或者重新做了子句分析，已写入的译文不会自动复查。`review_report` 会把已存的译文还原成提交格式，按当前数据重跑提交检查：

| 类别 | 含义 |
|---|---|
| `structure` | 子句分析在翻译之后改过，译文对不上：缺译子句、子句 id 变了、rendering 越界、实词缺 rendering、本节没有子句分析 |
| `dispute` | 子句后来标为 ambiguous，或有影响翻译的异文，但译文还没有处理 |
| `glossary` | 违反当前术语表（`locked` 不符；`preferred` 不符且没写 note） |

报告给出两份清单：`retranslate` 把需要改译的节合并成连续范围（如 `创世记 1:3-5`），可以直接交给 bible-translate；`humanReview` 列出 needs-review / ambiguous 子句，交人工复核。`bible-review` skill 按这份报告逐段重译，最后再跑一次确认清零。`upsert_glossary` 返回时会提示跑审校；重新分析已有译文的节时，`submit_clause_analysis` 会在 `translatedVerses` 里提醒。

## 争议处理

争议尽量标出，主译之外并列其他译法，各自写依据。

- **系统已知的争议**会出现在 briefing 的 `disputes` 里，必须处理：
  - 影响翻译的经文异文：STEPBible 用大写标出，如 TAGNT 的 `T=` 异文、TAHOT 中意义不同的 Ketiv/Qere，以及只见于其他版本的整段（如约一 5:7）。处理方式是给出 `kind: textual` 的其他译法，或在 note 里说明为何不影响译文。
  - 子句分析里标为 `ambiguous` 的结构争议：必须给出其他译法，并在 note 里写明主译为什么这样取舍。
- **其他争议由模型主动标出**，分为断句、句法、词义几类，规则文档里给了常见例子。
- **主语检查**：以 Macula 句法树的主语标注为证据，漏标主语、把表语当成主语、把主语切到别的子句里，都会被拒绝。模型可以写理由推翻 Macula 的判断，但该子句会被标为 `needs-review`，交人工复核。
- **视图**：缩进视图在每句主译下列出其他译法。点开子句可以看到每种译法的依据和主译的取舍理由。

## 扩展 MCP

skill 不依赖任何私有数据。私有扩展用 `install.sh --ext <ext.json>` 安装（不传时自动读取 `~/.config/bibleskill/ext.json`），格式同 `.mcp.json`。每个扩展分到隔离目录 `<workdir>/.ext/<名字>/`，配置里的 `${EXT_DIR}` 会替换成这个目录：如果扩展自带写工作文件的工具，就让它写到这里。

新约断句以 NA28/UBS 为准。ext.json 里可以用顶层字段 `"criticalText": {"server", "tool", "args"}` 声明哪个扩展工具能取 NA28 原文。声明后，新约 briefing 会点名让模型调用这个工具，按 NA28 断句，并把校勘符号（`⸀ ⸂⸃ ⸋⸌ ˸` 等）当作争议线索。没有扩展的用户不受影响：模型按自己对 NA28/UBS 断句的了解判断，拿不准就标为争议。`--no-ext` 可以跳过自动读取扩展配置。如果环境里有其他 MCP 工具提供学术词典、注释书、交叉引用、引语层级、语法书检索等能力，skill 会用它们辅助判断，并在 `sources` 中记为 `ext:<能力>`。工作文件里只写结论，不写入受版权保护的原文。

## 开发

```bash
pnpm build && pnpm test        # 单元测试（校验器、审校、引用解析、句型换算、对齐定位、编辑操作）
pnpm verify:passage            # 用真实 MCP client 在临时目录走一遍完整流程，最后经 --serve 的接口做编辑
```

| 包 | 职责 |
|---|---|
| `packages/core` | 经文引用、词 id、schema、工作文件存储、数据库读取 |
| `packages/data-build` | 开放数据 → sqlite |
| `packages/clause-tree` | 子句树算法（建树、缩进、树形前缀） |
| `packages/mcp-server` | MCP 工具与提交校验 |
| `packages/viewer` | 缩进查看（终端 / HTML）与可编辑视图（`--serve`） |
| `skills/`、`prompts/` | skill 与规则文档（安装时把 prompts 复制进各 skill 的 `references/`） |

## 二期

- 新约引用旧约的译法对照
