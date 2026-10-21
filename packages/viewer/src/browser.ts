/**
 * 浏览器端入口。数据带 editable（pnpm view --serve）时交给 editor.ts，否则只读渲染。
 */
import { startEditor } from './editor.js';
import { renderChapter, type Chapter } from './render.js';

declare global {
  interface Window { __BIBLESKILL__: { chapters: Chapter[]; editable?: boolean; token?: string } }
}

async function main(): Promise<void> {
  const data = window.__BIBLESKILL__;
  await document.fonts.ready;
  const root = document.getElementById('app')!;
  const panel = document.getElementById('details')!;
  if (data.editable) {
    startEditor(data.chapters, data.token ?? '', root, panel);
    return;
  }
  root.replaceChildren(...data.chapters.map((chapter) => renderChapter(chapter, panel)));
}

void main();
