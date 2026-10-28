# 子句切分（analyze）

把经文切分为子句并确定从属关系，通过 `submit_clause_analysis` 提交。

## 流程

1. 调 `build_analysis_briefing(range)` 一次。范围较大（如超过 15 节）时按自然段分批进行。
2. 读 `tokens`（逐词 TSV，`# 章:节` 分节）、`maculaSeeds` 与 `ambiguityHints`（旧约）。
3. 逐节确定子句，组成 `clauses` 数组提交。
4. 若返回 `errors`，只修正并重提出错的节；已写入的节不要重提。
5. 完成后可调 `view_clauses(range)` 检查缩进结构。

## Macula 种子是第二意见，不是标准答案

`maculaSeeds` 来自 Macula lowfat 句法树（已换算成本项目的词 id）。每行：`seedId / parentSeedId / rule / attributive / predicate / subject / tokens`。

- `tokens` 是该子句**自身**的词（不含嵌套子句），用区间表示，可能不连续。
- `attributive=1` 表示 Macula 判为修饰名词的定语子句。
- `subject` 是 Macula 标出的明示主语。
- 种子会把只含连词或冠词的包裹层也算作子句，也可能把很短的嵌套从句单列。**以句法证据为准**：同意种子就照用；不同意时按你的判断切分，并在该子句的 `seedDiff` 写一句为什么不同。
- 两种切法都说得通时，选一种提交，`status` 设为 `ambiguous`，另一种写进 `alternatives`（`summary` 说明读法，`basis` 写依据）。断句传统有分歧（如约 1:3-4）、修饰语挂接有两解、引语止于何处不确定，都属此类。翻译时这些子句必须给出对应的其他译法。
- **提交前逐节自查歧义**。第一个读得通的切法不一定是唯一的，每节都过一遍下面几问，找到第二种说得通的读法就标 `ambiguous`。`ambiguous` 不表示两种读法一样好：主读法证据更强，另一种只要语法上成立、意思说得通，也要列出，由人工译者取舍。
  1. **挪动边界**：把每个子句交界处的成分（夹在两个主句之间的从句，如 `כִּי`、`אִם`、`אֲשֶׁר`、不定式、分词、`ὅτι`、`ἵνα`、`ὡς` 引导的从句；交界处的介词短语、副词、时间词、呼格）试着挪到另一边，看前后两句是否仍然合语法、意思是否说得通。从句改挂后句时，它常成为后句的条件、时间或原因。
  2. **重音不是否决权**：旧约的马所拉重音（`athnach`、`zaqef` 等）代表中世纪的一种断句传统，主切分依它；但第 1 问挪出来的读法即使跨过 `athnach`，只要成立照样列出，`basis` 注明与重音不合。例：赛 40:3 `קוֹל קוֹרֵא בַּמִּדְבָּר פַּנּוּ דֶּרֶךְ`，重音把 `בַּמִּדְבָּר` 归下句（“在旷野预备道路”），七十士译本与太 3:3 归上句（“在旷野有声音呼喊”）。
  3. **Macula 种子的挂接与你不同**（如种子把某个从句放在顶层，你把它挂在前句下），说明另一种挂法有人主张，按第 1 问检验。只看挂接（父子关系）；子句怎么切仍按上面的切分规则，不必因此把种子的包裹层单列。
  4. 同一个词形能不能有两种分析，进而改变主语或子句关系？如希伯来文前缀 `ת` 的未完成式第二人称阳性与第三人称阴性同形，Hiphil 不定式独立式与祈使式同形，分词与完成式同形；希腊文中关身与被动同形、直说与虚拟同形。
  5. 七十士译本等古译本在这里的断句或语法理解明显不同时，那就是另一种读法的线索。
- `ambiguityHints`（旧约）是系统按词形标注与马所拉重音找出的歧义线索（同形异析、`athnach` 前可改挂下半节的从句等），**逐条检验**：成立的标 `ambiguous` 并写进 `alternatives`，不成立的不必说明。线索不全，上面的自查照做。
- `textualVariants` 列出影响翻译的经文异文；异文改变句子结构时（多出或少一个子句），在相关子句的 `note` 记下。

## 每个子句的字段

| 字段 | 说明 |
|---|---|
| `id` | `bcv + 字母`，如 `1001002a`；同一节按 a、b、c… 连续 |
| `firstWordId` / `lastWordId` | 只用 briefing 中出现的词 id |
| `type` | 仅旧约：**基础句型全称**（见下），系统换算展示码；新约不填 |
| `parentId` | 父子句的完整 id；顶层子句为 `null` |
| `modifies` | 父句中被本句修饰的词 id（决定缩进视图分支位置）；与父句相邻时应填写 |
| `subjectRange` | 明示主语的词 id 或 `首-末` 区间；无明示主语则省略 |
| `verbRange` | 谓词中心的词 id |
| `br` | 可选，逗号分隔的词 id，在这些词之后换行显示（长子句） |
| `alone` | 可选，`true` 表示从当前树组中独立出来、开始新的段落树 |
| `status` | 可选，`accepted`（默认）/ `ambiguous` / `needs-review` |
| `alternatives` | `ambiguous` 时必填：`[{summary, basis?, parentId?, modifies?, firstWordId?, lastWordId?, reading?}]`；`reading` 是关联读法组（见 principles.md 的“关联读法”），几句的读法要连起来才成立时标同一个 `R1`、`R2`… |
| `logic` | 可选，逻辑关系：`{relation, target, note?}`，见下文“逻辑关系” |
| `seedDiff` | 与 Macula 种子不一致时写原因 |
| `sources` | 默认 `["ai"]`；用了扩展工具时追加 `ext:<能力>` |
| `note` | 可选说明 |

