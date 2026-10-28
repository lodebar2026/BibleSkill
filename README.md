# BibleSkill

把**希伯来文旧约**和**希腊文新约**译成**中文**的 AI 工作流：一组可公开的 skill，加一个基于开放数据（STEPBible、Macula、UBS 中文词典）的 MCP server。模型先做子句分析，再逐子句翻译，并检查用词统一、标出经文异文与解经争议。译文贴近原文形式还是偏重意义分 5 档（逐字、直译、平衡、意义对等、意译），按工作目录设定，默认直译。同一份 skill 可在 Claude Code、Gemini CLI、agy（Google Antigravity CLI）、Codex 中使用，因此可以选用 Claude、Gemini、GPT 等模型。

工作流分四步，另有一个从修改历史学习的步骤：

1. **analyze**：把经文切分为子句并确定从属关系。Macula 句法树作为第二意见，不当作标准答案。
2. **translate**：按设定的档位逐子句翻译，同时给出实词的译法对照，并检查用词统一。
3. **consistency**：汇总一词多译、多词一译，把判定结果固化进术语表。
4. **review**：按当前子句分析与术语表复查已写入的译文，列出需要整节改译的范围和需要人工复核的子句。
5. **learn**：汇总人工修改历史，整理成术语偏好、个人风格和项目规则，经用户确认后写入；可以批量替换不一致的译词。

结果用缩进树形视图查看，可在终端显示，也可生成单文件 HTML；人工复核时可以起本地服务，直接在视图里改。`/bible-diagram` 还能画出一段经文的原文结构图（主句、从句与修饰关系）。

