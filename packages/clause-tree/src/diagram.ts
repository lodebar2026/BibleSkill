/**
 * 结构图：单文件交互 HTML。
 *
 * 每个子句一行，按原文先后自上而下排（叙事链、话语内容的序列一句接一句往下读），缩进表示从属；
 * 框头标子句编号。框里每个句子成分一块（新约照 Macula 分出宾语、间接宾语、状语、表语）。
 * 连线走在缩进留出的沟槽里，从子句连到母句里被修饰的词，不穿过别的框；箭头伸进母句框，指到那个词。
 * 新约词按格着色、动词按时态加框、按语气加底色。旧约非 qal 的动词按词干着色，谓语前的实词成分（前置）加框标出。
 * 点「详情」展开词义与要点，点「收起分支」隐藏下属子句，点词弹出词卡。页面脚本是 diagramClient，整个函数以源码嵌入页面。
 */
import type { DiagramData } from '@bs/core';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
}

/** 内嵌 JSON 时防止 `</script>` 提前结束脚本块。 */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

const STYLE = `
:root {
  --bg: #f7f5f0; --panel: #ffffff; --ink: #1f1d1a; --muted: #6b665d; --line: #dcd6ca; --soft: #efebe2;
  --accent: #8a4b16; --wire: #8a4b16; --logic: #0f766e;
  --r-v: #b42318; --r-s: #1d4ed8; --r-conj: #6b665d; --r-none: #b8b0a2;
  --hl: #fde68a; --amb: #fff1c7; --rev: #fde2e2;
  --c-acc: rgb(42, 127, 255); --c-gen: rgb(0, 160, 0); --c-dat: rgb(164, 73, 255); --c-voc: rgb(255, 102, 0);
  --t-pres: #0000ff; --t-impf: #ff00ff; --t-fut: #32cd32; --t-aor: #1f1d1a; --t-perf: #ff0000; --t-plpf: #ff0000;
  --m-ind: #f5f5dc; --m-impv: #ffc0c0; --m-subj: #ffe0ff; --m-opt: #e0ffe0;
  --focus: #d97706; --st-qal: #6b665d; --st-niphal: #0369a1; --st-piel: #c2410c; --st-hiphil: #7e22ce; --st-hithpael: #15803d;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #171614; --panel: #201e1b; --ink: #ece7dd; --muted: #a39d92; --line: #3a3631; --soft: #2a2724;
    --accent: #e0a46a; --wire: #e0a46a; --logic: #5eead4;
    --r-v: #f87171; --r-s: #7aa2ff; --r-conj: #a39d92; --r-none: #5a554d;
    --hl: #6b5512; --amb: #3d3418; --rev: #44232a;
    --c-acc: #6aa8ff; --c-gen: #4ade80; --c-dat: #c084fc; --c-voc: #fb923c;
    --t-pres: #7aa2ff; --t-impf: #f472d0; --t-fut: #65e07a; --t-aor: #ece7dd; --t-perf: #f87171; --t-plpf: #f87171;
    --m-ind: #3a3626; --m-impv: #4a2626; --m-subj: #44284a; --m-opt: #24402a;
    --focus: #fbbf24; --st-qal: #a39d92; --st-niphal: #38bdf8; --st-piel: #fb923c; --st-hiphil: #c084fc; --st-hithpael: #4ade80;
  }
}
:root[data-theme="dark"] {
  --bg: #171614; --panel: #201e1b; --ink: #ece7dd; --muted: #a39d92; --line: #3a3631; --soft: #2a2724;
  --accent: #e0a46a; --wire: #e0a46a; --logic: #5eead4;
  --r-v: #f87171; --r-s: #7aa2ff; --r-conj: #a39d92; --r-none: #5a554d;
  --hl: #6b5512; --amb: #3d3418; --rev: #44232a;
  --c-acc: #6aa8ff; --c-gen: #4ade80; --c-dat: #c084fc; --c-voc: #fb923c;
  --t-pres: #7aa2ff; --t-impf: #f472d0; --t-fut: #65e07a; --t-aor: #ece7dd; --t-perf: #f87171; --t-plpf: #f87171;
  --m-ind: #3a3626; --m-impv: #4a2626; --m-subj: #44284a; --m-opt: #24402a;
  --focus: #fbbf24; --st-qal: #a39d92; --st-niphal: #38bdf8; --st-piel: #fb923c; --st-hiphil: #c084fc; --st-hithpael: #4ade80;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.6 -apple-system, "PingFang SC", "Noto Sans SC", sans-serif; }
.o { font-family: "Gentium Book Plus", "SBL BibLit", "SBL Greek", "SBL Hebrew", "Noto Serif Hebrew", "Times New Roman", serif; }
.ot .o { font-family: "SBL Hebrew", "SBL BibLit", "Noto Serif Hebrew", "Ezra SIL", serif; }
header { padding: 20px 16px 8px; max-width: 1400px; margin: 0 auto; }
h1 { font-size: 20px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 13px; }
main { max-width: 1400px; margin: 0 auto; padding: 0 16px 40px; }
section.card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin-bottom: 16px; }
section.card h2 { font-size: 15px; margin: 0 0 10px; display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.toolbar { display: flex; gap: 6px; flex-wrap: wrap; font-weight: normal; }
.toolbar button { font: inherit; font-size: 13px; border: 1px solid var(--line); background: var(--soft); color: var(--ink); border-radius: 6px; padding: 3px 9px; cursor: pointer; }
.toolbar button[aria-pressed="true"] { background: var(--accent); color: var(--panel); border-color: var(--accent); }
.hint { font-size: 12px; color: var(--muted); }
.text-line { font-size: 22px; line-height: 2; }
.ot .text-line { direction: rtl; font-size: 26px; }
.vn { font-size: 12px; color: var(--accent); vertical-align: super; margin: 0 2px 0 6px; font-family: sans-serif; }
.trans { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--line); font-size: 16px; }
.trans .vn { font-size: 11px; }
.tok { cursor: pointer; border-radius: 4px; padding: 0 1px; }
.tok.var { text-decoration: underline dotted var(--accent); text-underline-offset: 4px; }

.scroller { overflow-x: auto; padding-bottom: 6px; }
.canvas { position: relative; }
.forest { display: flex; flex-direction: column; align-items: flex-start; gap: 26px; padding: 4px 0; }
.forest .box.vstart { margin-top: 14px; }
.forest .box.vstart:first-child { margin-top: 0; }
.forest .row.vstart { margin-top: 14px; }
.forest .row.vstart:first-child { margin-top: 0; }
.box { position: relative; z-index: 2; background: var(--panel); border: 1.5px solid var(--line); border-radius: 10px; padding: 8px 10px 10px; width: fit-content; min-width: 280px; max-width: 100%; margin-inline-start: calc(var(--depth, 0) * 40px); }
/* 方框宽度由原文成分与框头标签决定（标签不折行）；大意、说明、展开内容不参与宽度计算，在框内换行 */
.box > .up, .box > .more, .bh .gist { contain: inline-size; }
.box.root { border: 2.5px solid var(--accent); box-shadow: 0 2px 10px color-mix(in srgb, var(--accent) 18%, transparent); }
.box.ambiguous { background: color-mix(in srgb, var(--amb) 45%, var(--panel)); }
.bh { display: flex; gap: 4px 8px; align-items: baseline; flex-wrap: wrap; margin-bottom: 6px; user-select: none; direction: ltr; }
/* 「详情」是标签那一排的最后一项，推到行尾：它的位置只算在标签那一排（框宽按“标签 + 详情”定），大意另起一行用满框宽 */
.bh .det { margin-inline-start: auto; font: inherit; font-size: 11px; border: 1px solid var(--line); background: var(--soft); color: var(--muted); border-radius: 999px; padding: 0 8px; cursor: pointer; }
.box.open .bh .det { color: var(--ink); border-color: var(--muted); }
.box[data-form] { border-color: var(--tc); border-width: 2px; }
.box.root[data-form] { border-width: 3px; box-shadow: none; }
.box[data-form="wayyiqtol"] { --tc: #F656B8; } .box[data-form="qatal"] { --tc: #FF0000; } .box[data-form="weqatal"] { --tc: #2A7FFF; }
.box[data-form="yiqtol"] { --tc: #00CC00; } .box[data-form="participle"] { --tc: #9E5329; } .box[data-form="infinitive"] { --tc: #6B6B6B; }
.box[data-form="imperative"] { --tc: #A449FF; } .box[data-form="nominal"] { --tc: #B8B0A2; }
/* 新约方框不按时态着色（动词本身已有时态框），框头标签用中性色 */
.box[data-nt-form] { --tc: var(--muted); }
.bh .ty { font-size: 12px; font-weight: 700; color: var(--tc); border: 1.5px solid var(--tc); border-radius: 4px; padding: 0 5px; font-family: ui-monospace, Menlo, monospace; }
.bh .mk { font-size: 11px; border-radius: 4px; padding: 0 5px; color: var(--ink); background: var(--soft); border: 1px dashed var(--muted); }
.forest.ot-forms { padding-inline-start: 30px; }
.hide-forms .box[data-form] { border-color: var(--line); border-width: 1.5px; }
.hide-forms .box.root[data-form] { border-color: var(--accent); border-width: 2.5px; }
.hide-forms .bh .ty, .hide-forms .bh .mk, .hide-forms #wires .spine { display: none; }
#wires .spine { stroke: var(--muted); stroke-width: 3; stroke-linecap: round; opacity: .55; }
.forms-legend { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12px; color: var(--muted); margin-top: 6px; }
.forms-legend i { display: inline-block; width: 14px; height: 10px; border-radius: 3px; margin-inline-end: 4px; vertical-align: -1px; border: 2px solid var(--tc); }
.bh .fold { font: inherit; font-size: 11px; border: 1px solid var(--accent); background: var(--panel); color: var(--accent); border-radius: 4px; padding: 0 6px; cursor: pointer; }
.box.folded .bh .fold { background: var(--accent); color: var(--panel); border-color: var(--accent); }
.box[hidden] { display: none; }
/* 只有一个词的引语框架（εἰπόντες、לֵאמֹר）放在母句同一行的行尾，省竖向空间 */
.row { display: flex; align-items: flex-start; gap: 10px 36px; flex-wrap: wrap; }
.row > .box.side { margin-inline-start: 0; min-width: 250px; }
.row[hidden] { display: none; }
.bh .cid { font-size: 12px; font-weight: 700; color: var(--accent); border: 1.5px solid var(--accent); border-radius: 4px; padding: 0 5px; font-variant-numeric: tabular-nums; }
.bh .lab { font-size: 12px; font-weight: 600; color: var(--panel); background: var(--muted); border-radius: 4px; padding: 0 6px; }
.box.root .bh .lab { background: var(--accent); }
.bh .st { font-size: 11px; border-radius: 4px; padding: 0 5px; }
.bh .st.ambiguous { background: var(--amb); color: var(--ink); border: 1px solid var(--accent); }
.bh .st.needs-review { background: var(--rev); color: var(--ink); border: 1px solid var(--r-v); }
.bh .gist { font-size: 14px; flex: 1 1 100%; min-width: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: stretch; }
.chip { display: flex; flex-direction: column; border: 1px solid var(--line); border-top: 4px solid var(--c); border-radius: 6px; padding: 0 2px 2px; background: color-mix(in srgb, var(--c) 6%, var(--panel)); --c: var(--r-none); }
.chip > .rl { font-size: 11px; color: var(--c); font-weight: 600; padding: 1px 4px 0; min-height: 1.4em; direction: ltr; }
.hide-roles .chip > .rl { display: none; }
/* 隐藏成分名后块宽只剩字宽：给个最小宽度、内容居中，单个字母（וַ）的块不显得局促 */
.hide-roles .chip { padding-top: 2px; min-width: 30px; align-items: center; }
.chip > .ws { display: flex; flex-wrap: wrap; }
.chip > .ws > .lb { flex-basis: 100%; height: 4px; }
.chip.r-v { --c: var(--r-v); } .chip.r-s { --c: var(--r-s); }
.chip.r-o, .chip.r-o2, .chip.r-io, .chip.r-adv, .chip.r-p { --c: var(--muted); }
.chip > .ws > .w.ind { margin-inline-start: calc(var(--ind) * 28px); }
.canvas:not(.hide-case) .w[data-case="nom"] .g { font-weight: 700; }
.canvas:not(.hide-case) .w[data-case="acc"] .g { color: var(--c-acc); } .canvas:not(.hide-case) .w[data-case="gen"] .g { color: var(--c-gen); }
.canvas:not(.hide-case) .w[data-case="dat"] .g { color: var(--c-dat); } .canvas:not(.hide-case) .w[data-case="voc"] .g { color: var(--c-voc); }
.canvas:not(.hide-case) .w[data-tense] .g { border: 1.5px solid var(--t); border-radius: 4px; padding: 0 3px; background: var(--m, transparent); }
.canvas:not(.hide-case) .w[data-tense="plpf"] .g { border-width: 2.5px; }
.w[data-tense="pres"] { --t: var(--t-pres); } .w[data-tense="impf"] { --t: var(--t-impf); } .w[data-tense="fut"] { --t: var(--t-fut); }
.w[data-tense="aor"] { --t: var(--t-aor); } .w[data-tense="perf"] { --t: var(--t-perf); } .w[data-tense="plpf"] { --t: var(--t-plpf); }
.w[data-mood="ind"] { --m: var(--m-ind); } .w[data-mood="impv"] { --m: var(--m-impv); } .w[data-mood="subj"] { --m: var(--m-subj); } .w[data-mood="opt"] { --m: var(--m-opt); }
.case-legend { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12px; color: var(--muted); margin-top: 6px; align-items: baseline; }
.case-legend .o { font-size: 15px; }
.case-legend .vt { border: 1.5px solid var(--t); border-radius: 4px; padding: 0 4px; }
.case-legend .vm { background: var(--m); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; }
.chip.r-conj { --c: var(--r-conj); border-style: dashed; border-top-style: solid; }
.w { display: inline-flex; flex-direction: column; align-items: center; padding: 1px 4px 2px; border-radius: 5px; cursor: pointer; }
/* 同一词的语素之间、maqqef（־）之后紧接下一个词，不留间距 */
.w.join { padding-inline-end: 0; }
.w.join + .w { padding-inline-start: 0; }
.w .g { font-size: 20px; line-height: 1.3; white-space: nowrap; }
.ot .w .g { font-size: 24px; }
.w .m, .w .z, .w .e { font-size: 11px; color: var(--muted); line-height: 1.35; white-space: nowrap; direction: ltr; }
.w .z { color: var(--ink); font-size: 12px; }
.w.target .g { text-decoration: underline 2px var(--wire); text-underline-offset: 5px; }
/* 嵌在句中的子句：占位符（虚线小框，标子句编号），点它跳到那个子句 */
.w.slot { justify-content: center; }
.w.slot .g { font-family: ui-monospace, Menlo, monospace; font-size: 13px; font-weight: 700; color: var(--accent); border: 1.5px dashed var(--accent); border-radius: 5px; padding: 0 6px; direction: ltr; }
.ot .w.slot .g { font-size: 13px; }
.box.flash { box-shadow: 0 0 0 3px var(--hl); }
/* 旧约词干：非 qal 的动词按词干类着色，词后小标签；主动实心、被动空心 */
.w[data-stem="qal"] { --st: var(--st-qal); } .w[data-stem="niphal"] { --st: var(--st-niphal); } .w[data-stem="piel"] { --st: var(--st-piel); }
.w[data-stem="hiphil"] { --st: var(--st-hiphil); } .w[data-stem="hithpael"] { --st: var(--st-hithpael); }
.canvas:not(.hide-focus) .w[data-stem] .g { color: var(--st); }
.sb { font-size: 10px; font-weight: 700; color: var(--panel); background: var(--st); border: 1px solid var(--st); border-radius: 3px; padding: 0 3px; margin-inline-start: 2px; vertical-align: super; font-family: sans-serif; }
.w[data-passive] .sb { color: var(--st); background: transparent; }
.hide-focus .sb { display: none; }
/* 旧约：谓语前的实词成分（前置），多为焦点、对比或话题 */
.canvas:not(.hide-focus) .chip.front { border: 2px solid var(--focus); border-top: 4px solid var(--c); background: color-mix(in srgb, var(--focus) 14%, var(--panel)); }
.chip > .rl .fr { color: var(--focus); }
.hide-focus .chip > .rl .fr, .hide-focus .bh .mk.front { display: none; }
.forms-legend .sb { vertical-align: baseline; }
/* 同根不定式独立形强调动词：不定式与动词都加焦点色框 */
.canvas:not(.hide-focus) .w.cog .g, .forms-legend .cog-key { outline: 2px solid var(--focus); outline-offset: 1px; border-radius: 4px; background: color-mix(in srgb, var(--focus) 14%, transparent); }
.forms-legend .cog-key { padding: 0 4px; color: var(--ink); }
.forms-legend .front-key { border: 2px solid var(--focus); border-radius: 4px; padding: 0 5px; background: color-mix(in srgb, var(--focus) 14%, var(--panel)); color: var(--ink); }
.vb { font-size: 10px; color: var(--panel); background: var(--accent); border-radius: 3px; padding: 0 3px; margin-inline-start: 2px; vertical-align: super; font-family: sans-serif; }
.box:not(.open) .w .m, .box:not(.open) .w .z, .box:not(.open) .w .e { display: none; }
.hide-m .w .m, .hide-z .w .z, .hide-e .w .e { display: none !important; }
.more { display: none; margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--line); font-size: 13px; max-width: 46em; direction: ltr; }
.box.open .more { display: block; }
.more ul { margin: 0; padding-left: 18px; }
.more li { margin: 3px 0; }
.more .o { font-size: 15px; }
.more details { margin-top: 6px; }
.more summary { cursor: pointer; color: var(--accent); }
.more .tag { font-weight: 600; }
.up { font-size: 12px; color: var(--accent); margin-top: 6px; direction: ltr; }
#wires, #tips { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 1; overflow: visible; }
#tips { z-index: 3; }
#tips path { fill: none; stroke: var(--wire); stroke-width: 2; }
/* 有连线时句法、逻辑说明放进「详情」，不挡箭头；窄屏不画线，留在框底 */
.more .up { margin: 0 0 6px; }
.box > .up { display: none; }
#wires path { fill: none; stroke: var(--wire); stroke-width: 2; }
#wires path.tip, #tips path.tip { fill: var(--wire); stroke: none; }
#wires path.logic { stroke: var(--logic); stroke-dasharray: 6 4; }
#tips path.logic-tip { fill: var(--logic); stroke: none; }
.ll { position: absolute; z-index: 4; transform: translate(-50%, -50%); font-size: 12px; font-weight: 600; color: var(--logic); background: var(--panel); border: 1.5px dashed var(--logic); border-radius: 999px; padding: 0 7px; white-space: nowrap; pointer-events: none; direction: ltr; }
.hide-logic .ll { display: none; }
.up .lg { color: var(--logic); }
@media (max-width: 760px) {
  .forest { gap: 12px; }
  .box { margin-inline-start: calc(var(--depth, 0) * 14px); max-width: calc(100% - var(--depth, 0) * 14px); }
  #wires, #tips, .ll { display: none; }
  .box > .up { display: block; }
  .more .up { display: none; }
}
.legend { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--muted); margin-top: 12px; }
.legend span::before { content: ""; display: inline-block; width: 14px; height: 4px; margin-right: 4px; vertical-align: middle; background: var(--c); }
.hl { background: var(--hl) !important; }
.sel { outline: 2px solid var(--accent); }
#pop { position: absolute; z-index: 10; width: min(380px, calc(100% - 8px)); background: var(--panel); border: 1.5px solid var(--accent); border-radius: 10px; padding: 10px 12px; box-shadow: 0 8px 28px rgba(0,0,0,.18); display: none; font-size: 13px; direction: ltr; }
#pop.show { display: block; }
#pop .lemma { font-size: 24px; }
#pop .x { position: absolute; right: 8px; top: 4px; border: none; background: none; color: var(--muted); font-size: 18px; cursor: pointer; }
#pop dl { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 3px 8px; margin: 6px 0; }
#pop dt { color: var(--muted); }
#pop dd { margin: 0; }
#pop .warn { background: color-mix(in srgb, var(--accent) 14%, var(--panel)); border-left: 3px solid var(--accent); padding: 4px 8px; border-radius: 4px; margin: 6px 0; }
#pop details { margin-top: 6px; }
#pop summary { cursor: pointer; color: var(--accent); }
#pop .def { white-space: pre-wrap; background: var(--soft); border-radius: 6px; padding: 8px; max-height: 220px; overflow: auto; margin-top: 4px; }
`;

