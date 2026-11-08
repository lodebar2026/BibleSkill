/** 结构图：每个子句一行，按原文先后排，缩进 = 从属层级；引语框架、过渡句引出的从句排在母句那一行的行尾。 */
import { renderBox } from './box.js';
import { $ } from './dom.js';
import { type Clause, D, byId, firstWord, formOf, kids, lastWord, mainline, words } from './model.js';

// 词数：旧约一个词可能由几个语素组成（לֵ־אמֹר），语素之间 after 为空
const wordCount = (ids: string[]) => ids.filter((id, i) => i === ids.length - 1 || words[id].after !== '').length;
// 引语框架：只有一个说话动词（λέγω、εἶπον、φημί、ἀποκρίνομαι、λαλέω、אָמַר、דָּבַר）、下面还挂着引出的话，
// 母句已经画出来时，放到母句那一行的行尾。נִחַשְׁתִּי 这类带内容从句的普通动词不算
const SPEECH = /^(G3004|G2036|G5346|G0611|G2980|H0559|H1696)/;
const isSide = (clause: Clause) => {
  const ids = clause.chips.flatMap((chip) => chip.wordIds);
  return Boolean(clause.parentId && byId.has(clause.parentId) && kids.has(clause.id))
    && wordCount(ids) === 1 && ids.some((id) => SPEECH.test(words[id].strong));
};
// 只有一个 הָיָה 的过渡句（וַיְהִי、וְהָיָה）：它引出的第一个从句（多为时间从句）排在它同一行的行尾
const isMarker = (clause: Clause) => {
  const ids = clause.chips.flatMap((chip) => chip.wordIds);
  return D.isOT && kids.has(clause.id) && wordCount(ids) === 1 && ids.some((id) => /^H1961/.test(words[id].strong));
};
const besideMarker = (clause: Clause) => {
  const parent = clause.parentId ? byId.get(clause.parentId) : undefined;
  return Boolean(parent && isMarker(parent) && kids.get(parent.id)!.map((id) => byId.get(id)!)
    .sort((a, b) => firstWord(a).localeCompare(firstWord(b)))[0] === clause);
};

export function renderForest(): void {
  const forest = $('#forest');
  forest.classList.toggle('ot-forms', mainline && D.clauses.some((clause) => formOf(clause)));
  const ordered = [...D.clauses].sort((a, b) => firstWord(a).localeCompare(firstWord(b)));
  // 原文里紧接着母句：两者之间的子句都嵌在母句里面（首词在母句末词之前，如 徒 8:7a 的 ⟨7b⟩），或已排在母句那一行。
  // 隔着别的子句时（如 徒 8:9d λέγων 前面是 9b、9c）照常另起一行，不打乱原文顺序
  const follows = (clause: Clause, parentBox: HTMLElement) => {
    const parent = byId.get(clause.parentId!)!;
    const between = ordered.slice(ordered.indexOf(parent) + 1, ordered.indexOf(clause));
    return between.every((item) => lastWord(parent).localeCompare(firstWord(item)) > 0
      || $(`[data-box="${item.id}"]`)?.parentElement === parentBox.parentElement && parentBox.parentElement!.classList.contains('row'));
  };
  let lastVerse = '';
  for (const clause of ordered) {
    const verse = clause.id.replace(/[a-z]+$/, '');
    const parentBox = isSide(clause) || besideMarker(clause) ? $(`[data-box="${clause.parentId}"]`) : null;
    if (parentBox && follows(clause, parentBox)) {
      let row = parentBox.parentElement!;
      if (!row.classList.contains('row')) {
        row = document.createElement('div');
        // 节首的上边距移到整行上，行里的方框顶边对齐
        row.className = `row${parentBox.classList.contains('vstart') ? ' vstart' : ''}`;
        parentBox.classList.remove('vstart');
        parentBox.replaceWith(row);
        row.append(parentBox);
      }
      renderBox(clause, row, false).classList.add('side');
    } else {
      renderBox(clause, forest, verse !== lastVerse);
    }
    lastVerse = verse;
  }
}
