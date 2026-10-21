## ClauseType 指南（旧约希伯来语）

本页只适用**旧约**。新约希腊语见 [clause-type-guidance-greek.md](clause-type-guidance-greek.md)。

本页说明的是系统落盘后的展示句型 `ClauseType`，不是 analyze 时直接提交的 `type`。
analyze 时，`type` 提交基础句型全称；系统会根据 `subjectRange`、`verbRange` 等信息自动换算成这里的展示句型。
这里要区分两层名称：
- 展示句型：系统落盘与下游展示使用的短码，如 `WayX`、`Way0`、`QtlX`、`XQtl`
- 基础句型：analyze 提交使用的全称，如 `wayyiqtol`、`qatal`、`yiqtol`、`weqatal`、`imperative`

### `WayX`

展示句型：`WayX`
基础句型：`wayyiqtol`
带明示主语的 `wayyiqtol` 子句。`X` 只表示有明示主语，不表示主语前置。通常属于叙事主线，常译为过去时推进动作。

### `Way0`

展示句型：`Way0`
基础句型：`wayyiqtol`
无明示主语的 `wayyiqtol` 子句。与 `WayX` 同属叙事主线，只是不显式写出主语。
若某个 `WayX` / `Way0` 出现在引语之后并继续推进事件，它通常仍属于外层叙事主线，不因和前面的“说”存在回应或结果关系就降成“说”的从属子句。

### `Impv`

展示句型：`Impv`
基础句型：`imperative`
祈使子句。通常译为“你要 / 你们要”或直接祈使形式，需要区分真命令、请求、许可三种语气强度。

### `QtlX`

展示句型：`QtlX`
基础句型：`qatal`
带明示主语的 `qatal` 子句。这里的 `X` 只表示有明示主语，不表示主语前置。

### `Qtl0`

展示句型：`Qtl0`
基础句型：`qatal`
无明示主语的 `qatal` 子句。常表示完成动作、既成状态或背景信息。

### `XQtl`

展示句型：`XQtl`
基础句型：`qatal`
明示主语前置的 `qatal` 子句。前缀式 `X` 表示主语前置，常带强调、对比或话题转换功能。

### `YqtX`

展示句型：`YqtX`
基础句型：`yiqtol`
带明示主语的 `yiqtol` 子句。这里的 `X` 只表示有明示主语，不表示主语前置。

### `Yqt0`

展示句型：`Yqt0`
基础句型：`yiqtol`
无明示主语的 `yiqtol` 子句。常表达未完成、持续、习惯性或将来动作。

### `XYqt`

展示句型：`XYqt`
基础句型：`yiqtol`
明示主语前置的 `yiqtol` 子句。前缀式 `X` 表示主语前置，常用于强调、对比或引入新话题。

### `Ptcp`

展示句型：`Ptcp`
基础句型：`participle`
分词子句。可表示进行中的动作、描述性修饰，或名词化的施动者。常见译法如“正在……的”“那位……的”。

### `InfC`

展示句型：`InfC`
基础句型：`infinitive_construct`
不定式结构子句。可表达目的、结果、时间或方式，常见译法如“为要……”“在……的时候”“以致……”。

### `InfA`

展示句型：`InfA`
基础句型：`infinitive_absolute`
不定式绝对式子句。常用于强调、加强语气，或与有限动词并用形成强化表达，常见译法如“必定……”“不断……”“切切……”。

### `NmCl`

展示句型：`NmCl`
基础句型：`nominal`
名词子句，无显式动词。用于状态描述、等同判断、存在陈述，常见译法如“……是……”“……在……”。中文可补“是”，但不要过度添加。分析提交时通常不要求 `verbRange`，也不要求 `subjectRange`。

### `WQtl`

展示句型：`WQtl`
基础句型：`weqatal`
`weqatal` 子句，常见于条件句 apodosis 或结果句，常译为“就……”“则……”；律法体裁中常表示法规后果。
