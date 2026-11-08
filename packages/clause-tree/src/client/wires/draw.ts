/**
 * 连线：竖线走在子句缩进留出的沟槽里，到母句旁的空隙再横折，指到被修饰的词。
 * 先画句法连线（标签、同位语双线、叙事主线随后），最后画逻辑虚线；排版变了（收起分支、字体载入、窗口变宽）就整个重画。
 */
import { highlightBranch, hoverBranch } from '../folds.js';
import { drawAppositions } from './appos.js';
import { placeArgumentLabels } from './labels.js';
import { Layout } from './layout.js';
import { drawLogic, estimateLogicSegs } from './logic.js';
import { pickWires } from './pick.js';
import { buildWires } from './routes.js';
import { drawSpine } from './spine.js';

function drawWires(): void {
  const L = new Layout();
  if (matchMedia('(max-width: 760px)').matches) {
    return;
  }
  const logicSegs = estimateLogicSegs(L);
  const wires = buildWires(L);
  placeArgumentLabels(L, pickWires(L, wires, logicSegs));
  drawAppositions(L);
  drawSpine(L);
  if (L.showLogic) {
    drawLogic(L);
  }
}

let frame = 0;
export const redraw = () => {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    drawWires();
    // 重画会清掉感应区，正在悬停的那一支重新加亮
    if (hoverBranch) {
      highlightBranch(hoverBranch);
    }
  });
};
