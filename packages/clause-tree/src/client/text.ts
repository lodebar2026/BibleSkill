/** 页首的原文与译文：按段落分成 <p>，段前有小标题时译文里加标题；段首可在节中。 */
import { $, esc, zh } from './dom.js';
import { D, words } from './model.js';

/** 往容器里依次加段落：没有段首数据（旧图、没有分段）时整个是一段。 */
function paragraphs(container: HTMLElement) {
  let current: HTMLElement | null = null;
  return {
    /** 开新段；title 非空时先加标题行。 */
    start(title: string | null) {
      if (title) {
        container.insertAdjacentHTML('beforeend', `<div class="ptitle">${esc(title)}</div>`);
      }
      current = document.createElement('p');
      current.className = 'para';
      container.append(current);
    },
    get el(): HTMLElement {
      if (!current) {
        this.start(null);
      }
      return current!;
    },
  };
}

export function renderText(): void {
  const text = $('#text');
  const trans = $('#trans');
  const source = paragraphs(text);
  const target = paragraphs(trans);
  for (const verse of D.verses) {
    const breaks = verse.paragraphs ?? [];
    const breakAt = new Map(breaks.map((item) => [item.wordId, item]));
    verse.wordIds.forEach((id, index) => {
      if (breakAt.has(id)) {
        source.start(null);
      }
      if (index === 0) {
        source.el.insertAdjacentHTML('beforeend', `<span class="vn">${verse.verse}</span>`);
      }
      const word = words[id];
      const span = document.createElement('span');
      span.className = `tok${word.variant ? ' var' : ''}`;
      span.dataset.id = id;
      span.textContent = word.text;
      source.el.append(span, document.createTextNode(word.after));
    });
    if (verse.translation.length === 0) {
      continue;
    }
    // 译文按段首切开：节首的段首在节号之前，节中的段首另起一段、不再标节号
    const cuts = [...new Set([0, ...breaks.map((item) => item.at), verse.translation.length])].sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i += 1) {
      const paragraph = breaks.find((item) => item.at === cuts[i]);
      if (paragraph) {
        target.start(paragraph.title);
      }
      const number = i === 0 ? `<span class="vn">${verse.verse}</span>` : '';
      target.el.insertAdjacentHTML('beforeend', `${number}${zh(verse.translation.slice(cuts[i], cuts[i + 1]))}`);
    }
  }
  if (!trans.textContent) {
    trans.remove();
  } else if (D.literalness) {
    trans.insertAdjacentHTML('beforeend', `<p class="para hint">（${esc(D.literalness)}）</p>`);
  }
}
