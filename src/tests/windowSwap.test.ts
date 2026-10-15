import { describe, expect, it } from 'vitest';
import { swapFrames } from '../workspace/WorkspaceStore';
import type { WidgetFrame } from '../types/widgets';

const win = (id: string, x: number, y: number, width = 400, height = 300): WidgetFrame => ({
  id, type: 'news', title: id, x, y, width, height, zIndex: 1, minimized: false, maximized: false, locked: false, visible: true, appearance: {}, settings: {},
});

describe('swap windows', () => {
  it('swaps position and size', () => {
    const out = swapFrames([win('w1', 0, 0, 800, 450), win('w4', 800, 450, 600, 400)], 'w4', 'w1', { w: 1600, h: 900 });
    expect(out.find((w) => w.id === 'w4')).toMatchObject({ x: 0, y: 0, width: 800, height: 450 });
    expect(out.find((w) => w.id === 'w1')).toMatchObject({ x: 800, y: 450, width: 600, height: 400 });
  });
});
