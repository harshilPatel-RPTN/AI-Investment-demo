import type { WidgetFrame } from '../types/widgets';

/** Space kept between cards. */
export const PACK_GAP = 10;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const boxOf = (f: WidgetFrame): Box => ({ x: f.x, y: f.y, w: f.width, h: f.height });

/** True when two cards are closer than the gap (touching edges `gap` apart is fine). */
export function collides(a: Box, b: Box, gap = PACK_GAP): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

const overlapsX = (a: Box, b: Box, gap: number) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap;

/** Cards that take part in packing: visible, on the canvas, not minimised or maximised. */
const packs = (f: WidgetFrame) => f.visible && !f.minimized && !f.maximized;

export interface ResolveOptions {
  /** Card the user is dragging/resizing: it stays exactly where it is and the others move. */
  fixedId?: string;
  /** Also slide cards up into free space above them (gravity). Otherwise cards are only pushed down. */
  compact: boolean;
  gap?: number;
}

/**
 * Removes every overlap. Locked cards and the `fixedId` card are obstacles; the rest are taken in
 * reading order (top → bottom, left → right), pushed below anything they hit, and — with `compact` —
 * raised until they meet the card above. Sizes never change; x only changes to stay on the canvas.
 */
export function resolveLayout(windows: WidgetFrame[], canvasW: number, opts: ResolveOptions): WidgetFrame[] {
  const gap = opts.gap ?? PACK_GAP;
  const fitX = (b: Box): Box => ({ ...b, x: Math.max(0, Math.min(b.x, Math.max(0, canvasW - b.w))), y: Math.max(0, b.y) });
  const items = windows.filter(packs);
  if (!items.length) return windows;

  const placed: Box[] = [];
  const out = new Map<string, Box>();
  const settle = (b: Box, rise: boolean): Box => {
    let y = b.y;
    // Push down past anything in the way (each step moves strictly lower, so this ends).
    for (let guard = 0; guard < 500; guard++) {
      const hit = placed.find((p) => collides({ ...b, y }, p, gap));
      if (!hit) break;
      y = hit.y + hit.h + gap;
    }
    if (rise) {
      let top = 0;
      for (const p of placed) if (overlapsX(b, p, gap) && p.y + p.h + gap <= y) top = Math.max(top, p.y + p.h + gap);
      if (!placed.some((p) => collides({ ...b, y: top }, p, gap))) y = top;
    }
    return { ...b, y };
  };

  // Obstacles first: locked cards keep their spot; the fixed card only moves if it lands on a locked one.
  for (const f of items.filter((f) => f.locked && f.id !== opts.fixedId)) {
    const b = fitX(boxOf(f));
    placed.push(b);
    out.set(f.id, b);
  }
  const fixed = opts.fixedId ? items.find((f) => f.id === opts.fixedId) : undefined;
  if (fixed) {
    const b = settle(fitX(boxOf(fixed)), false);
    placed.push(b);
    out.set(fixed.id, b);
  }

  const rest = items
    .filter((f) => !out.has(f.id))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  for (const f of rest) {
    const b = settle(fitX(boxOf(f)), opts.compact);
    placed.push(b);
    out.set(f.id, b);
  }

  return windows.map((f) => {
    const b = out.get(f.id);
    if (!b) return f;
    const x = Math.round(b.x);
    const y = Math.round(b.y);
    return x === f.x && y === f.y ? f : { ...f, x, y };
  });
}

/** Commit-time layout: resolve around the moved card, then (when compacting) let everything settle. */
export function settleLayout(windows: WidgetFrame[], canvasW: number, compact: boolean, fixedId?: string): WidgetFrame[] {
  const first = resolveLayout(windows, canvasW, { fixedId, compact });
  return fixedId && compact ? resolveLayout(first, canvasW, { compact }) : first;
}

/** Top-most, then left-most free spot where a card of this size fits without touching any other. */
export function findFreeSpot(windows: WidgetFrame[], size: { w: number; h: number }, canvasW: number, gap = PACK_GAP): { x: number; y: number } {
  const others = windows.filter(packs).map(boxOf);
  const w = Math.min(size.w, canvasW);
  const xs = Array.from(new Set([0, ...others.map((o) => o.x + o.w + gap)])).filter((x) => x + w <= canvasW).sort((a, b) => a - b);
  const ys = Array.from(new Set([0, ...others.map((o) => o.y + o.h + gap)])).sort((a, b) => a - b);
  for (const y of ys) {
    for (const x of xs) {
      const b = { x, y, w, h: size.h };
      if (!others.some((o) => collides(b, o, gap))) return { x, y };
    }
  }
  return { x: 0, y: others.reduce((m, o) => Math.max(m, o.y + o.h + gap), 0) };
}

/** True when no two packed cards overlap. */
export function hasOverlap(windows: WidgetFrame[], gap = 0): boolean {
  const list = windows.filter(packs).map(boxOf);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (collides(list[i], list[j], gap)) return true;
  return false;
}
