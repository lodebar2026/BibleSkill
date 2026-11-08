/** 复制选中的词：只取原文（不带词法、词义那几行），同一子句里以空格相连（语素、maqqef 相连处不加），不同子句另起一行。 */
import { $$ } from './dom.js';

export function setupCopy(): void {
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
}
