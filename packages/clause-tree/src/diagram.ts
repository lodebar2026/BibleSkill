/**
 * 结构图：交互 HTML。
 *
 * 每个子句一行，按原文先后自上而下排（叙事链、话语内容的序列一句接一句往下读），缩进表示从属；
 * 框头标子句编号。框里每个句子成分一块（新约照 Macula 分出宾语、间接宾语、状语、表语）。
 * 连线走在缩进留出的沟槽里，从子句连到母句里被修饰的词，不穿过别的框；箭头伸进母句框，指到那个词。
 * 新约词按格着色、动词按时态加框、按语气加底色。旧约非 qal 的动词按词干着色，谓语前的实词成分（前置）加框标出。
 * 点「详情」展开词义与分析、翻译记录，点「收起分支」收起这一句下面的所有分支，鼠标移到连线上可只收那一支（这个子句及其下属），鼠标移到词上弹出词卡。
 * 各图共用 diagram.css 与 diagram.js（DIAGRAM_ASSETS，页面骨架也由脚本生成），每张图的 HTML 只内嵌自己的数据。
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
  --m-ind: #f5f5dc; --m-impv: #ffc0c0; --m-subj: #ffe0ff; --m-opt: #e0ffe0; --m-inf: #e0e0e0;
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
    --m-ind: #3a3626; --m-impv: #4a2626; --m-subj: #44284a; --m-opt: #24402a; --m-inf: #3a3a3a;
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
  --m-ind: #3a3626; --m-impv: #4a2626; --m-subj: #44284a; --m-opt: #24402a; --m-inf: #3a3a3a;
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
/* 补词：点状下划线 */
.added { text-decoration: underline dotted var(--muted); text-decoration-thickness: 1.5px; text-underline-offset: 4px; cursor: help; }
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
.bh .unfold { font: inherit; font-size: 11px; border: 1px solid var(--accent); background: var(--accent); color: var(--panel); border-radius: 4px; padding: 0 6px; cursor: pointer; }
/* 鼠标移到连线上：这一支加亮，旁边出现「收起」按钮 */
#hits { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 3; overflow: visible; }
#hits path.hit { fill: none; stroke: transparent; stroke-width: 12; pointer-events: stroke; cursor: pointer; }
#hits path.lit { fill: none; stroke: var(--accent); stroke-width: 6; opacity: .45; pointer-events: none; }
.box.lit { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 35%, transparent); }
#bfold { position: absolute; z-index: 6; display: none; font: inherit; font-size: 12px; border: 1px solid var(--accent); background: var(--panel); color: var(--accent); border-radius: 4px; padding: 1px 8px; cursor: pointer; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,.15); direction: ltr; }
#bfold.on { display: block; }
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
.hide-roles .chip > .rl:not(:has(.sb)), .hide-roles.hide-focus .chip > .rl, .hide-roles .chip > .rl .rn { display: none; }
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
.w[data-mood="ind"] { --m: var(--m-ind); } .w[data-mood="impv"] { --m: var(--m-impv); } .w[data-mood="subj"] { --m: var(--m-subj); } .w[data-mood="opt"] { --m: var(--m-opt); } .w[data-mood="inf"] { --m: var(--m-inf); }
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
/* 被修饰的词：下划线画在 ::after 上，紧挨的下一个词也是被修饰的词（并列的先行词）时伸过词间空白，连成一条 */
.w.target .g { position: relative; }
.w.target .g::after { content: ''; position: absolute; inset-inline: 0; bottom: -3px; height: 2px; background: var(--wire); }
.w.target:has(+ .w.target) .g::after { inset-inline-end: -10px; }
/* 嵌在句中的子句：占位符（虚线小框，标子句编号），点它跳到那个子句 */
.w.slot { justify-content: center; }
.w.slot .g { font-family: ui-monospace, Menlo, monospace; font-size: 13px; font-weight: 700; color: var(--accent); border: 1.5px dashed var(--accent); border-radius: 5px; padding: 0 6px; direction: ltr; }
.ot .w.slot .g { font-size: 13px; }
.box.flash { box-shadow: 0 0 0 3px var(--hl); }
/* 旧约词干：非 qal 的动词按词干类着色，标签放在成分名那一行；主动实心、被动空心 */
[data-stem="qal"] { --st: var(--st-qal); } [data-stem="niphal"] { --st: var(--st-niphal); } [data-stem="piel"] { --st: var(--st-piel); }
[data-stem="hiphil"] { --st: var(--st-hiphil); } [data-stem="hithpael"] { --st: var(--st-hithpael); }
.canvas:not(.hide-focus) .w[data-stem] .g { color: var(--st); }
.sb { font-size: 10px; font-weight: 700; color: var(--panel); background: var(--st); border: 1px solid var(--st); border-radius: 3px; padding: 0 3px; margin-inline-start: 4px; font-family: sans-serif; }
.sb.pass { color: var(--st); background: transparent; }
.hide-focus .sb { display: none; }
/* 旧约：谓语前的实词成分（前置），多为焦点、对比或话题 */
.canvas:not(.hide-focus) .chip.front { border: 2px solid var(--focus); border-top: 4px solid var(--c); background: color-mix(in srgb, var(--focus) 14%, var(--panel)); }
.chip > .rl .fr { color: var(--focus); }
.hide-focus .chip > .rl .fr, .hide-focus .bh .mk.front { display: none; }
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
.hide-logic .ll:not(.al) { display: none; }
/* 论元子句（宾语、主语、表语、引语）：标签画在句法连线上 */
.ll.al { color: var(--wire); border: 1.5px solid var(--wire); font-weight: 500; z-index: 4; }
.up .lg { color: var(--logic); }
@media (max-width: 760px) {
  .forest { gap: 12px; }
  .box { margin-inline-start: calc(var(--depth, 0) * 14px); max-width: calc(100% - var(--depth, 0) * 14px); }
  #wires, #tips, #hits, #bfold, .ll { display: none; }
  .box > .up { display: block; }
  .more .up { display: none; }
}
.legend { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--muted); margin-top: 12px; }
.legend span::before { content: ""; display: inline-block; width: 14px; height: 4px; margin-right: 4px; vertical-align: middle; background: var(--c); }
.hl { background: var(--hl) !important; }
.sel { outline: 2px solid var(--accent); }
#pop { position: fixed; z-index: 10; width: min(380px, calc(100vw - 16px)); overflow: auto; box-sizing: border-box; background: var(--panel); border: 1.5px solid var(--accent); border-radius: 10px; padding: 10px 12px; box-shadow: 0 8px 28px rgba(0,0,0,.18); display: none; font-size: 13px; direction: ltr; }
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
function diagramClient(D: DiagramData, subtitle: string): void {
  const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) => root.querySelector(selector) as T;
  const $$ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) => [...root.querySelectorAll(selector)] as T[];
  const esc = (value: unknown) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
  /** 文字里的希腊文、希伯来文换原文字体。 */
  const orig = (value: string) => esc(value).replace(/[Ͱ-Ͽἀ-῿֐-׿][Ͱ-Ͽἀ-῿֐-׿̀-ͯʼ’᾽ ]*/g, (run) => `<span class="o">${run}</span>`);
  const ROLE_ZH: Record<string, string> = { s: '主语', v: '谓语', o: '宾语', o2: '宾补', io: '间接宾语', adv: '状语', p: '表语', conj: '连接词' };
  const TENSE_ZH: Record<string, string> = { pres: '现在', impf: '未完成', fut: '将来', aor: '不定过去', perf: '完成', plpf: '过去完成' };
  const MOOD_ZH: Record<string, string> = { ind: '直说', subj: '虚拟', opt: '祈愿', impv: '祈使', inf: '不定式', ptcp: '分词' };
  const words = D.words;
  /** 译文：补词段加点状下划线，悬停看补词说明。旧图的数据里译文还是纯字符串。 */
  const zh = (value: string | Array<{ text: string; added?: true; note?: string }>) => typeof value === 'string' ? esc(value)
    : value.map((part) => part.added ? `<span class="added" title="${esc(part.note ? `补词：${part.note}` : '补词：原文没有，译者补出')}">${esc(part.text)}</span>` : esc(part.text)).join('');
  const punct = (after: string) => after.trim();

  // ---------- 页面骨架：各图共用这份脚本，只有数据各自内嵌 ----------
  document.title = `${D.title} 结构图`;
  document.body.insertAdjacentHTML('afterbegin', `<header>
  <h1>${esc(D.title)} · 原文结构</h1>
  <div class="sub">${esc(subtitle || '结构以子句分析为准')} · 按原文先后自上而下，缩进 = 从属，框头是子句编号 · 点「详情」看词义与分析、翻译记录，点「收起分支」收起下属子句，鼠标移到连线上可只收那一支，鼠标移到词上看词典</div>
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
        <button type="button" data-toggle="logic" aria-pressed="true">逻辑关系</button>${D.isOT ? '\n        <button type="button" data-toggle="forms" aria-pressed="true">句型与主线</button>\n        <button type="button" data-toggle="focus" aria-pressed="true" title="非 qal 词干的动词着色、动词前的实词成分（前置）加框">词干与前置</button>' : `
        <button type="button" data-toggle="case" aria-pressed="true">格与时态</button>
        <button type="button" data-toggle="forms" aria-pressed="true">${D.narrative ? '时态与主线' : '时态标签'}</button>`}
      </span>
    </h2>
    <div class="scroller">
      <div id="canvas" class="canvas hide-m hide-e"${D.isOT ? ' dir="rtl"' : ''}>
        <div id="forest" class="forest"></div>
        <svg id="wires"></svg>
        <svg id="tips"></svg>
        <svg id="hits"></svg>
        <button type="button" id="bfold"></button>
      </div>
    </div>
    <div class="legend">
      <span style="--c: var(--r-v)">谓语</span><span style="--c: var(--r-s)">主语</span><span style="--c: var(--r-conj)">连接词</span><span style="--c: var(--muted)">宾语、间接宾语、状语、表语等（照 Macula）</span>
      <span>· 实线 = 句法从属，指到被修饰的词（下划线） · <b style="color:var(--logic)">虚线</b> = 逻辑关系（与句法不同时标出） · <b style="color:var(--accent)">异</b> = 有异文</span>
    </div>${D.isOT ? `
    <div class="forms-legend">
      <span>边框颜色 = 动词形式：</span>
      <span style="--tc:#F656B8"><i></i>wayyiqtol</span><span style="--tc:#2A7FFF"><i></i>weqatal</span><span style="--tc:#FF0000"><i></i>qatal</span>
      <span style="--tc:#00CC00"><i></i>yiqtol</span><span style="--tc:#A449FF"><i></i>祈使</span><span style="--tc:#9E5329"><i></i>分词</span>
      <span style="--tc:#6B6B6B"><i></i>不定式</span><span style="--tc:#B8B0A2"><i></i>名词句</span>
      <span>· 最外侧竖线 = 叙事主线，同一句法主干上的各句 = 会话序列 · 「离线」= 顶层不用 wayyiqtol，不接主线</span>
    </div>
    <div class="forms-legend">
      <span>动词词干：</span><span class="o" style="color:var(--st-niphal)">niphal <span class="sb" data-stem="niphal">Ni</span></span>
      <span class="o" style="color:var(--st-piel)">piel <span class="sb" data-stem="piel">Pi</span></span>
      <span class="o" style="color:var(--st-hiphil)">hiphil <span class="sb" data-stem="hiphil">Hi</span></span>
      <span class="o" style="color:var(--st-hithpael)">hithpael <span class="sb" data-stem="hithpael">Ht</span></span>
      <span>（qal 不着色；被动如 pual <span class="sb pass" data-stem="piel">Pu</span>、hophal 用空心标签）</span>
      <span>· <span class="front-key">前置</span> = 动词前的实词成分（X-动词语序），多为焦点、对比或话题；框头「前置」同义</span>
      <span>· <span class="cog-key">同根强调</span> = 不定式独立形 + 同根动词（מוֹת תָּמוּת），强调动作本身</span>
    </div>` : `
${D.narrative ? `
    <div class="forms-legend">
      <span>框头标签 = 谓语动词的时态与语气 · 最外侧竖线 = 叙事主线，同一句法主干上的各句 = 会话序列 · 「离线」= 顶层不用不定过去式直说语气（背景、历史现在式、评述），不接主线</span>
    </div>` : ''}
    <div class="case-legend">
      <span>格：</span><span class="o"><b>主格</b></span><span class="o" style="color:var(--c-acc)">宾格</span><span class="o" style="color:var(--c-gen)">属格</span>
      <span class="o" style="color:var(--c-dat)">与格</span><span class="o" style="color:var(--c-voc)">呼格</span>
      <span>· 动词框色 = 时态：</span><span class="vt" style="--t:var(--t-aor)">不定过去</span><span class="vt" style="--t:var(--t-pres)">现在</span>
      <span class="vt" style="--t:var(--t-impf)">未完成</span><span class="vt" style="--t:var(--t-fut)">将来</span><span class="vt" style="--t:var(--t-perf)">完成</span>
      <span>· 底色 = 语气：</span><span class="vm" style="--m:var(--m-ind)">直说</span><span class="vm" style="--m:var(--m-impv)">祈使</span>
      <span class="vm" style="--m:var(--m-subj)">虚拟</span><span class="vm" style="--m:var(--m-opt)">祈愿</span><span class="vm" style="--m:var(--m-inf)">不定式</span><span>（分词无底色）</span>
    </div>`}
  </section>
</main>
<div id="pop"></div>`);
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
    if (verse.translation.length > 0) {
      trans.insertAdjacentHTML('beforeend', `<span class="vn">${verse.verse}</span>${zh(verse.translation)}`);
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
  // 被修饰的词都加下划线；旧图的数据只有 targetWordId
  const targets = new Set(D.clauses.flatMap((clause) => clause.targetWordIds ?? [clause.targetWordId]).filter(Boolean));
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
  // 叙事主线：旧约顶层子句里 wayyiqtol 是主线，新约叙事书卷里是不定过去式直说语气；其余形式离开主线（背景、评述、凸显）。
  // 分析里写了 mainline 的按分析（如徒 8:17 τότε 引出的未完成式推进情节）；旧图的数据没有这个字段
  const mainline = D.isOT || D.narrative;
  const offline = (clause: (typeof D.clauses)[number]) => mainline && !clause.parentId && (clause.mainline != null ? !clause.mainline
    : formOf(clause) !== null && (D.isOT ? formOf(clause) !== 'wayyiqtol' : clause.ntForm !== 'aor-ind'));
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
    box.innerHTML = `<div class="bh">${kids.has(clause.id) ? '<button type="button" class="fold" title="收起/展开这一句下面的所有分支">收起分支</button>' : ''}<span class="cid">${esc(clauseNo(clause.id))}</span>${typeBadge}<span class="lab">${esc(clause.label)}</span>${status}<button type="button" class="det" title="词义、要点与分析记录">详情 ▾</button><span class="gist">${zh(clause.gist)}</span></div>`;
    const chips = document.createElement('div');
    chips.className = 'chips';
    for (const chip of clause.chips) {
      const el = document.createElement('div');
      el.className = `chip${chip.role ? ` r-${chip.role}` : ''}${chip.fronted ? ' front' : ''}`;
      const frontLabel = chip.fronted ? `<span class="fr">${chip.role ? ' · ' : ''}前置</span>` : '';
      // 词干标签与成分名同一行，不另占行
      const stems = [...new Map(chip.wordIds.map((id) => words[id].stem).filter((stem) => stem !== null).map((stem) => [stem.name, stem])).values()];
      const stemTags = stems.map((stem) => `<span class="sb${stem.passive ? ' pass' : ''}" data-stem="${stem.family}" title="${esc(stem.name)}">${esc(STEM_TAG[stem.name] ?? stem.name.slice(0, 3))}</span>`).join('');
      el.innerHTML = `<span class="rl"><span class="rn">${chip.role ? ROLE_ZH[chip.role] : ''}${frontLabel}</span>${stemTags}</span><span class="ws"></span>`;
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
        }
        if (chip.indents) {
          w.dataset.indent = String(chip.indents[chip.wordIds.indexOf(id)]);
        }
        w.innerHTML = `<span class="g o">${esc(word.text)}${esc(punct(word.after))}${word.variant ? '<span class="vb">异</span>' : ''}</span>`
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
    const records = clause.records.map((record) => `<li><span class="tag">${esc(record.tag)}</span>：${orig(record.text)}</li>`).join('');
    const ups: string[] = [];
    if (clause.parentId && byId.has(clause.parentId)) {
      const targetIds = clause.targetWordIds ?? (clause.targetWordId ? [clause.targetWordId] : []);
      const target = targetIds.length ? ` <span class="o">${esc(targetIds.map((id) => words[id]?.text).join(' '))}</span>` : '';
      ups.push(`↳ 句法：属 ${esc(clauseNo(clause.parentId))}${clause.link ? ` · ${esc(clause.link)}` : ''}${target}`);
    }
    if (clause.logic) {
      ups.push(`<span class="lg">⇢ 逻辑：${esc(clause.logic.label)} → ${esc(clause.logic.targetText)}${clause.logic.note ? ` · ${esc(clause.logic.note)}` : ''}</span>`);
    }
    const up = ups.length > 0 ? `<div class="up">${ups.join('<br>')}</div>` : '';
    box.insertAdjacentHTML('beforeend', `<div class="more">${up}`
      + (records ? `<details open><summary>分析与翻译记录（${clause.records.length}）</summary><ul>${records}</ul></details>` : '')
      + (!records && !up ? '<span class="hint">没有备注。</span>' : '') + `</div>${up}`);
    $('.det', box).addEventListener('click', () => setOpen(box, !box.classList.contains('open')));
    box.querySelector('.fold')?.addEventListener('click', (event) => {
      event.stopPropagation();
      const all = kids.get(clause.id)!;
      const shut = all.every((kid) => folded.has(kid));
      all.forEach((kid) => (shut ? folded.delete(kid) : folded.add(kid)));
      applyFolds();
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
  const lastWord = (clause: (typeof D.clauses)[number]) => clause.chips.flatMap((chip) => chip.wordIds).sort().at(-1) ?? firstWord(clause);
  const ordered = [...D.clauses].sort((a, b) => firstWord(a).localeCompare(firstWord(b)));
  // 原文里紧接着母句：两者之间的子句都嵌在母句里面（首词在母句末词之前，如 徒 8:7a 的 ⟨7b⟩），或已排在母句那一行。
  // 隔着别的子句时（如 徒 8:9d λέγων 前面是 9b、9c）照常另起一行，不打乱原文顺序
  const follows = (clause: (typeof D.clauses)[number], parentBox: HTMLElement) => {
    const parent = byId.get(clause.parentId!)!;
    const between = ordered.slice(ordered.indexOf(parent) + 1, ordered.indexOf(clause));
    return between.every((item) => lastWord(parent).localeCompare(firstWord(item)) > 0
      || $(`[data-box="${item.id}"]`)?.parentElement === parentBox.parentElement && parentBox.parentElement!.classList.contains('row'));
  };
  for (const clause of ordered) {
    const verse = clause.id.replace(/[a-z]+$/, '');
    const parentBox = isSide(clause) || besideMarker(clause) ? $(`[data-box="${clause.parentId}"]`) : null;
    if (parentBox && follows(clause, parentBox)) {
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

  // ---------- 分支展开/收起：一支 = 一个子句连同它的下属。收起的支在母句框头留一个「▸ 编号」按钮，点它展开 ----------
  const folded = new Set<string>();
  const branchLabel = (id: string) => {
    const ids = [id, ...descendants(id)].sort();
    return ids.length > 1 ? `${clauseNo(ids[0])}–${clauseNo(ids.at(-1)!)}` : clauseNo(id);
  };
  function applyFolds(): void {
    const hidden = new Set([...folded].flatMap((id) => [id, ...descendants(id)]));
    for (const box of $$('.box')) {
      box.hidden = hidden.has(box.dataset.box!);
      const row = box.parentElement!;
      if (row.classList.contains('row')) {
        row.hidden = [...row.children].every((item) => hidden.has((item as HTMLElement).dataset.box!));
      }
      $$('.unfold', box).forEach((button) => button.remove());
      // 这一句的分支全部收起时，「收起分支」改为「展开分支」，不再逐支列出
      const all = kids.get(box.dataset.box!) ?? [];
      const shut = all.length > 0 && all.every((id) => folded.has(id));
      box.classList.toggle('folded', shut);
      const fold = box.querySelector<HTMLElement>('.fold');
      if (fold) {
        fold.textContent = shut ? '展开分支' : '收起分支';
      }
      if (shut) {
        continue;
      }
      const cid = $('.bh .cid', box);
      for (const kid of [...(kids.get(box.dataset.box!) ?? [])].reverse().filter((id) => folded.has(id))) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'unfold';
        button.textContent = `▸ ${branchLabel(kid)}`;
        button.title = `展开收起的分支 ${branchLabel(kid)}（${1 + descendants(kid).length} 句）`;
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          folded.delete(kid);
          applyFolds();
        });
        cid.before(button);
      }
    }
    hidePop();
    hideBranchButton();
    redraw();
  }
  // 只看主句：收起主句下的每一支
  $('#foldAll').addEventListener('click', () => {
    folded.clear();
    D.clauses.filter((clause) => clause.parentId && byId.has(clause.parentId) && !byId.get(clause.parentId)!.parentId).forEach((clause) => folded.add(clause.id));
    applyFolds();
  });
  $('#unfoldAll').addEventListener('click', () => {
    folded.clear();
    applyFolds();
  });
  // 鼠标移到连线上：加亮这一支（线与子句框），在鼠标旁给出「收起」按钮；移开后稍等再收，好让鼠标移到按钮上
  const branchButton = $('#bfold');
  let branchTimer = 0;
  let hoverBranch: string | null = null;
  function highlightBranch(id: string | null): void {
    $$('#hits path.lit').forEach((path) => path.remove());
    $$('.box.lit').forEach((box) => box.classList.remove('lit'));
    if (!id) {
      return;
    }
    for (const hit of $$(`#hits path.hit[data-branch="${id}"]`)) {
      const mark = hit.cloneNode() as SVGPathElement;
      mark.setAttribute('class', 'lit');
      mark.removeAttribute('data-branch');
      hit.before(mark);
    }
    [id, ...descendants(id)].forEach((kid) => $(`[data-box="${kid}"]`)?.classList.add('lit'));
  }
  function hideBranchButton(): void {
    clearTimeout(branchTimer);
    branchButton.classList.remove('on');
    hoverBranch = null;
    highlightBranch(null);
  }
  function showBranchButton(id: string, event: MouseEvent): void {
    clearTimeout(branchTimer);
    if (hoverBranch !== id) {
      const base = $('#canvas').getBoundingClientRect();
      branchButton.textContent = `收起 ${branchLabel(id)}`;
      branchButton.style.left = `${event.clientX - base.left + 8}px`;
      branchButton.style.top = `${event.clientY - base.top + 8}px`;
      branchButton.classList.add('on');
      hoverBranch = id;
      highlightBranch(id);
    }
  }
  const leaveBranch = () => {
    clearTimeout(branchTimer);
    branchTimer = window.setTimeout(hideBranchButton, 400);
  };
  $('#hits').addEventListener('mouseover', (event) => {
    const id = (event.target as Element).getAttribute?.('data-branch');
    if (id) {
      showBranchButton(id, event as MouseEvent);
    }
  });
  $('#hits').addEventListener('mouseout', leaveBranch);
  branchButton.addEventListener('mouseenter', () => clearTimeout(branchTimer));
  branchButton.addEventListener('mouseleave', leaveBranch);
  branchButton.addEventListener('click', () => {
    if (hoverBranch) {
      folded.add(hoverBranch);
      applyFolds();
    }
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
    const hits = $<SVGSVGElement>('#hits');
    hits.innerHTML = '';
    // 先把三层缩成 0 再量画布：否则 scrollHeight 会把上一次的 SVG 尺寸算进去，收起分支、字体载入、窗口变宽后
    // SVG 只增不减，伸出画布底部，让 .scroller（overflow-x:auto 连带纵向也 auto）多出一条内层纵向滚动条
    const layers = [svg, tips, hits];
    for (const layer of layers) {
      layer.setAttribute('width', '0');
      layer.setAttribute('height', '0');
    }
    const [canvasWidth, canvasHeight] = [canvas.scrollWidth, canvas.scrollHeight];
    for (const layer of layers) {
      layer.setAttribute('width', String(canvasWidth));
      layer.setAttribute('height', String(canvasHeight));
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
    /** 两段在同一条直线上且有一段叠在一起。 */
    const overlapping = (a: Seg, b: Seg) => {
      const range = (p1: number, p2: number, q1: number, q2: number) => Math.min(Math.max(p1, p2), Math.max(q1, q2)) - Math.max(Math.min(p1, p2), Math.min(q1, q2)) > 1;
      return a.x1 === a.x2 && b.x1 === b.x2 ? Math.abs(a.x1 - b.x1) < 1 && range(a.y1, a.y2, b.y1, b.y2)
        : a.y1 === a.y2 && b.y1 === b.y2 && Math.abs(a.y1 - b.y1) < 1 && range(a.x1, a.x2, b.x1, b.x2);
    };
    const crowded = (points: Array<[number, number]>) => polyline(points).filter((seg) => seg.x1 === seg.x2).reduce((sum, seg) => sum + segs.filter((other) => other.x1 === other.x2
      && Math.abs(other.x1 - seg.x1) >= 1 && Math.abs(other.x1 - seg.x1) < 10
      && Math.min(Math.max(seg.y1, seg.y2), Math.max(other.y1, other.y2)) > Math.max(Math.min(seg.y1, seg.y2), Math.min(other.y1, other.y2))).length, 0);
    /**
     * 带箭头的线：线画在 layer，只画到箭头底边（线宽不会从箭头尖两侧露出来）；箭头是单独的三角形，
     * 一律画在最上层（#tips），不被方框边框盖住，各处大小一样。
     */
    const ARROW = 9;
    /** 连线的感应区（透明粗线），鼠标移上去可收起 branch 这一支。 */
    const hitArea = (points: Array<[number, number]>, branch: string) => {
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('class', 'hit');
      path.setAttribute('d', pathD(points));
      path.dataset.branch = branch;
      hits.append(path);
    };
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
    type Wire = { candidates: Array<Array<[number, number]>>; farSide: Set<number>; startSide: Set<number>; span: number; group: string; into: number | null; clause: string };
    const showLogic = !canvas.classList.contains('hide-logic');
    const wires: Wire[] = [];
    const argumentLines: Array<{ text: string; line: Array<[number, number]> }> = [];
    // 画逻辑虚线的方框（起点与关联的子句）
    const logicBoxes = new Set(D.clauses.flatMap((clause) => (clause.logic && clause.logic.targetIds.length > 0 ? [clause.id, clause.logic.targetIds[0]] : [])));
    const visible = allBoxes.filter((box) => !box.hidden).map((box) => {
      const r = box.getBoundingClientRect();
      return { box, left: r.left - base.left, right: r.right - base.left, top: r.top - base.top, bottom: r.bottom - base.top };
    });
    const endOf = (rect: DOMRect) => (rtl ? rect.left : rect.right) - base.left;
    // 逻辑虚线后画，先估出它们的位置：从两框尾边中点横出，到两句之间所有方框尾侧之外的竖道。句法连线挑走法时与它们的交叉照样计数
    const logicSegs: Seg[] = [];
    for (const clause of showLogic ? D.clauses : []) {
      const from = $(`[data-box="${clause.id}"]`);
      const to = clause.logic && clause.logic.targetIds.length > 0 ? $(`[data-box="${clause.logic.targetIds[0]}"]`) : null;
      if (!from || !to || from.hidden || to.hidden) {
        continue;
      }
      const [ra, rb] = [from.getBoundingClientRect(), to.getBoundingClientRect()];
      const [ya, yb] = [ra.top + ra.height / 2 - base.top, rb.top + rb.height / 2 - base.top];
      let lane = rtl ? Math.min(endOf(ra), endOf(rb)) : Math.max(endOf(ra), endOf(rb));
      for (const item of visible) {
        if (item.top < Math.max(ya, yb) && item.bottom > Math.min(ya, yb)) {
          lane = rtl ? Math.min(lane, item.left) : Math.max(lane, item.right);
        }
      }
      lane += rtl ? -18 : 18;
      logicSegs.push(...polyline([[endOf(ra), ya], [lane, ya], [lane, yb], [endOf(rb), yb]]));
    }
    /** 竖线 x 从 y1 到 y2 是否穿过 skip 以外的方框。 */
    const blockedV = (x: number, y1: number, y2: number, skip: HTMLElement[]) => visible.some((item) => !skip.includes(item.box)
      && x > item.left - 3 && x < item.right + 3 && Math.max(y1, y2) > item.top && Math.min(y1, y2) < item.bottom);
    // 连线指到母句里的占位符（嵌入子句）或被修饰的词
    const targetOf = (clause: (typeof D.clauses)[number], parentBox: HTMLElement) => clause.targetSlot
      ? $(`[data-slot="${clause.targetSlot}"] .g`, parentBox)
      : clause.targetWordId ? $(`[data-id="${clause.targetWordId}"] .g`, parentBox) : null;
    // 同一母句同一侧的横道按跨度排：子句离得最远的那组（主干在最外圈）用最靠近母句的横道，
    // 内圈的竖线从更远的横道起，不会横穿外圈的横线（徒 8:9a 下 10a→Σίμων 与 9b–9d→προϋπῆρχεν）
    const reach = new Map<string, Map<string, number>>();
    for (const clause of D.clauses) {
      const childBox = clause.parentId && byId.has(clause.parentId) ? $(`[data-box="${clause.id}"]`) : null;
      const parentBox = childBox ? $(`[data-box="${clause.parentId}"]`) : null;
      if (!childBox || !parentBox || childBox.hidden || parentBox.hidden || childBox.classList.contains('side')) {
        continue;
      }
      const c = childBox.getBoundingClientRect();
      const p = parentBox.getBoundingClientRect();
      const below = c.top >= p.bottom;
      const key = `${clause.parentId}|${below ? 'b' : 'a'}`;
      const targetKey = clause.targetSlot ?? clause.targetWordId ?? '';
      const spans = reach.get(key) ?? new Map<string, number>();
      spans.set(targetKey, Math.max(spans.get(targetKey) ?? 0, below ? c.top - p.bottom : p.top - c.bottom));
      reach.set(key, spans);
    }
    for (const [key, spans] of reach) {
      lanes.set(key, new Map([...spans].sort((a, b) => b[1] - a[1]).map(([target], i) => [target, i])));
    }
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
        hitArea(points, clause.id);
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
      // 2) 起始侧沟槽：在子句与母句之间所有方框的起始侧之外（记在 startSide）
      const startSide = new Set<number>();
      let gutter = start(c) + (rtl ? 16 : -16);
      for (const item of visible) {
        if (!skip.includes(item.box) && item.top < Math.max(childEdge, edge) && item.bottom > Math.min(childEdge, edge)) {
          gutter = rtl ? Math.max(gutter, (rtl ? item.right : item.left) + 10) : Math.min(gutter, item.left - 10);
        }
      }
      for (let k = 0; k < 6; k += 1) {
        const g = gutter + (rtl ? 1 : -1) * k * 6;
        startSide.add(candidates.length);
        candidates.push([[start(c), yChild], [g, yChild], [g, yLane], [xT, yLane], [xT, tip]]);
      }
      // 3) 尾侧沟槽（这里和 4) 里竖道在尾侧的走法记在 farSide）
      const farSide = new Set<number>();
      let far = endOf(c);
      for (const item of visible) {
        if (item.top < Math.max(childEdge, edge) && item.bottom > Math.min(childEdge, edge)) {
          far = rtl ? Math.min(far, item.left) : Math.max(far, item.right);
        }
      }
      // 子句自己带逻辑关系时，逻辑虚线接在尾边中点，句法线改从尾边上部出
      const yFar = showLogic && logicBoxes.has(clause.id) ? Math.round(c.top - base.top + Math.min(c.height * 0.3, 40)) : yChild;
      for (let k = 0; k < 4; k += 1) {
        const g = far + (rtl ? -1 : 1) * (10 + k * 6);
        farSide.add(candidates.length);
        candidates.push([[endOf(c), yFar], [g, yFar], [g, yLane], [xT, yLane], [xT, tip]]);
      }
      // 4) 经中间方框之间的空隙绕过去：从子句朝母句的边（或起始侧沟槽）进空隙，横走到尾侧沟槽或正对目标词处，再往母句去。
      // 挡在中间的从句与母句的连线（如嵌入子句的竖线）这样就不必横穿
      const [lo, hi] = [Math.min(childEdge, edge), Math.max(childEdge, edge)];
      const inRange = visible.filter((item) => item.top < hi && item.bottom > lo).sort((a, b) => a.top - b.top);
      let cursor = lo;
      const gaps: number[] = [];
      for (const item of inRange) {
        if (item.top - cursor >= 12) {
          gaps.push(Math.round((cursor + item.top) / 2));
        }
        cursor = Math.max(cursor, item.bottom);
      }
      if (hi - cursor >= 12) {
        gaps.push(Math.round((cursor + hi) / 2));
      }
      for (const yG of gaps.filter((y) => Math.abs(y - yLane) > 8 && Math.abs(y - childEdge) > 8)) {
        const entries: Array<Array<[number, number]>> = [
          ...[...new Set(exits)].filter((x) => !blockedV(x, childEdge, yG, skip)).map((x): Array<[number, number]> => [[x, childEdge], [x, yG]]),
          [[start(c), yChild], [gutter, yChild], [gutter, yG]],
        ];
        // 尾侧竖道只需绕开空隙到母句之间的方框：同一处空隙出来的线落在同一条竖道上，能汇成主干
        let farAbove = rtl ? Infinity : -Infinity;
        for (const item of inRange) {
          if (item.top < Math.max(yG, edge) && item.bottom > Math.min(yG, edge)) {
            farAbove = rtl ? Math.min(farAbove, item.left) : Math.max(farAbove, item.right);
          }
        }
        for (const entry of entries) {
          const g = (Number.isFinite(farAbove) ? farAbove : far) + (rtl ? -1 : 1) * 10;
          farSide.add(candidates.length);
          candidates.push([...entry, [g, yG], [g, yLane], [xT, yLane], [xT, tip]]);
          if (!blockedV(xT, yG, tip, skip)) {
            candidates.push([...entry, [xT, yG], [xT, tip]]);
          }
        }
      }
      wires.push({ candidates, farSide, startSide, span: Math.abs(childEdge - edge), group: `${laneKey}|${targetKey}`, into, clause: clause.id });
    }
    const verticals: Array<{ x: number; top: number; bottom: number }> = [];
    const length = (points: Array<[number, number]>) => points.slice(1).reduce((sum, [x, y], i) => sum + Math.abs(x - points[i][0]) + Math.abs(y - points[i][1]), 0);
    // 指向同一个词的线汇成主干：汇合处最多三个方向（┬ ┴ ├ ┤），四个方向就成了十字，看着像交叉而过
    const groupSegs = new Map<string, Seg[]>();
    const directions = (x: number, y: number, seg: Seg) => {
      const on = (a: number, b: number, v: number) => v >= Math.min(a, b) - 0.5 && v <= Math.max(a, b) + 0.5;
      if (!on(seg.x1, seg.x2, x) || !on(seg.y1, seg.y2, y) || (seg.x1 === seg.x2 && Math.abs(seg.x1 - x) > 0.5) || (seg.y1 === seg.y2 && Math.abs(seg.y1 - y) > 0.5)) {
        return [];
      }
      const ends = [[seg.x1, seg.y1], [seg.x2, seg.y2]].filter(([ex, ey]) => Math.abs(ex - x) > 0.5 || Math.abs(ey - y) > 0.5);
      return ends.map(([ex, ey]) => (ex > x ? 'r' : ex < x ? 'l' : ey > y ? 'd' : 'u'));
    };
    const crossJoints = (path: Seg[], others: Seg[]) => {
      const points = path.flatMap((seg) => [[seg.x1, seg.y1], [seg.x2, seg.y2]])
        .concat(others.flatMap((seg) => [[seg.x1, seg.y1], [seg.x2, seg.y2]]));
      const seen = new Set<string>();
      let count = 0;
      for (const [x, y] of points) {
        const key = `${Math.round(x)},${Math.round(y)}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const mine = new Set(path.flatMap((seg) => directions(x, y, seg)));
        if (mine.size > 0 && new Set([...mine, ...others.flatMap((seg) => directions(x, y, seg))]).size === 4) {
          count += 1;
        }
      }
      return count;
    };
    const score = (wire: Wire, index: number) => {
      const points = wire.candidates[index];
      const path = polyline(points);
      const logicCrossings = path.reduce((sum, seg) => sum + logicSegs.filter((other) => crosses(seg, other)).length, 0);
      const own = groupSegs.get(wire.group) ?? [];
      const joints = crossJoints(path, own);
      // 与别组的线重合（同一条竖道或横道上有一段叠在一起）看不出各自指向哪个词，与交叉同价
      const shared = path.reduce((sum, seg) => sum + segs.filter((other) => !own.includes(other) && overlapping(seg, other)).length, 0);
      // 新约：主干、分叉优先走起始侧（左侧），尾侧留给逻辑虚线；只在左侧会多出交叉时才走尾侧
      const farCost = !D.isOT && wire.farSide.has(index) ? 500 : 0;
      // 新约：几条线指向同一个词时，都从起始侧沟槽汇进主干（包括正对着目标词、本可直上的那条，如引语的第一句）
      const sideCost = !D.isOT && !wire.startSide.has(index) && (groups.get(wire.group)?.length ?? 0) > 1 ? 400 : 0;
      return (cost(path) + logicCrossings + joints + shared) * 1000 + crowded(points) * 300 + (points.length - 2) * 40 + length(points) * 0.05 + farCost + sideCost;
    };
    const commit = (wire: Wire, best: Array<[number, number]>) => {
      // 与先画的线交叉处，后画的这条跨过去
      const hops = crossings(best);
      const lines = polyline(best);
      segs.push(...lines);
      groupSegs.set(wire.group, [...(groupSegs.get(wire.group) ?? []), ...lines]);
      // 句法竖线也记下，逻辑虚线不贴着它们走
      for (const seg of polyline(best).filter((item) => item.x1 === item.x2)) {
        verticals.push({ x: seg.x1, top: Math.min(seg.y1, seg.y2), bottom: Math.max(seg.y1, seg.y2) });
      }
      hitArea(best, wire.clause);
      const argument = byId.get(wire.clause)?.argument;
      if (argument) {
        argumentLines.push({ text: argument, line: wire.into === null ? best : [...best, [best.at(-1)![0], wire.into]] });
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
    };
    // 指向同一个词的几条线一起挑（可共用一段主干绕开别的线）：组合不多时穷举；各组按其中跨度最短的那条排先后
    const groups = new Map<string, Wire[]>();
    for (const wire of wires) {
      groups.set(wire.group, [...(groups.get(wire.group) ?? []), wire]);
    }
    const minSpan = (group: Wire[]) => Math.min(...group.map((wire) => wire.span));
    for (const group of [...groups.values()].sort((a, b) => minSpan(a) - minSpan(b))) {
      group.sort((a, b) => a.span - b.span);
      const combos = group.reduce((product, wire) => product * wire.candidates.length, 1);
      if (group.length === 1 || combos > 20000) {
        for (const wire of group) {
          const index = wire.candidates.reduce((best, _, i) => (score(wire, i) < score(wire, best) ? i : best), 0);
          commit(wire, wire.candidates[index]);
        }
        continue;
      }
      const singles = group.map((wire) => wire.candidates.map((_, i) => score(wire, i)));
      const pick = group.map(() => 0);
      let bestPick = [...pick];
      let bestScore = Infinity;
      const walk = (depth: number, sum: number) => {
        if (sum >= bestScore) {
          return;
        }
        if (depth === group.length) {
          bestScore = sum;
          bestPick = [...pick];
          return;
        }
        for (const [i, single] of singles[depth].entries()) {
          pick[depth] = i;
          const mine = polyline(group[depth].candidates[i]);
          const picked = pick.slice(0, depth).flatMap((j, d) => polyline(group[d].candidates[j]));
          const mutual = picked.reduce((m, seg) => m + mine.filter((other) => crosses(seg, other)).length, 0)
            + crossJoints(mine, [...(groupSegs.get(group[0].group) ?? []), ...picked]);
          walk(depth + 1, sum + single + mutual * 1000);
        }
      };
      walk(0, 0);
      group.forEach((wire, d) => commit(wire, wire.candidates[bestPick[d]]));
    }

    // ---- 论元子句的连线上标「宾语」「引语」等：放在最长的一段上，靠近箭头那头；与已放的标签重叠就沿线挪开 ----
    const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
    const overlapsLabel = (x: number, y: number, w: number, h: number) => placed.some((other) => Math.abs(other.x - x) < (other.w + w) / 2
      && Math.abs(other.y - y) < (other.h + h) / 2);
    for (const { text, line } of argumentLines) {
      const label = document.createElement('div');
      label.className = 'll al';
      label.textContent = text;
      canvas.append(label);
      const width = label.offsetWidth + 6;
      const height = label.offsetHeight + 4;
      const segments = line.slice(1).map((point, i) => [line[i], point] as const)
        .map(([a, b], i) => ({ a, b, i, size: Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) }));
      // 段长够放下标签的里取最长的（同长取靠箭头的）；都不够就取最长的一段
      const fits = segments.filter(({ a, b, size }) => size >= (a[1] === b[1] ? width : height) + 8);
      const pool = fits.length > 0 ? fits : segments;
      const seg = pool.reduce((best, item) => (item.size > best.size || (item.size === best.size && item.i > best.i) ? item : best));
      // 从段的中点往两头试，避开已放好的标签
      let spot: [number, number] = [(seg.a[0] + seg.b[0]) / 2, (seg.a[1] + seg.b[1]) / 2];
      const horizontal = seg.a[1] === seg.b[1];
      for (let k = 0; k < 20 && overlapsLabel(spot[0], spot[1], width, height); k += 1) {
        const step = (k % 2 === 0 ? 1 : -1) * Math.ceil((k + 1) / 2) * (horizontal ? width / 2 : height / 2);
        const [mx, my] = [(seg.a[0] + seg.b[0]) / 2, (seg.a[1] + seg.b[1]) / 2];
        spot = horizontal ? [mx + step, my] : [mx, my + step];
      }
      placed.push({ x: spot[0], y: spot[1], w: width, h: height });
      label.style.left = `${spot[0]}px`;
      label.style.top = `${spot[1]}px`;
    }

    // ---- 叙事主线：主线上的顶层句用短横线接到最外侧的脊线（不画圆点，前置看框头标签）；离线句不接，脊线只连主线句 ----
    const roots: Array<[number, HTMLElement]> = [];
    for (const clause of D.clauses) {
      const box = $(`[data-box="${clause.id}"]`);
      if (mainline && box && (box.dataset.form || box.dataset.ntForm || clause.mainline) && !box.hidden && !(clause.parentId && byId.has(clause.parentId)) && !offline(clause)) {
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
      // 以框的垂直中点为中心上下排开；间距大于标签高度，贴着同一框的两段横线各放标签时不重叠（徒 8:22a）
      const step = Math.min(24, (rect.height - 16) / Math.max(1, list.length));
      const middle = rect.top - base.top + rect.height / 2;
      list.forEach((item, i) => anchorY.set(item.key, Math.round(middle + (i - (list.length - 1) / 2) * step)));
    }
    const order = links.map((link, index) => ({ ...link, index }));
    const labels: Array<{ label: HTMLElement; line: Array<[number, number]>; lane: number }> = [];
    for (const { clause, c, t, top, bottom, edge, index, cRow, tRow } of order.sort((a, b) => (a.bottom - a.top) - (b.bottom - b.top))) {
      /** 框上的连接段：尾侧空着时从侧边横出；被挡住时从顶边或底边竖出，再到整行外侧的横道。返回 [框上的点, 横道上的点]。 */
      const attach = (rect: DOMRect, row: DOMRect | null, key: string, up: boolean): Array<[number, number]> => {
        if (!row) {
          return [[end(rect), anchorY.get(key)!]];
        }
        const rank = anchorRank.get(key) ?? 0;
        const x = Math.round(end(rect) + (rtl ? 1 : -1) * (16 + rank * 10));
        const yEdge = (up ? rect.top : rect.bottom) - base.top;
        // 框可能比整行的外框更靠外（如 徒 8:10a 底边低于行底）：横道从两者更外的边算起，离框边至少 16px，箭头（9px）前留一段竖线
        const yLane = Math.round((up ? Math.min(row.top, rect.top) - 16 - rank * 6 : Math.max(row.bottom, rect.bottom) + 16 + rank * 6) - base.top);
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
      canvas.append(label);
      labels.push({ label, line: points(best), lane: best });
    }
    // 标签放在这条线独有的横段上（几条竖道并排时，放在竖线上看不出归属）：挑最长的横段，避开横穿它的竖线和已放好的标签；
    // 横段都放不下时才放在竖线中点，与已放好的标签重叠就往下挪
    for (const { label, line, lane } of labels) {
      const width = label.offsetWidth + 8;
      const height = label.offsetHeight + 4;
      let spot: [number, number] | null = null;
      let room = 0;
      for (let i = 1; i < line.length; i += 1) {
        const [[xa, ya], [xb, yb]] = [line[i - 1], line[i]];
        if (ya !== yb || Math.abs(xb - xa) < width + 12) {
          continue;
        }
        const lo = Math.min(xa, xb) + 6 + width / 2;
        const hi = Math.max(xa, xb) - 6 - width / 2;
        for (let x = lo; x <= hi; x += 4) {
          const clear = !verticals.some((v) => v.x !== lane && v.top < ya && v.bottom > ya && Math.abs(v.x - x) < width / 2 + 2)
            && !overlapsLabel(x, ya, width, height);
          if (clear && hi - lo + width > room) {
            spot = [x, ya];
            room = hi - lo + width;
            break;
          }
        }
      }
      let [x, y] = spot ?? [lane, (line[0][1] + line.at(-1)![1]) / 2];
      while (!spot && overlapsLabel(x, y, width, height)) {
        y += height;
      }
      placed.push({ x, y, w: width, h: height });
      label.style.left = `${x}px`;
      label.style.top = `${y}px`;
    }
  }
  let frame = 0;
  const redraw = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      drawWires();
      // 重画会清掉感应区，正在悬停的那一支重新加亮
      if (hoverBranch) {
        highlightBranch(hoverBranch);
      }
    });
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

  // ---------- 悬停高亮、悬停弹出词卡 ----------
  const mark = (id: string, cls: string) => $$(`[data-id="${id}"]`).forEach((el) => el.classList.add(cls));
  const clear = (cls: string) => $$(`.${cls}`).forEach((el) => el.classList.remove(cls));
  let popId: string | null = null;
  let popAnchor: HTMLElement | null = null;
  let popTimer = 0;
  function hidePop(): void {
    clearTimeout(popTimer);
    $('#pop').classList.remove('show');
    clear('sel');
    popId = null;
    popAnchor = null;
  }
  // 移出词后稍等再收，好让指针移进词卡里展开词典
  function hidePopSoon(): void {
    clearTimeout(popTimer);
    popTimer = window.setTimeout(hidePop, 250);
  }
  function showPop(id: string, anchor: HTMLElement): void {
    clearTimeout(popTimer);
    if (popId === id) {
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
    popAnchor = anchor;
    placePop();
  }
  // 词卡固定在视口里、不占版面（原先放在画布里，词在页面底部时词卡撑高页面，指针随之移出词，来回抖动）。
  // 下方放得下就放下方，否则放剩余空间较大的一侧；放上方时以底边定位，展开词典往上长；仍放不下时词卡内部滚动。
  function placePop(): void {
    const pop = $('#pop');
    if (!popAnchor || !pop.classList.contains('show')) {
      return;
    }
    const gap = 6;
    const margin = 8;
    const rect = popAnchor.getBoundingClientRect();
    pop.style.maxHeight = '';
    pop.style.left = `${Math.max(margin, Math.min(rect.left, innerWidth - pop.offsetWidth - margin))}px`;
    const below = innerHeight - rect.bottom - gap - margin;
    const above = rect.top - gap - margin;
    if (pop.offsetHeight <= below || below >= above) {
      Object.assign(pop.style, { top: `${rect.bottom + gap}px`, bottom: 'auto', maxHeight: `${below}px` });
    } else {
      Object.assign(pop.style, { top: 'auto', bottom: `${innerHeight - rect.top + gap}px`, maxHeight: `${above}px` });
    }
  }
  for (const el of $$('[data-id]')) {
    el.addEventListener('mouseenter', () => mark(el.dataset.id!, 'hl'));
    el.addEventListener('mouseleave', () => clear('hl'));
  }
  for (const el of $$('#canvas [data-id]')) {
    el.addEventListener('mouseenter', () => {
      clearTimeout(popTimer);
      popTimer = window.setTimeout(() => showPop(el.dataset.id!, el), 120);
    });
    el.addEventListener('mouseleave', hidePopSoon);
    // 触屏没有悬停，点一下照样弹出
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      showPop(el.dataset.id!, el);
    });
  }
  $('#pop').addEventListener('mouseenter', () => clearTimeout(popTimer));
  $('#pop').addEventListener('mouseleave', hidePopSoon);
  $('#pop').addEventListener('click', (event) => event.stopPropagation());
  // 展开、收起词典后词卡高度变了，重新挑位置
  $('#pop').addEventListener('toggle', placePop, true);
  // 词卡不随页面滚动，滚动时收起（词卡自己的滚动除外）
  document.addEventListener('scroll', (event) => {
    if (!$('#pop').contains(event.target as Node)) {
      hidePop();
    }
  }, true);
  addEventListener('resize', placePop);
  document.addEventListener('click', hidePop);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hidePop();
    }
  });
  // 复制选中的词：只取原文（不带词法、词义那几行），同一子句里以空格相连（语素、maqqef 相连处不加），不同子句另起一行
  document.addEventListener('copy', (event) => {
    const selection = getSelection();
    const words = selection ? $$('#canvas .w:not(.slot)').filter((w) => selection.containsNode(w, true)) : [];
    if (words.length === 0 || !event.clipboardData) {
      return;
    }
    const text = words.map((w, i) => {
      const g = w.querySelector('.g')!.cloneNode(true) as HTMLElement;
      g.querySelector('.vb')?.remove();
      const previous = words[i - 1];
      const gap = !previous ? '' : previous.closest('.box') !== w.closest('.box') ? '\n' : previous.classList.contains('join') ? '' : ' ';
      return gap + g.textContent;
    }).join('');
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
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

/** 各结构图共用的样式与脚本，写在图旁边；重写这两个文件，已生成的图刷新就用上新版。 */
export const DIAGRAM_ASSETS: Record<string, string> = {
  'diagram.css': `@import url('https://fonts.googleapis.com/css2?family=Gentium+Book+Plus:wght@400;700&family=Noto+Serif+Hebrew:wght@400;600&display=swap');\n${STYLE}`,
  'diagram.js': `(() => {\n  const data = document.getElementById('data');\n  (${diagramClient.toString()})(JSON.parse(data.textContent), data.dataset.subtitle);\n})();\n`,
};

/** 一张图的 HTML：只有标题与数据，样式、骨架和脚本都在共用的 DIAGRAM_ASSETS 里。 */
export function renderDiagramPage(data: DiagramData, subtitle = ''): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(data.title)} 结构图</title>
<link rel="stylesheet" href="diagram.css">
</head>
<body>
<script id="data" type="application/json" data-subtitle="${escapeHtml(subtitle || '结构以子句分析为准')}">${safeJson(data)}</script>
<script src="diagram.js"></script>
</body>
</html>
`;
}