/** 页面脚本：只用 data 与 DOM，不得引用模块里的其他东西（以源码嵌入页面）。 */
function diagramClient(D: DiagramData): void {
  const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) => root.querySelector(selector) as T;
  const $$ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) => [...root.querySelectorAll(selector)] as T[];
  const esc = (value: unknown) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
  /** 文字里的希腊文、希伯来文换原文字体。 */
  const orig = (value: string) => esc(value).replace(/[Ͱ-Ͽἀ-῿֐-׿][Ͱ-Ͽἀ-῿֐-׿̀-ͯʼ’᾽ ]*/g, (run) => `<span class="o">${run}</span>`);
  const ROLE_ZH: Record<string, string> = { s: '主语', v: '谓语', o: '宾语', o2: '宾补', io: '间接宾语', adv: '状语', p: '表语', conj: '连接词' };
  const TENSE_ZH: Record<string, string> = { pres: '现在', impf: '未完成', fut: '将来', aor: '不定过去', perf: '完成', plpf: '过去完成' };
  const MOOD_ZH: Record<string, string> = { ind: '直说', subj: '虚拟', opt: '祈愿', impv: '祈使', inf: '不定式', ptcp: '分词' };
  const words = D.words;
  const punct = (after: string) => after.trim();

  document.body.classList.toggle('ot', D.isOT);

  // ---------- 原文与译文 ----------
  const text = $('#text');
  const trans = $('#trans');
  for (const verse of D.verses) {
    text.insertAdjacentHTML('beforeend', `<span class="vn">${verse.verse}</span>`);
    for (const id of verse.wordIds) {
      const word = words[id];
      const span = document.createElement('span');
      span.className = `tok${word.variant ? ' var' : ''}`;
      span.dataset.id = id;
      span.textContent = word.text;
      text.append(span, document.createTextNode(word.after));
    }
    if (verse.translation) {
      trans.insertAdjacentHTML('beforeend', `<span class="vn">${verse.verse}</span>${esc(verse.translation)}`);
    }
  }
  if (!trans.textContent) {
    trans.remove();
  } else if (D.literalness) {
    trans.insertAdjacentHTML('beforeend', ` <span class="hint">（${esc(D.literalness)}）</span>`);
  }

  // ---------- 结构图：每个子句一行，按原文先后排，缩进 = 从属层级 ----------
  const byId = new Map(D.clauses.map((clause) => [clause.id, clause]));
  const firstWord = (clause: (typeof D.clauses)[number]) => clause.chips[0]?.wordIds[0] ?? clause.fromWordId;
  const kids = new Map<string, string[]>();
  for (const clause of D.clauses) {
    if (clause.parentId && byId.has(clause.parentId)) {
      kids.set(clause.parentId, [...(kids.get(clause.parentId) ?? []), clause.id]);
    }
  }
  const descendants = (id: string, seen = new Set<string>()): string[] =>
    (kids.get(id) ?? []).filter((kid) => !seen.has(kid) && seen.add(kid)).flatMap((kid) => [kid, ...descendants(kid, seen)]);
  const depthOf = (clause: (typeof D.clauses)[number]): number => {
    let depth = 0;
    const seen = new Set<string>();
    for (let parent = clause.parentId; parent && byId.has(parent) && !seen.has(parent); parent = byId.get(parent)!.parentId) {
      seen.add(parent);
      depth += 1;
    }
    return depth;
  };
  const targets = new Set(D.clauses.map((clause) => clause.targetWordId).filter(Boolean));
  // 旧约句型码 → 动词形式（着色用）；X 在动词前 = 成分前置
  const formOf = (clause: (typeof D.clauses)[number]): string | null => {
    if (!D.isOT) return clause.ntForm ? `nt-${clause.ntForm.split('-')[0]}` : null;
    const type = clause.type;
    if (!type) return null;
    if (/^Way/.test(type)) return 'wayyiqtol';
    if (type === 'WQtl') return 'weqatal';
    if (/Qtl/.test(type)) return 'qatal';
    if (/Yqt/.test(type)) return 'yiqtol';
    if (type === 'Impv') return 'imperative';
    if (type === 'Ptcp') return 'participle';
    if (/^Inf/.test(type)) return 'infinitive';
    if (type === 'NmCl') return 'nominal';
    return null;
  };
  const FORM_ZH: Record<string, string> = { wayyiqtol: 'wayyiqtol', qatal: 'qatal', weqatal: 'weqatal', yiqtol: 'yiqtol', participle: '分词', infinitive: '不定式', imperative: '祈使', nominal: '名词句' };
  const STEM_TAG: Record<string, string> = {
    qal: 'Q', 'qal passive': 'Qp', niphal: 'Ni', piel: 'Pi', pual: 'Pu', hiphil: 'Hi', hophal: 'Ho', hithpael: 'Ht', polel: 'Po', polal: 'Pol',
    poel: 'Po', poal: 'Poa', pilpel: 'Pil', polpal: 'Ppl', hithpolel: 'Htp', hishtaphel: 'Hsht',
  };
  // 叙事主线：旧约顶层子句里 wayyiqtol 是主线，新约叙事书卷里是不定过去式直说语气；其余形式离开主线（背景、评述、凸显）
  const mainline = D.isOT || D.narrative;
  const offline = (clause: (typeof D.clauses)[number]) => mainline && !clause.parentId && formOf(clause) !== null
    && (D.isOT ? formOf(clause) !== 'wayyiqtol' : clause.ntForm !== 'aor-ind');
  const OFFLINE_TITLE = D.isOT ? '顶层叙事不用 wayyiqtol：离开主线，多为背景、评述或凸显'
    : '顶层叙事不用不定过去式直说语气：未完成式、过去完成式多为背景，现在式多为历史现在式或评述，完成式表结果状态';
  // 子句编号：bcv+字母，显示为「节+字母」；范围跨章时带章号
  const chapterOf = (id: string) => Math.floor(Number(id.match(/^\d+/)![0]) / 1000) % 1000;
  const multiChapter = new Set(D.clauses.map((clause) => chapterOf(clause.id))).size > 1;
  const clauseNo = (id: string) => {
    const [, bcv, sub] = id.match(/^(\d+)([a-z]+)$/) ?? [, '0', id];
    const verse = Number(bcv) % 1000;
    return multiChapter ? `${chapterOf(id)}:${verse}${sub}` : `${verse}${sub}`;
  };

  function renderBox(clause: (typeof D.clauses)[number], forest: HTMLElement, verseStart: boolean): HTMLElement {
    const depth = depthOf(clause);
    const box = document.createElement('div');
    box.className = `box${depth === 0 ? ' root' : ''}${clause.status === 'ambiguous' ? ' ambiguous' : ''}${verseStart ? ' vstart' : ''}`;
    box.dataset.box = clause.id;
    box.style.setProperty('--depth', String(depth));
    const form = formOf(clause);
    if (form) {
      box.dataset[D.isOT ? 'form' : 'ntForm'] = form;
    }
    const front = clause.chips.filter((chip) => chip.fronted).map((chip) => (chip.role ? ROLE_ZH[chip.role] : '成分'));
    const marks = [front.length > 0 ? `<span class="mk front" title="动词前有${esc(front.join('、'))}前置（X-动词语序），常用来凸显焦点、对比或转入背景">前置</span>` : '',
      offline(clause) ? `<span class="mk" title="${OFFLINE_TITLE}">离线</span>` : '',
      clause.cognate.length > 0 ? '<span class="mk front" title="同根的不定式独立形强调动词本身（必定、痛……），如 מוֹת תָּמוּת、וַתִּבְכֶּה בָכֹה">同根强调</span>' : ''].join('');
    const ntBadge = () => {
      const [tense, mood] = clause.ntForm!.split('-');
      return mood === 'inf' || mood === 'ptcp' ? `${TENSE_ZH[tense]}${MOOD_ZH[mood]}` : `${TENSE_ZH[tense]}·${MOOD_ZH[mood]}`;
    };
    const typeBadge = !form ? '' : D.isOT ? `<span class="ty" title="${esc(FORM_ZH[form])}">${esc(clause.type)}</span>${marks}`
      : `<span class="ty" title="谓语动词的时态与语气">${esc(ntBadge())}</span>${marks}`;
    const status = clause.status === 'ambiguous' ? '<span class="st ambiguous">有歧义</span>' : clause.status === 'needs-review' ? '<span class="st needs-review">待复核</span>' : '';
    const foldButton = descendants(clause.id).length > 0 ? '<button type="button" class="fold" title="收起/展开这个分支（隐藏或显示下属子句）">收起分支</button>' : '';
    box.innerHTML = `<div class="bh">${foldButton}<span class="cid">${esc(clauseNo(clause.id))}</span>${typeBadge}<span class="lab">${esc(clause.label)}</span>${status}<button type="button" class="det" title="词义、要点与分析记录">详情 ▾</button><span class="gist">${esc(clause.gist)}</span></div>`;
    const chips = document.createElement('div');
    chips.className = 'chips';
    for (const chip of clause.chips) {
      const el = document.createElement('div');
      el.className = `chip${chip.role ? ` r-${chip.role}` : ''}${chip.fronted ? ' front' : ''}`;
      const frontLabel = chip.fronted ? `<span class="fr">${chip.role ? ' · ' : ''}前置</span>` : '';
      el.innerHTML = `<span class="rl">${chip.role ? ROLE_ZH[chip.role] : ''}${frontLabel}</span><span class="ws"></span>`;
      const ws = $('.ws', el);
      for (const [index, id] of chip.wordIds.entries()) {
        const word = words[id];
        const w = document.createElement('span');
        // 与下一个语素相连（同一词、maqqef）且下一个在同一块里时才去掉间距；跨块的（וַ 是连接词、动词在下一块）照常留边
        const joined = (word.after === '' || word.after === '־') && index < chip.wordIds.length - 1;
        w.className = `w${targets.has(id) ? ' target' : ''}${joined ? ' join' : ''}${clause.cognate.includes(id) ? ' cog' : ''}`;
        w.dataset.id = id;
        for (const key of ['gcase', 'tense', 'mood'] as const) {
          if (word[key]) {
            w.dataset[key === 'gcase' ? 'case' : key] = word[key]!;
          }
        }
        if (word.stem) {
          w.dataset.stem = word.stem.family;
          if (word.stem.passive) {
            w.dataset.passive = '';
          }
        }
        if (chip.indents) {
          w.dataset.indent = String(chip.indents[chip.wordIds.indexOf(id)]);
        }
        w.innerHTML = `<span class="g o">${esc(word.text)}${esc(punct(word.after))}${word.variant ? '<span class="vb">异</span>' : ''}`
          + `${word.stem ? `<span class="sb" title="${esc(word.stem.name)}">${esc(STEM_TAG[word.stem.name] ?? word.stem.name.slice(0, 3))}</span>` : ''}</span>`
          + `<span class="m">${esc(word.morph)}</span><span class="z">${esc(word.rendering ?? word.glossZh ?? '—')}</span><span class="e">${esc(word.glossEn)}</span>`;
        if (chip.pauses) {
          w.dataset.pause = String(chip.pauses[chip.wordIds.indexOf(id)]);
        }
        ws.append(w);
      }
      // 嵌入子句的占位符插在 wordIds[at] 之前
      for (const slot of [...chip.slots ?? []].sort((a, b) => b.at - a.at)) {
        const w = document.createElement('span');
        w.className = 'w slot';
        w.dataset.slot = slot.id;
        w.title = `这里嵌着子句 ${slot.clauseIds.map(clauseNo).join('、')}，点击跳到那里`;
        w.innerHTML = `<span class="g">⟨${esc(slot.clauseIds.map(clauseNo).join(' '))}⟩</span>`;
        if (chip.pauses) {
          w.dataset.pause = String(slot.pause ?? 0);
        }
        const before = $$('.w', ws)[slot.at];
        ws.insertBefore(w, before ?? null);
        w.addEventListener('click', () => {
          const target = $(`[data-box="${slot.clauseIds[0]}"]`);
          if (!target || target.hidden) {
            return;
          }
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('flash');
          setTimeout(() => target.classList.remove('flash'), 1200);
        });
      }
      chips.append(el);
    }
    box.append(chips);
    const points = clause.points.map((point) => `<li>${orig(point)}</li>`).join('');
    const records = clause.records.map((record) => `<li><span class="tag">${esc(record.tag)}</span>：${orig(record.text)}</li>`).join('');
    const ups: string[] = [];
    if (clause.parentId && byId.has(clause.parentId)) {
      const target = clause.targetWordId ? ` <span class="o">${esc(words[clause.targetWordId]?.text)}</span>` : '';
      ups.push(`↳ 句法：属 ${esc(clauseNo(clause.parentId))}${clause.link ? ` · ${esc(clause.link)}` : ''}${target}`);
    }
    if (clause.logic) {
      ups.push(`<span class="lg">⇢ 逻辑：${esc(clause.logic.label)} → ${esc(clause.logic.targetText)}${clause.logic.note ? ` · ${esc(clause.logic.note)}` : ''}</span>`);
    }
    const up = ups.length > 0 ? `<div class="up">${ups.join('<br>')}</div>` : '';
    box.insertAdjacentHTML('beforeend', `<div class="more">${up}${points ? `<ul>${points}</ul>` : ''}`
      + (records ? `<details${points ? '' : ' open'}><summary>分析与翻译记录（${clause.records.length}）</summary><ul>${records}</ul></details>` : '')
      + (!points && !records && !up ? '<span class="hint">没有备注。</span>' : '') + `</div>${up}`);
    $('.det', box).addEventListener('click', () => setOpen(box, !box.classList.contains('open')));
    box.querySelector('.fold')?.addEventListener('click', (event) => {
      event.stopPropagation();
      setFolded(clause.id, !box.classList.contains('folded'));
    });
    forest.append(box);
    return box;
  }

  const forest = $('#forest');
  forest.classList.toggle('ot-forms', mainline && D.clauses.some((clause) => formOf(clause)));
  let lastVerse = '';
  // 词数：旧约一个词可能由几个语素组成（לֵ־אמֹר），语素之间 after 为空
  const wordCount = (ids: string[]) => ids.filter((id, i) => i === ids.length - 1 || words[id].after !== '').length;
  // 引语框架：只有一个说话动词（λέγω、εἶπον、φημί、ἀποκρίνομαι、λαλέω、אָמַר、דָּבַר）、下面还挂着引出的话，
  // 母句已经画出来时，放到母句那一行的行尾。נִחַשְׁתִּי 这类带内容从句的普通动词不算
  const SPEECH = /^(G3004|G2036|G5346|G0611|G2980|H0559|H1696)/;
  const isSide = (clause: (typeof D.clauses)[number]) => {
    const ids = clause.chips.flatMap((chip) => chip.wordIds);
    return Boolean(clause.parentId && byId.has(clause.parentId) && kids.has(clause.id))
      && wordCount(ids) === 1 && ids.some((id) => SPEECH.test(words[id].strong));
  };
  // 只有一个 הָיָה 的过渡句（וַיְהִי、וְהָיָה）：它引出的第一个从句（多为时间从句）排在它同一行的行尾
  const isMarker = (clause: (typeof D.clauses)[number]) => {
    const ids = clause.chips.flatMap((chip) => chip.wordIds);
    return D.isOT && kids.has(clause.id) && wordCount(ids) === 1 && ids.some((id) => /^H1961/.test(words[id].strong));
  };
  const besideMarker = (clause: (typeof D.clauses)[number]) => {
    const parent = clause.parentId ? byId.get(clause.parentId) : undefined;
    return Boolean(parent && isMarker(parent) && kids.get(parent.id)!.map((id) => byId.get(id)!)
      .sort((a, b) => firstWord(a).localeCompare(firstWord(b)))[0] === clause);
  };
  for (const clause of [...D.clauses].sort((a, b) => firstWord(a).localeCompare(firstWord(b)))) {
    const verse = clause.id.replace(/[a-z]+$/, '');
    const parentBox = isSide(clause) || besideMarker(clause) ? $(`[data-box="${clause.parentId}"]`) : null;
    if (parentBox) {
      let row = parentBox.parentElement!;
      if (!row.classList.contains('row')) {
        row = document.createElement('div');
        // 节首的上边距移到整行上，行里的方框顶边对齐
        row.className = `row${parentBox.classList.contains('vstart') ? ' vstart' : ''}`;
        parentBox.classList.remove('vstart');
        parentBox.replaceWith(row);
        row.append(parentBox);
      }
      renderBox(clause, row, false).classList.add('side');
    } else {
      renderBox(clause, forest, verse !== lastVerse);
    }
    lastVerse = verse;
  }

  // ---------- 成分块切行：按实际排版宽度，超宽时在停顿最强的一级处切（同级的一起切；最弱一级只切一处，取两边最匀的位置），递归到每行够窄 ----------
  const LINE_MAX = 460;
  function layoutChips(scope: ParentNode = document): void {
    const forestWidth = $('#forest').clientWidth;
    for (const ws of $$('.chip > .ws', scope)) {
      $$('.lb', ws).forEach((lb) => lb.remove());
      ws.style.width = '';
      const items = $$('.w', ws);
      items.forEach((item) => item.classList.remove('ind'));
      if (items.length < 2 || !items[0].dataset.pause) {
        continue;
      }
      const box = ws.closest<HTMLElement>('.box')!;
      const depth = Number(box.style.getPropertyValue('--depth') || 0);
      const max = Math.max(160, Math.min(LINE_MAX, forestWidth - depth * 40 - 140));
      const widths = items.map((item) => item.getBoundingClientRect().width);
      const pauses = items.map((item) => Number(item.dataset.pause));
      const cuts = new Set<number>();
      const width = (from: number, to: number) => widths.slice(from, to).reduce((sum, value) => sum + value, 0);
      const split = (from: number, to: number): void => {
        if (width(from, to) <= max) {
          return;
        }
        let best = -1;
        for (let index = from; index < to - 1; index += 1) {
          if (pauses[index] < 0) {
            continue;
          }
          const balance = (i: number) => Math.abs(width(from, i + 1) - width(i + 1, to));
          if (best < 0 || pauses[index] > pauses[best] || (pauses[index] === pauses[best] && balance(index) < balance(best))) {
            best = index;
          }
        }
        if (best < 0) {
          return;
        }
        // 同一级的停顿（强度相同的重音、同类的句法边界）一起断，各段对等；最弱一级（不到 1）只断一处
        const level = pauses[best];
        const same = level >= 1 ? [...Array(to - 1 - from).keys()].map((k) => from + k).filter((i) => pauses[i] === level) : [best];
        same.forEach((index) => cuts.add(index));
        [from, ...same.map((index) => index + 1)].forEach((start, k, starts) => split(start, starts[k + 1] ?? to));
      };
      let start = 0;
      pauses.forEach((pause, index) => {
        if (pause >= 9 && index < items.length - 1) {
          cuts.add(index);
          split(start, index + 1);
          start = index + 1;
        }
      });
      split(start, items.length);
      // 嵌入的分词短语、关系从句起头的行缩进（每级 28px，同 .w.ind）
      const indentOf = (index: number) => Number(items[index]?.dataset.indent ?? 0);
      for (const index of cuts) {
        items[index].insertAdjacentHTML('afterend', '<span class="lb"></span>');
        if (indentOf(index + 1) > 0) {
          items[index + 1].classList.add('ind');
          items[index + 1].style.setProperty('--ind', String(indentOf(index + 1)));
        }
      }
      // 折行后块宽取最宽的一行，方框随之收窄（否则仍按未折行的整行宽度撑开）
      if (cuts.size > 0) {
        const ends = [...cuts].sort((a, b) => a - b).map((index) => index + 1);
        const lines = [0, ...ends].map((from, i) => width(from, ends[i] ?? items.length) + (from > 0 ? indentOf(from) * 28 : 0));
        ws.style.width = `${Math.ceil(Math.max(...lines)) + 1}px`;
      }
    }
  }

  // ---------- 分支展开/收起：收起的方框隐藏全部下属子句，按钮显示收起了几句 ----------
  function applyFolds(): void {
    const hidden = new Set($$('.box.folded').flatMap((box) => descendants(box.dataset.box!)));
    for (const box of $$('.box')) {
      box.hidden = hidden.has(box.dataset.box!);
      const row = box.parentElement!;
      if (row.classList.contains('row')) {
        row.hidden = [...row.children].every((item) => hidden.has((item as HTMLElement).dataset.box!));
      }
      const button = box.querySelector<HTMLElement>('.fold');
      if (button) {
        button.textContent = box.classList.contains('folded') ? '展开分支' : '收起分支';
      }
    }
    hidePop();
    redraw();
  }
  function setFolded(id: string, folded: boolean): void {
    $(`[data-box="${id}"]`)?.classList.toggle('folded', folded);
    applyFolds();
  }
  $('#foldAll').addEventListener('click', () => {
    $$('.box').forEach((box) => box.classList.toggle('folded', !byId.get(box.dataset.box!)?.parentId && kids.has(box.dataset.box!)));
    applyFolds();
  });
  $('#unfoldAll').addEventListener('click', () => {
    $$('.box').forEach((box) => box.classList.remove('folded'));
    applyFolds();
  });

  function setOpen(box: HTMLElement, open: boolean): void {
    box.classList.toggle('open', open);
    $('.det', box).textContent = open ? '详情 ▴' : '详情 ▾';
    layoutChips(box);
    hidePop();
  }
  $('#openAll').addEventListener('click', () => $$('.box').forEach((box) => setOpen(box, true)));
  $('#closeAll').addEventListener('click', () => $$('.box').forEach((box) => setOpen(box, false)));
  $$<HTMLButtonElement>('[data-toggle]').forEach((button) => button.addEventListener('click', () => {
    const on = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(on));
    $('#canvas').classList.toggle(`hide-${button.dataset.toggle}`, !on);
    layoutChips();
    redraw();
  }));

  // ---------- 连线：竖线走在子句缩进留出的沟槽里，到母句旁的空隙再横折，指到被修饰的词 ----------
  const SVG = 'http://www.w3.org/2000/svg';
  function drawWires(): void {
    const canvas = $('#canvas');
    const svg = $<SVGSVGElement>('#wires');
    $$('.ll', canvas).forEach((label) => label.remove());
    svg.innerHTML = '';
    const base = canvas.getBoundingClientRect();
    const tips = $<SVGSVGElement>('#tips');
    tips.innerHTML = '';
    for (const layer of [svg, tips]) {
      layer.setAttribute('width', String(canvas.scrollWidth));
      layer.setAttribute('height', String(canvas.scrollHeight));
    }
    if (matchMedia('(max-width: 760px)').matches) {
      return;
    }
    const rtl = D.isOT;
    const start = (rect: DOMRect) => (rtl ? rect.right : rect.left) - base.left;
    const allBoxes = $$('.box', canvas);
    // 已画线段（横、竖），候选位置按与它们的交叉数取最少；同一条主干上的重合不算交叉
    type Seg = { x1: number; y1: number; x2: number; y2: number };
    const segs: Seg[] = [];
    const crosses = (a: Seg, b: Seg) => {
      const [h, v] = a.y1 === a.y2 ? [a, b] : [b, a];
      if (h.y1 !== h.y2 || v.x1 !== v.x2) {
        return false;
      }
      const [hx1, hx2] = [Math.min(h.x1, h.x2), Math.max(h.x1, h.x2)];
      const [vy1, vy2] = [Math.min(v.y1, v.y2), Math.max(v.y1, v.y2)];
      return v.x1 > hx1 + 1 && v.x1 < hx2 - 1 && h.y1 > vy1 + 1 && h.y1 < vy2 - 1;
    };
    const cost = (path: Seg[]) => path.reduce((sum, seg) => sum + segs.filter((other) => crosses(seg, other)).length, 0);
    const polyline = (points: Array<[number, number]>): Seg[] => points.slice(1).map(([x, y], i) => ({ x1: points[i][0], y1: points[i][1], x2: x, y2: y }));
    /** 折线的 path；hops 是与已画线段的交叉点，在那里画一个小半圆跨过去（看得出是交叉而过，不是接在一起）。 */
    const HOP = 5;
    const pathD = (points: Array<[number, number]>, hops: Array<[number, number]> = []) => points.map(([x, y], i) => {
      if (i === 0) {
        return `M${x},${y}`;
      }
      const [px, py] = points[i - 1];
      const length = Math.hypot(x - px, y - py) || 1;
      const [ux, uy] = [(x - px) / length, (y - py) / length];
      const along = hops.map(([hx, hy]) => ({ hx, hy, t: (hx - px) * ux + (hy - py) * uy }))
        .filter(({ hx, hy, t }) => t > HOP + 1 && t < length - HOP - 1 && Math.abs((hx - px) * uy - (hy - py) * ux) < 0.5)
        .sort((a, b) => a.t - b.t);
      return along.map(({ hx, hy }) => `L${hx - ux * HOP},${hy - uy * HOP} A${HOP},${HOP} 0 0 1 ${hx + ux * HOP},${hy + uy * HOP}`).join(' ') + ` L${x},${y}`;
    }).join(' ');
    /** points 与已画线段的交叉点。 */
    const crossings = (points: Array<[number, number]>): Array<[number, number]> => polyline(points).flatMap((seg) => segs.filter((other) => crosses(seg, other))
      .map((other): [number, number] => (seg.x1 === seg.x2 ? [seg.x1, other.y1] : [other.x1, seg.y1])));
    /** 与已画的竖线并排、又贴得太近（不到 10px，共用主干的除外）的竖段数。 */
    const crowded = (points: Array<[number, number]>) => polyline(points).filter((seg) => seg.x1 === seg.x2).reduce((sum, seg) => sum + segs.filter((other) => other.x1 === other.x2
      && Math.abs(other.x1 - seg.x1) >= 1 && Math.abs(other.x1 - seg.x1) < 10
      && Math.min(Math.max(seg.y1, seg.y2), Math.max(other.y1, other.y2)) > Math.max(Math.min(seg.y1, seg.y2), Math.min(other.y1, other.y2))).length, 0);
    /**
     * 带箭头的线：线画在 layer，只画到箭头底边（线宽不会从箭头尖两侧露出来）；箭头是单独的三角形，
     * 一律画在最上层（#tips），不被方框边框盖住，各处大小一样。
     */
    const ARROW = 9;
    const arrow = (layer: SVGSVGElement, points: Array<[number, number]>, cls = '', hops: Array<[number, number]> = []): void => {
      const [tx, ty] = points.at(-1)!;
      const [px, py] = points.at(-2)!;
      const length = Math.hypot(tx - px, ty - py) || 1;
      const [dx, dy] = [(tx - px) / length, (ty - py) / length];
      const [bx, by] = [tx - dx * ARROW, ty - dy * ARROW];
      const line = document.createElementNS(SVG, 'path');
      if (cls) {
        line.setAttribute('class', cls);
      }
      line.setAttribute('d', pathD([...points.slice(0, -1), [bx, by]], hops));
      layer.append(line);
      const head = document.createElementNS(SVG, 'path');
      head.setAttribute('class', cls ? `${cls}-tip` : 'tip');
      head.setAttribute('d', `M${tx},${ty} L${bx - dy * 4.5},${by + dx * 4.5} L${bx + dy * 4.5},${by - dx * 4.5} z`);
      tips.append(head);
    };

    // ---- 句法：指向同一个词的线共用一条横道（汇成主干）；同一母句里指向不同词的，横道上下错开 ----
    const lanes = new Map<string, Map<string, number>>();
    // 每条线有几种走法（从子句顶边/底边直接出、起始侧沟槽、尾侧沟槽），排除穿过其他方框的，
    // 按「交叉数 → 折点数 → 长度」取最好的；跨度短的先定
    // into：箭头伸进母句框、指到被修饰词的那一段（画在方框上层）；没有目标词时为 null，箭头停在框边
    type Wire = { candidates: Array<Array<[number, number]>>; span: number; farFrom: number; into: number | null };
    // 尾侧是逻辑虚线走的地方：显示逻辑关系时，句法连线走尾侧要多付代价（逻辑线进出方框的横线都会穿过它）
    const farPenalty = canvas.classList.contains('hide-logic') ? 0 : 1500;
    const wires: Wire[] = [];
    // 画逻辑虚线的方框（起点与关联的子句）
    const logicBoxes = new Set(D.clauses.flatMap((clause) => (clause.logic && clause.logic.targetIds.length > 0 ? [clause.id, clause.logic.targetIds[0]] : [])));
    const visible = allBoxes.filter((box) => !box.hidden).map((box) => {
      const r = box.getBoundingClientRect();
      return { box, left: r.left - base.left, right: r.right - base.left, top: r.top - base.top, bottom: r.bottom - base.top };
    });
    const endOf = (rect: DOMRect) => (rtl ? rect.left : rect.right) - base.left;
    /** 竖线 x 从 y1 到 y2 是否穿过 skip 以外的方框。 */
    const blockedV = (x: number, y1: number, y2: number, skip: HTMLElement[]) => visible.some((item) => !skip.includes(item.box)
      && x > item.left - 3 && x < item.right + 3 && Math.max(y1, y2) > item.top && Math.min(y1, y2) < item.bottom);
    // 连线指到母句里的占位符（嵌入子句）或被修饰的词
    const targetOf = (clause: (typeof D.clauses)[number], parentBox: HTMLElement) => clause.targetSlot
      ? $(`[data-slot="${clause.targetSlot}"] .g`, parentBox)
      : clause.targetWordId ? $(`[data-id="${clause.targetWordId}"] .g`, parentBox) : null;
    for (const clause of D.clauses) {
      if (!clause.parentId || !byId.has(clause.parentId)) {
        continue;
      }
      const childBox = $(`[data-box="${clause.id}"]`);
      const parentBox = $(`[data-box="${clause.parentId}"]`);
      if (!childBox || !parentBox || childBox.hidden || parentBox.hidden) {
        continue;
      }
      const c = childBox.getBoundingClientRect();
      const p = parentBox.getBoundingClientRect();
      // 行尾的引语框架、过渡句引出的从句：一根横线从它的起始边指回母句的尾边，高度对着被修饰的词（排不下折到下一行时照常布线）
      if (childBox.classList.contains('side') && c.top < p.bottom) {
        const word = targetOf(clause, parentBox)?.getBoundingClientRect();
        const y = Math.round((word ? word.top + word.height / 2 : p.top + p.height / 2) - base.top);
        const points: Array<[number, number]> = [[start(c), y], [endOf(p) + (rtl ? -1 : 1), y]];
        segs.push(...polyline(points));
        arrow(svg, points);
        continue;
      }
      const below = c.top >= p.bottom;
      const laneKey = `${clause.parentId}|${below ? 'b' : 'a'}`;
      const byTarget = lanes.get(laneKey) ?? new Map<string, number>();
      const targetKey = clause.targetSlot ?? clause.targetWordId ?? '';
      if (!byTarget.has(targetKey)) {
        byTarget.set(targetKey, byTarget.size);
      }
      lanes.set(laneKey, byTarget);
      const lane = byTarget.get(targetKey)!;
      const skip = [childBox, parentBox];
      // 连线的起止点放在边的中段，不贴着框角：侧边取垂直中点，顶边、底边取中间 60%
      const yChild = Math.round(c.top + c.height / 2 - base.top);
      const target = targetOf(clause, parentBox);
      const t = target?.getBoundingClientRect();
      const edge = (below ? p.bottom : p.top) - base.top;
      // 从下方来的箭头伸进框里指到词的下沿；从上方来的停在框边（框头的编号、译文在词的上面）
      const into = t && below ? t.bottom - base.top + 3 : null;
      const tip = into !== null ? edge : below ? edge + 1 : edge - 1;
      // 横道离母句至少 13px：箭头（9px）前留一段竖线，折点不直接接在箭头上；多条横道相隔 4px，都在框间 26px 的空隙里
      const yLane = below ? edge + 13 + lane * 4 : edge - 13 - lane * 4;
      const xT = t ? t.left + t.width / 2 - base.left : (c.left + c.right) / 2 - base.left;
      const candidates: Array<Array<[number, number]>> = [];
      // 1) 从子句朝母句的那条边直接出：能对准被修饰词就一根竖线，否则在母句旁的空隙横折一次
      const childEdge = (below ? c.top : c.bottom) - base.top;
      const [cl, cr] = [c.left - base.left + c.width * 0.2, c.right - base.left - c.width * 0.2];
      // 目标词对着子句框底边、顶边的中段时直接一根竖线；否则横折，折出来的横段太短（不到 16px）不好看，不用
      const straight = xT >= cl && xT <= cr;
      const exits = [...new Set([Math.min(Math.max(xT, cl), cr), (cl + cr) / 2, rtl ? cr : cl].map(Math.round))]
        .map((x) => (straight && Math.abs(x - xT) < 16 ? xT : x))
        .filter((x) => x === xT || Math.abs(x - xT) >= 16);
      for (const x of [...new Set(exits)]) {
        if (Math.abs(x - xT) < 1) {
          if (!blockedV(xT, childEdge, tip, skip)) {
            candidates.push([[xT, childEdge], [xT, tip]]);
          }
        } else if (!blockedV(x, childEdge, yLane, skip)) {
          candidates.push([[x, childEdge], [x, yLane], [xT, yLane], [xT, tip]]);
        }
      }
      // 1b) 目标词在子句框的左右外侧时，从那一侧的边横出、再竖直指到词：只折一次。
      // 横段放在边的上部（逻辑虚线接在边的中点）；竖线、横段都不能穿过别的框；
      // 走尾侧时，竖线旁边若有带逻辑关系的框，逻辑虚线进出框的横线会穿过竖线，不用
      const sideX = xT < c.left - base.left - 16 ? c.left - base.left : xT > c.right - base.left + 16 ? c.right - base.left : null;
      if (sideX !== null) {
        const ySide = Math.round(c.top - base.top + Math.min(c.height * 0.3, 40));
        const onFar = rtl ? sideX === c.left - base.left : sideX === c.right - base.left;
        const between = visible.filter((item) => !skip.includes(item.box) && item.top < ySide && item.bottom > tip);
        const blockedH = visible.some((item) => !skip.includes(item.box) && ySide > item.top - 3 && ySide < item.bottom + 3
          && Math.max(item.left, Math.min(sideX, xT)) < Math.min(item.right, Math.max(sideX, xT)));
        const logicBeside = onFar && !canvas.classList.contains('hide-logic')
          && between.some((item) => logicBoxes.has(item.box.dataset.box!) && (rtl ? item.left > xT : item.right < xT));
        if (!blockedH && !logicBeside && !blockedV(xT, ySide, tip, skip)) {
          candidates.push([[sideX, ySide], [xT, ySide], [xT, tip]]);
        }
      }
      // 2) 起始侧沟槽：在子句与母句之间所有方框的起始侧之外
      let gutter = start(c) + (rtl ? 16 : -16);
      for (const item of visible) {
        if (!skip.includes(item.box) && item.top < Math.max(childEdge, edge) && item.bottom > Math.min(childEdge, edge)) {
          gutter = rtl ? Math.max(gutter, (rtl ? item.right : item.left) + 10) : Math.min(gutter, item.left - 10);
        }
      }
      for (let k = 0; k < 6; k += 1) {
        const g = gutter + (rtl ? 1 : -1) * k * 6;
        candidates.push([[start(c), yChild], [g, yChild], [g, yLane], [xT, yLane], [xT, tip]]);
      }
      // 3) 尾侧沟槽
      let far = endOf(c);
      for (const item of visible) {
        if (item.top < Math.max(childEdge, edge) && item.bottom > Math.min(childEdge, edge)) {
          far = rtl ? Math.min(far, item.left) : Math.max(far, item.right);
        }
      }
      const farFrom = candidates.length;
      for (let k = 0; k < 4; k += 1) {
        const g = far + (rtl ? -1 : 1) * (10 + k * 6);
        candidates.push([[endOf(c), yChild], [g, yChild], [g, yLane], [xT, yLane], [xT, tip]]);
      }
      wires.push({ candidates, span: Math.abs(childEdge - edge), farFrom, into });
    }
    const verticals: Array<{ x: number; top: number; bottom: number }> = [];
    const length = (points: Array<[number, number]>) => points.slice(1).reduce((sum, [x, y], i) => sum + Math.abs(x - points[i][0]) + Math.abs(y - points[i][1]), 0);
    for (const wire of wires.sort((a, b) => a.span - b.span)) {
      let best = wire.candidates[0];
      let bestScore = Infinity;
      for (const [index, points] of wire.candidates.entries()) {
        const score = cost(polyline(points)) * 1000 + crowded(points) * 300 + (points.length - 2) * 40 + length(points) * 0.05 + (index >= wire.farFrom ? farPenalty : 0);
        if (score < bestScore) {
          best = points;
          bestScore = score;
        }
      }
      // 与先画的线交叉处，后画的这条跨过去
      const hops = crossings(best);
      segs.push(...polyline(best));
      // 句法竖线也记下，逻辑虚线不贴着它们走
      for (const seg of polyline(best).filter((item) => item.x1 === item.x2)) {
        verticals.push({ x: seg.x1, top: Math.min(seg.y1, seg.y2), bottom: Math.max(seg.y1, seg.y2) });
      }
      if (wire.into === null) {
        arrow(svg, best, '', hops);
      } else {
        // 框外一段画在下层，伸进框里的一段画在上层
        const path = document.createElementNS(SVG, 'path');
        path.setAttribute('d', pathD(best, hops));
        svg.append(path);
        const [x, y] = best.at(-1)!;
        arrow(tips, [[x, y], [x, wire.into]]);
      }
    }

    // ---- 叙事主线：主线上的顶层句用短横线接到最外侧的脊线（不画圆点，前置看框头标签）；离线句不接，脊线只连主线句 ----
    const roots: Array<[number, HTMLElement]> = [];
    for (const clause of D.clauses) {
      const box = $(`[data-box="${clause.id}"]`);
      if (mainline && box && (box.dataset.form || box.dataset.ntForm) && !box.hidden && !(clause.parentId && byId.has(clause.parentId)) && !offline(clause)) {
        const r = box.getBoundingClientRect();
        roots.push([Math.round(r.top + r.height / 2 - base.top), box]);
      }
    }
    if (roots.length > 0) {
      const forestRect = $('#forest').getBoundingClientRect();
      const x = start(forestRect) + (rtl ? -12 : 12);
      const spine = document.createElementNS(SVG, 'path');
      spine.setAttribute('class', 'spine');
      spine.setAttribute('d', `M${x},${roots[0][0]} L${x},${roots.at(-1)![0]}`);
      svg.append(spine);
      for (const [y, box] of roots) {
        const tick = document.createElementNS(SVG, 'path');
        tick.setAttribute('class', 'spine');
        tick.setAttribute('d', `M${x},${y} L${start(box.getBoundingClientRect())},${y}`);
        tick.style.strokeWidth = '1.5';
        svg.append(tick);
      }
    }
    if (canvas.classList.contains('hide-logic')) {
      return;
    }

    // ---- 逻辑关系：虚线走在框的另一侧（尾侧），从本句连到关联子句（一段时连到首句并标出范围）。
    // 跨度短的贴近方框、长的往外（嵌套的不相交）；每条在候选车道里挑交叉最少、又不与纵向重叠的竖线贴得太近的；指向同一句的箭头上下错开 ----
    const end = (rect: DOMRect) => (rtl ? rect.left : rect.right) - base.left;
    const outer = (a: number, b: number) => (rtl ? Math.min(a, b) : Math.max(a, b));
    // 尾侧挨着横排进来的从句（同一行里后面还有框）：逻辑虚线改从顶边、底边进出，横线从整行上方或下方绕过去
    const hemmed = (box: HTMLElement) => box.parentElement?.classList.contains('row') && box.nextElementSibling instanceof HTMLElement && !box.nextElementSibling.hidden
      ? box.parentElement.getBoundingClientRect() : null;
    const links: Array<{ clause: (typeof D.clauses)[number]; c: DOMRect; t: DOMRect; top: number; bottom: number; edge: number; cRow: DOMRect | null; tRow: DOMRect | null }> = [];
    for (const clause of D.clauses) {
      const targetId = clause.logic?.targetIds[0];
      const childBox = targetId ? $(`[data-box="${clause.id}"]`) : null;
      const targetBox = targetId ? $(`[data-box="${targetId}"]`) : null;
      if (!clause.logic || !childBox || !targetBox || childBox.hidden || targetBox.hidden) {
        continue;
      }
      const c = childBox.getBoundingClientRect();
      const t = targetBox.getBoundingClientRect();
      const top = Math.min(c.top, t.top) - base.top;
      const bottom = Math.max(c.bottom, t.bottom) - base.top;
      let edge = outer(end(c), end(t));
      for (const box of allBoxes) {
        const r = box.getBoundingClientRect();
        if (!box.hidden && r.bottom - base.top >= top && r.top - base.top <= bottom) {
          edge = outer(edge, end(r));
        }
      }
      links.push({ clause, c, t, top, bottom, edge, cRow: hemmed(childBox), tRow: hemmed(targetBox) });
    }
    // 每个框上的连接点按方向和跨度排好上下：往上走的在上、往下走的在下；
    // 往上的跨度越长越靠下、往下的跨度越长越靠上（外圈的横线不会横穿内圈的竖线）
    const anchors = new Map<string, Array<{ key: string; up: boolean; span: number; rect: DOMRect }>>();
    const addAnchor = (id: string, key: string, up: boolean, span: number, rect: DOMRect) => anchors.set(id, [...(anchors.get(id) ?? []), { key, up, span, rect }]);
    links.forEach(({ clause, c, t, top, bottom }, index) => {
      addAnchor(clause.id, `${index}c`, t.top < c.top, bottom - top, c);
      addAnchor(clause.logic!.targetIds[0], `${index}t`, c.top < t.top, bottom - top, t);
    });
    const anchorY = new Map<string, number>();
    const anchorRank = new Map<string, number>();
    for (const list of anchors.values()) {
      list.sort((a, b) => (a.up === b.up ? (a.up ? a.span - b.span : b.span - a.span) : a.up ? -1 : 1));
      // 顶边、底边进出时按离框远近错开：往上的、往下的各自从靠近尾角处排起
      list.filter((item) => item.up).reverse().forEach((item, i) => anchorRank.set(item.key, i));
      list.filter((item) => !item.up).forEach((item, i) => anchorRank.set(item.key, i));
      const rect = list[0].rect;
      // 以框的垂直中点为中心上下排开
      const step = Math.min(10, (rect.height - 16) / Math.max(1, list.length));
      const middle = rect.top - base.top + rect.height / 2;
      list.forEach((item, i) => anchorY.set(item.key, Math.round(middle + (i - (list.length - 1) / 2) * step)));
    }
    const order = links.map((link, index) => ({ ...link, index }));
    for (const { clause, c, t, top, bottom, edge, index, cRow, tRow } of order.sort((a, b) => (a.bottom - a.top) - (b.bottom - b.top))) {
      /** 框上的连接段：尾侧空着时从侧边横出；被挡住时从顶边或底边竖出，再到整行外侧的横道。返回 [框上的点, 横道上的点]。 */
      const attach = (rect: DOMRect, row: DOMRect | null, key: string, up: boolean): Array<[number, number]> => {
        if (!row) {
          return [[end(rect), anchorY.get(key)!]];
        }
        const rank = anchorRank.get(key) ?? 0;
        const x = Math.round(end(rect) + (rtl ? 1 : -1) * (16 + rank * 10));
        const yEdge = (up ? rect.top : rect.bottom) - base.top;
        const yLane = Math.round((up ? row.top - 10 - rank * 6 : row.bottom + 10 + rank * 6) - base.top);
        return [[x, yEdge], [x, yLane]];
      };
      const from = attach(c, cRow, `${index}c`, t.top < c.top);
      const to = attach(t, tRow, `${index}t`, c.top < t.top).reverse();
      const y1 = from.at(-1)![1];
      const y2 = to[0][1];
      const points = (x: number): Array<[number, number]> => [...from, [x, y1], [x, y2], ...to];
      let best = 0;
      let bestCost = Infinity;
      for (let k = 0; k < 16; k += 1) {
        const x = edge + (rtl ? -1 : 1) * (18 + k * 12);
        if (verticals.some((line) => line.top < bottom && line.bottom > top && Math.abs(line.x - x) < 10)) {
          continue;
        }
        const value = cost(polyline(points(x)));
        if (value < bestCost) {
          best = x;
          bestCost = value;
        }
        if (value === 0) {
          break;
        }
      }
      verticals.push({ x: best, top, bottom });
      segs.push(...polyline(points(best)));
      arrow(svg, points(best), 'logic');
      const label = document.createElement('div');
      label.className = 'll';
      label.textContent = clause.logic!.targetIds.length > 1 ? `${clause.logic!.label} → ${clause.logic!.targetText}` : clause.logic!.label;
      label.style.left = `${best}px`;
      label.style.top = `${(y1 + y2) / 2}px`;
      canvas.append(label);
    }
  }
  let frame = 0;
  const redraw = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(drawWires);
  };
  new ResizeObserver(redraw).observe($('#forest'));
  addEventListener('resize', () => {
    layoutChips();
    redraw();
  });
  layoutChips();
  void document.fonts?.ready.then(() => {
    layoutChips();
    redraw();
  });

  // ---------- 悬停高亮、点词弹出词卡 ----------
  const mark = (id: string, cls: string) => $$(`[data-id="${id}"]`).forEach((el) => el.classList.add(cls));
  const clear = (cls: string) => $$(`.${cls}`).forEach((el) => el.classList.remove(cls));
  let popId: string | null = null;
  function hidePop(): void {
    $('#pop').classList.remove('show');
    clear('sel');
    popId = null;
  }
  function showPop(id: string, anchor: HTMLElement): void {
    if (popId === id) {
      hidePop();
      return;
    }
    hidePop();
    popId = id;
    mark(id, 'sel');
    const word = words[id];
    const lexicon = D.lexicon[word.strong] ?? [];
    const pop = $('#pop');
    pop.innerHTML = `<button class="x" type="button" aria-label="关闭">×</button>
      <div><span class="lemma o">${esc(word.lemma)}</span> <span class="hint">${esc(word.translit)} · ${esc(word.strong)} · ${Math.floor(word.bcv / 1000) % 1000}:${word.bcv % 1000}</span></div>
      ${word.variant ? `<div class="warn">异文：${orig(word.variant)}</div>` : ''}
      <dl>
        <dt>本处</dt><dd><span class="o">${esc(word.text)}</span></dd>
        ${word.rendering ? `<dt>译作</dt><dd>${esc(word.rendering)}</dd>` : ''}
        <dt>词法</dt><dd>${esc(word.morph)} <span class="hint">${esc((word.morphExp ?? '').replace(/\b[A-Za-z]+=/g, ''))}</span></dd>
        <dt>词义</dt><dd>${esc(word.glossZh ?? '—')} · ${esc(word.glossEn)}${word.sense ? ` <span class="hint">义项 ${esc(word.sense)}</span>` : ''}</dd>
      </dl>
      ${lexicon.map((entry) => `<details><summary>${entry.source === 'UBS-zh' ? 'UBS 中文词典' : `STEPBible 简明词典（${esc(entry.source)}）`}</summary><div class="def">${orig(entry.definition)}</div></details>`).join('')}`;
    $('.x', pop).addEventListener('click', hidePop);
    pop.classList.add('show');
    const canvas = $('#canvas').getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    pop.style.left = `${Math.max(0, Math.min(rect.left - canvas.left, canvas.width - pop.offsetWidth))}px`;
    pop.style.top = `${rect.bottom - canvas.top + 6}px`;
  }
  for (const el of $$('[data-id]')) {
    el.addEventListener('mouseenter', () => mark(el.dataset.id!, 'hl'));
    el.addEventListener('mouseleave', () => clear('hl'));
  }
  for (const el of $$('#canvas [data-id]')) {
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      showPop(el.dataset.id!, el);
    });
  }
  $('#pop').addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', hidePop);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hidePop();
    }
  });
  $('#theme').addEventListener('click', () => {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const current = document.documentElement.dataset.theme ?? (dark ? 'dark' : 'light');
    document.documentElement.dataset.theme = current === 'dark' ? 'light' : 'dark';
  });
  if (location.hash === '#open') {
    $$('.box').forEach((box) => setOpen(box, true));
  }
  if (location.hash === '#roots') {
    $('#foldAll').click();
  }
}

