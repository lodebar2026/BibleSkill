/**
 * 子句树：按 parentId 建树、按 modifies 定分支位置、生成 `┐ ┤ ┘ │` 前缀。
 *
 * - 文本宽度测量由调用方注入（浏览器用 canvas，终端用字符数近似），不依赖 DOM
 * - 段落标题按子句 key 查
 */

export type TreeWord = { id: string; text: string; after: string };

export type TreeClause = {
  id: string;
  type: string;
  parentId: string | null;
  modifies: string | null;
  firstWordId: string;
  lastWordId: string;
  subjectRange: string | null;
  br: string | null;
  alone: boolean;
};

/**
 * 测量文本宽度。`original` 为原文字体（SBL BibLit/SBL Hebrew 20pt），
 * `prefix` 为树形前缀字体（Times New Roman 25pt，只量空格）。
 */
export type Measure = (text: string, font: 'original' | 'prefix') => number;

export interface OrigWord {
  word: TreeWord;
  /** 是否落在 subjectRange 内（显示为阴影）。 */
  shadow: boolean;
}

export class OrigLine {
  words: OrigWord[] = [];

  /** 按 id 范围收词（allWords 有序、id 定宽，字典序即词序）。不按 id === endId 收尾：端点词缺失时会一路吞到章末。 */
  static getWords(allWords: TreeWord[], startId: string, endId: string, shadowStart = '', shadowEnd = ''): OrigWord[] {
    const result: OrigWord[] = [];
    for (const word of allWords) {
      if (word.id < startId) {
        continue;
      }
      if (endId.length > 0 && word.id > endId) {
        break;
      }
      const shadow = shadowStart.length > 0 && word.id >= shadowStart && word.id <= shadowEnd;
      result.push({ word, shadow });
    }
    return result;
  }
}

export class ClauseNode {
  name: string;
  row = 0;
  prefix = '';
  type = '';
  children: ClauseNode[] = [];
  lines: OrigLine[] = [];
  parent?: ClauseNode;
  aboveIndent = 0;
  belowIndent = 0;
  modifies?: string;
  alone = false;

  constructor(name: string) {
    this.name = name;
  }

  add(child: ClauseNode): void {
    this.children.push(child);
    child.parent = this;
  }

  /** 从 this 沿 parent 链能否走到 ancestor（防环）。 */
  hasAncestor(ancestor: ClauseNode): boolean {
    const visited = new Set<ClauseNode>();
    let current: ClauseNode | undefined = this;
    while (current && !visited.has(current)) {
      if (current === ancestor) {
        return true;
      }
      visited.add(current);
      current = current.parent;
    }
    return false;
  }

  generatePrefix(visited: Set<ClauseNode> = new Set()): string {
    if (this.alone || !this.parent || visited.has(this)) {
      return '';
    }
    const nextVisited = new Set(visited);
    nextVisited.add(this);
    const parentPrefix = this.parent.generatePrefix(nextVisited);

    let result = '';
    let beforeParent = false;
    let indent = this.parent.belowIndent;
    if (this.row < this.parent.row) {
      beforeParent = true;
      indent = this.parent.aboveIndent;
    }
    if (indent < 0) {
      indent = 0;
    }
    if (this.parent.prefix.length > 0) {
      result = this.parent.prefix;
    } else if (parentPrefix.length > 0) {
      const lastChar = parentPrefix[parentPrefix.length - 1];
      result = parentPrefix.slice(0, -1);
      if ((!beforeParent && lastChar === '┘') || (beforeParent && lastChar === '┐')) {
        result += '   ';
      } else {
        result += '│';
      }
    }
    result += ' '.repeat(indent);
    const siblings = this.parent.children;
    const parentIsRoot = this.parent.parent == null;
    // 段落里只有一个顶层子句时不画分支符
    if (parentIsRoot && siblings.length === 1) {
      return '';
    }
    let symbol = '┤';
    if (this === siblings[siblings.length - 1] && (parentIsRoot || !beforeParent)) {
      symbol = '┘';
    }
    if (this === siblings[0] && (parentIsRoot || beforeParent)) {
      symbol = '┐';
    }
    return result + symbol;
  }

  sortChildren(visited: Set<ClauseNode> = new Set()): void {
    if (this.children.length === 0 || visited.has(this)) {
      return;
    }
    const nextVisited = new Set(visited);
    nextVisited.add(this);
    this.children.sort((a, b) => a.row - b.row);
    for (const child of this.children) {
      child.sortChildren(nextVisited);
    }
  }
}

