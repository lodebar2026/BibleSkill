/**
 * 结构图：交互 HTML。
 *
 * 每个子句一行，按原文先后自上而下排（叙事链、话语内容的序列一句接一句往下读），缩进表示从属；
 * 框头标子句编号。框里每个句子成分一块（新约照 Macula 分出宾语、间接宾语、状语、表语）。
 * 连线走在缩进留出的沟槽里，从子句连到母句里被修饰的词，不穿过别的框；箭头伸进母句框，指到那个词。
 * 新约词按格着色、动词按时态加框、按语气加底色。旧约非 qal 的动词按词干着色，谓语前的实词成分（前置）加框标出。
 * 点「详情」展开词义与分析、翻译记录，点「收起分支」收起这一句下面的所有分支，鼠标移到连线上可只收那一支（这个子句及其下属），鼠标移到词上弹出词卡。
 *
 * 各图共用 diagram.css 与 diagram.js（DIAGRAM_ASSETS），每张图的 HTML 只内嵌自己的数据。
 * 样式、页面模板在 assets/，页面脚本在 client/（构建时由 esbuild 打包成 dist/assets/diagram.js）。
 */
import { readFileSync } from 'node:fs';
import type { DiagramData } from '@bs/core';

const asset = (name: string) => readFileSync(new URL(`./assets/${name}`, import.meta.url), 'utf8');

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
}

/** 内嵌 JSON 时防止 `</script>` 提前结束脚本块。 */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** 各结构图共用的样式与脚本，写在图旁边；重写这两个文件，已生成的图刷新就用上新版。 */
export const DIAGRAM_ASSETS: Record<string, string> = {
  'diagram.css': asset('diagram.css'),
  'diagram.js': asset('diagram.js'),
};

/** 一张图的 HTML：只有标题与数据，样式、骨架和脚本都在共用的 DIAGRAM_ASSETS 里。 */
export function renderDiagramPage(data: DiagramData, subtitle = ''): string {
  const values: Record<string, string> = {
    title: escapeHtml(data.title),
    subtitle: escapeHtml(subtitle || '结构以子句分析为准'),
    data: safeJson(data),
  };
  return asset('page.html').replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key]);
}