> **English summary.** BibleSkill is an open-source AI workflow for translating the Hebrew Bible (Old Testament) and the Greek New Testament into Chinese. It ships agent skills (`bible-analyze`, `bible-translate`, `bible-consistency`, `bible-review`, `bible-learn`, `bible-diagram`) and a Model Context Protocol (MCP) server built only from openly licensed data: STEPBible TAHOT/TAGNT, Clear Bible's Macula Hebrew/Greek syntax trees, and the UBS Chinese Hebrew and Greek dictionaries. The model first segments each passage into clauses, then translates clause by clause at one of five literalness levels (word-for-word, literal, balanced, dynamic equivalence, paraphrase), records a rendering for every content word, enforces a shared glossary, and flags textual variants (NA28/UBS base text for the New Testament, Leningrad Codex with Qere for the Old Testament) and interpretive disputes with alternative renderings. The same skills run in Claude Code, Gemini CLI, Google Antigravity CLI (agy), and OpenAI Codex. Results can be viewed as an indented clause tree in the terminal, as a standalone HTML page, or edited in a local browser view. MIT licensed.

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
./scripts/install.sh ~/圣经翻译
```

`install.sh` 写入以下内容：

| CLI | 内容 |
|---|---|
| Claude Code | `.claude/skills/`、`.mcp.json` |
| agy / Gemini CLI | `.agents/skills/`、`.agents/mcp_config.json`、`.gemini/settings.json`、`.gemini/policies/` |
| Codex | `.agents/skills/`；MCP 片段由脚本打印，需手动加入 `~/.codex/config.toml` |
| 通用 | `AGENTS.md`、`config.json`（数据库路径）；`style.md`、`terms.yaml`（有个人设置时） |

个人风格与术语偏好：`install.sh --style <style.md> --terms <terms.yaml>` 拷进工作目录。不传时，如果 `~/.config/bibleskill/style.md`、`~/.config/bibleskill/terms.yaml` 存在、而工作目录里还没有，就自动拷入；工作目录里已有的不覆盖。

**agy 无头模式**（`agy -p`）不能弹出权限确认。需要在 `~/.gemini/antigravity-cli/settings.json` 的 `permissions.allow` 里加入 `mcp(bibleskill/<工具名>)`，工具名见下表。

## 翻译档位

在工作目录的 `style.md` 里用 frontmatter 选项 `literalness` 设定档位（不写时为 2）：

```markdown
---
literalness: 4   # 1 逐字 / 2 直译 / 3 平衡 / 4 意义对等 / 5 意译
---
（下面是个人风格正文，可以不写）
```

| 档 | 名称 | 做法 | 校验 |
|---|---|---|---|
| 1 | 逐字 | 原文语序与词数，一个原文词对应一个译词 | 不能合并子句（span 只能为 1） |
| 2 | 直译（默认） | 形式对等，中文不能成句时才调整语序、合并子句 | 原有规则 |
| 3 | 平衡 | 保留意象与重要结构，句式按中文调整 | 同 2 |
| 4 | 意义对等 | 按意思重组句子，比喻、成语、度量衡可译出其意，可补主语 | 不用 `[ ]`；∅ 不必写 note；偏离既有译法或 `preferred` 只提示不拦 |
| 5 | 意译 | 释义，可补出读者理解所需的隐含信息，但不加原文没有的论断 | 同 4 |

各档通用：依据原文、不照搬其他译本、争议必须标出、每个实词都要给 rendering（第 4、5 档可以用 `首-末` 区间对应整个短语）、`locked` 术语必须照用。各档的细则见 [prompts/literalness.md](prompts/literalness.md)。briefing 的 `approach` 把当前档位告诉模型。

一个工作目录用一个档位。想要另一档的译本，另开一个工作目录。中途换档位时，已译的经文不会被改写：每条译文记下写入时的档位（`literalness`），审校按各自的档位复查，并在 `otherLevel` 里列出与当前档位不同的节。`clauseOrder`（后置状语从句合并前置还是保留原文语序）只在第 2、3 档起作用；第 1 档固定保留原文语序，第 4、5 档固定按中文语序。

## 使用

在工作目录里启动任一 CLI：

```text
/bible-analyze 创 1:1-5
/bible-translate 创 1:1-5
/bible-consistency 创世记
/bible-review 创世记
/bible-learn 创世记
/bible-diagram 徒 7:17-18
```

查看结果：

```bash
pnpm view 创 1 --workdir ~/圣经翻译                    # 终端文本
pnpm view 创 1 --workdir ~/圣经翻译 --html gen1.html   # 单文件 HTML（canvas 精确对齐分支位置）
pnpm view 创 1 --workdir ~/圣经翻译 --serve            # 可编辑视图：http://127.0.0.1:4310/（--port 改端口）
pnpm view 徒 7:17-18 --workdir ~/圣经翻译 --diagram acts7.html   # 原文结构图
```

### 原文结构图

`/bible-diagram <范围>` 按子句分析画一张可交互的结构图（单文件 HTML，写到工作目录的 `图示/`，并在浏览器打开）：

- **层级**：主句在最上，修饰它的从句在下一行，从句的从句再下一行；同一行内左右即原文先后（旧约自右向左）。同一句里的并列主句并排。
- **连线**：从从句首词出发，在两行之间折行，指到母句里被修饰的词（加下划线），线上标出关系（当…时、直到、修饰“王”）。
- **成分**：主语、谓语取自分析的 `subjectRange`、`verbRange`，句首连接词按词法认出，其余相邻的词合成一块。结构一律以子句分析为准，不取 Macula。
- **交互**：点框头展开逐词词义、要点与“分析与翻译记录”（分析备注、另一种分析、译注、其他译法、异文，自动列出）；点词弹出词卡（词法、本处译法、UBS 中文词典、STEPBible 简明词典）；可切换词法、英文、明暗。

子句功能、连线标签、中文大意和要点由模型写（`render_diagram` 的 `annotations`），存在 `<书名>/chNN/diagram.json`，重画时沿用；子句重新切分后对不上的自动作废。没有说明时用默认值：顶层为“主句”、修饰名词的为“定语从句”，大意取该子句的译文。

### 按设定的模型跑分析与翻译

子句分析和翻译可以交给不同的模型。默认分析用 agy 的 Gemini 4 Argon（找争议最全），翻译用 Claude Code 的 Opus（译文最好）：

```bash
pnpm passage 创 30:32-33 --workdir ~/圣经翻译                      # 先分析再翻译
pnpm passage 创 30:32-33 --workdir ~/圣经翻译 --step translate     # 只翻译
pnpm passage 创 30:32-33 --workdir ~/圣经翻译 --translate claude:opus@high   # 本次临时换模型
```

模型写在工作目录 `config.json` 的 `models` 里，写法 `claude:<模型>[@思考级别]` 或 `agy:<模型>`（agy 的思考级别含在模型名里，见 `agy models`）：

```json
{ "models": { "analyze": "agy:gemini-4-argon-medium", "translate": "claude:opus" } }
```

安装时用 `install.sh --analyze-model <写法> --translate-model <写法>` 设定；不给时沿用已有设定，或取 `~/.config/bibleskill/models.json`，再没有就用上面的默认。agy 默认带 `--dangerously-skip-permissions` 运行（无头模式不能弹权限确认）；已在 agy 设置里放行 bibleskill 工具的，可加 `--no-skip-permissions`。

在 CLI 里直接 `/bible-translate` 而经文还没有分析时，模型会说明设定的分析模型和命令，问你是去跑那个模型，还是由它直接分析。

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
cd ~/圣经翻译
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
| `build_translation_briefing` / `submit_translation` | 翻译（按档位） |
| `view_clauses` | 缩进文本视图 |
| `render_diagram` | 原文结构图（HTML），写入子句功能、连线标签、大意与要点 |
| `upsert_glossary` / `consistency_report` | 术语表与用词统一报告 |
| `review_report` | 审校：复查已写入的译文，列出需要改译的范围与需要人工复核的子句 |
| `revision_report` | 修改历史：按原文义项汇总人工改过的译词，以及导入历史里的文本替换 |
| `replace_rendering` | 批量替换某个原文词的译法（默认预览，`apply` 才写入） |
| `update_style` / `update_term_preferences` / `upsert_rule` | 写入个人风格、术语偏好、项目规则 |

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
rules.json                         分析/翻译规则 {id, task, pattern, resolution, examples}（手工维护，或由 bible-learn 写入）
style.md                           翻译档位与个人风格：Markdown，可带 frontmatter 选项（literalness: 1-5，clauseOrder: fluent|source）
terms.yaml                         术语偏好 [{lemma, strong?, senseKey?, zh, avoid?, note?}]，可写注释
<中文书名>/chNN/clause_entities.json  子句分析
<中文书名>/chNN/clauses.json          译文
<中文书名>/chNN/diagram.json          结构图上的说明 {clauseId, firstWordId, lastWordId, label, link, gist, notes}
图示/                               结构图 HTML
<中文书名>/chNN/history.jsonl         译文修改历史 {bcv, sub, at, origin: ai|human|replace|import, before, after}
```

