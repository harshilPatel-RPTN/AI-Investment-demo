import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { useWorkspace } from './WorkspaceStore';
import { resolveLayout } from './packLayout';
import { smartArrange } from './smartArrange';
import { useScreenWindows } from './useScreenWindows';
import { TEAROFF_TARGET_ID, useTearOff } from './tearOff';
import { ExternalLink } from 'lucide-react';
import { CURRENT_SCREEN, IS_MAIN_SCREEN, screenLabel } from './screen';
import { WindowFrame, type DragGuides } from './WindowFrame';
import { useApp } from '../store/appStore';

const SNAP = 8;

export function WorkspaceCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  const workspace = useWorkspace((s) => s.workspaces.find((w) => w.id === s.activeId) ?? s.workspaces[0]);
  const focusedId = useWorkspace((s) => s.focusedId);
  const snap = useWorkspace((s) => s.snapToGrid);
  const showGuides = useWorkspace((s) => s.showGuides);
  const autoArrange = useWorkspace((s) => s.autoArrange);
  const setCanvas = useWorkspace((s) => s.setCanvas);
  const [lines, setLines] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  /** Live positions of the other cards while one is being dragged or resized (they make room). */
  const [preview, setPreview] = useState<Record<string, { x: number; y: number; width?: number; height?: number }> | null>(null);
  /** Where the card being dragged/resized will land (smart arrange only). */
  const [ghost, setGhost] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const canvas = useWorkspace((s) => s.canvas);
  const tear = useTearOff();

  // Track canvas size and recover windows on viewport change.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setCanvas({ w: Math.floor(el.clientWidth), h: Math.floor(el.clientHeight) }));
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [setCanvas]);

  const screenWindows = useScreenWindows();
  const windowsRef = useRef(screenWindows);
  windowsRef.current = screenWindows;

  const guides: DragGuides = useMemo(
    () => ({
      onDrag: (id, x, y, w, h) => {
        const snapped = snapToGuides(id, x, y, w, h);
        reflow(id, snapped.x, snapped.y, w, h);
        return snapped;
      },
      onResize: (id, x, y, w, h) => reflow(id, x, y, w, h, true),
      onDragEnd: () => {
        setLines({ v: [], h: [] });
        setPreview(null);
        setGhost(null);
      },
    }),
    [],
  );

  /** Where every other card goes if the moving one were dropped here — same rules as the store. */
  function reflow(id: string, x: number, y: number, w: number, h: number, resizing = false) {
    const s = useWorkspace.getState();
    const current = windowsRef.current;
    const next: Record<string, { x: number; y: number; width?: number; height?: number }> = {};
    let landing: { x: number; y: number; width: number; height: number } | null = null;
    if (s.autoArrange) {
      // Same smart layout the store will commit: others move AND resize; the ghost shows the landing slot.
      const moved = current.map((o) => (o.id === id ? (resizing ? { ...o, prefW: w, prefH: h } : { ...o, x, y }) : o));
      const out = smartArrange(moved, s.canvas, resizing ? {} : { movingId: id, drop: { x, y, w, h } });
      out.forEach((o, i) => {
        const c = current[i];
        if (o.id === id) landing = { x: o.x, y: o.y, width: o.width, height: o.height };
        else if (o.x !== c.x || o.y !== c.y || o.width !== c.width || o.height !== c.height) next[o.id] = { x: o.x, y: o.y, width: o.width, height: o.height };
      });
    } else {
      const moved = current.map((o) => (o.id === id ? { ...o, x, y, width: w, height: h } : o));
      const out = resolveLayout(moved, s.canvas.w, { fixedId: id, compact: false });
      out.forEach((o, i) => {
        if (o.id !== id && (o.x !== current[i].x || o.y !== current[i].y)) next[o.id] = { x: o.x, y: o.y };
      });
    }
    setPreview((prev) => (JSON.stringify(prev ?? {}) === JSON.stringify(next) ? prev : next));
    setGhost((prev) => (JSON.stringify(prev) === JSON.stringify(landing) ? prev : landing));
  }

  function snapToGuides(id: string, x: number, y: number, w: number, h: number) {
        if (!useWorkspace.getState().showGuides) return { x, y };
        const c = useWorkspace.getState().canvas;
        const others = windowsRef.current.filter((o) => o.id !== id && !o.minimized && !o.maximized);
        const xs = [0, c.w, ...others.flatMap((o) => [o.x, o.x + o.width])];
        const ys = [0, c.h, ...others.flatMap((o) => [o.y, o.y + o.height])];
        let nx = x;
        let ny = y;
        const v: number[] = [];
        const hz: number[] = [];
        for (const gx of xs) {
          if (Math.abs(x - gx) < SNAP) { nx = gx; v.push(gx); break; }
          if (Math.abs(x + w - gx) < SNAP) { nx = gx - w; v.push(gx); break; }
        }
        for (const gy of ys) {
          if (Math.abs(y - gy) < SNAP) { ny = gy; hz.push(gy); break; }
          if (Math.abs(y + h - gy) < SNAP) { ny = gy - h; hz.push(gy); break; }
        }
        setLines((prev) => (prev.v[0] === v[0] && prev.h[0] === hz[0] ? prev : { v, h: hz }));
        return { x: Math.round(nx), y: Math.round(ny) };
  }

  const visible = screenWindows.filter((w) => w.visible);
  const shown = visible.filter((w) => !w.minimized);
  const anyMax = shown.some((w) => w.maximized);
  // The surface grows with its content (plus room to drag lower); the viewport scrolls vertically.
  const bottom = shown.reduce((m, w) => Math.max(m, w.y + w.height), 0);
  const surfaceH = anyMax ? canvas.h : Math.max(canvas.h, bottom > canvas.h ? bottom + (autoArrange ? 0 : 160) : canvas.h);

  // Maximised windows cover the viewport, so jump to the top.
  useEffect(() => {
    if (anyMax) ref.current?.scrollTo({ top: 0 });
  }, [anyMax]);

  // Bring a newly focused/added window into view if it is below the fold.
  useEffect(() => {
    if (!focusedId) return;
    const t = setTimeout(() => {
      const el = ref.current?.querySelector(`[data-wid="${focusedId}"]`) as HTMLElement | null;
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 80);
    return () => clearTimeout(t);
  }, [focusedId]);

  const openLauncher = useCallback(() => useApp.getState().set({ launcherOpen: true }), []);

  return (
    <div ref={ref} className="canvas" id="workspace-canvas" style={{ overflowY: anyMax ? 'hidden' : 'auto' }}>
      <div className={`canvas-surface ${snap ? 'show-grid' : ''}`} style={{ height: surfaceH }}>
      {visible.map((f) => (
        <WindowFrame key={f.id} f={f} focused={focusedId === f.id} guides={guides} snap={snap} preview={preview?.[f.id]} />
      ))}
      {ghost && <div className="drop-ghost" style={{ left: ghost.x, top: ghost.y, width: ghost.width, height: ghost.height }} />}
      {showGuides && lines.v.map((x) => <div key={`v${x}`} className="guide-line v" style={{ left: x }} />)}
      {showGuides && lines.h.map((y) => <div key={`h${y}`} className="guide-line h" style={{ top: y }} />)}
      </div>
      {tear.dragging && (
        <div id={TEAROFF_TARGET_ID} className={`tearoff-target ${tear.overTarget ? 'over' : ''}`} aria-hidden>
          <ExternalLink size={16} /> Drop here — or drag outside the browser — to open in a new window
        </div>
      )}
      {tear.dragging && tear.outside && <div className="tearoff-hint">Release to open this card in a new window</div>}
      {visible.filter((w) => !w.minimized).length === 0 && (
        <div className="canvas-empty">
          <div className="neu-raised card col center" style={{ alignItems: 'center', padding: 28, maxWidth: 380 }}>
            <LayoutGrid size={28} className="accent" />
            <h3>{screenWindows.length ? 'All windows are minimised' : IS_MAIN_SCREEN ? 'Blank canvas' : `${screenLabel(CURRENT_SCREEN)} is empty`}</h3>
            <p className="secondary small">
              {screenWindows.length ? 'Restore them from the dock on the left, or open another app.' : IS_MAIN_SCREEN ? 'Open apps from the launcher to build your own trading desk.' : `Add apps here, or send a window to this screen from its ⋯ menu on another screen. Workspace: ${workspace.name}.`}
            </p>
            <button className="btn primary mt-2" onClick={openLauncher}>
              Open app launcher
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
