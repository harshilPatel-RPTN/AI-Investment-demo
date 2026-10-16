import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { z } from 'zod';
import type { WidgetAppearance, WidgetFrame, WidgetType, Workspace } from '../types/widgets';
import { APP_MAP } from './registry';
import { WORKSPACE_PRESETS, type PresetWindow, type WorkspacePreset } from '../data/workspaces';
import { CURRENT_SCREEN, onScreen, screenOf, SCREEN_IDS, workspaceScreens } from './screen';
import { safeStorage, STORAGE_KEYS, recoveredKeys } from '../lib/persistence';
import { uid } from '../lib/formatting';
import { LAYOUT_SCHEMA_VERSION, parseLayoutFile, workspaceSchema } from './layoutSchema';
import { findFreeSpot } from './packLayout';
import { arrangeCards } from './smartArrange';

export type LayoutMode = 'freeform' | 'grid' | 'two-column' | 'quad' | 'chart' | 'ai' | 'news' | 'risk';
export const LAYOUT_MODES: Array<{ id: LayoutMode; label: string }> = [
  { id: 'freeform', label: 'Freeform (cascade)' },
  { id: 'grid', label: 'Grid / tiled' },
  { id: 'two-column', label: 'Two-column research' },
  { id: 'quad', label: 'Four quadrants' },
  { id: 'chart', label: 'Chart-focused' },
  { id: 'ai', label: 'AI-focused' },
  { id: 'news', label: 'News & events' },
  { id: 'risk', label: 'Risk / portfolio' },
];

const GAP = 10;
const HISTORY_LIMIT = 60;

interface Canvas {
  w: number;
  h: number;
}

interface WorkspaceState {
  workspaces: Workspace[];
  activeId: string;
  snapToGrid: boolean;
  /** Re-tile windows automatically when windows are added, closed, minimised or restored. */
  autoArrange: boolean;
  showGuides: boolean;
  // session
  canvas: Canvas;
  past: WidgetFrame[][];
  future: WidgetFrame[][];
  focusedId: string | null;
  lastSavedAt: string | null;
}

interface WorkspaceActions {
  active: () => Workspace;
  setCanvas: (c: Canvas) => void;
  openApp: (type: WidgetType, opts?: { forceNew?: boolean; settings?: Record<string, unknown>; title?: string }) => string;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  /** Drop `id` onto `targetId`: the two windows trade places and sizes (one undo step). */
  swapWindows: (id: string, targetId: string) => void;
  /** Bulk window actions for this screen (each is one undo step; locked windows are left alone). */
  closeAllWindows: () => void;
  minimizeAllWindows: () => void;
  restoreAllWindows: () => void;
  resizeWindow: (id: string, x: number, y: number, w: number, h: number) => void;
  toggleMinimize: (id: string) => void;
  toggleMaximize: (id: string) => void;
  toggleLock: (id: string) => void;
  duplicateWindow: (id: string) => void;
  renameWindow: (id: string, title: string) => void;
  setWindowAppearance: (id: string, a: Partial<WidgetAppearance>, opts?: { replace?: boolean; history?: boolean }) => void;
  resetWindowAppearance: (id: string) => void;
  updateSettings: (id: string, s: Record<string, unknown>) => void;
  applyLayout: (mode: LayoutMode) => void;
  dockWindow: (id: string, side: 'left' | 'right' | 'top' | 'bottom') => void;
  undo: () => void;
  redo: () => void;
  switchWorkspace: (id: string) => void;
  openPreset: (presetId: string) => string;
  resetWorkspace: () => void;
  saveAs: (name: string) => string;
  renameWorkspace: (id: string, name: string) => void;
  deleteWorkspace: (id: string) => boolean;
  duplicateWorkspace: (id: string) => string;
  exportWorkspace: (id?: string) => string;
  importWorkspace: (text: string) => { ok: true; name: string } | { ok: false; error: string };
  markSaved: () => void;
  toggleSnap: () => void;
  toggleAutoArrange: () => void;
  toggleGuides: () => void;
  /** Multi-monitor: send a window to another screen (browser window). */
  moveToScreen: (id: string, screen: string) => void;
  /** Adds the next free screen to the active workspace; returns its id (null when all six are used). */
  addScreen: () => string | null;
  /** Removes a screen; its windows move back to the main screen. */
  removeScreen: (screen: string) => void;
  /** Creates (or rebuilds) a personal desk with exactly these apps, auto-arranged, and switches to it. */
  createDesk: (id: string, name: string, types: WidgetType[]) => void;
}

function fallbackCanvas(): Canvas {
  if (typeof window === 'undefined') return { w: 1280, h: 680 };
  return { w: Math.max(600, window.innerWidth - 70), h: Math.max(400, window.innerHeight - 130) };
}

/** Rows shorter than this get the preferred height instead, and the canvas scrolls vertically. */
export const ROW_FIT_MIN = 380;
export const ROW_PREF = 440;
/** Columns are never narrower than this; extra windows wrap to new rows. */
export const COL_MIN_W = 460;
const MAX_Y = 20000;