`clause_entities.json`（`ClauseEntity`）与 `clauses.json`（`ClauseText`）的字段保持稳定，新功能只追加字段：

- 子句：`status`（accepted / ambiguous / needs-review）、`alternatives`（其他切法与依据）、`seedDiff`、`sources`、`note`
- 译文：`renderings`（每条可带 `at`：译词在本行译文中的位置，存盘时自动定位）、`alternatives`（其他译法 `{text, kind, basis}`）、`sources`、`literalness`（写入时的档位，旧数据没有，按 2 算）
- `formatted` 是 `TranslationSegment[]`（`{text, styleName?, note?}`）的 JSON 字符串。补出的词单独成段，`styleName: "added"`，`text` 不带括号，`note` 是补词的说明；主译的取舍理由在最后一个普通段的 note 上。模型提交时仍在 `text` 里写 `[ ]`、用 `supplied: [{text, note}]` 写补词说明，由系统拆成段；briefing、文本视图里再拼回 `[ ]`。`renderings` 的 `zh`、`at` 按不带括号的纯文本计算。HTML 视图里补词显示为带括号的灰字，有说明时悬停可看。

  旧版本把 `[ ]` 直接写在正文里。转换成补词段（文字不变，对齐位置随之调整，不记修改历史）：

  ```bash
  pnpm migrate:segments --workdir ~/圣经翻译 [--dry-run]
  ```

  `review_report` 会在 `legacy` 里列出还没转换的节。

两个文件都有 `version` 字段，按节整体替换，写入是原子的（先写临时文件再 rename）。

## 用词统一

- **归并键**：`senseKey` = 扩展 Strong + Macula 义项（旧约 SDBH，新约 Louw-Nida）。扩展 Strong 已经区分同形词和专名个体。
- **译法对照**：提交译文时，每个实词（名词、动词、形容词）都要给出 `renderings`。这些对照构成译法记忆，不另外落盘，扫描工作目录实时汇总。它们同时就是词级对齐：`zh` 在译文里出现不止一处、或落在别的译词里（「地」在「大地」里）时，存盘时按「给定的 `at` → 长词优先 → 词序」定到具体位置，视图据此做原文与译文的双向高亮。
- **提交检查**：
  - 违反 `locked` 术语 → 拒绝该节。
  - 偏离 `preferred` 术语或既有主导译法、又没写 `note` → 拒绝该节，并列出既有译法（第 4、5 档只列出，不拒绝）。
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

## 个人风格、术语偏好与修改历史

- **个人风格**（`style.md`）进入 analyze、translate briefing 和审校报告的 `style` 字段。它是偏好级：原文两种译法都成立时才采用，与当前档位的原则、术语表冲突时以原则为准（档位 `literalness` 本身不是偏好，必须遵守）；审校不会因为风格不符要求重译。frontmatter 的 `clauseOrder` 控制后置状语从句是合并前置（`fluent`，默认）还是保留原文语序（`source`）。
- **术语偏好**（`terms.yaml`）在 translate briefing 的 `terms[].preference` 里提示，只对还没有术语表条目的词生效；`consistency_report` 的 `preferenceConflicts` 列出与偏好不同的现有译法。要强制统一，把它写成术语表的 `preferred`。
- **修改历史**：每次写入译文，变化了的子句都把改前改后追加到该章的 `history.jsonl`，`origin` 区分 AI 提交（`ai`）、视图里的人工编辑（`human`）、批量替换（`replace`）和导入（`import`）。别处的修改历史可以导入：

  ```bash
  pnpm revisions import 历史.jsonl --workdir ~/圣经翻译
  # 每行 {"ref": "撒上 5:8", "before": "改前文本", "after": "改后文本"}，也可以用 bcv、sub、time
  ```

  `revision_report` 对工具写入的历史按原文义项列出“从 A 改成 B”，对导入的纯文本历史按字符 diff 归并替换片段；`bible-learn` skill 据此分类，经用户确认后写入 terms.yaml、style.md、rules.json。
