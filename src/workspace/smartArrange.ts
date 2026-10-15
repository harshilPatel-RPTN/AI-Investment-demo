import type { WidgetFrame } from '../types/widgets';
import { APP_MAP } from './registry';
import { PACK_GAP, settleLayout } from './packLayout';

/**
 * Smart arrange: a gap-free "justified rows" layout.
 *
 * Cards are taken in reading order and split into rows by dynamic programming so every card stays
 * as close as possible to its preferred size. Each row is then stretched to the exact canvas width
 * and all cards in a row share one height, so there is no empty space between, beside or after
 * cards. Row heights are finally scaled to fill the viewport height (or the page scrolls when the
 * cards genuinely need more room than the screen has).
 */

export interface Canvas {
  w: number;
  h: number;
}

export interface Slot {
  x: number;
  y: number;
  width: number;
  height: number;
}

const packs = (f: WidgetFrame) => f.visible && !f.minimized && !f.maximized;

/** The size a card would like: the user's own resize, otherwise the app's designed default. */
export function preferredSize(f: WidgetFrame): { w: number; h: number } {
  const meta = APP_MAP[f.type];
  return { w: f.prefW ?? meta?.defaultSize.w ?? f.width, h: f.prefH ?? meta?.defaultSize.h ?? f.height };
}

const minSize = (f: WidgetFrame) => APP_MAP[f.type]?.minSize ?? { w: 260, h: 200 };

interface Item {
  id: string;
  pw: number;
  ph: number;
  mw: number;
  mh: number;
  /** Compact cards (e.g. Market Summary) keep their height instead of stretching to fill the screen. */
  rigid: boolean;
}

/** A column in a row: one card, or two cards stacked (e.g. watchlist above events beside a big chart). */
interface Col {
  items: Item[];
  pw: number;
  ph: number;
  mw: number;
  mh: number;
  rigid: boolean;
}

const single = (it: Item): Col => ({ items: [it], pw: it.pw, ph: it.ph, mw: it.mw, mh: it.mh, rigid: it.rigid });
const stack = (a: Item, b: Item, gap: number): Col => ({ items: [a, b], pw: Math.max(a.pw, b.pw), ph: a.ph + b.ph + gap, mw: Math.max(a.mw, b.mw), mh: a.mh + b.mh + gap, rigid: false });

/** Fits a row's widths into `avail`: proportional to preference, but never below a column's minimum. */
function rowWidths(cols: Col[], avail: number): number[] | null {
  if (cols.reduce((s, c) => s + c.mw, 0) > avail + 0.5) return null;
  const fixed = new Map<number, number>();
  for (let guard = 0; guard <= cols.length; guard++) {
    const free = cols.map((_, k) => k).filter((k) => !fixed.has(k));
    const rest = avail - [...fixed.values()].reduce((s, v) => s + v, 0);
    const sum = free.reduce((s, k) => s + cols[k].pw, 0);
    const scale = sum > 0 ? rest / sum : 1;
    let changed = false;
    for (const k of free) {
      if (cols[k].pw * scale < cols[k].mw) {
        fixed.set(k, cols[k].mw);
        changed = true;
      }
    }
    if (!changed) return cols.map((c, k) => fixed.get(k) ?? c.pw * scale);
  }
  return null;
}

const sq = (v: number) => v * v;

/** Heights of the cards in a column of total height `h`: split by preference, respecting minimums. */
function stackHeights(col: Col, h: number, gap: number): number[] {
  if (col.items.length === 1) return [h];
  const [a, b] = col.items;
  const inner = h - gap;
  const ha = Math.max(a.mh, Math.min(inner - b.mh, (inner * a.ph) / (a.ph + b.ph)));
  return [ha, inner - ha];
}

/** How much a row distorts its cards from their preferred sizes (0 = perfect). */
function rowCost(cols: Col[], widths: number[], h: number, gap: number): number {
  let c = 0;
  cols.forEach((col, k) => {
    const hs = stackHeights(col, h, gap);
    col.items.forEach((it, j) => {
      c += sq(Math.log(widths[k] / it.pw));
      c += (it.rigid ? 3 : 0.6) * sq(Math.log(hs[j] / it.ph));
    });
    if (col.items.length > 1) c += 0.15; // stacking is a small structural cost
  });
  return c;
}

function rowHeight(cols: Col[]): number {
  // A shared height: the average preference, but never below any column's minimum.
  const avg = cols.reduce((s, c) => s + c.ph, 0) / cols.length;
  return Math.max(avg, ...cols.map((c) => c.mh));
}

const rowMin = (cols: Col[]) => Math.max(...cols.map((c) => c.mh));
const rowRigid = (cols: Col[]) => cols.every((c) => c.rigid);