/** Height a row band gets: fit the viewport when rows are tall enough, otherwise scroll. */
function rowHeight(viewH: number, rows: number) {
  if (rows <= 1) return viewH;
  return viewH / rows >= ROW_FIT_MIN ? viewH / rows : ROW_PREF;
}

/** Exchanges the position and size of two windows (drag one onto another to swap their slots). */
export function swapFrames(windows: WidgetFrame[], aId: string, bId: string, c: Canvas): WidgetFrame[] {
  const a = windows.find((w) => w.id === aId);
  const b = windows.find((w) => w.id === bId);
  if (!a || !b) return windows;
  const slot = (f: WidgetFrame) => ({ x: f.x, y: f.y, width: f.width, height: f.height, dockSide: null });
  return windows.map((w) => (w.id === aId ? clampFrame({ ...w, ...slot(b) }, c) : w.id === bId ? clampFrame({ ...w, ...slot(a) }, c) : w));
}

/** The canvas scrolls vertically: x is clamped to the viewport width, y only to ≥ 0. */
export function clampFrame(f: WidgetFrame, c: Canvas): WidgetFrame {
  const min = APP_MAP[f.type]?.minSize ?? { w: 260, h: 200 };
  const width = Math.round(Math.max(min.w, Math.min(f.width, c.w)));
  const height = Math.round(Math.max(min.h, Math.min(f.height, c.h)));
  const x = Math.round(Math.max(0, Math.min(f.x, c.w - Math.min(width, c.w))));
  const y = Math.round(Math.max(0, Math.min(f.y, MAX_Y)));
  if (x === f.x && y === f.y && width === f.width && height === f.height) return f;
  return { ...f, x, y, width, height };
}

function makeFrame(type: WidgetType, rect: { x: number; y: number; w: number; h: number }, z: number, extra?: Partial<WidgetFrame>): WidgetFrame {
  const meta = APP_MAP[type];
  return {
    id: uid('w'),
    type,
    title: meta.title,
    x: rect.x,
    y: rect.y,
    width: rect.w,
    height: rect.h,
    zIndex: z,
    minimized: false,
    maximized: false,
    locked: false,
    visible: true,
    dockSide: null,
    appearance: {},
    settings: {},
    ...extra,
  };
}

/**
 * Maps a preset's fractional y (0..1) to pixels. Each horizontal band between window edges keeps its
 * share of the viewport, but no band is shorter than ROW_PREF when that share would be cramped —
 * the workspace then scrolls instead of squeezing windows.
 */
function presetYMapper(windows: PresetWindow[], viewH: number) {
  const edges = Array.from(new Set([0, 1, ...windows.flatMap((w) => [w.y, Math.min(1, w.y + w.h)])])).sort((a, b) => a - b);
  const bands = edges.slice(1).map((e, i) => e - edges[i]).filter((d) => d > 0.001);
  const cramped = bands.some((d) => d * viewH < ROW_FIT_MIN);
  const px = bands.map((d) => (cramped ? Math.max(d * viewH, ROW_PREF) : d * viewH));
  const starts = [0];
  px.forEach((h, i) => starts.push(starts[i] + h));
  const cut = edges.filter((_, i) => i === 0 || edges[i] - edges[i - 1] > 0.001);
  return (fy: number) => {
    for (let i = 0; i < px.length; i++) {
      if (fy <= cut[i + 1] + 1e-9) return starts[i] + ((fy - cut[i]) / (cut[i + 1] - cut[i])) * px[i];
    }
    return starts[starts.length - 1];
  };
}

export function instantiatePreset(p: WorkspacePreset, viewport: Canvas): Workspace {
  const c = viewport;
  const mappers = new Map<string, ReturnType<typeof presetYMapper>>();
  for (const scr of new Set(p.windows.map((w) => w.screen ?? 'main'))) mappers.set(scr, presetYMapper(p.windows.filter((w) => (w.screen ?? 'main') === scr), c.h));
  const windows = p.windows.map((pw, i) => {
    const Y = mappers.get(pw.screen ?? 'main')!;
    const top = Y(pw.y);
    const bottom = Y(Math.min(1, pw.y + pw.h));
    return makeFrame(
      pw.type,
      {
        x: Math.round(pw.x * c.w + (pw.x > 0 ? GAP / 2 : GAP)),
        y: Math.round(top + (pw.y > 0 ? GAP / 2 : GAP)),
        w: Math.round(pw.w * c.w - GAP * 1.5),
        h: Math.round(bottom - top - GAP * 1.5),
      },
      i + 1,
      { settings: { ...(pw.settings ?? {}) }, title: pw.title ?? APP_MAP[pw.type].title, ...(pw.screen ? { screenId: pw.screen } : {}) },
    );
  }).map((f) => clampFrame(f, { w: c.w, h: Math.max(c.h, f.height) })).map((f, i) => ({
    // Preferences come from the preset's own proportions of this screen (not the band-inflated pixels above).
    ...f,
    prefW: Math.round(p.windows[i].w * c.w),
    prefH: APP_MAP[f.type].fixedHeight ? APP_MAP[f.type].defaultSize.h : Math.round(p.windows[i].h * c.h),
  }));
  const screens = Array.from(new Set(p.windows.map((w) => w.screen).filter((x): x is NonNullable<typeof x> => !!x)));
  // Every screen is laid out on this viewport; record it so each screen rescales to its own monitor on first open.
  const screenCanvas = Object.fromEntries(['main', ...screens].map((id) => [id, viewport]));
  return { id: `preset:${p.id}`, name: p.name, presetId: p.id, canvas: viewport, screenCanvas, ...(screens.length ? { screens } : {}), windows, updatedAt: new Date().toISOString() };
}

