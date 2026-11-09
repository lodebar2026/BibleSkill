---
name: bible-analyze
description: 圣经原文子句切分。当用户要求分析、切分、断句某段经文的子句结构（如「分析 创 1:1-5」「/bible-analyze 约 1」）时使用。读取 STEPBible 原文与 Macula 句法种子，产出子句及其从属关系并写入工作目录。
---

你要对指定经文做**子句切分**（翻译前的结构分析）。参数是经文范围，如 `创 1:1-5`、`约 1`。

开始前先读：

1. [references/principles.md](references/principles.md)：角色、翻译原则、扩展工具的用法
2. [references/analyze-task.md](references/analyze-task.md)：任务规则、字段、校验规则
3. 句型说明：旧约读 [references/clause-type-guidance-hebrew.md](references/clause-type-guidance-hebrew.md)（新约不分句型）；诗歌体再读 [references/poetry-genre.md](references/poetry-genre.md)

异文与解经争议默认不处理。用户在请求里要求标出异文或争议（如“带争议”“看异文”“标出不同读法”）时，给本流程的 briefing、提交都传 `disputes: true`，并读 [references/disputes.md](references/disputes.md)。

执行顺序：

1. `build_analysis_briefing(range)`，只调一次；范围超过约 10 节时按自然段分批，每批取一次 briefing、提交一次。批次边界放在段首：新约有原文分段数据时按它（翻译 briefing 子句的 `paragraph`）；没有时，如果有能对比各英文译本分段的扩展工具，分批前先取一次全范围的分段对比，放在多数译本和原文共同认可的段首。
   新约：如果有能返回 NA28 原文的扩展工具，再用它取一次本范围带标点的整节原文，按 NA28 断句（规则见 principles.md 的“底本”）。
2. 逐节切分。briefing 有 `paragraphStarts`（节中的段首词）时，段首词必须开一个新子句。Macula 种子是第二意见：同意就照用，不同意要写 `seedDiff`。开启争议时，拿不准就标 `ambiguous` 并给 `alternatives`；几句的可选读法要连起来才成立时标同一个 `reading`。
3. `submit_clause_analysis(range, clauses)` 提交；有 `errors` 只重提出错的节；有 `readingWarnings` 时补齐或去掉对应的 `reading` 再重提。返回 `needsReview` 时，把这些子句和理由逐条告诉用户。
4. 向用户简述切分结果，并列出 `seedDiff` 处（开启争议时另列所有 `ambiguous` 及依据）。

约束：

- 需要的数据都在 briefing 和工具返回里；**不要运行 shell 命令，也不要列目录、读工作目录里的文件**（references 里的文档直接读即可）。

- 词 id 只用 briefing 里出现的，不要自己编。
- 结果必须通过工具提交，不要只在对话里描述。
- 不要写脚本绕过工具，也不要直接改工作目录里的 JSON 文件。