function buildLines(clause: TreeClause, words: TreeWord[]): OrigLine[] {
  const [subjectStart = '', subjectEnd = ''] = clause.subjectRange ? clause.subjectRange.split('-') : [];
  const all = OrigLine.getWords(words, clause.firstWordId, clause.lastWordId, subjectStart, subjectEnd || subjectStart);
  if (!clause.br) {
    const line = new OrigLine();
    line.words = all;
    return [line];
  }
  const breaks = new Set(clause.br.split(','));
  const lines: OrigLine[] = [];
  let current = new OrigLine();
  for (const word of all) {
    current.words.push(word);
    if (breaks.has(word.word.id)) {
      lines.push(current);
      current = new OrigLine();
    }
  }
  if (current.words.length > 0) {
    lines.push(current);
  }
  return lines;
}

/** 子句分支符对准父句中被修饰词的中心：缩进 = round(该词中心距行首宽度 / 空格宽) - 1。只在父子相邻时生效。 */
function calcIndent(node: ClauseNode, measure: Measure): void {
  const parent = node.parent!;
  let position = 0;
  let found = false;
  for (const line of parent.lines) {
    position = 0;
    for (const { word } of line.words) {
      if (word.id === node.modifies) {
        position += measure(word.text, 'original') / 2;
        found = true;
        break;
      }
      position += measure(word.text + word.after, 'original');
    }
    if (found) {
      break;
    }
  }
  // modifies 不在父句里（数据不一致）时 position 是垃圾值，不能拿来算缩进
  if (!found) {
    return;
  }
  const count = Math.max(0, Math.round(position / measure(' ', 'prefix')) - 1);
  if (Math.abs(node.row - parent.row) === 1) {
    if (node.row > parent.row) {
      parent.belowIndent = count;
    } else {
      parent.aboveIndent = count;
    }
  }
}

function createTreeRoots(nodes: ClauseNode[], clauses: TreeClause[], paragraphStarts: Set<string>): void {
  let roots: ClauseNode[] = [];
  const flush = () => {
    if (roots.length > 0) {
      const root = new ClauseNode('root');
      for (const node of roots) {
        root.add(node);
      }
    }
    roots = [];
  };
  nodes.forEach((node, index) => {
    if (node.alone || paragraphStarts.has(node.name)) {
      flush();
      if (node.alone) {
        return;
      }
    }
    if (!clauses[index].parentId || !node.parent) {
      roots.push(node);
    }
  });
  flush();
}

export type ChapterTree = {
  nodes: ClauseNode[];
  /** 每个子句的前缀（仅第一行），与 nodes 同序。 */
  prefixes: string[];
  /** parentId 指不到本章子句、或会成环而被忽略的子句。 */
  orphans: string[];
};

export function buildChapterTree(
  clauses: TreeClause[],
  words: TreeWord[],
  measure: Measure,
  paragraphStarts: Set<string> = new Set(),
): ChapterTree {
  const nodes: ClauseNode[] = [];
  const byName = new Map<string, ClauseNode>();
  for (const clause of clauses) {
    const node = new ClauseNode(clause.id);
    node.lines = buildLines(clause, words);
    node.row = nodes.length;
    node.type = clause.type;
    node.alone = clause.alone;
    node.modifies = clause.modifies ?? undefined;
    byName.set(node.name, node);
    nodes.push(node);
  }
  const orphans: string[] = [];
  clauses.forEach((clause, index) => {
    if (!clause.parentId) {
      return;
    }
    const parent = byName.get(clause.parentId);
    const node = nodes[index];
    if (!parent || parent.hasAncestor(node)) {
      orphans.push(clause.id);
      return;
    }
    parent.add(node);
  });
  for (const node of nodes) {
    if (node.parent && node.modifies) {
      calcIndent(node, measure);
    }
  }
  createTreeRoots(nodes, clauses, paragraphStarts);
  for (const node of nodes) {
    node.sortChildren();
  }
  return { nodes, prefixes: nodes.map((node) => node.generatePrefix()), orphans };
}

/** 希腊文（左到右）显示时把分支符左右镜像。 */
export function flipTreePrefix(prefix: string): string {
  return prefix.replace(/┤/g, '├').replace(/┐/g, '┌').replace(/┘/g, '└');
}

/** 续行（br 拆出的第二行起）的前缀：末位分支符 ┤/┐ 换成竖线，其余换成三个空格。传未镜像的前缀。 */
export function continuationPrefix(prefix: string): string {
  if (prefix.length === 0) {
    return '';
  }
  const last = prefix[prefix.length - 1];
  return prefix.slice(0, -1) + (last === '┤' || last === '┐' ? '│' : '   ');
}
