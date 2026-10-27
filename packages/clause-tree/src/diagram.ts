/**
 * 结构图：单文件交互 HTML。
 *
 * 上下表示层级（主句在最上，从句在它下面一行，从句的从句再下一行），同一行内按原文先后排；
 * 连线从从句首词出发，在两行之间的空隙里折行，指到母句里被修饰的词。
 * 点框头展开词义与要点，点词弹出词卡。页面脚本是 diagramClient，整个函数以源码嵌入页面。
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
  --accent: #8a4b16; --wire: #8a4b16;
  --r-v: #b42318; --r-s: #1d4ed8; --r-conj: #6b665d; --r-none: #b8b0a2;
  --hl: #fde68a; --amb: #fff1c7; --rev: #fde2e2;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #171614; --panel: #201e1b; --ink: #ece7dd; --muted: #a39d92; --line: #3a3631; --soft: #2a2724;
    --accent: #e0a46a; --wire: #e0a46a;
    --r-v: #f87171; --r-s: #7aa2ff; --r-conj: #a39d92; --r-none: #5a554d;
    --hl: #6b5512; --amb: #3d3418; --rev: #44232a;
  }
}
:root[data-theme="dark"] {
  --bg: #171614; --panel: #201e1b; --ink: #ece7dd; --muted: #a39d92; --line: #3a3631; --soft: #2a2724;
  --accent: #e0a46a; --wire: #e0a46a;
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
.forest { display: flex; flex-wrap: wrap; gap: 40px 48px; align-items: flex-start; }
.tree { display: grid; grid-auto-columns: minmax(min-content, auto); row-gap: 72px; column-gap: 18px; padding-top: 4px; }
.box { position: relative; z-index: 2; background: var(--panel); border: 1.5px solid var(--line); border-radius: 10px; padding: 8px 10px 10px; justify-self: center; align-self: start; }
.box.root { border: 2.5px solid var(--accent); box-shadow: 0 2px 10px color-mix(in srgb, var(--accent) 18%, transparent); }
.box.ambiguous { background: color-mix(in srgb, var(--amb) 45%, var(--panel)); }
.bh { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; margin-bottom: 6px; cursor: pointer; user-select: none; direction: ltr; }
.bh .tw { font-size: 12px; color: var(--muted); width: 10px; }
.bh .lab { font-size: 12px; font-weight: 600; color: var(--panel); background: var(--muted); border-radius: 4px; padding: 0 6px; }
.box.root .bh .lab { background: var(--accent); }
.bh .st { font-size: 11px; border-radius: 4px; padding: 0 5px; }
.bh .st.ambiguous { background: var(--amb); color: var(--ink); border: 1px solid var(--accent); }
.bh .st.needs-review { background: var(--rev); color: var(--ink); border: 1px solid var(--r-v); }
.bh .gist { font-size: 14px; max-width: 34em; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: stretch; }
.chip { display: flex; flex-direction: column; border: 1px solid var(--line); border-top: 4px solid var(--c); border-radius: 6px; padding: 0 2px 2px; background: color-mix(in srgb, var(--c) 6%, var(--panel)); --c: var(--r-none); }
.chip > .rl { font-size: 11px; color: var(--c); font-weight: 600; padding: 1px 4px 0; min-height: 1.4em; direction: ltr; }
.chip > .ws { display: flex; flex-wrap: wrap; }
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
.up { display: none; font-size: 12px; color: var(--accent); margin-top: 6px; direction: ltr; }
#wires { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 3; overflow: visible; }
#wires path { fill: none; stroke: var(--wire); stroke-width: 2; }
#wires path.tip { fill: var(--wire); stroke: none; }
.wl { position: absolute; z-index: 4; transform: translate(-50%, -50%); font-size: 12px; font-weight: 600; color: var(--wire); background: var(--panel); border: 1.5px solid var(--wire); border-radius: 999px; padding: 0 8px; white-space: nowrap; pointer-events: none; direction: ltr; }
@media (max-width: 760px) {
  .tree { display: flex; flex-direction: column; gap: 12px; }
  .box { justify-self: stretch; }
  #wires, .wl { display: none; }
  .up { display: block; }
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

  // ---------- 结构图：每个句子一个网格，叶子子句占一列，母句横跨其子句所占的列 ----------
  const byId = new Map(D.clauses.map((clause) => [clause.id, clause]));
  const children = new Map<string, typeof D.clauses>();
  const roots: typeof D.clauses = [];
  const firstWord = (clause: (typeof D.clauses)[number]) => clause.chips[0]?.wordIds[0] ?? clause.fromWordId;
  for (const clause of D.clauses) {
    if (clause.parentId && byId.has(clause.parentId)) {
      children.set(clause.parentId, [...(children.get(clause.parentId) ?? []), clause]);
    } else {
      roots.push(clause);
    }
  }
  const sortByWord = (list: typeof D.clauses) => list.sort((a, b) => firstWord(a).localeCompare(firstWord(b)));
  const leaves = (clause: (typeof D.clauses)[number]): number => {
    const kids = children.get(clause.id) ?? [];
    return kids.length === 0 ? 1 : kids.reduce((sum, kid) => sum + leaves(kid), 0);
  };
  const targets = new Set(D.clauses.map((clause) => clause.targetWordId).filter(Boolean));

  function renderBox(clause: (typeof D.clauses)[number], depth: number, column: number, tree: HTMLElement): void {
    const box = document.createElement('div');
    box.className = `box${depth === 0 ? ' root' : ''}${clause.status === 'ambiguous' ? ' ambiguous' : ''}`;
    box.dataset.box = clause.id;
    box.style.gridRow = String(depth + 1);
    box.style.gridColumn = `${column} / span ${leaves(clause)}`;
    const status = clause.status === 'ambiguous' ? '<span class="st ambiguous">有歧义</span>' : clause.status === 'needs-review' ? '<span class="st needs-review">待复核</span>' : '';
    box.innerHTML = `<div class="bh" title="点击展开/收起"><span class="tw">▸</span><span class="lab">${esc(clause.label)}</span>${status}<span class="gist">${esc(clause.gist)}</span></div>`;
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
    if (clause.link && clause.targetWordId) {
      box.insertAdjacentHTML('beforeend', `<div class="up">↑ ${esc(clause.link)} → <span class="o">${esc(words[clause.targetWordId]?.text)}</span></div>`);
    }
    $('.bh', box).addEventListener('click', () => setOpen(box, !box.classList.contains('open')));
    tree.append(box);
    let next = column;
    for (const kid of sortByWord(children.get(clause.id) ?? [])) {
      renderBox(kid, depth + 1, next, tree);
      next += leaves(kid);
    }
  }

  // 句子：到句末标点为止；同一句里的并列主句放在同一个网格里并排
  const sentenceOf = new Map<string, number>();
  let sentence = 0;
  for (const verse of D.verses) {
    for (const id of verse.wordIds) {
      sentenceOf.set(id, sentence);
      if (/[.;;·!?׃]/.test(words[id].after)) {
        sentence += 1;
      }
    }
  }
  const forest = $('#forest');
  let tree: HTMLElement | null = null;
  let treeSentence = -1;
  let column = 1;
  for (const root of sortByWord(roots)) {
    const rootSentence = sentenceOf.get(firstWord(root)) ?? -1;
    if (!tree || rootSentence !== treeSentence) {
      tree = document.createElement('div');
      tree.className = 'tree';
      forest.append(tree);
      treeSentence = rootSentence;
      column = 1;
    }
    renderBox(root, 0, column, tree);
    column += leaves(root);
  }

  function setOpen(box: HTMLElement, open: boolean): void {
    box.classList.toggle('open', open);
    $('.tw', box).textContent = open ? '▾' : '▸';
    hidePop();
  }
  $('#openAll').addEventListener('click', () => $$('.box').forEach((box) => setOpen(box, true)));
  $('#closeAll').addEventListener('click', () => $$('.box').forEach((box) => setOpen(box, false)));
  $$<HTMLButtonElement>('[data-toggle]').forEach((button) => button.addEventListener('click', () => {
    const on = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(on));
    $('#canvas').classList.toggle(`hide-${button.dataset.toggle}`, !on);
  }));

  // ---------- 连线：折线走在两行之间的空隙里，不穿过任何框 ----------
  const SVG = 'http://www.w3.org/2000/svg';
  function drawWires(): void {
    const canvas = $('#canvas');
    const svg = $<SVGSVGElement>('#wires');
    $$('.wl', canvas).forEach((label) => label.remove());
    svg.innerHTML = '<defs><marker id="ah" viewBox="0 0 10 10" refX="10" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto"><path class="tip" d="M0,1 L10,5 L0,9 z"/></marker></defs>';
    const base = canvas.getBoundingClientRect();
    svg.setAttribute('width', String(canvas.scrollWidth));
    svg.setAttribute('height', String(canvas.scrollHeight));
    if (matchMedia('(max-width: 760px)').matches) {
      return;
    }
    // 同一个词有几条线指过来时，终点左右错开
    const fan = new Map<string, string[]>();
    for (const clause of D.clauses) {
      if (clause.parentId && clause.targetWordId && byId.has(clause.parentId)) {
        const key = `${clause.parentId}|${clause.targetWordId}`;
        fan.set(key, [...(fan.get(key) ?? []), clause.id]);
      }
    }
    for (const clause of D.clauses) {
      if (!clause.parentId || !clause.targetWordId || !byId.has(clause.parentId)) {
        continue;
      }
      const childBox = $(`[data-box="${clause.id}"]`);
      const parentBox = $(`[data-box="${clause.parentId}"]`);
      const from = childBox && $(`[data-id="${clause.fromWordId}"]`, childBox);
      const to = parentBox && $(`[data-id="${clause.targetWordId}"]`, parentBox);
      if (!from || !to) {
        continue;
      }
      const peers = fan.get(`${clause.parentId}|${clause.targetWordId}`) ?? [clause.id];
      const offset = (peers.indexOf(clause.id) - (peers.length - 1) / 2) * 28;
      const a = from.getBoundingClientRect();
      const b = $('.g', to).getBoundingClientRect();
      const x1 = a.left + a.width / 2 - base.left;
      const y1 = childBox.getBoundingClientRect().top - base.top;
      const x2 = b.left + b.width / 2 - base.left + offset;
      const y2 = parentBox.getBoundingClientRect().bottom - base.top + 1;
      const ym = (y1 + y2) / 2;
      const r = Math.min(10, Math.abs(x2 - x1) / 2);
      const dir = Math.sign(x2 - x1);
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('d', Math.abs(x2 - x1) < 1
        ? `M${x1},${y1} L${x2},${y2}`
        : `M${x1},${y1} L${x1},${ym + r} Q${x1},${ym} ${x1 + dir * r},${ym} L${x2 - dir * r},${ym} Q${x2},${ym} ${x2},${ym - r} L${x2},${y2}`);
      path.setAttribute('marker-end', 'url(#ah)');
      svg.append(path);
      if (clause.link) {
        const label = document.createElement('div');
        label.className = 'wl';
        label.textContent = clause.link;
        label.style.left = `${(x1 + x2) / 2}px`;
        label.style.top = `${ym}px`;
        canvas.append(label);
      }
    }
  }
  let frame = 0;
  const redraw = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(drawWires);
  };
  new ResizeObserver(redraw).observe($('#forest'));
  addEventListener('resize', redraw);
  void document.fonts?.ready.then(redraw);

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
  <div class="sub">${escapeHtml(subtitle || '结构以子句分析为准')} · 越往上层级越高，同一行左右为原文先后${ot ? '（自右向左）' : ''} · 点框头展开词义与要点，点词看词典</div>
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
        <button type="button" id="openAll">全部展开</button>
        <button type="button" id="closeAll">全部收起</button>
        <button type="button" data-toggle="z" aria-pressed="true">中文</button>
        <button type="button" data-toggle="m" aria-pressed="false">词法</button>
        <button type="button" data-toggle="e" aria-pressed="false">英文</button>
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
      <span>· 下划线 = 被从句修饰的词 · <b style="color:var(--accent)">异</b> = 有异文</span>
    </div>
  </section>
</main>
<script id="data" type="application/json">${safeJson(data)}</script>
<script>(${diagramClient.toString()})(JSON.parse(document.getElementById('data').textContent));</script>
</body>
</html>
`;
}