/** Pure layout for cards in this order. */
export function justify(cards: WidgetFrame[], canvas: Canvas, gap = PACK_GAP): Map<string, Slot> {
  const W = Math.max(1, canvas.w);
  const items: Item[] = cards.map((f) => {
    const p = preferredSize(f);
    const m = minSize(f);
    const mw = Math.min(m.w, W);
    return { id: f.id, pw: Math.max(mw, Math.min(p.w, W)), ph: Math.max(m.h, p.h), mw, mh: m.h, rigid: !!APP_MAP[f.type]?.fixedHeight };
  });
  const n = items.length;
  const out = new Map<string, Slot>();
  if (!n) return out;

  // Best way to lay out each possible row [start, end): plain, or with its last two cards stacked.
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(n + 1).fill(Infinity));
  const shape: Col[][][] = Array.from({ length: n + 1 }, () => new Array<Col[]>(n + 1));
  for (let start = 0; start < n; start++) {
    for (let end = start + 1; end <= n; end++) {
      const row = items.slice(start, end);
      const options: Col[][] = [row.map(single)];
      if (row.length >= 3) options.push([...row.slice(0, -2).map(single), stack(row[row.length - 2], row[row.length - 1], gap)]);
      let feasible = false;
      for (const cols of options) {
        const widths = rowWidths(cols, W - gap * (cols.length - 1));
        if (!widths) continue;
        feasible = true;
        const c = rowCost(cols, widths, rowHeight(cols), gap);
        if (c < cost[start][end]) {
          cost[start][end] = c;
          shape[start][end] = cols;
        }
      }
      if (!feasible && end - start > 3) break; // more cards only make the row tighter
    }
    // A card can always have a row of its own.
    if (cost[start][start + 1] === Infinity) {
      cost[start][start + 1] = 1;
      shape[start][start + 1] = [single(items[start])];
    }
  }

  // dp[r][end] = cheapest split of items[0..end) into exactly r rows.
  const maxRows = n;
  const dp: number[][] = Array.from({ length: maxRows + 1 }, () => new Array<number>(n + 1).fill(Infinity));
  const back: number[][] = Array.from({ length: maxRows + 1 }, () => new Array<number>(n + 1).fill(-1));
  dp[0][0] = 0;
  for (let r = 1; r <= maxRows; r++) {
    for (let end = r; end <= n; end++) {
      for (let start = r - 1; start < end; start++) {
        const c = dp[r - 1][start] + cost[start][end];
        if (c < dp[r][end]) {
          dp[r][end] = c;
          back[r][end] = start;
        }
      }
    }
  }

  const itemPenalty = (rows: Col[][], hs: number[]) =>
    rows.reduce((acc, cols, k) => acc + cols.reduce((q, col) => {
      const parts = stackHeights(col, hs[k], gap);
      return q + col.items.reduce((z, it, j) => z + (it.rigid ? 3 : 0.6) * sq(Math.log(parts[j] / it.ph)), 0);
    }, 0), 0);

  /**
   * Fits one split to the viewport. Flexible rows grow to fill the screen exactly (compact rows such as
   * the market strip keep their height); when cards need more room than the screen has they shrink only
   * to their minimum heights and the page scrolls. Returns the heights and the distortion this caused.
   */
  const viewFit = (rows: Col[][]) => {
    const base = rows.map(rowHeight);
    const mins = rows.map(rowMin);
    const viewH = Math.max(1, canvas.h - gap * (rows.length - 1));
    const total = base.reduce((acc, h) => acc + h, 0);
    const before = itemPenalty(rows, base);
    if (total <= viewH) {
      const flex = rows.map((r) => !rowRigid(r));
      const flexSum = base.reduce((acc, h, k) => acc + (flex[k] ? h : 0), 0);
      const hs = flexSum > 0 ? base.map((h, k) => (flex[k] ? h * ((viewH - total + flexSum) / flexSum) : h)) : base.map((h) => (h * viewH) / total);
      return { heights: hs, penalty: itemPenalty(rows, hs) - before };
    }
    const minSum = mins.reduce((acc, m) => acc + m, 0);
    if (minSum >= viewH) return { heights: mins, penalty: itemPenalty(rows, mins) - before + 3 * n * sq(Math.log(minSum / viewH)) };
    // Shrink proportionally, but never below a row's minimum (water-filling).
    const fixed = new Map<number, number>();
    let f = 1;
    for (let guard = 0; guard <= rows.length; guard++) {
      const free = base.map((_, k) => k).filter((k) => !fixed.has(k));
      const rest = viewH - [...fixed.values()].reduce((acc, v) => acc + v, 0);
      const sum = free.reduce((acc, k) => acc + base[k], 0);
      f = rest / sum;
      let changed = false;
      for (const k of free) if (base[k] * f < mins[k]) { fixed.set(k, mins[k]); changed = true; }
      if (!changed) break;
    }
    const hs = base.map((h, k) => fixed.get(k) ?? h * f);
    return { heights: hs, penalty: itemPenalty(rows, hs) - before };
  };

  // Pick the number of rows whose layout, once fitted to the screen, distorts cards the least.
  let rows: Col[][] = [];
  let heights: number[] = [];
  let bestTotal = Infinity;
  for (let r = 1; r <= maxRows; r++) {
    if (dp[r][n] === Infinity) continue;
    const split: Col[][] = [];
    for (let end = n, k = r; k > 0; k--) {
      const start = back[k][end];
      split.unshift(shape[start][end]);
      end = start;
    }
    const fit = viewFit(split);
    const total = dp[r][n] + fit.penalty + 0.05 * r;
    if (total < bestTotal) {
      bestTotal = total;
      rows = split;
      heights = fit.heights;
    }
  }

  let y = 0;
  rows.forEach((cols, r) => {
    const widths = rowWidths(cols, W - gap * (cols.length - 1)) ?? cols.map((c) => Math.min(c.pw, W));
    const top = Math.round(y);
    const bottom = Math.round(y + heights[r]);
    let x = 0;
    cols.forEach((col, k) => {
      const left = Math.round(x);
      const right = k === cols.length - 1 ? W : Math.round(x + widths[k]);
      const width = Math.max(1, right - left);
      if (col.items.length === 1) out.set(col.items[0].id, { x: left, y: top, width, height: Math.max(1, bottom - top) });
      else {
        const [ha] = stackHeights(col, bottom - top, gap);
        const mid = top + Math.round(ha);
        out.set(col.items[0].id, { x: left, y: top, width, height: Math.max(1, mid - top) });
        out.set(col.items[1].id, { x: left, y: mid + gap, width, height: Math.max(1, bottom - mid - gap) });
      }
      x += widths[k] + gap;
    });
    y += heights[r] + gap;
  });
  return out;
}

