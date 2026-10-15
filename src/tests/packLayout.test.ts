import { describe, expect, it } from 'vitest';
import { collides, findFreeSpot, hasOverlap, PACK_GAP, resolveLayout, settleLayout } from '../workspace/packLayout';
import { mulberry32 } from '../lib/seed';
import type { WidgetFrame } from '../types/widgets';

const win = (id: string, x: number, y: number, width = 400, height = 300, extra: Partial<WidgetFrame> = {}): WidgetFrame => ({
  id, type: 'news', title: id, x, y, width, height, zIndex: 1, minimized: false, maximized: false, locked: false, visible: true, appearance: {}, settings: {}, ...extra,
});
const W = 1600;
const at = (ws: WidgetFrame[], id: string) => ws.find((w) => w.id === id)!;
/** No two packed cards closer than the gap. */
const clean = (ws: WidgetFrame[]) => {
  const list = ws.filter((w) => w.visible && !w.minimized && !w.maximized);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = { x: list[i].x, y: list[i].y, w: list[i].width, h: list[i].height };
    const b = { x: list[j].x, y: list[j].y, w: list[j].width, h: list[j].height };
    if (collides(a, b, PACK_GAP - 0.5)) return false;
  }
  return true;
};

describe('pack layout', () => {
  it('pushes a card out from under the one being dragged and keeps sizes', () => {
    const ws = [win('a', 0, 0), win('b', 410, 0, 500, 260)];
    const out = resolveLayout(ws.map((w) => (w.id === 'b' ? { ...w, x: 100, y: 50 } : w)), W, { fixedId: 'b', compact: false });
    expect(at(out, 'b')).toMatchObject({ x: 100, y: 50, width: 500, height: 260 });
    expect(at(out, 'a').y).toBeGreaterThanOrEqual(50 + 260 + PACK_GAP);
    expect(at(out, 'a')).toMatchObject({ width: 400, height: 300 });
    expect(hasOverlap(out)).toBe(false);
  });

  it('dropping card 4 onto card 1 moves card 1 out of the way (2×2 grid)', () => {
    const grid = [win('w1', 0, 0), win('w2', 410, 0), win('w3', 0, 310), win('w4', 410, 310)];
    const dropped = grid.map((w) => (w.id === 'w4' ? { ...w, x: 0, y: 0 } : w));
    const out = settleLayout(dropped, W, true, 'w4');
    expect(at(out, 'w4')).toMatchObject({ x: 0, y: 0 });
    expect(clean(out)).toBe(true);
  });

  it('compacts cards upward into free space only when asked', () => {
    const ws = [win('a', 0, 0, 400, 200), win('b', 0, 600, 400, 200)];
    expect(at(resolveLayout(ws, W, { compact: true }), 'b').y).toBe(200 + PACK_GAP);
    expect(at(resolveLayout(ws, W, { compact: false }), 'b').y).toBe(600);
  });

  it('never moves locked cards; the dragged card is pushed off them instead', () => {
    const ws = [win('lock', 0, 0, 400, 300, { locked: true }), win('m', 0, 0)];
    const out = resolveLayout(ws, W, { fixedId: 'm', compact: true });
    expect(at(out, 'lock')).toMatchObject({ x: 0, y: 0 });
    expect(at(out, 'm').y).toBe(300 + PACK_GAP);
  });

  it('ignores minimised and maximised cards and keeps cards on the canvas', () => {
    const ws = [win('a', 0, 0), win('min', 0, 0, 400, 300, { minimized: true }), win('wide', 1500, 0, 400, 300)];
    const out = resolveLayout(ws, W, { compact: true });
    expect(at(out, 'min')).toMatchObject({ x: 0, y: 0 });
    expect(at(out, 'wide').x + at(out, 'wide').width).toBeLessThanOrEqual(W);
    expect(clean(out)).toBe(true);
  });

  it('finds the first free spot for a new card', () => {
    const ws = [win('a', 0, 0, 800, 400)];
    expect(findFreeSpot(ws, { w: 600, h: 300 }, W)).toEqual({ x: 800 + PACK_GAP, y: 0 });
    expect(findFreeSpot(ws, { w: 900, h: 300 }, W)).toEqual({ x: 0, y: 400 + PACK_GAP });
  });

  it('fuzz: thousands of random drags and resizes never leave an overlap', () => {
    const rand = mulberry32(42);
    let ws = Array.from({ length: 7 }, (_, i) => win(`w${i}`, Math.floor(rand() * 1200), Math.floor(rand() * 900), 260 + Math.floor(rand() * 500), 200 + Math.floor(rand() * 400)));
    ws = settleLayout(ws, W, true);
    expect(clean(ws)).toBe(true);
    for (let step = 0; step < 3000; step++) {
      const i = Math.floor(rand() * ws.length);
      const id = ws[i].id;
      const resize = rand() < 0.3;
      const moved = ws.map((w) => (w.id !== id ? w : resize
        ? { ...w, width: 260 + Math.floor(rand() * 700), height: 200 + Math.floor(rand() * 500) }
        : { ...w, x: Math.floor(rand() * W), y: Math.floor(rand() * 1500) }));
      const compact = rand() < 0.7;
      // Live preview and committed layout must both be overlap-free.
      expect(clean(resolveLayout(moved, W, { fixedId: id, compact }))).toBe(true);
      ws = settleLayout(moved, W, compact, id);
      expect(clean(ws)).toBe(true);
      for (const w of ws) expect(w.x + w.width).toBeLessThanOrEqual(W);
    }
  });
});
