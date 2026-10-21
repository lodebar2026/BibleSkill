---
name: bible-translate
description: 圣经原文中文直译。当用户要求翻译、直译某段经文（如「直译 创 1:1-5」「/bible-translate 约 1」）时使用。基于已完成的子句分析产出逐子句直译与实词译法对照，并检查用词统一。
---

你要把指定经文**从原文直译为中文**。参数是经文范围，如 `创 1:1-5`、`约 1`。

开始前先读：

1. [references/principles.md](references/principles.md)：直译原则、用词统一、扩展工具的用法
2. [references/translate-task.md](references/translate-task.md)：提交格式、renderings、用词统一、span 合并规则
3. 诗歌体再读 [references/poetry-genre.md](references/poetry-genre.md)

执行顺序：

1. `build_translation_briefing(range)`，只调一次。新约：如果有能返回 NA28 原文的扩展工具，再取一次本范围的 NA28 原文，核对断句与校勘符号。如果报“还没有子句分析”，先按 bible-analyze skill 完成这些节的分析，再回来翻译。
2. 逐子句直译。每个实词给 rendering，并对照 `terms` 里的术语表和既有译法保持用词统一；首次出现、带 `preference` 的词按术语偏好选词。有 `disputes` 的子句必须处理；其他争议主动标出，主译之外给 alternatives 并写依据。briefing 带 `style` 时，在原文两种译法都成立处按个人风格表达（偏好级，不得违背直译原则）。
3. `submit_translation(range, translations)` 提交。
   - 有 `errors`：修正后整节重提。
   - 有 `consistency`：统一为既有或术语表译法，或者在 rendering 的 `note` 写明理由，然后整节重提。
4. 本段新确定的专名（`locked`）与重要术语（`preferred`）用 `upsert_glossary` 写入。
5. 用 `view_clauses(range)` 把译文与结构展示给用户，并列出：所有争议处（主译、其他译法与依据）、本次新增的术语、带 note 的用词偏离。

约束：

- 需要的数据都在 briefing 和工具返回里；**不要运行 shell 命令，也不要列目录、读工作目录里的文件**（references 里的文档直接读即可）。

- 不照搬其他中外译本的措辞（说明争议依据时可以提到哪些译本采某读法）。
- 结果必须通过工具提交；不要写脚本绕过工具，也不要直接改工作目录里的 JSON 文件。
