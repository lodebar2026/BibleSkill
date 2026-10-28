/**
 * 结构图：单文件交互 HTML。
 *
 * 每个子句一行，按原文先后自上而下排（叙事链、话语内容的序列一句接一句往下读），缩进表示从属；
 * 框头标子句编号。连线走在缩进留出的沟槽里，从子句连到母句里被修饰的词，不穿过别的框。
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
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #171614; --panel: #201e1b; --ink: #ece7dd; --muted: #a39d92; --line: #3a3631; --soft: #2a2724;
    --accent: #e0a46a; --wire: #e0a46a; --logic: #5eead4;
    --r-v: #f87171; --r-s: #7aa2ff; --r-conj: #a39d92; --r-none: #5a554d;
    --hl: #6b5512; --amb: #3d3418; --rev: #44232a;
  }
}
:root[data-theme="dark"] {
  --bg: #171614; --panel: #201e1b; --ink: #ece7dd; --muted: #a39d92; --line: #3a3631; --soft: #2a2724;
  --accent: #e0a46a; --wire: #e0a46a; --logic: #5eead4;
  --r-v: #f87171; --r-s: #7aa2ff; --r-conj: #a39d92; --r-none: #5a554d;
  --hl: #6b5512; --amb: #3d3418; --rev: #44232a;
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
.forest { display: flex; flex-direction: column; align-items: flex-start; gap: 40px; padding: 4px 0; }
.forest .box.vstart { margin-top: 14px; }
.forest .box.vstart:first-child { margin-top: 0; }
.box { position: relative; z-index: 2; background: var(--panel); border: 1.5px solid var(--line); border-radius: 10px; padding: 8px 10px 10px; width: fit-content; min-width: 280px; max-width: 100%; margin-inline-start: calc(var(--depth, 0) * 40px); }
/* 方框宽度只由原文成分决定：框头、说明、展开内容不参与宽度计算，在框内换行 */
.box > .bh, .box > .up, .box > .more { contain: inline-size; }
.box.root { border: 2.5px solid var(--accent); box-shadow: 0 2px 10px color-mix(in srgb, var(--accent) 18%, transparent); }
.box.ambiguous { background: color-mix(in srgb, var(--amb) 45%, var(--panel)); }
.bh { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; margin-bottom: 6px; user-select: none; direction: ltr; }
.bh .det { font: inherit; font-size: 11px; border: 1px solid var(--line); background: var(--soft); color: var(--muted); border-radius: 999px; padding: 0 8px; cursor: pointer; margin-inline-start: auto; }
.box.open .bh .det { color: var(--ink); border-color: var(--muted); }
.box[data-form] { border-color: var(--tc); border-width: 2px; }
.box.root[data-form] { border-width: 3px; box-shadow: none; }
.box[data-form="wayyiqtol"] { --tc: #F656B8; } .box[data-form="qatal"] { --tc: #FF0000; } .box[data-form="weqatal"] { --tc: #2A7FFF; }
.box[data-form="yiqtol"] { --tc: #00CC00; } .box[data-form="participle"] { --tc: #9E5329; } .box[data-form="infinitive"] { --tc: #6B6B6B; }
.box[data-form="imperative"] { --tc: #A449FF; } .box[data-form="nominal"] { --tc: #B8B0A2; }
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
.bh .cid { font-size: 12px; font-weight: 700; color: var(--accent); border: 1.5px solid var(--accent); border-radius: 4px; padding: 0 5px; font-variant-numeric: tabular-nums; }
.bh .lab { font-size: 12px; font-weight: 600; color: var(--panel); background: var(--muted); border-radius: 4px; padding: 0 6px; }
.box.root .bh .lab { background: var(--accent); }
.bh .st { font-size: 11px; border-radius: 4px; padding: 0 5px; }
.bh .st.ambiguous { background: var(--amb); color: var(--ink); border: 1px solid var(--accent); }
.bh .st.needs-review { background: var(--rev); color: var(--ink); border: 1px solid var(--r-v); }
.bh .gist { font-size: 14px; flex: 1 1 9em; min-width: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: stretch; }
.chip { display: flex; flex-direction: column; border: 1px solid var(--line); border-top: 4px solid var(--c); border-radius: 6px; padding: 0 2px 2px; background: color-mix(in srgb, var(--c) 6%, var(--panel)); --c: var(--r-none); }
.chip > .rl { font-size: 11px; color: var(--c); font-weight: 600; padding: 1px 4px 0; min-height: 1.4em; direction: ltr; }
.chip > .ws { display: flex; flex-wrap: wrap; }
.chip > .ws > .lb { flex-basis: 100%; height: 4px; }
.chip.r-v { --c: var(--r-v); } .chip.r-s { --c: var(--r-s); }
.chip.r-conj { --c: var(--r-conj); border-style: dashed; border-top-style: solid; }
.w { display: inline-flex; flex-direction: column; align-items: center; padding: 1px 4px 2px; border-radius: 5px; cursor: pointer; }
.w.join { padding-inline-end: 0; }
.w.join + .w { padding-inline-start: 0; }
.w .g { font-size: 20px; line-height: 1.3; white-space: nowrap; }
.ot .w .g { font-size: 24px; }
.w .m, .w .z, .w .e { font-size: 11px; color: var(--muted); line-height: 1.35; white-space: nowrap; direction: ltr; }
.w .z { color: var(--ink); font-size: 12px; }
.w.target .g { text-decoration: underline 2px var(--wire); text-underline-offset: 5px; }
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
#wires { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 1; overflow: visible; }
#wires path { fill: none; stroke: var(--wire); stroke-width: 2; }
#wires path.tip { fill: var(--wire); stroke: none; }
#wires path.logic { stroke: var(--logic); stroke-dasharray: 6 4; }
#wires path.logic-tip { fill: var(--logic); stroke: none; }
.ll { position: absolute; z-index: 4; transform: translate(-50%, -50%); font-size: 12px; font-weight: 600; color: var(--logic); background: var(--panel); border: 1.5px dashed var(--logic); border-radius: 999px; padding: 0 7px; white-space: nowrap; pointer-events: none; direction: ltr; }
.hide-logic .ll { display: none; }
.up .lg { color: var(--logic); }
@media (max-width: 760px) {
  .forest { gap: 12px; }
  .box { margin-inline-start: calc(var(--depth, 0) * 14px); max-width: calc(100% - var(--depth, 0) * 14px); }
  #wires, .ll { display: none; }
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
  const ROLE_ZH: Record<string, string> = { s: '主语', v: '谓语', conj: '连接词' };
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
  // 旧约句型码 → 动词形式（着色用，配色同 BibleCenter）；X 在动词前 = 成分前置
  const formOf = (type: string): string | null => {
    if (!D.isOT || !type) return null;
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
  const fronted = (type: string) => /^X(Qtl|Yqt)/.test(type);
  // 叙事主线：顶层子句里 wayyiqtol 是主线，其余形式离开主线（背景、评述、凸显）
  const offline = (clause: (typeof D.clauses)[number]) => !clause.parentId && formOf(clause.type) !== null && formOf(clause.type) !== 'wayyiqtol';
  // 子句编号：bcv+字母，显示为「节+字母」；范围跨章时带章号
  const chapterOf = (id: string) => Math.floor(Number(id.match(/^\d+/)![0]) / 1000) % 1000;
  const multiChapter = new Set(D.clauses.map((clause) => chapterOf(clause.id))).size > 1;
  const clauseNo = (id: string) => {
    const [, bcv, sub] = id.match(/^(\d+)([a-z]+)$/) ?? [, '0', id];
    const verse = Number(bcv) % 1000;
    return multiChapter ? `${chapterOf(id)}:${verse}${sub}` : `${verse}${sub}`;
  };

  function renderBox(clause: (typeof D.clauses)[number], forest: HTMLElement, verseStart: boolean): void {
    const depth = depthOf(clause);
    const box = document.createElement('div');
    box.className = `box${depth === 0 ? ' root' : ''}${clause.status === 'ambiguous' ? ' ambiguous' : ''}${verseStart ? ' vstart' : ''}`;
    box.dataset.box = clause.id;
    box.style.setProperty('--depth', String(depth));
    const form = formOf(clause.type);
    if (form) {
      box.dataset.form = form;
    }
    const marks = [fronted(clause.type) ? '<span class="mk" title="动词前有成分前置（X-动词语序），常用来凸显、对比或转入背景">前置</span>' : '',
      offline(clause) ? '<span class="mk" title="顶层叙事不用 wayyiqtol：离开主线，多为背景、评述或凸显">离线</span>' : ''].join('');
    const typeBadge = form ? `<span class="ty" title="${esc(FORM_ZH[form])}">${esc(clause.type)}</span>${marks}` : '';
    const status = clause.status === 'ambiguous' ? '<span class="st ambiguous">有歧义</span>' : clause.status === 'needs-review' ? '<span class="st needs-review">待复核</span>' : '';
    const foldButton = descendants(clause.id).length > 0 ? '<button type="button" class="fold" title="收起/展开这个分支（隐藏或显示下属子句）">收起分支</button>' : '';
    box.innerHTML = `<div class="bh">${foldButton}<span class="cid">${esc(clauseNo(clause.id))}</span>${typeBadge}<span class="lab">${esc(clause.label)}</span>${status}<span class="gist">${esc(clause.gist)}</span><button type="button" class="det" title="词义、要点与分析记录">详情 ▾</button></div>`;
    const chips = document.createElement('div');
    chips.className = 'chips';
    for (const chip of clause.chips) {
      const el = document.createElement('div');
      el.className = `chip${chip.role ? ` r-${chip.role}` : ''}`;
      el.innerHTML = `<span class="rl">${chip.role ? ROLE_ZH[chip.role] : ''}</span><span class="ws"></span>`;
      const ws = $('.ws', el);
      for (const id of chip.wordIds) {
        const word = words[id];
        const w = document.createElement('span');
        w.className = `w${targets.has(id) ? ' target' : ''}${word.after === '' ? ' join' : ''}`;
        w.dataset.id = id;
        w.innerHTML = `<span class="g o">${esc(word.text)}${esc(punct(word.after))}${word.variant ? '<span class="vb">异</span>' : ''}</span>`
          + `<span class="m">${esc(word.morph)}</span><span class="z">${esc(word.rendering ?? word.glossZh ?? '—')}</span><span class="e">${esc(word.glossEn)}</span>`;
        if (chip.pauses) {
          w.dataset.pause = String(chip.pauses[chip.wordIds.indexOf(id)]);
        }
        ws.append(w);
      }
      chips.append(el);
    }
    box.append(chips);
    const points = clause.points.map((point) => `<li>${orig(point)}</li>`).join('');
    const records = clause.records.map((record) => `<li><span class="tag">${esc(record.tag)}</span>：${orig(record.text)}</li>`).join('');
    box.insertAdjacentHTML('beforeend', `<div class="more">${points ? `<ul>${points}</ul>` : ''}`
      + (records ? `<details${points ? '' : ' open'}><summary>分析与翻译记录（${clause.records.length}）</summary><ul>${records}</ul></details>` : '')
      + (!points && !records ? '<span class="hint">没有备注。</span>' : '') + '</div>');
    const ups: string[] = [];
    if (clause.parentId && byId.has(clause.parentId)) {
      const target = clause.targetWordId ? ` <span class="o">${esc(words[clause.targetWordId]?.text)}</span>` : '';
      ups.push(`↳ 句法：属 ${esc(clauseNo(clause.parentId))}${clause.link ? ` · ${esc(clause.link)}` : ''}${target}`);
    }
    if (clause.logic) {
      ups.push(`<span class="lg">⇢ 逻辑：${esc(clause.logic.label)} → ${esc(clause.logic.targetText)}${clause.logic.note ? ` · ${esc(clause.logic.note)}` : ''}</span>`);
    }
    if (ups.length > 0) {
      box.insertAdjacentHTML('beforeend', `<div class="up">${ups.join('<br>')}</div>`);
    }
    $('.det', box).addEventListener('click', () => setOpen(box, !box.classList.contains('open')));
    box.querySelector('.fold')?.addEventListener('click', (event) => {
      event.stopPropagation();
      setFolded(clause.id, !box.classList.contains('folded'));
    });
    forest.append(box);
  }

  const forest = $('#forest');
  forest.classList.toggle('ot-forms', D.clauses.some((clause) => formOf(clause.type)));
  let lastVerse = '';
  for (const clause of [...D.clauses].sort((a, b) => firstWord(a).localeCompare(firstWord(b)))) {
    const verse = clause.id.replace(/[a-z]+$/, '');
    renderBox(clause, forest, verse !== lastVerse);
    lastVerse = verse;
  }

  // ---------- 成分块切行：按实际排版宽度，超宽时在停顿最强处切（同样强取两边最匀的位置），递归到每行够窄 ----------
  const LINE_MAX = 460;
  function layoutChips(scope: ParentNode = document): void {
    const forestWidth = $('#forest').clientWidth;
    for (const ws of $$('.chip > .ws', scope)) {
      $$('.lb', ws).forEach((lb) => lb.remove());
      ws.style.width = '';
      const items = $$('.w', ws);
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
        cuts.add(best);
        split(from, best + 1);
        split(best + 1, to);
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
      for (const index of cuts) {
        items[index].insertAdjacentHTML('afterend', '<span class="lb"></span>');
      }
      // 折行后块宽取最宽的一行，方框随之收窄（否则仍按未折行的整行宽度撑开）
      if (cuts.size > 0) {
        const ends = [...cuts].sort((a, b) => a - b).map((index) => index + 1);
        const lines = [0, ...ends].map((from, i) => width(from, ends[i] ?? items.length));
        ws.style.width = `${Math.ceil(Math.max(...lines)) + 1}px`;
      }
    }
  }

  // ---------- 分支展开/收起：收起的方框隐藏全部下属子句，按钮显示收起了几句 ----------
  function applyFolds(): void {
    const hidden = new Set($$('.box.folded').flatMap((box) => descendants(box.dataset.box!)));
    for (const box of $$('.box')) {
      box.hidden = hidden.has(box.dataset.box!);
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
    svg.innerHTML = '<defs><marker id="ah" viewBox="0 0 10 10" refX="10" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto"><path class="tip" d="M0,1 L10,5 L0,9 z"/></marker>'
      + '<marker id="lh" viewBox="0 0 10 10" refX="10" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto"><path class="logic-tip" d="M0,1 L10,5 L0,9 z"/></marker></defs>';
    const base = canvas.getBoundingClientRect();
    svg.setAttribute('width', String(canvas.scrollWidth));
    svg.setAttribute('height', String(canvas.scrollHeight));
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
    const pathD = (points: Array<[number, number]>) => points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');

    // ---- 句法：指向同一个词的线共用一条横道（汇成主干）；同一母句里指向不同词的，横道上下错开 ----
    const lanes = new Map<string, Map<string, number>>();
    // 每条线有几种走法（从子句顶边/底边直接出、起始侧沟槽、尾侧沟槽），排除穿过其他方框的，
    // 按「交叉数 → 折点数 → 长度」取最好的；跨度短的先定
    type Wire = { candidates: Array<Array<[number, number]>>; span: number; farFrom: number };
    // 尾侧是逻辑虚线走的地方：显示逻辑关系时，句法连线走尾侧要多付代价（逻辑线进出方框的横线都会穿过它）
    const farPenalty = canvas.classList.contains('hide-logic') ? 0 : 1500;
    const wires: Wire[] = [];
    const visible = allBoxes.filter((box) => !box.hidden).map((box) => {
      const r = box.getBoundingClientRect();
      return { box, left: r.left - base.left, right: r.right - base.left, top: r.top - base.top, bottom: r.bottom - base.top };
    });
    const endOf = (rect: DOMRect) => (rtl ? rect.left : rect.right) - base.left;
    /** 竖线 x 从 y1 到 y2 是否穿过 skip 以外的方框。 */
    const blockedV = (x: number, y1: number, y2: number, skip: HTMLElement[]) => visible.some((item) => !skip.includes(item.box)
      && x > item.left - 3 && x < item.right + 3 && Math.max(y1, y2) > item.top && Math.min(y1, y2) < item.bottom);
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
      const below = c.top >= p.bottom;
      const laneKey = `${clause.parentId}|${below ? 'b' : 'a'}`;
      const byTarget = lanes.get(laneKey) ?? new Map<string, number>();
      const targetKey = clause.targetWordId ?? '';
      if (!byTarget.has(targetKey)) {
        byTarget.set(targetKey, byTarget.size);
      }
      lanes.set(laneKey, byTarget);
      const lane = byTarget.get(targetKey)!;
      const skip = [childBox, parentBox];
      const yChild = c.top + Math.min(22, c.height / 2) - base.top;
      const target = clause.targetWordId ? $(`[data-id="${clause.targetWordId}"] .g`, parentBox) : null;
      const t = target?.getBoundingClientRect();
      const edge = (below ? p.bottom : p.top) - base.top;
      const tip = below ? edge + 1 : edge - 1;
      // 横道离母句至少 18px：箭头（9px）前留一段竖线，折点不直接接在箭头上
      const yLane = below ? edge + 18 + lane * 6 : edge - 18 - lane * 6;
      const xT = t ? t.left + t.width / 2 - base.left : (c.left + c.right) / 2 - base.left;
      const candidates: Array<Array<[number, number]>> = [];
      // 1) 从子句朝母句的那条边直接出：能对准被修饰词就一根竖线，否则在母句旁的空隙横折一次
      const childEdge = (below ? c.top : c.bottom) - base.top;
      const [cl, cr] = [c.left - base.left + 14, c.right - base.left - 14];
      const exits = [...new Set([Math.min(Math.max(xT, cl), cr), (cl + cr) / 2, rtl ? cr : cl].map(Math.round))];
      for (const x of exits) {
        if (Math.abs(x - xT) < 1) {
          if (!blockedV(xT, childEdge, tip, skip)) {
            candidates.push([[xT, childEdge], [xT, tip]]);
          }
        } else if (!blockedV(x, childEdge, yLane, skip)) {
          candidates.push([[x, childEdge], [x, yLane], [xT, yLane], [xT, tip]]);
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
      wires.push({ candidates, span: Math.abs(childEdge - edge), farFrom });
    }
    const verticals: Array<{ x: number; top: number; bottom: number }> = [];
    const length = (points: Array<[number, number]>) => points.slice(1).reduce((sum, [x, y], i) => sum + Math.abs(x - points[i][0]) + Math.abs(y - points[i][1]), 0);
    for (const wire of wires.sort((a, b) => a.span - b.span)) {
      let best = wire.candidates[0];
      let bestScore = Infinity;
      for (const [index, points] of wire.candidates.entries()) {
        const score = cost(polyline(points)) * 1000 + (points.length - 2) * 40 + length(points) * 0.05 + (index >= wire.farFrom ? farPenalty : 0);
        if (score < bestScore) {
          best = points;
          bestScore = score;
        }
      }
      segs.push(...polyline(best));
      // 句法竖线也记下，逻辑虚线不贴着它们走
      for (const seg of polyline(best).filter((item) => item.x1 === item.x2)) {
        verticals.push({ x: seg.x1, top: Math.min(seg.y1, seg.y2), bottom: Math.max(seg.y1, seg.y2) });
      }
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('d', pathD(best));
      path.setAttribute('marker-end', 'url(#ah)');
      svg.append(path);
    }

    // ---- 叙事主线：顶层各句用短横线接到最外侧的脊线（不画圆点，前置/离线看框头标签） ----
    const roots: Array<[number, HTMLElement]> = [];
    for (const clause of D.clauses) {
      const box = $(`[data-box="${clause.id}"]`);
      if (box && box.dataset.form && !box.hidden && !(clause.parentId && byId.has(clause.parentId))) {
        const r = box.getBoundingClientRect();
        roots.push([r.top + Math.min(22, r.height / 2) - base.top, box]);
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
    const links: Array<{ clause: (typeof D.clauses)[number]; c: DOMRect; t: DOMRect; top: number; bottom: number; edge: number }> = [];
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
      links.push({ clause, c, t, top, bottom, edge });
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
    for (const list of anchors.values()) {
      list.sort((a, b) => (a.up === b.up ? (a.up ? a.span - b.span : b.span - a.span) : a.up ? -1 : 1));
      const rect = list[0].rect;
      const step = Math.min(10, (rect.height - 16) / Math.max(1, list.length));
      list.forEach((item, i) => anchorY.set(item.key, rect.top - base.top + 12 + i * step));
    }
    const order = links.map((link, index) => ({ ...link, index }));
    for (const { clause, c, t, top, bottom, edge, index } of order.sort((a, b) => (a.bottom - a.top) - (b.bottom - b.top))) {
      const y1 = anchorY.get(`${index}c`)!;
      const y2 = anchorY.get(`${index}t`)!;
      const points = (x: number): Array<[number, number]> => [[end(c), y1], [x, y1], [x, y2], [end(t), y2]];
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
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('class', 'logic');
      path.setAttribute('d', pathD(points(best)));
      path.setAttribute('marker-end', 'url(#lh)');
      svg.append(path);
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
        <button type="button" data-toggle="logic" aria-pressed="true">逻辑关系</button>${ot ? '\n        <button type="button" data-toggle="forms" aria-pressed="true">句型与主线</button>' : ''}
      </span>
    </h2>
    <div class="scroller">
      <div id="canvas" class="canvas hide-m hide-e"${ot ? ' dir="rtl"' : ''}>
        <div id="forest" class="forest"></div>
        <svg id="wires"></svg>
        <div id="pop"></div>
      </div>
    </div>
    <div class="legend">
      <span style="--c: var(--r-v)">谓语</span><span style="--c: var(--r-s)">主语</span><span style="--c: var(--r-conj)">连接词</span><span style="--c: var(--r-none)">其他成分</span>
      <span>· 实线 = 句法从属，指到被修饰的词（下划线） · <b style="color:var(--logic)">虚线</b> = 逻辑关系（与句法不同时标出） · <b style="color:var(--accent)">异</b> = 有异文</span>
    </div>${ot ? `
    <div class="forms-legend">
      <span>边框颜色 = 动词形式：</span>
      <span style="--tc:#F656B8"><i></i>wayyiqtol</span><span style="--tc:#2A7FFF"><i></i>weqatal</span><span style="--tc:#FF0000"><i></i>qatal</span>
      <span style="--tc:#00CC00"><i></i>yiqtol</span><span style="--tc:#A449FF"><i></i>祈使</span><span style="--tc:#9E5329"><i></i>分词</span>
      <span style="--tc:#6B6B6B"><i></i>不定式</span><span style="--tc:#B8B0A2"><i></i>名词句</span>
      <span>· 最外侧竖线 = 叙事主线，同一句法主干上的各句 = 会话序列 · 「前置」= X-动词语序（凸显/对比），「离线」= 顶层不用 wayyiqtol</span>
    </div>` : ''}
  </section>
</main>
<script id="data" type="application/json">${safeJson(data)}</script>
<script>(${diagramClient.toString()})(JSON.parse(document.getElementById('data').textContent));</script>
</body>
</html>
`;
}
