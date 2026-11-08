/** 悬停高亮同一个词（原文行与结构图里），悬停或点击弹出词卡。 */
import { $, $$, esc, orig } from './dom.js';
import { D, words } from './model.js';

const mark = (id: string, cls: string) => $$(`[data-id="${id}"]`).forEach((el) => el.classList.add(cls));
const clear = (cls: string) => $$(`.${cls}`).forEach((el) => el.classList.remove(cls));
let popId: string | null = null;
let popAnchor: HTMLElement | null = null;
let popTimer = 0;

export function hidePop(): void {
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

function card(id: string): string {
  const word = words[id];
  const lexicon = D.lexicon[word.strong] ?? [];
  return `<button class="x" type="button" aria-label="关闭">×</button>
      <div><span class="lemma o">${esc(word.lemma)}</span> <span class="hint">${esc(word.translit)} · ${esc(word.strong)} · ${Math.floor(word.bcv / 1000) % 1000}:${word.bcv % 1000}</span></div>
      ${word.variant ? `<div class="warn">异文：${orig(word.variant)}</div>` : ''}
      <dl>
        <dt>本处</dt><dd><span class="o">${esc(word.text)}</span></dd>
        ${word.rendering ? `<dt>译作</dt><dd>${esc(word.rendering)}</dd>` : ''}
        <dt>词法</dt><dd>${esc(word.morph)} <span class="hint">${esc((word.morphExp ?? '').replace(/\b[A-Za-z]+=/g, ''))}</span></dd>
        <dt>词义</dt><dd>${esc(word.glossZh ?? '—')} · ${esc(word.glossEn)}${word.sense ? ` <span class="hint">义项 ${esc(word.sense)}</span>` : ''}</dd>
      </dl>
      ${lexicon.map((entry) => `<details><summary>${entry.source === 'UBS-zh' ? 'UBS 中文词典' : `STEPBible 简明词典（${esc(entry.source)}）`}</summary><div class="def">${orig(entry.definition)}</div></details>`).join('')}`;
}

function showPop(id: string, anchor: HTMLElement): void {
  clearTimeout(popTimer);
  if (popId === id) {
    return;
  }
  hidePop();
  popId = id;
  mark(id, 'sel');
  const pop = $('#pop');
  pop.innerHTML = card(id);
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

export function setupPop(): void {
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
  const pop = $('#pop');
  pop.addEventListener('mouseenter', () => clearTimeout(popTimer));
  pop.addEventListener('mouseleave', hidePopSoon);
  pop.addEventListener('click', (event) => event.stopPropagation());
  // 展开、收起词典后词卡高度变了，重新挑位置
  pop.addEventListener('toggle', placePop, true);
  // 词卡不随页面滚动，滚动时收起（词卡自己的滚动除外）
  document.addEventListener('scroll', (event) => {
    if (!pop.contains(event.target as Node)) {
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
}
