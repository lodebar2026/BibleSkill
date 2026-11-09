/** 一个子句的方框：框头（编号、时态或句型、标记）、成分块、详情。 */
import { $, $$, esc, orig, punct, zh } from './dom.js';
import { toggleKids } from './folds.js';
import {
  type Clause, D, FORM_ZH, MOOD_ZH, ROLE_ZH, STEM_TAG, TENSE_ZH, byId, clauseNo, depthOf, formOf, hasParent, kids, offline, offlineTitle, targets, words,
} from './model.js';
import { setOpen } from './toolbar.js';

function header(clause: Clause, form: string | null): string {
  const front = clause.chips.filter((chip) => chip.fronted).map((chip) => (chip.role ? ROLE_ZH[chip.role] : '成分'));
  const marks = [front.length > 0 ? `<span class="mk front" title="动词前有${esc(front.join('、'))}前置（X-动词语序），常用来凸显焦点、对比或转入背景">前置</span>` : '',
    offline(clause) ? `<span class="mk" title="${offlineTitle()}">离线</span>` : '',
    clause.cognate.length > 0 ? '<span class="mk front" title="同根的不定式独立形强调动词本身（必定、痛……），如 מוֹת תָּמוּת、וַתִּבְכֶּה בָכֹה">同根强调</span>' : ''].join('');
  const ntBadge = () => {
    const [tense, mood] = clause.ntForm!.split('-');
    return mood === 'inf' || mood === 'ptcp' ? `${TENSE_ZH[tense]}${MOOD_ZH[mood]}` : `${TENSE_ZH[tense]}·${MOOD_ZH[mood]}`;
  };
  const typeBadge = !form ? '' : D.isOT ? `<span class="ty" title="${esc(FORM_ZH[form])}">${esc(clause.type)}</span>${marks}`
    : `<span class="ty" title="谓语动词的时态与语气">${esc(ntBadge())}</span>${marks}`;
  const status = clause.status === 'ambiguous' ? '<span class="st ambiguous">有歧义</span>' : clause.status === 'needs-review' ? '<span class="st needs-review">待复核</span>' : '';
  const fold = kids.has(clause.id) ? '<button type="button" class="fold" title="收起/展开这一句下面的所有分支">收起分支</button>' : '';
  return `<div class="bh">${fold}<span class="cid">${esc(clauseNo(clause.id))}</span>${typeBadge}<span class="lab">${esc(clause.label)}</span>${status}<button type="button" class="det" title="词义、要点与分析记录">详情 ▾</button><span class="gist">${zh(clause.gist)}</span></div>`;
}

function wordEl(clause: Clause, chip: Clause['chips'][number], id: string, index: number): HTMLElement {
  const word = words[id];
  const w = document.createElement('span');
  // 与下一个语素相连（同一词、maqqef）且下一个在同一块里时才去掉间距；跨块的（וַ 是连词、动词在下一块）照常留边
  const joined = (word.after === '' || word.after === '־') && index < chip.wordIds.length - 1;
  w.className = `w${targets.has(id) ? ' target' : ''}${joined ? ' join' : ''}${clause.cognate.includes(id) ? ' cog' : ''}`;
  w.dataset.id = id;
  for (const key of ['gcase', 'tense', 'mood'] as const) {
    if (word[key]) {
      w.dataset[key === 'gcase' ? 'case' : key] = word[key]!;
    }
  }
  if (word.stem) {
    w.dataset.stem = word.stem.family;
  }
  if (chip.indents) {
    w.dataset.indent = String(chip.indents[chip.wordIds.indexOf(id)]);
  }
  w.innerHTML = `<span class="g o">${esc(word.text)}${esc(punct(word.after))}${word.variant ? '<span class="vb">异</span>' : ''}</span>`
    + `<span class="m">${esc(word.morph)}</span><span class="z">${esc(word.rendering ?? word.glossZh ?? '—')}</span><span class="e">${esc(word.glossEn)}</span>`;
  if (chip.pauses) {
    w.dataset.pause = String(chip.pauses[chip.wordIds.indexOf(id)]);
  }
  return w;
}

