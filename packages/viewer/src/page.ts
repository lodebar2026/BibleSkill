/** 单文件 HTML 模板：样式 + 内嵌数据 + 内嵌脚本（dist/browser.bundle.js）。 */

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
}

/** 内嵌 JSON 时防止 `</script>` 提前结束脚本块。 */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

const STYLE = `
:root {
  --bg: #fdfcf9; --fg: #1d1b16; --muted: #77716a; --line: #e4dfd6; --accent: #8a5a00;
  --ambiguous: #fff1c7; --review: #fde2e2; --selected: #e8f0fe; --shadow: #6b6b6b; --error: #b3261e;
  --align: #ffe08a; --pending: #c7e3ff;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #17161a; --fg: #ebe7df; --muted: #9a958c; --line: #34313a; --accent: #f0b54a;
    --ambiguous: #3d3418; --review: #44232a; --selected: #233148; --shadow: #a8a29a; --error: #f28b82;
    --align: #6b5414; --pending: #1f4a73;
  }
}
:root[data-theme="dark"] {
  --bg: #17161a; --fg: #ebe7df; --muted: #9a958c; --line: #34313a; --accent: #f0b54a;
  --ambiguous: #3d3418; --review: #44232a; --selected: #233148; --shadow: #a8a29a; --error: #f28b82;
    --align: #6b5414; --pending: #1f4a73;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg);
  font-family: "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif; }
header { padding: 16px 24px; border-bottom: 1px solid var(--line); }
header h1 { margin: 0; font-size: 20px; }
header p { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
main { display: flex; gap: 24px; padding: 16px 24px; align-items: flex-start; }
#app { flex: 1; min-width: 0; overflow-x: auto; }
#details { position: sticky; top: 16px; width: 320px; flex-shrink: 0; border: 1px solid var(--line);
  border-radius: 8px; padding: 12px 16px; font-size: 14px; }
#details h3 { margin: 0 0 8px; }
#details h4 { margin: 12px 0 4px; font-size: 13px; color: var(--muted); }
#details dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0; }
#details dt { color: var(--muted); }
#details dd { margin: 0; }
#details .renderings td { padding: 2px 8px 2px 0; vertical-align: top; }
h2 { font-size: 16px; margin: 16px 0 8px; }
table.clauses { border-collapse: collapse; width: 100%; }
table.clauses td { border-bottom: 1px solid var(--line); padding: 2px 8px; vertical-align: middle; }
td.verse { color: var(--muted); font-size: 12px; white-space: nowrap; width: 3em; }
td.orig { white-space: nowrap; font-family: "SBL BibLit", "SBL Hebrew", "SBL Greek", "Noto Serif Hebrew", "Noto Serif", serif; font-size: 20pt; }
table.ot td.orig { direction: rtl; text-align: right; }
td.zh { font-size: 16px; line-height: 1.6; white-space: pre-line; min-width: 14em; }
.tree-prefix { white-space: pre; font-family: "Times New Roman", Times, serif; font-size: 25pt; color: var(--muted); }
.word.aligned, .zh-seg.aligned { background: var(--align); border-radius: 3px; }
.zh-added { color: var(--muted); }
.zh-added::before { content: '['; }
.zh-added::after { content: ']'; }
.word.pending { background: var(--pending); border-radius: 3px; }
#details .renderings input { width: 100%; font: inherit; font-size: 12px; }
#details .renderings button { font-size: 12px; padding: 0 4px; }
.word.na-bracket { color: var(--muted); font-style: italic; }
.word.shadow { color: var(--shadow); text-decoration: underline dotted; text-underline-offset: 6px; }
tr.para-title td { font-weight: 600; color: var(--accent); padding-top: 14px; border-bottom: none; }
tr.clause { cursor: pointer; }
tr.status-ambiguous td.orig { background: var(--ambiguous); }
tr.status-needs-review td.orig { background: var(--review); }
tr.selected td { background: var(--selected); }
.muted { color: var(--muted); }
.alt-line { font-size: 14px; color: var(--muted); }
.alt-kind { display: inline-block; font-size: 11px; padding: 0 5px; border: 1px solid var(--line); border-radius: 4px; color: var(--accent); }
ul.alternatives { padding-left: 18px; }
ul.alternatives li { margin-bottom: 6px; }
td.verse.needs-retranslate { color: var(--error); font-weight: 600; cursor: help; }
td.verse.needs-retranslate::after { content: " ↻"; }
td.verse.unsaved { background: var(--review); color: var(--error); font-weight: 600; }
tr.save-error td { color: var(--error); font-size: 13px; padding: 4px 8px 8px; }
.toolbar { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  padding: 8px 0; margin-bottom: 8px; background: var(--bg); border-bottom: 1px solid var(--line); }
.toolbar .spacer { flex: 1; }
.status-line { flex-basis: 100%; font-size: 13px; color: var(--muted); min-height: 1.4em; }
.status-line.error { color: var(--error); }
button { font: inherit; font-size: 13px; padding: 3px 10px; border: 1px solid var(--line); border-radius: 6px;
  background: var(--bg); color: var(--fg); cursor: pointer; }
button:hover:not(:disabled) { border-color: var(--accent); }
button:disabled { opacity: 0.45; cursor: default; }
button.mode.active { background: var(--accent); border-color: var(--accent); color: var(--bg); }
.word[data-id] { cursor: pointer; border-radius: 3px; }
.word[data-id]:hover { background: var(--selected); }
.edit-form { display: grid; gap: 6px; margin: 8px 0; }
.edit-form .field { display: grid; grid-template-columns: 6.5em 1fr; gap: 8px; align-items: start; font-size: 13px; }
.edit-form .field span { color: var(--muted); padding-top: 3px; }
.edit-form select, .edit-form textarea { font: inherit; font-size: 13px; color: var(--fg); background: var(--bg);
  border: 1px solid var(--line); border-radius: 6px; padding: 3px 6px; width: 100%; }
.edit-form textarea { min-height: 3.2em; resize: vertical; }
.actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
@media (max-width: 900px) {
  main { flex-direction: column; padding: 12px 16px; }
  #details { position: static; width: 100%; }
}
`;

export function renderPage(input: { title: string; subtitle: string; data: unknown; script: string }): string {
  return `<!doctype html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+Hebrew&family=Noto+Serif:ital@0;1&display=swap">
<style>${STYLE}</style>
</head>
<body>
<header><h1>${escapeHtml(input.title)}</h1><p>${escapeHtml(input.subtitle)}</p></header>
<main><div id="app">加载中…</div><aside id="details" hidden></aside></main>
<script>window.__BIBLESKILL__ = ${safeJson(input.data)};</script>
<script>${input.script.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>
`;
}
