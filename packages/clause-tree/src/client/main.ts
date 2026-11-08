/** 结构图的页面脚本（打包成 diagram.js）：读页面里内嵌的数据，生成页面骨架、原文与译文、结构图和连线。 */
import type { DiagramData } from '@bs/core';
import { layoutChips } from './chips.js';
import { setupCopy } from './copy.js';
import { $, $$ } from './dom.js';
import { setupFolds } from './folds.js';
import { renderForest } from './forest.js';
import { initModel } from './model.js';
import { setupPop } from './pop.js';
import { renderSkeleton } from './skeleton.js';
import { renderText } from './text.js';
import { setOpen, setupToolbar } from './toolbar.js';
import { redraw } from './wires/draw.js';

function main(data: DiagramData, subtitle: string): void {
  initModel(data);
  renderSkeleton(subtitle);
  renderText();
  renderForest();
  setupFolds();
  setupToolbar();
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
  setupPop();
  setupCopy();
  if (location.hash === '#open') {
    $$('.box').forEach((box) => setOpen(box, true));
  }
  if (location.hash === '#roots') {
    $('#foldAll').click();
  }
}

const data = document.getElementById('data')!;
main(JSON.parse(data.textContent!), data.dataset.subtitle ?? '');
