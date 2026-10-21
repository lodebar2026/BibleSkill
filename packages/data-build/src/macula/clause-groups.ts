/**
 * lowfat 句法树上的**子句划分**。
 *
 * 子句边界只此一份实现：构建子句种子与其他用途都调这里，避免同一节经文在不同地方切出不同子句。
 */
import type { GroupNode, Node, WordNode } from './lowfat-xml.js';

/** 属性名大小写在 lowfat 里不统一（如 rule / Rule），统一按小写取。 */
export function attr(node: { attrs: Record<string, string> }, name: string): string | undefined {
  const direct = node.attrs[name];
  if (direct !== undefined) {
    return direct;
  }
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(node.attrs)) {
    if (key.toLowerCase() === lower) {
      return value;
    }
  }
  return undefined;
}

export function isClauseGroup(node: Node): node is GroupNode {
  return node.tag === 'wg' && attr(node, 'class')?.toLowerCase() === 'cl';
}

/** 名词性/形容词性/副词性短语——子句嵌在其中即为该短语的定语，不是并列的分句。 */
const CONSTITUENT_CLASSES = new Set(['np', 'adjp', 'advp']);

/** 名词性成分：子句紧跟其后即为修饰它的定语，而非与它并列的另一个成分。 */
const NOMINAL_CLASSES = new Set(['np', 'adjp', 'noun', 'adj', 'pron']);

function isNominalSibling(node: Node): boolean {
  return NOMINAL_CLASSES.has(attr(node, 'class')?.toLowerCase() ?? '');
}


export type ClauseSite = {
  clause: GroupNode;
  /**
   * 该子句是否为某名词性成分的定语。
   *
   * 条件是两者兼备：处在 np/adjp/advp 之内，且同级紧跟在一个名词性成分之后
   * （腓 1:1 `τοῖς ἁγίοις … | τοῖς οὖσιν ἐν Φιλίπποις`）。只看「在短语内」会把
   * 腓 1:29 `οὐ μόνον τὸ … πιστεύειν ἀλλὰ καὶ τὸ … πάσχειν` 这类实体化冠词不定式
   * 也算成定语——它们前面是副词性成分，本身就是短语的中心，并非修饰语。
   */
  attributive: boolean;
  /**
   * 该子句所从属的母句谓词（原始 `xml:id`）。
   *
   * 取树上最近一个「自己带谓词」的祖先子句的谓词——`Conj-CL`、`DetCL` 这类只裹连词/冠词的
   * 包裹层没有谓词，会被跳过继续上溯；并列子句共用同一个包裹层，彼此不构成从属，
   * 于是自然共享上一层的治理谓词。顶层子句无此字段。
   */
  governorRawId?: string;
};


/** 该子句自身（不含嵌套子句）的谓词中心：先限定/系动词 role，再动词词类，最后无动词句的述语。 */
export function directPredicateWord(clause: GroupNode): WordNode | undefined {
  const own = directWords(clause);
  return own.find((word) => {
    const role = attr(word, 'role')?.toLowerCase();
    return role === 'v' || role === 'vc';
  })
    ?? own.find((word) => attr(word, 'class')?.toLowerCase() === 'verb')
    ?? own.find((word) => {
      const role = attr(word, 'role')?.toLowerCase();
      return role === 'p' || role === 'p2';
    });
}


/** 该子句自身的词——不含嵌套子句里的词。 */
export function directWords(clause: GroupNode): WordNode[] {
  const found: WordNode[] = [];
  const walk = (current: Node) => {
    if (current.tag === 'w') {
      found.push(current);
      return;
    }
    if (isClauseGroup(current) && current !== clause) {
      return;
    }
    for (const child of current.children) {
      walk(child);
    }
  };
  walk(clause);
  return found;
}

export function collectClauseGroups(node: Node): ClauseSite[] {
  const found: ClauseSite[] = [];
  const walk = (
    current: Node,
    insideConstituent: boolean,
    attributive: boolean,
    previousSibling: Node | undefined,
    governorRawId: string | undefined,
  ) => {
    if (current.tag === 'w') {
      return;
    }
    const className = current.tag === 'wg' ? attr(current, 'class')?.toLowerCase() ?? '' : '';
    if (current.tag === 'wg' && className === 'cl') {
      // 定语身份沿子句链下传：定语子句还会再套一层子句（DetCL > VC-P-ADV），
      // 内层若重新算作独立子句就会把边界切回来，等于白抑制。
      const isAttributive = attributive
        || (insideConstituent && previousSibling !== undefined && isNominalSibling(previousSibling));
      found.push({ clause: current, attributive: isAttributive, governorRawId });
      const ownPredicate = directPredicateWord(current)?.attrs['xml:id'];
      const childGovernor = ownPredicate ?? governorRawId;
      let previous: Node | undefined;
      for (const child of current.children) {
        walk(child, insideConstituent, isAttributive, previous, childGovernor);
        previous = child;
      }
      return;
    }
    const nextInside = insideConstituent || CONSTITUENT_CLASSES.has(className);
    let previous: Node | undefined;
    for (const child of current.children) {
      walk(child, nextInside, attributive, previous, governorRawId);
      previous = child;
    }
  };
  walk(node, false, false, undefined, undefined);
  return found;
}
