/** 页面脚本共用的 DOM 小工具。 */

export const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) => root.querySelector(selector) as T;
export const $$ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) => [...root.querySelectorAll(selector)] as T[];
export const esc = (value: unknown) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
/** 文字里的希腊文、希伯来文换原文字体。 */
export const orig = (value: string) => esc(value).replace(/[Ͱ-Ͽἀ-῿֐-׿][Ͱ-Ͽἀ-῿֐-׿̀-ͯʼ’᾽ ]*/g, (run) => `<span class="o">${run}</span>`);
/** 译文：补词段加点状下划线，悬停看补词说明。旧图的数据里译文还是纯字符串。 */
export const zh = (value: string | Array<{ text: string; added?: true; note?: string }>) => typeof value === 'string' ? esc(value)
  : value.map((part) => part.added ? `<span class="added" title="${esc(part.note ? `补词：${part.note}` : '补词：原文没有，译者补出')}">${esc(part.text)}</span>` : esc(part.text)).join('');
export const punct = (after: string) => after.trim();
export const SVG = 'http://www.w3.org/2000/svg';
