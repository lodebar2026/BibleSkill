/**
 * 子句句型（只用于旧约）。analyze 提交基础句型全称，系统按主语有无与前后换算成展示码（WayX、XQtl …）。
 * 新约不分句型，type 一律存空串。
 *
 * 展示码规则：无明示主语 → `…0`；主语在动词前 → `X…`；否则 → `…X`。
 */
import { parseTokenRange } from './ids.js';

export const BASIC_TYPES_OT = [
  'wayyiqtol', 'qatal', 'yiqtol', 'weqatal', 'imperative', 'participle',
  'infinitive_construct', 'infinitive_absolute', 'nominal',
] as const;

/** 必须给 verbRange 的基础句型（据此判断主语前置并回填动词信息）。 */
const VERB_REQUIRED_OT = new Set(['wayyiqtol', 'qatal', 'yiqtol', 'infinitive_construct', 'infinitive_absolute']);

function subjectFronted(subjectRange: string | null, verbRange: string | null): boolean {
  if (!subjectRange || !verbRange) {
    return false;
  }
  return parseTokenRange(subjectRange)[0] < parseTokenRange(verbRange)[0];
}

/** 校验基础句型；返回问题列表（空即通过）。新约不分句型，不校验。 */
export function validateBasicType(
  testament: 'OT' | 'NT',
  input: { type: string; subjectRange: string | null; verbRange: string | null },
): string[] {
  if (testament === 'NT') {
    return [];
  }
  const allowed: readonly string[] = BASIC_TYPES_OT;
  if (!allowed.includes(input.type)) {
    return [`type 应为旧约基础句型之一：${allowed.join(' / ')}（收到 ${input.type || '空'}）`];
  }
  if (VERB_REQUIRED_OT.has(input.type) && !input.verbRange) {
    return [`type=${input.type} 时必须填写 verbRange`];
  }
  return [];
}

export function displayClauseType(
  testament: 'OT' | 'NT',
  input: { type: string; subjectRange: string | null; verbRange: string | null },
): string {
  if (testament === 'NT') {
    return '';
  }
  const withSubject = Boolean(input.subjectRange);
  const fronted = subjectFronted(input.subjectRange, input.verbRange);
  switch (input.type) {
    case 'wayyiqtol': return withSubject ? 'WayX' : 'Way0';
    case 'qatal': return withSubject ? (fronted ? 'XQtl' : 'QtlX') : 'Qtl0';
    case 'yiqtol': return withSubject ? (fronted ? 'XYqt' : 'YqtX') : 'Yqt0';
    case 'weqatal': return 'WQtl';
    case 'imperative': return 'Impv';
    case 'participle': return 'Ptcp';
    case 'infinitive_construct': return 'InfC';
    case 'infinitive_absolute': return 'InfA';
    default: return 'NmCl';
  }
}

/**
 * 展示码 → 基础句型（displayClauseType 的逆）。展示码与基础句型一一对应；
 * 已是基础句型的原样返回，认不出的返回 null。编辑器把存盘的子句重新提交校验时用。
 * 新约一律返回空串（旧数据里残留的句型随之清掉）。
 */
export function basicClauseType(testament: 'OT' | 'NT', type: string): string | null {
  if (testament === 'NT') {
    return '';
  }
  const allowed: readonly string[] = BASIC_TYPES_OT;
  if (allowed.includes(type)) {
    return type;
  }
  const ot: Record<string, string> = {
    WayX: 'wayyiqtol', Way0: 'wayyiqtol', XQtl: 'qatal', QtlX: 'qatal', Qtl0: 'qatal', XYqt: 'yiqtol', YqtX: 'yiqtol', Yqt0: 'yiqtol',
    WQtl: 'weqatal', Impv: 'imperative', Ptcp: 'participle', InfC: 'infinitive_construct', InfA: 'infinitive_absolute', NmCl: 'nominal',
  };
  return ot[type] ?? null;
}

export const HEBREW_STEMS: Record<string, string> = {
  q: 'qal', N: 'niphal', p: 'piel', P: 'pual', h: 'hiphil', H: 'hophal', t: 'hithpael',
  o: 'polel', O: 'polal', r: 'hithpolel', m: 'poel', M: 'poal', k: 'palel', K: 'pulal',
  Q: 'qal passive', l: 'pilpel', L: 'polpal', f: 'hithpalpel', D: 'nithpael', j: 'pealal',
  i: 'pilel', u: 'hothpaal', c: 'tiphil', v: 'hishtaphel', w: 'nithpalel', y: 'nithpoel', z: 'hithpoel',
};

/**
 * 从谓词词法回填动词信息：希伯来 `HVqp3ms` → stem=qal、person=3ms；希腊 `V-AAI-3S` → person=3s。
 * 词法里没有人称（不定式、分词）时返回 null。
 */
export function verbInfoFromMorph(morph: string): { stem: string | null; person: string | null } {
  const hebrew = morph.match(/^[HA]V(\w)\w(\d?)([mfc]?)([sdp]?)/);
  if (hebrew) {
    const person = hebrew[2] && hebrew[4] ? `${hebrew[2]}${hebrew[3]}${hebrew[4]}` : null;
    return { stem: HEBREW_STEMS[hebrew[1]] ?? null, person };
  }
  const greek = morph.match(/^V-\w+-(\d)([SP])/);
  if (greek) {
    return { stem: null, person: `${greek[1]}${greek[2].toLowerCase()}` };
  }
  return { stem: null, person: null };
}
