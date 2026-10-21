---
name: bible-review
description: 圣经直译的审校。当用户要求「审校」「复查」「检查哪些译文要改」，或在改了术语表、重新分析子句之后要找出受影响的译文时使用。按当前子句分析与术语表复查已写入的译文，列出需要整节改译的范围与需要人工复核的子句，并在用户同意后逐段重译。
---

你要对已完成的直译做**审校**。参数是书卷名（如 `创世记`）或经文范围（如 `创 1:1-10`），不给则审全部。

开始前先读 [references/principles.md](references/principles.md)。

执行顺序：

1. `review_report(range)` 取报告。
2. 向用户汇报：
   - **需要改译的范围**（`retranslate`），并按 `verses` 里的问题类别说明原因：
     - `structure`：子句分析在翻译之后改过，译文对不上（缺译子句、子句 id 变了、rendering 越界、实词缺 rendering 等）
     - `dispute`：子句后来标成了 ambiguous，或有影响翻译的异文，但译文还没有处理
     - `glossary`：违反当前术语表
   - **需要人工复核的子句**（`humanReview`）：needs-review 写明推翻 Macula 的理由，ambiguous 列出各种读法。这些由用户判断，不要替用户定。用户可以在终端运行 `pnpm view <范围> --serve --workdir <工作目录>` 打开可编辑视图，自己改切分、挂接、主语和状态；改完再回来跑审校。
   - `untranslated` 只是进度信息，简单提一句即可。
   - 报告带 `style`（个人风格）时，可以另列几处明显不合风格的译文作为**可选建议**；不要因此把节放进需要改译的范围。
3. 用户同意后，按 `retranslate` 逐个范围走 bible-translate 的流程（`build_translation_briefing` → `submit_translation`）整节重提。`structure` 问题提示“没有子句分析”的，先按 bible-analyze 完成分析再翻译。
4. 全部重提后再调一次 `review_report(range)`，确认 `retranslate` 已清空，然后向用户汇报改了哪些节、还剩哪些需要人工复核。

约束：

- 需要的数据都在 briefing 和工具返回里；**不要运行 shell 命令，也不要列目录、读工作目录里的文件**（references 里的文档直接读即可）。
- 本流程不改术语表；如果审校中发现术语表本身有问题，告诉用户，交给 bible-consistency 处理。
- 结果必须通过工具提交；不要写脚本绕过工具，也不要直接改工作目录里的 JSON 文件。