function maxZ(ws: WidgetFrame[]) {
  return ws.reduce((m, w) => Math.max(m, w.zIndex), 0);
}

function normaliseZ(ws: WidgetFrame[]): WidgetFrame[] {
  // Keep z-indexes compact so they never grow without bound.
  const order = [...ws].sort((a, b) => a.zIndex - b.zIndex).map((w) => w.id);
  return ws.map((w) => ({ ...w, zIndex: order.indexOf(w.id) + 1 }));
}

/** Pure layout functions — positions every visible, non-minimised window for a mode. */
export function layoutWindows(windows: WidgetFrame[], mode: LayoutMode, c: Canvas): WidgetFrame[] {
  const targets = windows.filter((w) => w.visible && !w.minimized);
  if (!targets.length) return windows;
  const rects = new Map<string, { x: number; y: number; w: number; h: number }>();
  const cell = (x: number, y: number, w: number, h: number) => ({ x: x + GAP / 2, y: y + GAP / 2, w: w - GAP, h: h - GAP });
  const stack = (list: WidgetFrame[], x: number, y: number, w: number, h: number) => {
    const each = rowHeight(h, list.length);
    list.forEach((f, i) => rects.set(f.id, cell(x, y + i * each, w, each)));
  };
  const gridIn = (list: WidgetFrame[], x: number, y: number, w: number, h: number) => {
    // On wide canvases put up to 3 windows side by side; otherwise a near-square grid.
    const ideal = list.length <= 3 && w / h > 1.3 ? list.length : Math.ceil(Math.sqrt(list.length));
    const cols = Math.max(1, Math.min(ideal, Math.floor(w / COL_MIN_W)));
    const rows = Math.ceil(list.length / cols);
    const rh = rowHeight(h, rows);
    list.forEach((f, i) => {
      const r = Math.floor(i / cols);
      const inRow = r === rows - 1 ? list.length - r * cols : cols;
      const cw = w / inRow;
      rects.set(f.id, cell(x + (i % cols) * cw, y + r * rh, cw, rh));
    });
  };
  const focusTypes: Partial<Record<LayoutMode, WidgetType[]>> = {
    chart: ['chart-studio'],
    ai: ['ai-copilot', 'report', 'evidence'],
    news: ['news', 'calendar'],
    risk: ['risk-lab', 'portfolio', 'scenarios', 'backtest'],
  };
  switch (mode) {
    case 'freeform':
      targets.forEach((f, i) => {
        const w = Math.min(f.width, c.w * 0.6);
        const h = Math.min(f.height, c.h * 0.7);
        rects.set(f.id, { x: 24 + (i * 34) % Math.max(34, c.w - w - 24), y: 18 + (i * 30) % Math.max(30, c.h - h - 18), w, h });
      });
      break;
    case 'grid':
      gridIn(targets, 0, 0, c.w, c.h);
      break;
    case 'two-column': {
      const half = Math.ceil(targets.length / 2);
      stack(targets.slice(0, half), 0, 0, c.w / 2, c.h);
      if (targets.length > half) stack(targets.slice(half), c.w / 2, 0, c.w / 2, c.h);
      else rects.set(targets[0].id, cell(0, 0, c.w, c.h));
      break;
    }
    case 'quad': {
      const four = targets.slice(0, 4);
      const pos = [[0, 0], [1, 0], [0, 1], [1, 1]];
      if (four.length === 1) rects.set(four[0].id, cell(0, 0, c.w, c.h));
      else four.forEach((f, i) => rects.set(f.id, cell((pos[i][0] * c.w) / 2, (pos[i][1] * c.h) / 2, four.length === 3 && i === 2 ? c.w : c.w / 2, c.h / 2)));
      targets.slice(4).forEach((f, i) => rects.set(f.id, { x: 40 + i * 30, y: 40 + i * 30, w: Math.min(f.width, c.w / 2), h: Math.min(f.height, c.h / 2) }));
      break;
    }
    default: {
      const types = focusTypes[mode] ?? [];
      const primary = targets.filter((t) => types.includes(t.type));
      const rest = targets.filter((t) => !types.includes(t.type));
      if (!primary.length || !rest.length) {
        gridIn(targets, 0, 0, c.w, c.h);
        break;
      }
      const mainW = c.w * 0.64;
      stack(primary, 0, 0, mainW, c.h);
      stack(rest, mainW, 0, c.w - mainW, c.h);
    }
  }
  return windows.map((f) => {
    const r = rects.get(f.id);
    if (!r) return f;
    return clampFrame({ ...f, x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.w), height: Math.round(r.h), maximized: false, dockSide: null }, c);
  });
}