- **批量替换**：`replace_rendering` 按 strong 或 senseKey 把某个译法换成另一个，同时改写译文文本与对齐位置；默认只预览。

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

新约断句以 NA28/UBS 为准。ext.json 里可以用顶层字段 `"criticalText": {"server", "tool", "args"}` 声明哪个扩展工具能取 NA28 原文。声明后，新约 briefing 会点名让模型调用这个工具，按 NA28 断句，并把校勘符号（`⸀ ⸂⸃ ⸋⸌ ˸` 等）当作争议线索。没有扩展的用户不受影响：模型按自己对 NA28/UBS 断句的了解判断，拿不准就标为争议。扩展里用不到的工具（写入、校验、扩展自己的工作流）可以列在 `"hideTools": {"<服务器>": [工具名…]}` 里，不放进模型上下文，省 token：agy 写成 `disabledTools`，Gemini 写成 `excludeTools`，`pnpm passage` 调 Claude Code 时转成 `--disallowedTools`。`--no-ext` 可以跳过自动读取扩展配置。如果环境里有其他 MCP 工具提供学术词典、注释书、交叉引用、引语层级、语法书检索等能力，skill 会用它们辅助判断，并在 `sources` 中记为 `ext:<能力>`。工作文件里只写结论，不写入受版权保护的原文。

## 常见问题

**BibleSkill 是什么？**
一个开源的圣经原文中文翻译工作流。它让 AI 模型按“子句分析 → 逐子句翻译 → 用词统一 → 审校”的步骤，把希伯来文旧约和希腊文新约译成中文，每一步的结果都写进工作目录，可以人工复核和修改。

**用的是什么原文底本？**
新约以 NA28/UBS5 为准（取 STEPBible TAGNT 中 NA28 的词），旧约用列宁格勒抄本（TAHOT 的 L，并按读型 Qere 读）。异文另存，影响翻译的会作为争议列出。详见“主干选择”。

**支持哪些 AI 模型和工具？**
同一份 skill 可在 Claude Code、Gemini CLI、agy（Google Antigravity CLI）和 Codex 中使用，因此可以选用 Claude、Gemini、GPT 等模型；子句分析和翻译还可以分别交给不同的模型。

**是不是照抄和合本或其他现成译本？**
不是。原则是依据原文翻译、不照搬其他译本；节号沿用英文（NRSV）体系，与和合本基本一致，只为方便对照。

**直译还是意译？**
可以选。档位分 5 级：逐字、直译、平衡、意义对等、意译，默认直译。一个工作目录用一个档位。

**原文数据从哪里来，能否商用？**
只用开放许可的数据：STEPBible-Data 与 Macula 为 CC BY 4.0，UBS 中文词典为 CC BY-SA 4.0。数据库在本地构建，不随仓库分发；使用时请保留 [NOTICE.md](NOTICE.md) 中的署名。代码为 MIT 许可。

**需要联网或付费数据吗？**
MCP server 和数据库都在本地运行，不依赖任何私有或付费数据。翻译时调用的模型取决于你使用的 CLI。

## 开发

```bash
pnpm build && pnpm test        # 单元测试（校验器、档位、补词分段、审校、迁移、引用解析、句型换算、对齐定位、编辑操作）
pnpm verify:passage            # 用真实 MCP client 在临时目录走一遍完整流程，最后经 --serve 的接口做编辑
```

| 包 | 职责 |
|---|---|
| `packages/core` | 经文引用、词 id、schema、工作文件存储、数据库读取 |
| `packages/data-build` | 开放数据 → sqlite |
| `packages/clause-tree` | 子句树算法（建树、缩进、树形前缀）与结构图页面 |
| `packages/mcp-server` | MCP 工具与提交校验 |
| `packages/viewer` | 缩进查看（终端 / HTML）与可编辑视图（`--serve`） |
| `skills/`、`prompts/` | skill 与规则文档（安装时把 prompts 复制进各 skill 的 `references/`） |

## 二期

- 新约引用旧约的译法对照
