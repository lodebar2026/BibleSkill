/** 图的数据与由它推出的子句关系（母句、下属、层级、动词形式、主线），各模块共用。 */
import type { DiagramData } from '@bs/core';

export type Clause = DiagramData['clauses'][number];

export let D: DiagramData;
export let words: DiagramData['words'];
export let byId: Map<string, Clause>;
export const kids = new Map<string, string[]>();
/** 被修饰的词都加下划线；旧图的数据只有 targetWordId。 */
export let targets: Set<string | undefined>;
/** 叙事主线：旧约顶层子句里 wayyiqtol 是主线，新约叙事书卷里是不定过去式直说语气；其余形式离开主线（背景、评述、凸显）。 */
export let mainline: boolean;
/** 画逻辑虚线的方框（起点与关联的子句）。 */
export let logicBoxes: Set<string>;
let multiChapter = false;

export function initModel(data: DiagramData): void {
  D = data;
  words = D.words;
  byId = new Map(D.clauses.map((clause) => [clause.id, clause]));
  for (const clause of D.clauses) {
    if (clause.parentId && byId.has(clause.parentId)) {
      kids.set(clause.parentId, [...(kids.get(clause.parentId) ?? []), clause.id]);
    }
  }
  targets = new Set(D.clauses.flatMap((clause) => clause.targetWordIds ?? [clause.targetWordId]).filter(Boolean));
  mainline = D.isOT || D.narrative;
  logicBoxes = new Set(D.clauses.flatMap((clause) => (clause.logic && clause.logic.targetIds.length > 0 ? [clause.id, clause.logic.targetIds[0]] : [])));
  multiChapter = new Set(D.clauses.map((clause) => chapterOf(clause.id))).size > 1;
}

export const ROLE_ZH: Record<string, string> = { s: '主语', v: '谓语', o: '宾语', o2: '宾补', io: '间接宾语', adv: '状语', p: '表语', conj: '连接词', appos: '同位语' };
export const TENSE_ZH: Record<string, string> = { pres: '现在', impf: '未完成', fut: '将来', aor: '不定过去', perf: '完成', plpf: '过去完成' };
export const MOOD_ZH: Record<string, string> = { ind: '直说', subj: '虚拟', opt: '祈愿', impv: '祈使', inf: '不定式', ptcp: '分词' };
export const FORM_ZH: Record<string, string> = { wayyiqtol: 'wayyiqtol', qatal: 'qatal', weqatal: 'weqatal', yiqtol: 'yiqtol', participle: '分词', infinitive: '不定式', imperative: '祈使', nominal: '名词句' };
export const STEM_TAG: Record<string, string> = {
  qal: 'Q', 'qal passive': 'Qp', niphal: 'Ni', piel: 'Pi', pual: 'Pu', hiphil: 'Hi', hophal: 'Ho', hithpael: 'Ht', polel: 'Po', polal: 'Pol',
  poel: 'Po', poal: 'Poa', pilpel: 'Pil', polpal: 'Ppl', hithpolel: 'Htp', hishtaphel: 'Hsht',
};

export const firstWord = (clause: Clause) => clause.chips[0]?.wordIds[0] ?? clause.fromWordId;
export const lastWord = (clause: Clause) => clause.chips.flatMap((chip) => chip.wordIds).sort().at(-1) ?? firstWord(clause);
export const descendants = (id: string, seen = new Set<string>()): string[] =>
  (kids.get(id) ?? []).filter((kid) => !seen.has(kid) && seen.add(kid)).flatMap((kid) => [kid, ...descendants(kid, seen)]);
export const depthOf = (clause: Clause): number => {
  let depth = 0;
  const seen = new Set<string>();
  for (let parent = clause.parentId; parent && byId.has(parent) && !seen.has(parent); parent = byId.get(parent)!.parentId) {
    seen.add(parent);
    depth += 1;
  }
  return depth;
};
/** 有画在图上的母句。 */
export const hasParent = (clause: Clause) => Boolean(clause.parentId && byId.has(clause.parentId));

/** 旧约句型码 → 动词形式（着色用）；X 在动词前 = 成分前置。新约是谓语动词的时态。 */
export const formOf = (clause: Clause): string | null => {
  if (!D.isOT) return clause.ntForm ? `nt-${clause.ntForm.split('-')[0]}` : null;
  const type = clause.type;
  if (!type) return null;
  if (/^Way/.test(type)) return 'wayyiqtol';
  if (type === 'WQtl') return 'weqatal';
  if (/Qtl/.test(type)) return 'qatal';
  if (/Yqt/.test(type)) return 'yiqtol';
  if (type === 'Impv') return 'imperative';
  if (type === 'Ptcp') return 'participle';
  if (/^Inf/.test(type)) return 'infinitive';
  if (type === 'NmCl') return 'nominal';
  return null;
};
/** 离开主线的顶层句。分析里写了 mainline 的按分析（如徒 8:17 τότε 引出的未完成式推进情节）；旧图的数据没有这个字段。 */
export const offline = (clause: Clause) => mainline && !clause.parentId && (clause.mainline != null ? !clause.mainline
  : formOf(clause) !== null && (D.isOT ? formOf(clause) !== 'wayyiqtol' : clause.ntForm !== 'aor-ind'));
export const offlineTitle = () => D.isOT ? '顶层叙事不用 wayyiqtol：离开主线，多为背景、评述或凸显'
  : '顶层叙事不用不定过去式直说语气：未完成式、过去完成式多为背景，现在式多为历史现在式或评述，完成式表结果状态';

/** 子句编号：bcv+字母，显示为「节+字母」；范围跨章时带章号。 */
const chapterOf = (id: string) => Math.floor(Number(id.match(/^\d+/)![0]) / 1000) % 1000;
export const clauseNo = (id: string) => {
  const [, bcv, sub] = id.match(/^(\d+)([a-z]+)$/) ?? [, '0', id];
  const verse = Number(bcv) % 1000;
  return multiChapter ? `${chapterOf(id)}:${verse}${sub}` : `${verse}${sub}`;
};