### 主语（系统会校验）

- 有明示主语就必须填 `subjectRange`；旧约的展示码（`WayX`/`XQtl` …）也据此换算。
- 判断系词句的主语：希腊文带冠词的名词通常是主语，不带冠词的是表语（约 1:1 `θεὸς ἦν ὁ λόγος` 主语是 `ὁ λόγος`）。
- `subjectRange` 只标主语名词短语本身，不能包含谓词。
- 系统拿 Macula 的主语核对：谓词在本句内而 Macula 标出的主语漏填、标得完全不重叠、或主语被切到别的子句，都会拒绝该节。
- 确实不同意 Macula 时，可在 `seedDiff` 写明**句法理由**提交，该句会被标为 `needs-review` 交人工复核。复述报错不是理由；拿不准时宁可按 Macula 修正。

### 断句依据

- 新约子句边界与断句以 NA28/UBS 为准。tokens 里词后的标点来自 THGNT，Macula 种子依据 SBLGNT。
- 有能返回 NA28 原文的扩展工具时（见 principles.md 的“底本”），切分前先取本范围的 NA28 整节原文，逐节对照标点。**主切分必须按 NA28**，THGNT/SBLGNT/Macula 的不同断句只能放进 `alternatives`；与种子不同时在 `seedDiff` 注明；NA28 本身标了标点异文（`˸`）或断句传统有分歧时，标 `status: ambiguous`，另一种断句写进 `alternatives`。

### 覆盖规则（系统会校验）

- 每节的子句**首尾相接**，恰好覆盖该节全部词，不重叠、不遗漏。
- 子句不跨节；跨节的句子在每节各自成子句，用 `parentId` 连接。`parentId` 可以指向**后面**的子句（包括下一节的）：例如约 1:3-4 按 NA28 断句时，3c `ὃ γέγονεν` 挂在 4a 下，`modifies` 指向 4a 的词。
- 前置的连词、介词留在其后的子句里。

### 切分单位

- 动词不与它的宾语、补语拆成两个子句。
- 诗歌以诗行为单位：同一诗行内的成分不要拆到两个子句里，但不跨平行诗行合并（见 [poetry-genre.md](poetry-genre.md)）。
- 工作目录有个人风格（briefing 的 `style`）时，其中的切分偏好在不违反上面规则时采用。
- 子句切分按句法来，不随翻译档位（briefing 的 `approach`）改变。第 1 档翻译时不合并子句，所以不要为了让译文好合并而把该切的子句并在一起。

### 基础句型（仅旧约）

- 旧约：`wayyiqtol`、`qatal`、`yiqtol`、`weqatal`、`imperative`、`participle`、`infinitive_construct`、`infinitive_absolute`、`nominal`。用法见 [clause-type-guidance-hebrew.md](clause-type-guidance-hebrew.md)。
- `wayyiqtol`、`qatal`、`yiqtol`、`infinitive_*` 必须给 `verbRange`。
- 展示码（`WayX`、`XQtl` …）由系统按主语有无与前后换算，不要自己填。
- 新约不分句型，`type` 不填；子句有谓词时照常给 `verbRange`。

## 从属关系的判断

- `parentId` / `modifies` 只表达**句法附着**，不表达因果、回应、叙事结果等语义关系；语义关系写在 `logic`（见下）。
- 引语：引语内容子句的 `parentId` 指向引导子句（如“说”）。引语结束、回到叙事主线后的子句恢复到外层层级，不挂在“说”下面。
- 新约：`ὅτι` 引出的补语从句、`λέγων` 类分词引导的引语，内容子句都以引导子句为父。
- 连续命令链、顺承动作链不要改写成逐级父子链；只有后一句在句法上嵌入前一句（作补足语或修饰语）才建立 `parentId`。
- 定语（关系）子句挂在被修饰名词所在的子句下，`modifies` 指向该名词。
- `modifies` 优先指向父句动词，或本句修饰的名词。

## 逻辑关系（logic）

句法挂接（`parentId` / `modifies`）之外，子句在**逻辑上**修饰谁、是什么关系，写在可选字段 `logic`：

- `relation`：`cause` 原因、`purpose` 目的、`result` 结果、`condition` 条件、`time` 时间、`concession` 让步、`contrast` 对比、`content` 内容、`sequence` 承接、`elaboration` 说明、`comparison` 比较。
- `target`：逻辑上关联的子句 id，或连续一段 `首id-末id`（如整段请求 `1030025d-1030026c`）；可以与 `parentId` 不同，可以指向后面的子句，不能包含本句。
- `note`：可选，一句话说明。

只在两种情况填：逻辑关联的对象**不同于**句法母句；或者句法上看不出的关系需要点明（并列的 wayyiqtol 实为结果，weqatal 链实为“每逢……就……”）。逻辑关系和句法母句一致、且关系从连词就看得出时不用填。例：

- 创 30:26d `כִּי אַתָּה יָדַעְתָּ`：句法上挂在 26a 下，逻辑上是整段请求的理由 → `{"relation": "cause", "target": "1030025d-1030026c"}`。
- 创 30:27d `וַיְבָרֲכֵנִי`：形式上是 wayyiqtol，逻辑上是 27c“我占卜得知”的内容 → `{"relation": "content", "target": "1030027c"}`。
- 创 30:41–42 的 weqatal 链：后句是前句条件下的结果 → `{"relation": "result", "target": "<条件子句 id>"}`。

逻辑关系有两种都说得通时，主读法写在 `logic`，另一种写进 `alternatives` 的 summary。