const readingOrder = (a: WidgetFrame, b: WidgetFrame) => a.y - b.y || a.x - b.x;

export interface SmartOptions {
  /** Card being dragged: it is re-inserted at the position nearest to `drop`. */
  movingId?: string;
  drop?: { x: number; y: number; w: number; h: number };
}

/**
 * Lays out every packed card with `justify`. With `movingId`, tries every insertion point for that
 * card and keeps the one whose slot centre is closest to where the user dropped it.
 */
export function smartArrange(windows: WidgetFrame[], canvas: Canvas, opts: SmartOptions = {}, gap = PACK_GAP): WidgetFrame[] {
  const cards = windows.filter(packs).sort(readingOrder);
  if (!cards.length) return windows;
  let slots: Map<string, Slot>;
  const moving = opts.movingId ? cards.find((c) => c.id === opts.movingId) : undefined;
  if (moving && opts.drop) {
    const others = cards.filter((c) => c.id !== moving.id);
    const cx = opts.drop.x + opts.drop.w / 2;
    const cy = opts.drop.y + opts.drop.h / 2;
    let bestD = Infinity;
    slots = new Map();
    for (let i = 0; i <= others.length; i++) {
      const order = [...others.slice(0, i), moving, ...others.slice(i)];
      const s = justify(order, canvas, gap);
      const m = s.get(moving.id)!;
      // Distance to the slot itself (0 when the drop point is inside it), then to its centre.
      const dx = Math.max(m.x - cx, 0, cx - (m.x + m.width));
      const dy = Math.max(m.y - cy, 0, cy - (m.y + m.height));
      const d = Math.hypot(dx, dy) * 4 + Math.hypot(m.x + m.width / 2 - cx, m.y + m.height / 2 - cy);
      if (d < bestD) {
        bestD = d;
        slots = s;
      }
    }
  } else slots = justify(cards, canvas, gap);

  return windows.map((f) => {
    const s = slots.get(f.id);
    if (!s) return f;
    if (s.x === f.x && s.y === f.y && s.width === f.width && s.height === f.height && !f.dockSide) return f;
    return { ...f, ...s, dockSide: null };
  });
}

/** The one entry point the store uses: smart (gap-free) when auto-arrange is on, free placement otherwise. */
export function arrangeCards(windows: WidgetFrame[], canvas: Canvas, autoArrange: boolean, movingId?: string): WidgetFrame[] {
  if (!autoArrange) return settleLayout(windows, canvas.w, false, movingId);
  const m = movingId ? windows.find((w) => w.id === movingId) : undefined;
  return smartArrange(windows, canvas, m ? { movingId, drop: { x: m.x, y: m.y, w: m.width, h: m.height } } : {});
}
