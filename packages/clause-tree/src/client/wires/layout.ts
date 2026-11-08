/**
 * 一次画线的上下文：画布、三层 SVG、可见方框的位置，以及已画的线段、竖线、标签（后画的线、标签据此避让）。
 */
import { $, $$, SVG } from '../dom.js';
import { D } from '../model.js';
import { type Point, type Seg, crosses, pathD, polyline } from './geometry.js';

/** 箭头长度。 */
const ARROW = 9;

export type BoxRect = { box: HTMLElement; left: number; right: number; top: number; bottom: number };

export class Layout {
  readonly canvas = $('#canvas');
  readonly svg = $<SVGSVGElement>('#wires');
  readonly tips = $<SVGSVGElement>('#tips');
  readonly hits = $<SVGSVGElement>('#hits');
  readonly base: DOMRect;
  readonly rtl = D.isOT;
  readonly allBoxes: HTMLElement[];
  readonly visible: BoxRect[];
  readonly showLogic: boolean;
  /** 已画线段（横、竖），候选位置按与它们的交叉数取最少；同一条主干上的重合不算交叉。 */
  readonly segs: Seg[] = [];
  /** 句法、逻辑的竖线，逻辑虚线不贴着它们走、标签不压在它们上面。 */
  readonly verticals: Array<{ x: number; top: number; bottom: number }> = [];
  /** 已放好的标签（中心与宽高）。 */
  readonly placed: Array<{ x: number; y: number; w: number; h: number }> = [];

  constructor() {
    $$('.ll', this.canvas).forEach((label) => label.remove());
    this.svg.innerHTML = '';
    this.base = this.canvas.getBoundingClientRect();
    this.tips.innerHTML = '';
    this.hits.innerHTML = '';
    // 先把三层缩成 0 再量画布：否则 scrollHeight 会把上一次的 SVG 尺寸算进去，收起分支、字体载入、窗口变宽后
    // SVG 只增不减，伸出画布底部，让 .scroller（overflow-x:auto 连带纵向也 auto）多出一条内层纵向滚动条
    const layers = [this.svg, this.tips, this.hits];
    for (const layer of layers) {
      layer.setAttribute('width', '0');
      layer.setAttribute('height', '0');
    }
    const [canvasWidth, canvasHeight] = [this.canvas.scrollWidth, this.canvas.scrollHeight];
    for (const layer of layers) {
      layer.setAttribute('width', String(canvasWidth));
      layer.setAttribute('height', String(canvasHeight));
    }
    this.allBoxes = $$('.box', this.canvas);
    this.showLogic = !this.canvas.classList.contains('hide-logic');
    this.visible = this.allBoxes.filter((box) => !box.hidden).map((box) => {
      const r = box.getBoundingClientRect();
      return { box, left: r.left - this.base.left, right: r.right - this.base.left, top: r.top - this.base.top, bottom: r.bottom - this.base.top };
    });
  }

  /** 起始边（新约左、旧约右）、尾边的横坐标。 */
  readonly start = (rect: DOMRect): number => {
    return (this.rtl ? rect.right : rect.left) - this.base.left;
  };

  readonly endOf = (rect: DOMRect): number => {
    return (this.rtl ? rect.left : rect.right) - this.base.left;
  };

  /** path 与已画线段的交叉数。 */
  readonly cost = (path: Seg[]): number => {
    return path.reduce((sum, seg) => sum + this.segs.filter((other) => crosses(seg, other)).length, 0);
  };

  /** points 与已画线段的交叉点。 */
  readonly crossings = (points: Point[]): Point[] => {
    return polyline(points).flatMap((seg) => this.segs.filter((other) => crosses(seg, other))
      .map((other): Point => (seg.x1 === seg.x2 ? [seg.x1, other.y1] : [other.x1, seg.y1])));
  };

  /** 与已画的竖线并排、又贴得太近（不到 10px，共用主干的除外）的竖段数。 */
  readonly crowded = (points: Point[]): number => {
    return polyline(points).filter((seg) => seg.x1 === seg.x2).reduce((sum, seg) => sum + this.segs.filter((other) => other.x1 === other.x2
      && Math.abs(other.x1 - seg.x1) >= 1 && Math.abs(other.x1 - seg.x1) < 10
      && Math.min(Math.max(seg.y1, seg.y2), Math.max(other.y1, other.y2)) > Math.max(Math.min(seg.y1, seg.y2), Math.min(other.y1, other.y2))).length, 0);
  };

  /** 竖线 x 从 y1 到 y2 是否穿过 skip 以外的方框。 */
  readonly blockedV = (x: number, y1: number, y2: number, skip: HTMLElement[]): boolean => {
    return this.visible.some((item) => !skip.includes(item.box)
      && x > item.left - 3 && x < item.right + 3 && Math.max(y1, y2) > item.top && Math.min(y1, y2) < item.bottom);
  };

  readonly overlapsLabel = (x: number, y: number, w: number, h: number): boolean => {
    return this.placed.some((other) => Math.abs(other.x - x) < (other.w + w) / 2 && Math.abs(other.y - y) < (other.h + h) / 2);
  };

  /** 连线的感应区（透明粗线），鼠标移上去可收起 branch 这一支。 */
  readonly hitArea = (points: Point[], branch: string): void => {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('class', 'hit');
    path.setAttribute('d', pathD(points));
    path.dataset.branch = branch;
    this.hits.append(path);
  };

  /**
   * 带箭头的线：线画在 layer，只画到箭头底边（线宽不会从箭头尖两侧露出来）；箭头是单独的三角形，
   * 一律画在最上层（#tips），不被方框边框盖住，各处大小一样。
   */
  readonly arrow = (layer: SVGSVGElement, points: Point[], cls = '', hops: Point[] = []): void => {
    const [tx, ty] = points.at(-1)!;
    const [px, py] = points.at(-2)!;
    const length = Math.hypot(tx - px, ty - py) || 1;
    const [dx, dy] = [(tx - px) / length, (ty - py) / length];
    const [bx, by] = [tx - dx * ARROW, ty - dy * ARROW];
    const line = document.createElementNS(SVG, 'path');
    if (cls) {
      line.setAttribute('class', cls);
    }
    line.setAttribute('d', pathD([...points.slice(0, -1), [bx, by]], hops));
    layer.append(line);
    const head = document.createElementNS(SVG, 'path');
    head.setAttribute('class', cls ? `${cls}-tip` : 'tip');
    head.setAttribute('d', `M${tx},${ty} L${bx - dy * 4.5},${by + dx * 4.5} L${bx + dy * 4.5},${by - dx * 4.5} z`);
    this.tips.append(head);
  };

  /** 一段不带箭头的线。 */
  readonly path = (layer: SVGSVGElement, d: string, cls = ''): SVGPathElement => {
    const path = document.createElementNS(SVG, 'path');
    if (cls) {
      path.setAttribute('class', cls);
    }
    path.setAttribute('d', d);
    layer.append(path);
    return path;
  };
}
