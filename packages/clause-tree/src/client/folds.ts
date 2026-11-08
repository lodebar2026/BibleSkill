/**
 * 分支展开/收起：一支 = 一个子句连同它的下属。收起的支在母句框头留一个「▸ 编号」按钮，点它展开。
 * 鼠标移到连线上：加亮这一支（线与子句框），在鼠标旁给出「收起」按钮。
 */
import { $, $$ } from './dom.js';
import { D, byId, clauseNo, descendants, kids } from './model.js';
import { hidePop } from './pop.js';
import { redraw } from './wires/draw.js';

const folded = new Set<string>();
let branchTimer = 0;
/** 鼠标正停在哪一支的连线上；重画连线后要重新加亮它。 */
export let hoverBranch: string | null = null;

const branchLabel = (id: string) => {
  const ids = [id, ...descendants(id)].sort();
  return ids.length > 1 ? `${clauseNo(ids[0])}–${clauseNo(ids.at(-1)!)}` : clauseNo(id);
};

/** 框头「收起分支」：这一句的分支全收起时全部展开，否则全部收起。 */
export function toggleKids(id: string): void {
  const all = kids.get(id)!;
  const shut = all.every((kid) => folded.has(kid));
  all.forEach((kid) => (shut ? folded.delete(kid) : folded.add(kid)));
  applyFolds();
}

function applyFolds(): void {
  const hidden = new Set([...folded].flatMap((id) => [id, ...descendants(id)]));
  for (const box of $$('.box')) {
    box.hidden = hidden.has(box.dataset.box!);
    const row = box.parentElement!;
    if (row.classList.contains('row')) {
      row.hidden = [...row.children].every((item) => hidden.has((item as HTMLElement).dataset.box!));
    }
    $$('.unfold', box).forEach((button) => button.remove());
    // 这一句的分支全部收起时，「收起分支」改为「展开分支」，不再逐支列出
    const all = kids.get(box.dataset.box!) ?? [];
    const shut = all.length > 0 && all.every((id) => folded.has(id));
    box.classList.toggle('folded', shut);
    const fold = box.querySelector<HTMLElement>('.fold');
    if (fold) {
      fold.textContent = shut ? '展开分支' : '收起分支';
    }
    if (shut) {
      continue;
    }
    const cid = $('.bh .cid', box);
    for (const kid of [...(kids.get(box.dataset.box!) ?? [])].reverse().filter((id) => folded.has(id))) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'unfold';
      button.textContent = `▸ ${branchLabel(kid)}`;
      button.title = `展开收起的分支 ${branchLabel(kid)}（${1 + descendants(kid).length} 句）`;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        folded.delete(kid);
        applyFolds();
      });
      cid.before(button);
    }
  }
  hidePop();
  hideBranchButton();
  redraw();
}

export function highlightBranch(id: string | null): void {
  $$('#hits path.lit').forEach((path) => path.remove());
  $$('.box.lit').forEach((box) => box.classList.remove('lit'));
  if (!id) {
    return;
  }
  for (const hit of $$(`#hits path.hit[data-branch="${id}"]`)) {
    const mark = hit.cloneNode() as SVGPathElement;
    mark.setAttribute('class', 'lit');
    mark.removeAttribute('data-branch');
    hit.before(mark);
  }
  [id, ...descendants(id)].forEach((kid) => $(`[data-box="${kid}"]`)?.classList.add('lit'));
}

function hideBranchButton(): void {
  clearTimeout(branchTimer);
  $('#bfold').classList.remove('on');
  hoverBranch = null;
  highlightBranch(null);
}

function showBranchButton(id: string, event: MouseEvent): void {
  clearTimeout(branchTimer);
  if (hoverBranch !== id) {
    const branchButton = $('#bfold');
    const base = $('#canvas').getBoundingClientRect();
    branchButton.textContent = `收起 ${branchLabel(id)}`;
    branchButton.style.left = `${event.clientX - base.left + 8}px`;
    branchButton.style.top = `${event.clientY - base.top + 8}px`;
    branchButton.classList.add('on');
    hoverBranch = id;
    highlightBranch(id);
  }
}

export function setupFolds(): void {
  // 只看主句：收起主句下的每一支
  $('#foldAll').addEventListener('click', () => {
    folded.clear();
    D.clauses.filter((clause) => clause.parentId && byId.has(clause.parentId) && !byId.get(clause.parentId)!.parentId).forEach((clause) => folded.add(clause.id));
    applyFolds();
  });
  $('#unfoldAll').addEventListener('click', () => {
    folded.clear();
    applyFolds();
  });
  // 移开连线后稍等再收，好让鼠标移到按钮上
  const branchButton = $('#bfold');
  const leaveBranch = () => {
    clearTimeout(branchTimer);
    branchTimer = window.setTimeout(hideBranchButton, 400);
  };
  $('#hits').addEventListener('mouseover', (event) => {
    const id = (event.target as Element).getAttribute?.('data-branch');
    if (id) {
      showBranchButton(id, event as MouseEvent);
    }
  });
  $('#hits').addEventListener('mouseout', leaveBranch);
  branchButton.addEventListener('mouseenter', () => clearTimeout(branchTimer));
  branchButton.addEventListener('mouseleave', leaveBranch);
  branchButton.addEventListener('click', () => {
    if (hoverBranch) {
      folded.add(hoverBranch);
      applyFolds();
    }
  });
}
