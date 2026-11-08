/** 页首的原文与译文。 */
import { $, esc, zh } from './dom.js';
import { D, words } from './model.js';

export function renderText(): void {
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
    if (verse.translation.length > 0) {
      trans.insertAdjacentHTML('beforeend', `<span class="vn">${verse.verse}</span>${zh(verse.translation)}`);
    }
  }
  if (!trans.textContent) {
    trans.remove();
  } else if (D.literalness) {
    trans.insertAdjacentHTML('beforeend', ` <span class="hint">（${esc(D.literalness)}）</span>`);
  }
}
