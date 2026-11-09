/**
 * 复制选中的词：只取原文（不带词法、词义那几行），同一子句里以空格相连（语素、maqqef 相连处不加），不同子句另起一行。
 * 只选了框头的译文时复制译文：补词加 [ ]，「（合译）」等说明去掉，各框之间换行。
 */
import { $$ } from './dom.js';

function copyGists(selection: Selection, clipboard: DataTransfer): boolean {
  const gists = $$('#canvas .gist').filter((gist) => selection.containsNode(gist, true));
  if (gists.length === 0) {
    return false;
  }
  const range = selection.getRangeAt(0);
  const text = gists.map((gist) => {
    const part = document.createRange();
    part.selectNodeContents(gist);
    if (gist.contains(range.startContainer)) {
      part.setStart(range.startContainer, range.startOffset);
    }
    if (gist.contains(range.endContainer)) {
      part.setEnd(range.endContainer, range.endOffset);
    }
    const holder = document.createElement('div');
    holder.append(part.cloneContents());
    holder.querySelectorAll('.aside').forEach((aside) => aside.replaceWith(''));
    holder.querySelectorAll('.added').forEach((added) => { added.textContent = `[${added.textContent}]`; });
    return holder.textContent!.trim();
  }).filter(Boolean).join('\n');
  clipboard.setData('text/plain', text);
  return true;
}

export function setupCopy(): void {
  document.addEventListener('copy', (event) => {
    const selection = getSelection();
    const words = selection ? $$('#canvas .w:not(.slot)').filter((w) => selection.containsNode(w, true)) : [];
    if (!selection || selection.rangeCount === 0 || !event.clipboardData) {
      return;
    }
    if (words.length === 0) {
      copyGists(selection, event.clipboardData) && event.preventDefault();
      return;
    }
    const text = words.map((w, i) => {
      const g = w.querySelector('.g')!.cloneNode(true) as HTMLElement;
      g.querySelectorAll('.vb, .vc').forEach((mark) => mark.remove());
      const previous = words[i - 1];
      const gap = !previous ? '' : previous.closest('.box') !== w.closest('.box') ? '\n' : previous.classList.contains('join') ? '' : ' ';
      return gap + g.textContent;
    }).join('');
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
  });
}