/** 嵌入子句的占位符插在 wordIds[at] 之前，点击跳到那个子句。 */
function addSlots(chip: Clause['chips'][number], ws: HTMLElement): void {
  for (const slot of [...chip.slots ?? []].sort((a, b) => b.at - a.at)) {
    const w = document.createElement('span');
    w.className = 'w slot';
    w.dataset.slot = slot.id;
    w.title = `这里嵌着子句 ${slot.clauseIds.map(clauseNo).join('、')}，点击跳到那里`;
    w.innerHTML = `<span class="g">⟨${esc(slot.clauseIds.map(clauseNo).join(' '))}⟩</span>`;
    if (chip.pauses) {
      w.dataset.pause = String(slot.pause ?? 0);
    }
    const before = $$('.w', ws)[slot.at];
    ws.insertBefore(w, before ?? null);
    w.addEventListener('click', () => {
      const target = $(`[data-box="${slot.clauseIds[0]}"]`);
      if (!target || target.hidden) {
        return;
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('flash');
      setTimeout(() => target.classList.remove('flash'), 1200);
    });
  }
}

function chipsEl(clause: Clause, box: HTMLElement): HTMLElement {
  const chips = document.createElement('div');
  chips.className = 'chips';
  // 下属子句的连线从下方伸进框里、指到同位语与所配成分之间的词时（徒 9:17e 17h、17i→ἀπέσταλκέν），
  // 双线改走成分块上方，不与箭头交叉（从上方来的箭头停在框边，碰不到）
  const kidClauses = (kids.get(clause.id) ?? []).map((id) => byId.get(id)!);
  const incoming = new Set(kidClauses.flatMap((kid) => [...(kid.targetWordIds ?? (kid.targetWordId ? [kid.targetWordId] : [])), kid.targetSlot ?? '']));
  const pointedInto = (chip: Clause['chips'][number]) => chip.wordIds.some((id) => incoming.has(id)) || (chip.slots ?? []).some((slot) => incoming.has(slot.id));
  const upward = (index: number, head: number) => clause.chips.slice(Math.min(index, head) + 1, Math.max(index, head)).some(pointedInto);
  for (const [chipIndex, chip] of clause.chips.entries()) {
    const el = document.createElement('div');
    el.className = `chip${chip.role ? ` r-${chip.role}` : ''}${chip.fronted ? ' front' : ''}`;
    el.dataset.ci = String(chipIndex);
    if (chip.apposOf !== undefined) {
      el.dataset.appos = String(chip.apposOf);
      if (upward(chipIndex, chip.apposOf)) {
        el.dataset.apposUp = '';
        box.classList.add('appos-up');
      } else {
        box.classList.add('has-appos');
      }
    }
    // 同位语用所配成分的颜色（虚线框）
    const pair = chip.role === 'appos' && chip.apposOf !== undefined ? clause.chips[chip.apposOf]?.role : null;
    if (pair && pair !== 's') {
      el.style.setProperty('--c', pair === 'v' ? 'var(--r-v)' : 'var(--muted)');
    }
    const frontLabel = chip.fronted ? `<span class="fr">${chip.role ? ' · ' : ''}前置</span>` : '';
    // 词干标签与成分名同一行，不另占行
    const stems = [...new Map(chip.wordIds.map((id) => words[id].stem).filter((stem) => stem !== null).map((stem) => [stem.name, stem])).values()];
    const stemTags = stems.map((stem) => `<span class="sb${stem.passive ? ' pass' : ''}" data-stem="${stem.family}" title="${esc(stem.name)}">${esc(STEM_TAG[stem.name] ?? stem.name.slice(0, 3))}</span>`).join('');
    const roleName = chip.role ? ROLE_ZH[chip.role] : '';
    el.innerHTML = `<span class="rl"><span class="rn">${roleName}${frontLabel}</span>${stemTags}</span><span class="ws"></span>`;
    const ws = $('.ws', el);
    chip.wordIds.forEach((id, index) => ws.append(wordEl(clause, chip, id, index)));
    addSlots(chip, ws);
    chips.append(el);
  }
  return chips;
}

/** 详情：句法、逻辑关系与分析、翻译记录。 */
function details(clause: Clause): string {
  const records = clause.records.map((record) => `<li><span class="tag">${esc(record.tag)}</span>：${orig(record.text)}</li>`).join('');
  const ups: string[] = [];
  if (hasParent(clause)) {
    const targetIds = clause.targetWordIds ?? (clause.targetWordId ? [clause.targetWordId] : []);
    const target = targetIds.length ? ` <span class="o">${esc(targetIds.map((id) => words[id]?.text).join(' '))}</span>` : '';
    ups.push(`↳ 句法：属 ${esc(clauseNo(clause.parentId!))}${clause.link ? ` · ${esc(clause.link)}` : ''}${target}`);
  }
  if (clause.logic) {
    ups.push(`<span class="lg">⇢ 逻辑：${esc(clause.logic.label)} → ${esc(clause.logic.targetText)}${clause.logic.note ? ` · ${esc(clause.logic.note)}` : ''}</span>`);
  }
  const up = ups.length > 0 ? `<div class="up">${ups.join('<br>')}</div>` : '';
  return `<div class="more">${up}`
    + (records ? `<details open><summary>分析与翻译记录（${clause.records.length}）</summary><ul>${records}</ul></details>` : '')
    + (!records && !up ? '<span class="hint">没有备注。</span>' : '') + `</div>${up}`;
}

export function renderBox(clause: Clause, forest: HTMLElement, verseStart: boolean): HTMLElement {
  const depth = depthOf(clause);
  const box = document.createElement('div');
  box.className = `box${depth === 0 ? ' root' : ''}${clause.status === 'ambiguous' ? ' ambiguous' : ''}${verseStart ? ' vstart' : ''}${clause.wireLabel ? ' wl' : ''}`;
  box.dataset.box = clause.id;
  box.style.setProperty('--depth', String(depth));
  const form = formOf(clause);
  if (form) {
    box.dataset[D.isOT ? 'form' : 'ntForm'] = form;
  }
  box.innerHTML = header(clause, form);
  box.append(chipsEl(clause, box));
  box.insertAdjacentHTML('beforeend', details(clause));
  $('.det', box).addEventListener('click', () => setOpen(box, !box.classList.contains('open')));
  box.querySelector('.fold')?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleKids(clause.id);
  });
  forest.append(box);
  return box;
}
