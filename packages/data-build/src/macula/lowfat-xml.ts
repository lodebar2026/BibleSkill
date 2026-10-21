/**
 * Clear Bible lowfat 句法树的 XML 解析原语。
 *
 * 与语言无关：macula-hebrew（WLC）与 macula-greek（Nestle1904 / SBLGNT）用同一套
 * `<sentence>` / `<wg>` / `<w>` 结构，词一律以 `xml:id` 标识。
 * 只认这三个标签，正则扫描即可，不引入 XML 库。
 */

export type Attributes = Record<string, string>;

export type ParentNode = RootNode | SentenceNode | GroupNode;

export type RootNode = {
  tag: 'root';
  children: Node[];
};

export type SentenceNode = {
  tag: 'sentence';
  attrs: Attributes;
  children: Node[];
  parent: ParentNode;
};

export type GroupNode = {
  tag: 'wg';
  attrs: Attributes;
  children: Node[];
  parent: ParentNode;
};

export type WordNode = {
  tag: 'w';
  attrs: Attributes;
  parent: ParentNode;
};

export type Node = SentenceNode | GroupNode | WordNode;

const TAG_RE = /<(\/?)(sentence|wg|w)\b([^>]*)>/g;
const ATTR_RE = /([A-Za-z_:][A-Za-z0-9_.:-]*)="([^"]*)"/g;

export function parseAttributes(raw: string): Attributes {
  const attrs: Attributes = {};
  for (const match of raw.matchAll(ATTR_RE)) {
    const [, key, value] = match;
    if (!key) {
      continue;
    }
    attrs[key] = value ?? '';
  }
  return attrs;
}

export function parseTree(xml: string): RootNode {
  const root: RootNode = { tag: 'root', children: [] };
  const stack: ParentNode[] = [root];

  for (const match of xml.matchAll(TAG_RE)) {
    const [, slash, tag, rawAttrs] = match;
    if (!tag) {
      continue;
    }

    if (slash) {
      if (tag === 'w') {
        continue;
      }
      while (stack.length > 1) {
        const current = stack.pop();
        if (current?.tag === tag) {
          break;
        }
      }
      continue;
    }

    const parent = stack[stack.length - 1];
    if (!parent) {
      continue;
    }
    const attrs = parseAttributes(rawAttrs ?? '');
    const selfClosing = (rawAttrs ?? '').trim().endsWith('/');

    if (tag === 'w') {
      const node: WordNode = { tag, attrs, parent };
      parent.children.push(node);
      continue;
    }

    const node = {
      tag,
      attrs,
      children: [],
      parent,
    } as SentenceNode | GroupNode;
    parent.children.push(node);
    if (!selfClosing) {
      stack.push(node);
    }
  }

  return root;
}

export function getChildren(node: ParentNode | WordNode): Node[] {
  return 'children' in node ? node.children : [];
}

export function collectWords(node: Node): WordNode[] {
  if (node.tag === 'w') {
    return [node];
  }

  return node.children.flatMap((child) => collectWords(child));
}

export function parseWordSurfaceOrdinal(wordId: string | undefined): number | null {
  if (!wordId) {
    return null;
  }

  const digits = wordId.match(/\d+/g)?.join('');
  if (!digits) {
    return null;
  }

  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

export function compareWordNodesBySurfaceOrder(left: WordNode, right: WordNode): number {
  const leftId = left.attrs['xml:id'];
  const rightId = right.attrs['xml:id'];
  const leftOrdinal = parseWordSurfaceOrdinal(leftId);
  const rightOrdinal = parseWordSurfaceOrdinal(rightId);

  if (leftOrdinal !== null && rightOrdinal !== null && leftOrdinal !== rightOrdinal) {
    return leftOrdinal - rightOrdinal;
  }

  return (leftId ?? '').localeCompare(rightId ?? '');
}

export function sortWordsBySurfaceOrder(words: WordNode[]): WordNode[] {
  return [...words].sort(compareWordNodesBySurfaceOrder);
}

export function uniqueWords(words: WordNode[]): WordNode[] {
  const seen = new Set<string>();
  const result: WordNode[] = [];
  for (const word of words) {
    const id = word.attrs['xml:id'];
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(word);
  }
  return result;
}

/** 词集合 → `首词id-末词id`（单词时只返回该 id）；空集合返回 undefined。 */
export function toRange(words: WordNode[]): string | undefined {
  const orderedWords = sortWordsBySurfaceOrder(uniqueWords(words));
  if (orderedWords.length === 0) {
    return undefined;
  }

  const first = orderedWords[0]?.attrs['xml:id'];
  const last = orderedWords[orderedWords.length - 1]?.attrs['xml:id'];
  if (!first || !last) {
    return undefined;
  }
  return first === last ? first : `${first}-${last}`;
}
