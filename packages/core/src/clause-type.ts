/**
 * 子句句型。analyze 提交基础句型全称，系统按主语有无与前后换算成展示码（WayX、XAor …）。
 *
 * 展示码规则：无明示主语 → `…0`；主语在动词前 → `X…`；否则 → `…X`。
 */
import { parseTokenRange } from './ids.js';

export const BASIC_TYPES_OT = [
  'wayyiqtol', 'qatal', 'yiqtol', 'weqatal', 'imperative', 'participle',
  'infinitive_construct', 'infinitive_absolute', 'nominal',
] as const;

export const BASIC_TYPES_NT = [
  'aorist_ind', 'imperfect_ind', 'present_ind', 'perfect_ind', 'pluperfect_ind', 'future_ind',
  'subjunctive', 'optative', 'imperative', 'infinitive', 'participle', 'nominal',
] as const;

/** 必须给 verbRange 的基础句型（据此判断主语前置并回填动词信息）。 */
const VERB_REQUIRED_OT = new Set(['wayyiqtol', 'qatal', 'yiqtol', 'infinitive_construct', 'infinitive_absolute']);

const GREEK_INDICATIVE_STEMS: Record<string, string> = {
  present_ind: 'Prs',
  imperfect_ind: 'Ipf',
  aorist_ind: 'Aor',
  future_ind: 'Fut',
  perfect_ind: 'Prf',
  pluperfect_ind: 'Plp',
};

function subjectFronted(subjectRange: string | null, verbRange: string | null): boolean {
  if (!subjectRange || !verbRange) {
    return false;
  }
  return parseTokenRange(subjectRange)[0] < parseTokenRange(verbRange)[0];
}

/** 校验基础句型；返回问题列表（空即通过）。 */
export function validateBasicType(
  testament: 'OT' | 'NT',
  input: { type: string; subjectRange: string | null; verbRange: string | null },
): string[] {
  const allowed: readonly string[] = testament === 'OT' ? BASIC_TYPES_OT : BASIC_TYPES_NT;
  if (!allowed.includes(input.type)) {
    return [`type 应为${testament === 'OT' ? '旧约' : '新约'}基础句型之一：${allowed.join(' / ')}（收到 ${input.type || '空'}）`];
  }
  const needsVerb = testament === 'OT' ? VERB_REQUIRED_OT.has(input.type) : input.type !== 'nominal';
  if (needsVerb && !input.verbRange) {
    return [`type=${input.type} 时必须填写 verbRange`];
  }
  return [];
}

export function displayClauseType(
  testament: 'OT' | 'NT',
  input: { type: string; subjectRange: string | null; verbRange: string | null },
): string {
  const withSubject = Boolean(input.subjectRange);
  const fronted = subjectFronted(input.subjectRange, input.verbRange);
  if (testament === 'NT') {
    const stem = GREEK_INDICATIVE_STEMS[input.type];
    if (stem) {
      return withSubject ? (fronted ? `X${stem}` : `${stem}X`) : `${stem}0`;
    }
    switch (input.type) {
      case 'subjunctive': return withSubject ? (fronted ? 'XSbj' : 'SbjX') : 'Sbj0';
      case 'optative': return withSubject ? 'OptX' : 'Opt0';
      case 'imperative': return withSubject ? 'IpvX' : 'Ipv';
      case 'infinitive': return 'Inf';
      case 'participle': return 'Ptc';
      default: return 'Nom';
    }
  }
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
 * 展示码 → 基础句型（displayClauseType 的逆）。同一约内展示码与基础句型一一对应；
 * 已是基础句型的原样返回，认不出的返回 null。编辑器把存盘的子句重新提交校验时用。
 */
export function basicClauseType(testament: 'OT' | 'NT', type: string): string | null {
  const allowed: readonly string[] = testament === 'OT' ? BASIC_TYPES_OT : BASIC_TYPES_NT;
  if (allowed.includes(type)) {
    return type;
  }
  if (testament === 'NT') {
    for (const [basic, stem] of Object.entries(GREEK_INDICATIVE_STEMS)) {
      if ([`X${stem}`, `${stem}X`, `${stem}0`].includes(type)) {
        return basic;
      }
    }
    const nt: Record<string, string> = {
      XSbj: 'subjunctive', SbjX: 'subjunctive', Sbj0: 'subjunctive', OptX: 'optative', Opt0: 'optative',
      IpvX: 'imperative', Ipv: 'imperative', Inf: 'infinitive', Ptc: 'participle', Nom: 'nominal',
    };
    return nt[type] ?? null;
  }
  const ot: Record<string, string> = {
    WayX: 'wayyiqtol', Way0: 'wayyiqtol', XQtl: 'qatal', QtlX: 'qatal', Qtl0: 'qatal', XYqt: 'yiqtol', YqtX: 'yiqtol', Yqt0: 'yiqtol',
    WQtl: 'weqatal', Impv: 'imperative', Ptcp: 'participle', InfC: 'infinitive_construct', InfA: 'infinitive_absolute', NmCl: 'nominal',
  };
  return ot[type] ?? null;
}

const HEBREW_STEMS: Record<string, string> = {
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