export function renderDiagramPage(data: DiagramData, subtitle = ''): string {
  const ot = data.isOT;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(data.title)} 结构图</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Gentium+Book+Plus:wght@400;700&family=Noto+Serif+Hebrew:wght@400;600&display=swap" rel="stylesheet">
<style>${STYLE}</style>
</head>
<body>
<header>
  <h1>${escapeHtml(data.title)} · 原文结构</h1>
  <div class="sub">${escapeHtml(subtitle || '结构以子句分析为准')} · 按原文先后自上而下，缩进 = 从属，框头是子句编号 · 点「详情」看词义与要点，点「收起分支」隐藏下属子句，点词看词典</div>
</header>
<main>
  <section class="card">
    <h2>原文与译文 <span class="toolbar"><button id="theme" type="button">切换明暗</button></span></h2>
    <div id="text" class="text-line o"></div>
    <div id="trans" class="trans"></div>
  </section>
  <section class="card">
    <h2>结构图
      <span class="toolbar">
        <button type="button" id="openAll">展开详情</button>
        <button type="button" id="closeAll">收起详情</button>
        <button type="button" id="foldAll" title="把所有分支收到主句，只看主线">只看主句</button>
        <button type="button" id="unfoldAll">展开分支</button>
        <button type="button" data-toggle="z" aria-pressed="true">中文</button>
        <button type="button" data-toggle="m" aria-pressed="false">词法</button>
        <button type="button" data-toggle="e" aria-pressed="false">英文</button>
        <button type="button" data-toggle="roles" aria-pressed="true" title="成分块顶上的名称（主语、谓语、宾语……）；关掉后只留顶边色条">成分名</button>
        <button type="button" data-toggle="logic" aria-pressed="true">逻辑关系</button>${ot ? '\n        <button type="button" data-toggle="forms" aria-pressed="true">句型与主线</button>\n        <button type="button" data-toggle="focus" aria-pressed="true" title="非 qal 词干的动词着色、动词前的实词成分（前置）加框">词干与前置</button>' : `
        <button type="button" data-toggle="case" aria-pressed="true">格与时态</button>
        <button type="button" data-toggle="forms" aria-pressed="true">${data.narrative ? '时态与主线' : '时态标签'}</button>`}
      </span>
    </h2>
    <div class="scroller">
      <div id="canvas" class="canvas hide-m hide-e"${ot ? ' dir="rtl"' : ''}>
        <div id="forest" class="forest"></div>
        <svg id="wires"></svg>
        <svg id="tips"></svg>
        <div id="pop"></div>
      </div>
    </div>
    <div class="legend">
      <span style="--c: var(--r-v)">谓语</span><span style="--c: var(--r-s)">主语</span><span style="--c: var(--r-conj)">连接词</span><span style="--c: var(--muted)">宾语、间接宾语、状语、表语等（照 Macula）</span>
      <span>· 实线 = 句法从属，指到被修饰的词（下划线） · <b style="color:var(--logic)">虚线</b> = 逻辑关系（与句法不同时标出） · <b style="color:var(--accent)">异</b> = 有异文</span>
    </div>${ot ? `
    <div class="forms-legend">
      <span>边框颜色 = 动词形式：</span>
      <span style="--tc:#F656B8"><i></i>wayyiqtol</span><span style="--tc:#2A7FFF"><i></i>weqatal</span><span style="--tc:#FF0000"><i></i>qatal</span>
      <span style="--tc:#00CC00"><i></i>yiqtol</span><span style="--tc:#A449FF"><i></i>祈使</span><span style="--tc:#9E5329"><i></i>分词</span>
      <span style="--tc:#6B6B6B"><i></i>不定式</span><span style="--tc:#B8B0A2"><i></i>名词句</span>
      <span>· 最外侧竖线 = 叙事主线，同一句法主干上的各句 = 会话序列 · 「离线」= 顶层不用 wayyiqtol，不接主线</span>
    </div>
    <div class="forms-legend">
      <span>动词词干：</span><span class="o" style="color:var(--st-niphal)">niphal <span class="sb" style="--st:var(--st-niphal)">Ni</span></span>
      <span class="o" style="color:var(--st-piel)">piel <span class="sb" style="--st:var(--st-piel)">Pi</span></span>
      <span class="o" style="color:var(--st-hiphil)">hiphil <span class="sb" style="--st:var(--st-hiphil)">Hi</span></span>
      <span class="o" style="color:var(--st-hithpael)">hithpael <span class="sb" style="--st:var(--st-hithpael)">Ht</span></span>
      <span>（qal 不着色；被动如 pual <span class="sb" style="--st:var(--st-piel);color:var(--st-piel);background:transparent">Pu</span>、hophal 用空心标签）</span>
      <span>· <span class="front-key">前置</span> = 动词前的实词成分（X-动词语序），多为焦点、对比或话题；框头「前置」同义</span>
      <span>· <span class="cog-key">同根强调</span> = 不定式独立形 + 同根动词（מוֹת תָּמוּת），强调动作本身</span>
    </div>` : `
${data.narrative ? `
    <div class="forms-legend">
      <span>框头标签 = 谓语动词的时态与语气 · 最外侧竖线 = 叙事主线，同一句法主干上的各句 = 会话序列 · 「离线」= 顶层不用不定过去式直说语气（背景、历史现在式、评述），不接主线</span>
    </div>` : ''}
    <div class="case-legend">
      <span>格：</span><span class="o"><b>主格</b></span><span class="o" style="color:var(--c-acc)">宾格</span><span class="o" style="color:var(--c-gen)">属格</span>
      <span class="o" style="color:var(--c-dat)">与格</span><span class="o" style="color:var(--c-voc)">呼格</span>
      <span>· 动词框色 = 时态：</span><span class="vt" style="--t:var(--t-aor)">不定过去</span><span class="vt" style="--t:var(--t-pres)">现在</span>
      <span class="vt" style="--t:var(--t-impf)">未完成</span><span class="vt" style="--t:var(--t-fut)">将来</span><span class="vt" style="--t:var(--t-perf)">完成</span>
      <span>· 底色 = 语气：</span><span class="vm" style="--m:var(--m-ind)">直说</span><span class="vm" style="--m:var(--m-impv)">祈使</span>
      <span class="vm" style="--m:var(--m-subj)">虚拟</span><span class="vm" style="--m:var(--m-opt)">祈愿</span><span>（分词、不定式无底色）</span>
    </div>`}
  </section>
</main>
<script id="data" type="application/json">${safeJson(data)}</script>
<script>(${diagramClient.toString()})(JSON.parse(document.getElementById('data').textContent));</script>
</body>
</html>
`;
}
