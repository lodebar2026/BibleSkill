# 圣经直译工作目录

本目录是一个圣经原文直译项目，已安装 BibleSkill 的 skills 与 `bibleskill` MCP server（Claude Code、Gemini CLI、agy、Codex 通用）。

## 任务入口

| 用户说 | 使用的 skill |
|---|---|
| 分析 / 切分 / 断句 某段经文 | `bible-analyze` |
| 翻译 / 直译 某段经文 | `bible-translate` |
| 检查用词统一、一词多译、整理术语表 | `bible-consistency` |
| 审校、复查哪些译文需要改 | `bible-review` |

经文范围用中文或英文书名都可以，如 `创 1:1-5`、`约 1`、`John 3:16`。

## 规则

- 所有读写都通过 `bibleskill` MCP 工具完成：先 `build_*_briefing`，再 `submit_*`。
- 不要直接编辑工作文件（`<书名>/chNN/clause_entities.json`、`clauses.json`、`glossary.json`），也不要写脚本绕过工具。
- 不要运行 shell 命令，也不要列目录、读工作文件：需要的数据都由工具提供。
- 词 id 只用工具返回的 id。
- 不照搬其他中外译本的措辞（说明争议依据时可以提到哪些译本采某读法）。
- 如果环境里还有其他 MCP 工具提供学术词典、注释书、交叉引用等能力，可以用来辅助判断，在 `sources` 中记为 `ext:<能力>`，只写结论，不写入受版权保护的原文。

## 工作文件

```
config.json                 数据库路径
glossary.json               术语表（用词统一）
rules.json                  积累的分析/翻译规则（可手工维护）
<书名>/chNN/clause_entities.json   子句分析
<书名>/chNN/clauses.json           直译与实词译法对照
```
