import { describe, expect, it } from 'vitest';
import { smartArrange } from '../workspace/smartArrange';
import { PACK_GAP } from '../workspace/packLayout';
import { APP_MAP, WIDGET_TYPES } from '../workspace/registry';
import { mulberry32 } from '../lib/seed';
import type { WidgetFrame, WidgetType } from '../types/widgets';

const win = (id: string, type: WidgetType, x = 0, y = 0, extra: Partial<WidgetFrame> = {}): WidgetFrame => ({
  id, type, title: id, x, y, width: 300, height: 300, zIndex: 1, minimized: false, maximized: false, locked: false, visible: true, appearance: {}, settings: {}, ...extra,
});

/**
 * Asserts the layout is gap-free: cards stay on the canvas, never overlap, respect minimum sizes, every
 * point of the occupied area is covered by a card (or the 10px gutter), and the screen height is filled.
 */
function expectGapFree(out: WidgetFrame[], canvas: { w: number; h: number }) {
  const cards = out.filter((w) => w.visible && !w.minimized && !w.maximized);
  const bottom = Math.max(...cards.map((c) => c.y + c.height));
  for (const c of cards) {
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.x + c.width).toBeLessThanOrEqual(canvas.w);
    expect(c.width).toBeGreaterThanOrEqual(Math.min(APP_MAP[c.type].minSize.w, canvas.w) - 1);
    expect(c.height).toBeGreaterThanOrEqual(APP_MAP[c.type].minSize.h - 1);
  }
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i], b = cards[j];
    const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
  }
  // Sample the occupied area: every point must be inside a card or within the gutter of one.
  const step = 7;
  for (let y = 1; y < bottom - 1; y += step) {
    for (let x = 1; x < canvas.w - 1; x += step) {
      const hit = cards.some((c) => x >= c.x - PACK_GAP && x <= c.x + c.width + PACK_GAP && y >= c.y - PACK_GAP && y <= c.y + c.height + PACK_GAP);
      expect(hit, `hole at ${x},${y}`).toBe(true);
    }
  }
  expect(bottom).toBeGreaterThanOrEqual(canvas.h - 1);
}

describe('smart arrange', () => {
  const canvas = { w: 1600, h: 820 };

  it('fills the screen with no gaps for a typical desk', () => {
    const ws = [win('c', 'chart-studio'), win('n', 'news', 10), win('w', 'watchlist', 20), win('a', 'ai-copilot', 30)];
    expectGapFree(smartArrange(ws, canvas), canvas);
  });

  it('a single card fills the whole screen', () => {
    const out = smartArrange([win('w', 'watchlist')], canvas);
    expect(out[0]).toMatchObject({ x: 0, y: 0, width: 1600, height: 820 });
  });

  it('fuzz: any mix of apps on any canvas is gap-free', () => {
    const rand = mulberry32(7);
    for (let t = 0; t < 400; t++) {
      const c = { w: 1100 + Math.floor(rand() * 1500), h: 500 + Math.floor(rand() * 700) };
      const n = 1 + Math.floor(rand() * 12);
      const ws = Array.from({ length: n }, (_, i) => win(`w${i}`, WIDGET_TYPES[Math.floor(rand() * WIDGET_TYPES.length)], Math.floor(rand() * 1500), Math.floor(rand() * 2000), rand() < 0.3 ? { prefW: 300 + Math.floor(rand() * 900), prefH: 250 + Math.floor(rand() * 500) } : {}));
      expectGapFree(smartArrange(ws, c), c);
    }
  });

  it('is stable: arranging an arranged layout changes nothing', () => {
    const ws = WIDGET_TYPES.slice(0, 7).map((t, i) => win(`w${i}`, t, i * 50, i * 40));
    const once = smartArrange(ws, canvas);
    expect(smartArrange(once, canvas)).toEqual(once);
  });

  it('keeps cards near their preferred size (no row of one tiny card stretched across the screen when avoidable)', () => {
    const ws = [win('c', 'chart-studio', 0, 0), win('s', 'screener', 1, 0), win('w', 'watchlist', 2, 0)];
    const out = smartArrange(ws, canvas);
    const w = out.find((x) => x.id === 'w')!;
    expect(w.width).toBeLessThan(800);
  });

  it('dragging the last card to the top-left makes it the first card', () => {
    const ws = smartArrange([win('a', 'news'), win('b', 'news', 1), win('c', 'news', 2), win('d', 'news', 3)], canvas);
    const d = ws.find((x) => x.id === 'd')!;
    const moved = ws.map((x) => (x.id === 'd' ? { ...x, x: 5, y: 5 } : x));
    const out = smartArrange(moved, canvas, { movingId: 'd', drop: { x: 5, y: 5, w: d.width, h: d.height } });
    expect(out.find((x) => x.id === 'd')).toMatchObject({ x: 0, y: 0 });
    expectGapFree(out, canvas);
  });

  it('a resized card keeps its new size as a preference', () => {
    const ws = [win('a', 'news'), win('b', 'news', 1, 0, { prefW: 1100 })];
    const out = smartArrange(ws, canvas);
    const a = out.find((x) => x.id === 'a')!;
    const b = out.find((x) => x.id === 'b')!;
    expect(b.width).toBeGreaterThan(a.width);
  });

  it('leaves minimised and maximised cards alone', () => {
    const ws = [win('a', 'news'), win('m', 'news', 0, 0, { minimized: true }), win('x', 'news', 0, 0, { maximized: true })];
    const out = smartArrange(ws, canvas);
    expect(out.find((w) => w.id === 'm')).toMatchObject({ x: 0, y: 0, width: 300 });
    expect(out.find((w) => w.id === 'a')).toMatchObject({ width: 1600, height: 820 });
  });
});
