/** 工具栏：展开/收起详情、各显示开关、切换明暗。 */
import { layoutChips } from './chips.js';
import { $, $$ } from './dom.js';
import { hidePop } from './pop.js';
import { redraw } from './wires/draw.js';

export function setOpen(box: HTMLElement, open: boolean): void {
  box.classList.toggle('open', open);
  $('.det', box).textContent = open ? '详情 ▴' : '详情 ▾';
  layoutChips(box);
  hidePop();
}

export function setupToolbar(): void {
  $('#openAll').addEventListener('click', () => $$('.box').forEach((box) => setOpen(box, true)));
  $('#closeAll').addEventListener('click', () => $$('.box').forEach((box) => setOpen(box, false)));
  $$<HTMLButtonElement>('[data-toggle]').forEach((button) => button.addEventListener('click', () => {
    const on = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(on));
    $('#canvas').classList.toggle(`hide-${button.dataset.toggle}`, !on);
    layoutChips();
    redraw();
  }));
  $('#theme').addEventListener('click', () => {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const current = document.documentElement.dataset.theme ?? (dark ? 'dark' : 'light');
    document.documentElement.dataset.theme = current === 'dark' ? 'light' : 'dark';
  });
}