/**
 * Tiles every visible, unlocked, non-minimised window into a non-overlapping grid.
 * Existing windows keep their reading order (top-to-bottom, left-to-right); `lastId` goes at the end.
 */
export function autoTile(windows: WidgetFrame[], c: Canvas, lastId?: string): WidgetFrame[] {
  const movable = windows.filter((w) => w.visible && !w.minimized && !w.locked);
  if (!movable.length) return windows;
  const rowOf = (w: WidgetFrame) => Math.round(w.y / Math.max(1, c.h / 6));
  const ordered = [...movable].sort((a, b) => {
    if (a.id === lastId) return 1;
    if (b.id === lastId) return -1;
    return rowOf(a) - rowOf(b) || a.x - b.x;
  });
  const tiled = new Map(layoutWindows(ordered, 'grid', c).map((f) => [f.id, f]));
  return windows.map((w) => tiled.get(w.id) ?? w);
}

// First-time visitors land on the clean Starter Dashboard.
const DEFAULT_PRESET = WORKSPACE_PRESETS.find((p) => p.id === 'starter-dashboard') ?? WORKSPACE_PRESETS.find((p) => p.id === 'market-overview') ?? WORKSPACE_PRESETS[0];
export const MY_WORKSPACE_ID = 'ws_my';

/** The user's own default workspace, seeded from the Market Overview layout. */
function myWorkspace(c: Canvas): Workspace {
  const base = instantiatePreset(DEFAULT_PRESET, c);
  // First-time visitors see it under the Starter Dashboard name.
  return { ...base, id: MY_WORKSPACE_ID, name: DEFAULT_PRESET.id === 'starter-dashboard' ? 'Starter Dashboard' : 'My Workspace', presetId: undefined };
}

function initialState(): Pick<WorkspaceState, 'workspaces' | 'activeId' | 'snapToGrid' | 'showGuides' | 'autoArrange'> {
  const ws = myWorkspace(fallbackCanvas());
  return { workspaces: [ws], activeId: ws.id, snapToGrid: false, showGuides: true, autoArrange: true };
}

const persistedSchema = z.object({
  workspaces: z.array(workspaceSchema).min(1),
  activeId: z.string(),
  snapToGrid: z.boolean(),
  showGuides: z.boolean(),
  autoArrange: z.boolean().optional(),
  layoutVersion: z.number().optional(),
});

