/**
 * 终端文本视图：等宽近似测量 + 逐行输出（原文行带树形前缀，译文另起一行缩进对齐）。
 * 终端对希伯来文的双向排版各不相同，分支符对准被修饰词只在 HTML 视图里是精确的。
 */
import { buildChapterTree, continuationPrefix, flipTreePrefix, type Measure, type TreeClause, type TreeWord } from './tree.js';

/** 等宽近似：原文按基字符计（去掉元音点、重音等组合符号），空格宽 1。 */
export const measureMonospace: Measure = (text, font) =>
  font === 'prefix' ? text.length : text.normalize('NFD').replace(/\p{M}/gu, '').length;

export type TextViewClause = TreeClause & {
  /** 该子句的译文；被合并的后续子句（span=0）传 null。 */
  translation: string | null;
  status?: string;
  /** 争议处的其他译法。 */
  alternatives?: Array<{ text: string; kind: string; basis: string; reading?: string }>;
};

export function renderClausesText(
  clauses: TextViewClause[],
  words: TreeWord[],
  options: { leftToRight: boolean; paragraphStarts?: Set<string> },
): string {
  const tree = buildChapterTree(clauses, words, measureMonospace, options.paragraphStarts);
  const out: string[] = [];
  tree.nodes.forEach((node, index) => {
    const clause = clauses[index];
    const raw = tree.prefixes[index];
    const orient = (value: string) => (options.leftToRight ? flipTreePrefix(value) : value);
    const prefix = orient(raw);
    const label = clause.id.replace(/^\d+?(\d{3})([a-z]+)$/, (_, verse: string, sub: string) => `${Number(verse)}${sub}`);
    const flag = clause.status && clause.status !== 'accepted' ? ` [${clause.status}]` : '';
    node.lines.forEach((line, lineIndex) => {
      const text = line.words.map(({ word }) => word.text + word.after).join('').trim();
      const head = lineIndex === 0 ? prefix : orient(continuationPrefix(raw));
      out.push(`${(lineIndex === 0 ? label : '').padEnd(6)}${head}${text}${lineIndex === 0 ? flag : ''}`);
    });
    if (clause.translation !== null) {
      const indent = `${''.padEnd(6)}${' '.repeat(prefix.length)}  `;
      out.push(`${indent}${clause.translation}`);
      for (const alt of clause.alternatives ?? []) {
        out.push(`${indent}≈ ${alt.reading ? `[${alt.reading}] ` : ''}${alt.text}（${alt.kind}：${alt.basis}）`);
      }
    }
  });
  if (tree.orphans.length > 0) {
    out.push('', `parentId 无法解析或成环，已按独立子句显示: ${tree.orphans.join(', ')}`);
  }
  return out.join('\n');
}
