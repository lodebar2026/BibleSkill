/** 结构图：每个子句一行，按原文先后排，缩进 = 从属层级；引语框架、过渡句引出的从句排在母句那一行的行尾。 */
import { renderBox } from './box.js';
import { $, esc } from './dom.js';
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
// 过渡句：旧约只有一个 הָיָה（וַיְהִי、וְהָיָה），新约是 ἐγένετο（δέ）加不定式主语（徒 9:32a、43a），
// 除连词、状语外没有别的成分，且不超过 3 个词（徒 9:37a 带 ἐν ταῖς ἡμέραις ἐκείναις 的照常单占一行）。
// 它引出的第一个从句排在它同一行的行尾
const isMarker = (clause: Clause) => {
  if (!kids.has(clause.id)) {
    return false;
  }
  if (D.isOT) {
    const ids = clause.chips.flatMap((chip) => chip.wordIds);
    return wordCount(ids) === 1 && ids.some((id) => /^H1961/.test(words[id].strong));
  }
  const verb = clause.chips.filter((chip) => chip.role === 'v');
  return wordCount(clause.chips.flatMap((chip) => chip.wordIds)) <= 3 && verb.length === 1 && verb[0].wordIds.length === 1 && /^G1096/.test(words[verb[0].wordIds[0]].strong)
    && clause.chips.every((chip) => chip.role === 'v' || chip.role === 'conj' || chip.role === 'adv');
};
const besideMarker = (clause: Clause) => {
  const parent = clause.parentId ? byId.get(clause.parentId) : undefined;
  return Boolean(parent && isMarker(parent) && kids.get(parent.id)!.map((id) => byId.get(id)!)
    .sort((a, b) => firstWord(a).localeCompare(firstWord(b)))[0] === clause);
};

export function renderForest(): void {
  const forest = $('#forest');
  forest.classList.toggle('ot-forms', mainline && D.clauses.some((clause) => formOf(clause)));
  // 按原文先后；紧挨在所修饰动词前面的分词句（above）整组提到母句上方（徒 9:38c–d 排在 38b 之上）
  const sorted = [...D.clauses].sort((a, b) => firstWord(a).localeCompare(firstWord(b)));
  const ordered: Clause[] = [];
  const emit = (clause: Clause): void => {
    sorted.filter((item) => item.above === clause.id).forEach(emit);
    ordered.push(clause);
  };
  sorted.filter((clause) => !clause.above).forEach(emit);
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
      // 过渡句一行：两框竖向居中，连线走在中部（见 wires/routes.ts）
      row.classList.toggle('marker', besideMarker(clause));
      renderBox(clause, row, false).classList.add('side');
    } else {
      // 段首：有小标题时先加标题行，没有时方框上方多留一点空
      const paragraph = clause.paragraph ?? null;
      if (paragraph?.title) {
        forest.insertAdjacentHTML('beforeend', `<div class="ptitle">${esc(paragraph.title)}</div>`);
      }
      renderBox(clause, forest, verse !== lastVerse).classList.toggle('pstart', paragraph !== null && !paragraph.title);
    }
    lastVerse = verse;
  }
  // 带标签的从句紧挨在母句上方时（徒 10:15b ἃ ὁ θεὸς ἐκαθάρισεν 是 15c κοίνου 的宾语），连线从上面直下进母句框：
  // 母句框（或它所在的那一行）上方多留空隙，标签放在框外那段竖线上。中间隔着别的框时连线走沟槽，竖线够长，不用留（徒 7:35a → 35d）
  for (const clause of ordered) {
    const parent = clause.parentId ? byId.get(clause.parentId) : undefined;
    if (clause.wireLabel && parent && ordered.indexOf(parent) === ordered.indexOf(clause) + 1) {
      const box = $(`[data-box="${parent.id}"]`);
      const holder = box?.parentElement?.classList.contains('row') ? box.parentElement : box;
      holder?.classList.add('wla');
    }
  }
}