export const useWorkspace = create<WorkspaceState & WorkspaceActions>()(
  persist(
    (set, get) => {
      /** This window's screen size, recorded per screen so each monitor rescales independently. */
      const canvasPatch = (w: Workspace, c: Canvas) => ({ screenCanvas: { ...(w.screenCanvas ?? {}), [CURRENT_SCREEN]: c }, ...(CURRENT_SCREEN === 'main' ? { canvas: c } : {}) });
      /** Windows shown on this browser window's screen. */
      const mineOf = (w: Workspace = get().active()) => w.windows.filter(onScreen(CURRENT_SCREEN));
      /** Puts this screen's windows back together with every other screen's windows (by id, no duplicates). */
      const mergeMine = (w: Workspace, mine: WidgetFrame[]) => {
        const ids = new Set(mine.map((f) => f.id));
        return [...w.windows.filter((f) => !onScreen(CURRENT_SCREEN)(f) && !ids.has(f.id)), ...mine];
      };
      /**
       * Replace this screen's windows in the active workspace; optionally record an undo snapshot.
       * Every action goes through here, so open/close/arrange/auto-tile/undo only ever touch this screen.
       */
      const commit = (updater: (ws: WidgetFrame[]) => WidgetFrame[], history = true, fixedId?: string) => {
        const s = get();
        const cur = s.active();
        const mine = mineOf(cur);
        const changed = updater(mine);
        if (changed === mine) return;
        // No two cards may ever overlap: every change is settled around the card the user touched.
        const next = arrangeCards(changed, s.canvas, s.autoArrange, fixedId);
        set({
          workspaces: s.workspaces.map((w) => (w.id === cur.id ? { ...w, windows: mergeMine(w, next), ...canvasPatch(w, s.canvas), updatedAt: new Date().toISOString() } : w)),
          ...(history ? { past: [...s.past, mine].slice(-HISTORY_LIMIT), future: [] } : {}),
        });
      };
      const mapOne = (id: string, fn: (f: WidgetFrame) => WidgetFrame) => (ws: WidgetFrame[]) => ws.map((f) => (f.id === id ? fn(f) : f));
      /** Structural change (open/close/minimise...). Packing happens in commit, so cards keep their own size. */
      const arranged = (updater: (ws: WidgetFrame[]) => WidgetFrame[], _lastId?: string) => updater;

      return {
        ...initialState(),
        canvas: fallbackCanvas(),
        past: [],
        future: [],
        focusedId: null,
        lastSavedAt: null,

        active: () => {
          const s = get();
          return s.workspaces.find((w) => w.id === s.activeId) ?? s.workspaces[0];
        },
        setCanvas: (c) => {
          if (c.w < 50 || c.h < 50) return;
          const s = get();
          const cur = s.active();
          const prev = cur.screenCanvas?.[CURRENT_SCREEN] ?? (CURRENT_SCREEN === 'main' ? cur.canvas : undefined);
          // Rescale proportionally when the layout was arranged for a different canvas size,
          // then clamp so no window is lost off-screen (not an undoable edit).
          const sx = prev ? c.w / prev.w : 1;
          const sy = prev ? c.h / prev.h : 1;
          const rescale = prev && (Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01);
          let changed = !prev || prev.w !== c.w || prev.h !== c.h;
          const clamped = cur.windows.map((f) => {
            if (!onScreen(CURRENT_SCREEN)(f)) return f;
            const scaled = rescale ? { ...f, x: f.x * sx, y: f.y * sy, width: f.width * sx, height: f.height * sy } : f;
            const n = clampFrame(scaled, c);
            if (n !== f) changed = true;
            return n;
          });
          // Saved or rescaled layouts may overlap: settle them (not an undoable edit).
          const settled = new Map(arrangeCards(clamped.filter(onScreen(CURRENT_SCREEN)), c, s.autoArrange).map((f) => [f.id, f]));
          const windows = clamped.map((f) => {
            const n = settled.get(f.id) ?? f;
            if (n !== f) changed = true;
            return n;
          });
          if (!changed) return set({ canvas: c });
          set({
            canvas: c,
            workspaces: s.workspaces.map((w) => (w.id === cur.id ? { ...w, windows, ...canvasPatch(w, c) } : w)),
          });
        },
        openApp: (type, opts) => {
          const s = get();
          const ws = mineOf();
          const existing = ws.find((w) => w.type === type);
          if (existing && !opts?.forceNew && !opts?.settings) {
            const restore = mapOne(existing.id, (f) => ({ ...f, minimized: false, visible: true, zIndex: maxZ(ws) + 1 }));
            commit(existing.minimized ? arranged(restore, existing.id) : restore, existing.minimized);
            set({ focusedId: existing.id });
            return existing.id;
          }
          const meta = APP_MAP[type];
          const c = s.canvas;
          // Each app opens at the size it needs, in the first free spot (top-left first), never on top of another card.
          const w = Math.min(meta.defaultSize.w, c.w);
          const h = Math.min(meta.defaultSize.h, Math.max(meta.minSize.h, c.h - 20));
          const { x, y } = findFreeSpot(ws, { w, h }, c.w);
          const frame = clampFrame(makeFrame(type, { x, y, w, h }, maxZ(ws) + 1, { settings: { ...(opts?.settings ?? {}) }, title: opts?.title ?? meta.title, ...(CURRENT_SCREEN !== 'main' ? { screenId: CURRENT_SCREEN } : {}) }), c);
          commit(arranged((list) => [...list, frame], frame.id));
          set({ focusedId: frame.id });
          return frame.id;
        },
        closeWindow: (id) => {
          commit(arranged((ws) => ws.filter((f) => f.id !== id)));
          if (get().focusedId === id) set({ focusedId: null });
        },
        focusWindow: (id) => {
          const ws = mineOf();
          const top = maxZ(ws);
          const f = ws.find((w) => w.id === id);
          set({ focusedId: id });
          if (!f || f.zIndex === top) return;
          commit((list) => {
            const next = list.map((w) => (w.id === id ? { ...w, zIndex: top + 1 } : w));
            return top > 500 ? normaliseZ(next) : next;
          }, false);
        },
        // A hand-placed card stays exactly where it was dropped: manual moves switch smart auto-arrange off
        // (otherwise the next re-arrange would undo them). Other cards only move to avoid overlap.
        moveWindow: (id, x, y) => {
          if (get().autoArrange) set({ autoArrange: false });
          commit(mapOne(id, (f) => clampFrame({ ...f, x, y, dockSide: null }, get().canvas)), true, id);
        },
        swapWindows: (id, targetId) => commit((ws) => swapFrames(ws, id, targetId, get().canvas), true, id),
        closeAllWindows: () => commit((ws) => (ws.some((f) => !f.locked) ? ws.filter((f) => f.locked) : ws)),
        minimizeAllWindows: () => commit((ws) => (ws.some((f) => !f.locked && !f.minimized) ? ws.map((f) => (f.locked ? f : { ...f, minimized: true })) : ws)),
        restoreAllWindows: () => commit(arranged((ws) => (ws.some((f) => f.minimized || !f.visible) ? ws.map((f) => ({ ...f, minimized: false, visible: true })) : ws))),
        // Same for resizing: the card keeps the size you drew (and remembers it for the next auto-arrange).
        resizeWindow: (id, x, y, w, h) => {
          if (get().autoArrange) set({ autoArrange: false });
          commit(mapOne(id, (f) => clampFrame({ ...f, x, y, width: w, height: h, prefW: Math.round(w), prefH: Math.round(h), dockSide: null }, get().canvas)), true, id);
        },
        toggleMinimize: (id) => {
          const wasMin = mineOf().find((f) => f.id === id)?.minimized;
          commit(arranged(mapOne(id, (f) => ({ ...f, minimized: !f.minimized, zIndex: f.minimized ? maxZ(mineOf()) + 1 : f.zIndex })), wasMin ? id : undefined));
        },
        toggleMaximize: (id) => {
          commit(mapOne(id, (f) => ({ ...f, maximized: !f.maximized, minimized: false, zIndex: maxZ(mineOf()) + 1 })));
          set({ focusedId: id });
        },
        toggleLock: (id) => commit(mapOne(id, (f) => ({ ...f, locked: !f.locked }))),
        duplicateWindow: (id) => {
          const ws = mineOf();
          const f = ws.find((w) => w.id === id);
          if (!f) return;
          const spot = findFreeSpot(ws, { w: f.width, h: f.height }, get().canvas.w);
          const copy = clampFrame(
            { ...f, id: uid('w'), x: spot.x, y: spot.y, zIndex: maxZ(ws) + 1, maximized: false, minimized: false, locked: false, title: `${f.title} (copy)`, settings: JSON.parse(JSON.stringify(f.settings)), appearance: { ...f.appearance } },
            get().canvas,
          );
          commit(arranged((list) => [...list, copy], copy.id));
          set({ focusedId: copy.id });
        },
        renameWindow: (id, title) => commit(mapOne(id, (f) => ({ ...f, title: title.trim().slice(0, 80) || APP_MAP[f.type].title }))),
        setWindowAppearance: (id, a, opts) =>
          commit(mapOne(id, (f) => ({ ...f, appearance: opts?.replace ? { ...a } : { ...f.appearance, ...a } })), opts?.history ?? true),
        resetWindowAppearance: (id) => commit(mapOne(id, (f) => ({ ...f, appearance: {} }))),
        updateSettings: (id, st) => commit(mapOne(id, (f) => ({ ...f, settings: { ...f.settings, ...st } })), false),
        applyLayout: (mode) => {
          if (get().autoArrange) set({ autoArrange: false });
          commit((ws) => layoutWindows(ws, mode, get().canvas));
        },
        dockWindow: (id, side) => {
          const c = get().canvas;
          const rect = {
            left: { x: 0, y: 0, width: c.w / 2, height: c.h },
            right: { x: c.w / 2, y: 0, width: c.w / 2, height: c.h },
            top: { x: 0, y: 0, width: c.w, height: c.h / 2 },
            bottom: { x: 0, y: c.h / 2, width: c.w, height: c.h / 2 },
          }[side];
          commit(mapOne(id, (f) => clampFrame({ ...f, ...rect, maximized: false, dockSide: side }, c)), true, id);
        },
        undo: () => {
          const s = get();
          if (!s.past.length) return;
          const cur = s.active();
          const prev = s.past[s.past.length - 1];
          set({
            past: s.past.slice(0, -1),
            future: [mineOf(cur), ...s.future].slice(0, HISTORY_LIMIT),
            workspaces: s.workspaces.map((w) => (w.id === cur.id ? { ...w, windows: mergeMine(w, prev) } : w)),
          });
        },
        redo: () => {
          const s = get();
          if (!s.future.length) return;
          const cur = s.active();
          const next = s.future[0];
          set({
            future: s.future.slice(1),
            past: [...s.past, mineOf(cur)].slice(-HISTORY_LIMIT),
            workspaces: s.workspaces.map((w) => (w.id === cur.id ? { ...w, windows: mergeMine(w, next) } : w)),
          });
        },
        switchWorkspace: (id) => {
          if (!get().workspaces.some((w) => w.id === id)) return;
          set({ activeId: id, past: [], future: [], focusedId: null });
          get().setCanvas(get().canvas);
        },
        openPreset: (presetId) => {
          const p = WORKSPACE_PRESETS.find((x) => x.id === presetId);
          if (!p) return get().activeId;
          const id = `preset:${p.id}`;
          if (!get().workspaces.some((w) => w.id === id)) {
            set((s) => ({ workspaces: [...s.workspaces, instantiatePreset(p, s.canvas)] }));
          }
          get().switchWorkspace(id);
          return id;
        },
        resetWorkspace: () => {
          const cur = get().active();
          const p = WORKSPACE_PRESETS.find((x) => x.id === cur.presetId) ?? (cur.id === MY_WORKSPACE_ID ? DEFAULT_PRESET : undefined);
          const fresh = p ? instantiatePreset(p, get().canvas) : null;
          const s = get();
          set({
            workspaces: s.workspaces.map((w) => (w.id === cur.id ? { ...w, windows: fresh?.windows ?? [], screens: fresh?.screens, updatedAt: new Date().toISOString() } : w)),
            past: [...s.past, mineOf(cur)].slice(-HISTORY_LIMIT),
            future: [],
          });
          get().setCanvas(get().canvas);
        },
        saveAs: (name) => {
          const s = get();
          const cur = s.active();
          const id = uid('ws');
          const copy: Workspace = { id, name: name.trim().slice(0, 80) || 'Untitled workspace', canvas: cur.canvas ?? s.canvas, screenCanvas: cur.screenCanvas, screens: cur.screens, windows: JSON.parse(JSON.stringify(cur.windows)), updatedAt: new Date().toISOString() };
          set({ workspaces: [...s.workspaces, copy], activeId: id, past: [], future: [], lastSavedAt: new Date().toISOString() });
          return id;
        },
        renameWorkspace: (id, name) => set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name: name.trim().slice(0, 80) || w.name } : w)) })),
        deleteWorkspace: (id) => {
          const s = get();
          if (s.workspaces.length <= 1) return false;
          const rest = s.workspaces.filter((w) => w.id !== id);
          set({ workspaces: rest, ...(s.activeId === id ? { activeId: rest[0].id, past: [], future: [] } : {}) });
          return true;
        },
        duplicateWorkspace: (id) => {
          const s = get();
          const src = s.workspaces.find((w) => w.id === id);
          if (!src) return s.activeId;
          const nid = uid('ws');
          set({ workspaces: [...s.workspaces, { ...JSON.parse(JSON.stringify(src)), id: nid, presetId: undefined, name: `${src.name} (copy)`, updatedAt: new Date().toISOString() }] });
          return nid;
        },
        exportWorkspace: (id) => {
          const s = get();
          const ws = s.workspaces.find((w) => w.id === (id ?? s.activeId)) ?? s.active();
          return JSON.stringify({ app: 'ai-trading-os', schemaVersion: LAYOUT_SCHEMA_VERSION, exportedAt: new Date().toISOString(), workspace: ws }, null, 2);
        },
        importWorkspace: (text) => {
          const res = parseLayoutFile(text);
          if (!res.ok) return res;
          const id = uid('ws');
          const c = get().canvas;
          const ws: Workspace = { ...res.workspace, id, presetId: undefined, canvas: res.workspace.canvas ?? c, name: `${res.workspace.name} (imported)`, windows: res.workspace.windows, updatedAt: new Date().toISOString() };
          set((s) => ({ workspaces: [...s.workspaces, ws], activeId: id, past: [], future: [] }));
          get().setCanvas(c);
          return { ok: true, name: ws.name };
        },
        markSaved: () => set({ lastSavedAt: new Date().toISOString() }),
        toggleSnap: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
        toggleAutoArrange: () => {
          const on = !get().autoArrange;
          set({ autoArrange: on });
          if (on) commit((ws) => [...ws]);
        },
        toggleGuides: () => set((s) => ({ showGuides: !s.showGuides })),
        createDesk: (id, name, types) => {
          const s = get();
          const windows: WidgetFrame[] = [];
          types.forEach((t, i) => {
            const meta = APP_MAP[t];
            const size = { w: Math.min(meta.defaultSize.w, s.canvas.w), h: meta.defaultSize.h };
            windows.push(makeFrame(t, { ...findFreeSpot(windows, size, s.canvas.w), ...size }, i + 1));
          });
          const desk: Workspace = { id, name, canvas: s.canvas, screenCanvas: { main: s.canvas }, windows, updatedAt: new Date().toISOString() };
          set({
            workspaces: s.workspaces.some((w) => w.id === id) ? s.workspaces.map((w) => (w.id === id ? desk : w)) : [...s.workspaces, desk],
            activeId: id,
            past: [],
            future: [],
            focusedId: null,
          });
        },
        moveToScreen: (id, target) => {
          const s = get();
          const cur = s.active();
          const f = cur.windows.find((w) => w.id === id);
          if (!f || screenOf(f) === target || !(SCREEN_IDS as readonly string[]).includes(target)) return;
          const tc = cur.screenCanvas?.[target] ?? s.canvas;
          let windows = cur.windows.map((w) =>
            w.id === id ? clampFrame({ ...w, screenId: target === 'main' ? undefined : target, x: 20, y: 20, maximized: false, minimized: false, zIndex: maxZ(cur.windows) + 1 }, tc) : w,
          );
          {
            const tile = (list: WidgetFrame[], scr: string, c: Canvas, last?: string) => {
              let mine = list.filter(onScreen(scr));
              if (last) {
                const spot = findFreeSpot(mine.filter((x) => x.id !== last), { w: f.width, h: f.height }, c.w);
                mine = mine.map((x) => (x.id === last ? { ...x, ...spot } : x));
              }
              const tiled = new Map(arrangeCards(mine, c, s.autoArrange).map((x) => [x.id, x]));
              return list.map((x) => tiled.get(x.id) ?? x);
            };
            windows = tile(windows, target, tc, id);
            windows = tile(windows, screenOf(f), cur.screenCanvas?.[screenOf(f)] ?? s.canvas);
          }
          const screens = target === 'main' ? cur.screens : Array.from(new Set([...(cur.screens ?? []), target]));
          set({
            workspaces: s.workspaces.map((w) => (w.id === cur.id ? { ...w, windows, screens, screenCanvas: { ...(w.screenCanvas ?? {}), [target]: tc }, updatedAt: new Date().toISOString() } : w)),
            past: [...s.past, mineOf(cur)].slice(-HISTORY_LIMIT),
            future: [],
            focusedId: s.focusedId === id ? null : s.focusedId,
          });
        },
        addScreen: () => {
          const s = get();
          const cur = s.active();
          const used = workspaceScreens(cur);
          const next = SCREEN_IDS.find((x) => !used.includes(x));
          if (!next) return null;
          set({ workspaces: s.workspaces.map((w) => (w.id === cur.id ? { ...w, screens: [...(w.screens ?? []), next] } : w)) });
          return next;
        },
        removeScreen: (scr) => {
          if (scr === 'main') return;
          const s = get();
          const cur = s.active();
          let windows = cur.windows.map((w) => (screenOf(w) === scr ? { ...w, screenId: undefined } : w));
          if (windows.some((w) => w.screenId === undefined && cur.windows.find((o) => o.id === w.id)?.screenId === scr)) {
            const mc = cur.screenCanvas?.main ?? cur.canvas ?? s.canvas;
            const tiled = new Map(arrangeCards(windows.filter(onScreen('main')), mc, s.autoArrange).map((x) => [x.id, x]));
            windows = windows.map((x) => tiled.get(x.id) ?? x);
          }
          set({
            workspaces: s.workspaces.map((w) => (w.id === cur.id ? { ...w, windows, screens: (w.screens ?? []).filter((x) => x !== scr), updatedAt: new Date().toISOString() } : w)),
            past: [],
            future: [],
          });
        },
      };
    },
    {
      name: STORAGE_KEYS.workspace,
      version: 1,
      storage: createJSONStorage(() => safeStorage(500)),
      partialize: (s) => ({ workspaces: s.workspaces, activeId: s.activeId, snapToGrid: s.snapToGrid, showGuides: s.showGuides, autoArrange: s.autoArrange, layoutVersion: 4 }),
      merge: (persisted, current) => {
        const res = persistedSchema.safeParse(persisted);
        if (!res.success) {
          if (persisted != null) recoveredKeys.add(STORAGE_KEYS.workspace);
          return current;
        }
        const data = res.data as unknown as Pick<WorkspaceState, 'workspaces' | 'activeId' | 'snapToGrid' | 'showGuides'> & { autoArrange?: boolean; layoutVersion?: number };
        // Drop workspaces created from presets that no longer exist (e.g. the removed crypto desk).
        let workspaces = data.workspaces.filter((w) => !w.presetId || WORKSPACE_PRESETS.some((p) => p.id === w.presetId));
        if (!workspaces.length) workspaces = [myWorkspace(fallbackCanvas())];
        // One-time upgrade to the scrollable layout: rebuild untouched preset-based layouts with comfortable row heights.
        if ((data.layoutVersion ?? 1) < 2) {
          workspaces = workspaces.map((w) => {
            const p = WORKSPACE_PRESETS.find((x) => x.id === (w.presetId ?? (w.id === MY_WORKSPACE_ID ? DEFAULT_PRESET.id : '')));
            if (!p) return w;
            const same = w.windows.length === p.windows.length && p.windows.every((pw, i) => w.windows[i]?.type === pw.type);
            if (!same) return w;
            const fresh = instantiatePreset(p, w.canvas ?? fallbackCanvas());
            return { ...w, canvas: fresh.canvas, windows: w.windows.map((f, i) => ({ ...f, x: fresh.windows[i].x, y: fresh.windows[i].y, width: fresh.windows[i].width, height: fresh.windows[i].height })) };
          });
        }
        let activeId = workspaces.some((w) => w.id === data.activeId) ? data.activeId : (workspaces.find((w) => w.id === MY_WORKSPACE_ID) ?? workspaces[0]).id;
        // One-time (v3): everyone sees the new Starter Dashboard once; their other workspaces stay in the menu.
        if ((data.layoutVersion ?? 1) < 3) {
          const starter = WORKSPACE_PRESETS.find((p) => p.id === 'starter');
          if (starter) {
            if (!workspaces.some((w) => w.id === 'preset:starter')) workspaces = [...workspaces, instantiatePreset(starter, fallbackCanvas())];
            activeId = 'preset:starter';
          }
        }
        // One-time (v4): the task workspaces were redesigned. Their stale preset copies are rebuilt and
        // Market Overview becomes the active desk. User-created / saved workspaces are kept untouched.
        if ((data.layoutVersion ?? 1) < 4) {
          const redesigned = new Set(['market-overview', 'technical', 'metals-energy', 'risk', 'research']);
          workspaces = workspaces.filter((w) => !(w.presetId && redesigned.has(w.presetId)));
          const mo = WORKSPACE_PRESETS.find((p) => p.id === 'market-overview');
          if (mo) {
            workspaces = [...workspaces, instantiatePreset(mo, fallbackCanvas())];
            activeId = 'preset:market-overview';
          } else if (!workspaces.some((w) => w.id === activeId)) activeId = workspaces[0]?.id ?? activeId;
        }
        // One-time migration: older saves had only presets — give the user their own default workspace.
        if (!workspaces.some((w) => !w.presetId)) {
          const mine = myWorkspace(fallbackCanvas());
          workspaces = [mine, ...workspaces];
          activeId = mine.id;
        }
        return { ...current, ...data, workspaces, activeId, autoArrange: data.autoArrange ?? true };
      },
    },
  ),
);
