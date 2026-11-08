/** 页面骨架：各图共用这份脚本，只有数据各自内嵌。骨架在 skeleton.html，旧约、新约各自的按钮与图例用 data-if 标出。 */
import { $, $$, esc } from './dom.js';
import { D } from './model.js';
import skeleton from './skeleton.html';

/** data-if 里的条件都成立才留下：ot、nt、narrative，前加 ! 取反。 */
function holds(condition: string): boolean {
  const flags: Record<string, boolean> = { ot: D.isOT, nt: !D.isOT, narrative: Boolean(D.narrative) };
  return condition.split(/\s+/).every((flag) => (flag.startsWith('!') ? !flags[flag.slice(1)] : flags[flag]));
}

export function renderSkeleton(subtitle: string): void {
  document.title = `${D.title} 结构图`;
  const values: Record<string, string> = { title: esc(D.title), subtitle: esc(subtitle || '结构以子句分析为准') };
  document.body.insertAdjacentHTML('afterbegin', skeleton.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key]));
  for (const el of $$('[data-if]')) {
    if (holds(el.dataset.if!)) {
      el.removeAttribute('data-if');
    } else {
      el.remove();
    }
  }
  if (D.isOT) {
    $('#canvas').dir = 'rtl';
  }
  document.body.classList.toggle('ot', D.isOT);
}
