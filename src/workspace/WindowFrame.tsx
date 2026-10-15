import { memo, Suspense, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Rnd } from 'react-rnd';
import {
  Copy, ExternalLink, Lock, Maximize2, Minimize2, Minus, MonitorUp, MoreHorizontal, PanelTopClose, Palette, PanelBottom, PanelLeft, PanelRight, PanelTop, Pencil, Unlock, X,
} from 'lucide-react';
import type { WidgetFrame } from '../types/widgets';
import { APP_MAP } from './registry';
import { useWorkspace } from './WorkspaceStore';
import { MODULES } from '../modules';
import { ErrorBoundary } from '../components/ui';
import { useApp } from '../store/appStore';
import { fontStack } from '../design-system/ThemeProvider';
import { CURRENT_SCREEN, screenLabel, workspaceScreens } from './screen';
import { openScreenWindow, isScreenOpen } from '../lib/screens';
import { dockBack, pointerOutside, pointerOverTarget, popOutWindow, useTearOff } from './tearOff';
import { IS_POPOUT } from './screen';

/** Client and physical-screen coordinates of a mouse or touch event. */
function pointerOf(e: MouseEvent | TouchEvent) {
  const p = 'changedTouches' in e ? e.changedTouches[0] : e;
  return { x: p.clientX, y: p.clientY, sx: p.screenX, sy: p.screenY };
}

export interface DragGuides {
  onDrag: (id: string, x: number, y: number, w: number, h: number) => { x: number; y: number };
  onDragEnd: () => void;
  /** Live resize of one card: the others reflow around it. */
  onResize: (id: string, x: number, y: number, w: number, h: number) => void;
}

function appearanceVars(f: WidgetFrame): CSSProperties {
  const a = f.appearance;
  const v: Record<string, string> = {};
  if (a.background) v['--w-bg'] = a.background;
  if (a.textColor) v['--w-fg'] = a.textColor;
  if (a.accent) v['--w-accent'] = a.accent;
  if (a.borderColor) v['--w-border'] = a.borderColor;
  if (a.radius != null) v['--w-radius'] = `${a.radius}px`;
  if (a.opacity != null) v['--w-opacity'] = String(a.opacity);
  if (a.shadowIntensity != null) v['--w-sh'] = String(a.shadowIntensity);
  if (a.fontSize != null) v['--w-fs'] = `${a.fontSize}px`;
  if (a.fontFamily) v['--w-font'] = fontStack(a.fontFamily) ?? a.fontFamily;
  if (a.padding != null) v['--w-pad'] = `${a.padding}px`;
  if (a.accent) v['--accent'] = a.accent;
  return v as CSSProperties;
}

/**
 * The window menu is portalled to <body> with fixed positioning so it is never clipped by a short
 * window; it opens below the button, or above it when there isn't room, and stays on screen.
 */
function WindowMenu({ f, onRename, close, anchor, portalRef }: { f: WidgetFrame; onRename: () => void; close: () => void; anchor: HTMLElement | null; portalRef: React.RefObject<HTMLDivElement> }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const el = portalRef.current;
    if (!anchor || !el) return;
    const a = anchor.getBoundingClientRect();
    const m = el.getBoundingClientRect();
    const below = a.bottom + 6;
    const top = below + m.height <= window.innerHeight - 8 ? below : Math.max(8, a.top - 6 - m.height);
    const left = Math.min(Math.max(8, a.right - m.width), window.innerWidth - m.width - 8);
    setPos({ top, left });
  }, [anchor, portalRef]);
  const ws = useWorkspace();
  const openAppearance = () => useApp.getState().set({ appearanceOpen: true, appearanceTarget: f.id });
  const item = (icon: React.ReactNode, label: string, fn: () => void, danger = false) => (
    <button
      className={`menu-item ${danger ? 'danger' : ''}`}
      onClick={() => {
        fn();
        close();
      }}
    >
      {icon}
      {label}
    </button>
  );
  return createPortal(
    <div ref={portalRef} className="menu neu-raised no-drag window-menu-portal" role="menu" onMouseDown={(e) => e.stopPropagation()} style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, right: 'auto', maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }}>
      {item(<Pencil />, 'Rename window', onRename)}
      {item(<Copy />, 'Duplicate window', () => ws.duplicateWindow(f.id))}
      {item(<Palette />, 'Appearance…', openAppearance)}
      {item(f.locked ? <Unlock /> : <Lock />, f.locked ? 'Unlock position' : 'Lock position', () => ws.toggleLock(f.id))}
      {!IS_POPOUT && item(<ExternalLink />, 'Pop out to a new window', () => popOutWindow(f.id))}
      <div className="menu-sep" />
      {item(<PanelLeft />, 'Dock left half', () => ws.dockWindow(f.id, 'left'))}
      {item(<PanelRight />, 'Dock right half', () => ws.dockWindow(f.id, 'right'))}
      {item(<PanelTop />, 'Dock top half', () => ws.dockWindow(f.id, 'top'))}
      {item(<PanelBottom />, 'Dock bottom half', () => ws.dockWindow(f.id, 'bottom'))}
      <div className="menu-sep" />
      {workspaceScreens(ws.active())
        .filter((id) => id !== CURRENT_SCREEN)
        .map((id) => (
          <span key={id}>{item(<MonitorUp />, `Move to ${screenLabel(id)}`, () => {
            ws.moveToScreen(f.id, id);
            if (!isScreenOpen(id)) openScreenWindow(id);
          })}</span>
        ))}
      {item(<MonitorUp />, 'Move to a new screen', () => {
        const id = ws.addScreen();
        if (!id) return;
        ws.moveToScreen(f.id, id);
        openScreenWindow(id);
      })}
      <div className="menu-sep" />
      {item(<X />, 'Close window', () => ws.closeWindow(f.id), true)}
    </div>,
    document.body,
  );
}

function WindowFrameInner({ f, focused, guides, snap, preview }: { f: WidgetFrame; focused: boolean; guides: DragGuides; snap: boolean; preview?: { x: number; y: number; width?: number; height?: number } }) {
  const meta = APP_MAP[f.type];
  const Icon = meta.icon;
  const Module = MODULES[f.type];
  const canvas = useWorkspace((s) => s.canvas);
  const { focusWindow, moveWindow, resizeWindow, toggleMinimize, toggleMaximize, toggleLock, closeWindow, renameWindow, updateSettings } = useWorkspace.getState();
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(f.title);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuPortalRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menu) return;
    const h = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !menuPortalRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    window.addEventListener('mousedown', h);
    window.addEventListener('keydown', k);
    return () => {
      window.removeEventListener('mousedown', h);
      window.removeEventListener('keydown', k);
    };
  }, [menu]);

  // While another card is dragged, this one shows where it will move to (animated via .reflow).
  const [moving, setMoving] = useState(false);
  const pos = f.maximized ? { x: 0, y: 0 } : preview ?? { x: f.x, y: f.y };
  const size = f.maximized ? { width: canvas.w, height: canvas.h } : { width: preview?.width ?? f.width, height: preview?.height ?? f.height };
  const a = f.appearance;
  const grid: [number, number] = snap ? [20, 20] : [1, 1];

  return (
    <Rnd
      position={pos}
      size={size}
      bounds="parent"
      style={{ zIndex: f.zIndex, display: f.minimized ? 'none' : undefined }}
      minWidth={Math.min(meta.minSize.w, canvas.w)}
      minHeight={Math.min(meta.minSize.h, canvas.h)}
      maxWidth={canvas.w}
      maxHeight={canvas.h}
      dragHandleClassName="window-drag"
      cancel=".no-drag"
      dragGrid={grid}
      resizeGrid={grid}
      disableDragging={f.locked || f.maximized}
      enableResizing={!f.locked && !f.maximized}
      onMouseDown={() => focusWindow(f.id)}
      className={moving ? undefined : 'reflow'}
      onDragStart={() => {
        setMoving(true);
        if (!IS_POPOUT) useTearOff.setState({ dragging: f.id, outside: false, overTarget: false });
      }}
      onDrag={(e, d) => {
        if (!IS_POPOUT) {
          // Tear-off: dragging past the browser edge (or onto the drop zone) pops the card out.
          const p = pointerOf(e as MouseEvent | TouchEvent);
          const outside = pointerOutside(p.x, p.y);
          const overTarget = pointerOverTarget(p.x, p.y);
          const t = useTearOff.getState();
          if (t.outside !== outside || t.overTarget !== overTarget) useTearOff.setState({ outside, overTarget });
        }
        guides.onDrag(f.id, d.x, d.y, f.width, f.height);
      }}
      onDragStop={(e, d) => {
        setMoving(false);
        const tear = useTearOff.getState();
        useTearOff.setState({ dragging: null, outside: false, overTarget: false });
        if (!IS_POPOUT && (tear.outside || tear.overTarget)) {
          guides.onDragEnd();
          const p = pointerOf(e as MouseEvent | TouchEvent);
          popOutWindow(f.id, tear.outside ? { x: p.sx, y: p.sy } : undefined);
          return;
        }
        const snapped = guides.onDrag(f.id, d.x, d.y, f.width, f.height);
        // Commit first, then drop the preview, so the other cards never flash back.
        if (snapped.x !== f.x || snapped.y !== f.y) moveWindow(f.id, snapped.x, snapped.y);
        guides.onDragEnd();
      }}
      onResizeStart={() => setMoving(true)}
      onResize={(_e, _dir, ref, _delta, p) => guides.onResize(f.id, p.x, p.y, ref.offsetWidth, ref.offsetHeight)}
      onResizeStop={(_e, _dir, ref, _delta, p) => {
        setMoving(false);
        resizeWindow(f.id, p.x, p.y, ref.offsetWidth, ref.offsetHeight);
        guides.onDragEnd();
      }}
    >
      <section
        className={`window ${focused ? 'focused' : ''} ${f.locked ? 'locked' : ''} surface-${a.surface ?? 'raised'} ${a.gradient ? 'gradient' : ''}`}
        style={appearanceVars(f)}
        aria-label={f.title}
        data-wid={f.id}
        onFocusCapture={() => focusWindow(f.id)}
      >
        <header className="window-titlebar window-drag" onDoubleClick={(e) => !(e.target as HTMLElement).closest('.no-drag') && toggleMaximize(f.id)}>
          <span className="window-icon">
            <Icon />
          </span>
          {renaming ? (
            <input
              className="input window-title-input no-drag"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                renameWindow(f.id, title);
                setRenaming(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') {
                  setTitle(f.title);
                  setRenaming(false);
                }
              }}
            />
          ) : (
            <span className="window-title" title={f.title}>
              {f.title}
            </span>
          )}
          <div className="window-controls no-drag" ref={menuRef} style={{ position: 'relative' }}>
            {f.locked && (
              <button className="win-btn on" data-tip="Locked — click to unlock" aria-label="Unlock window" onClick={() => toggleLock(f.id)}>
                <Lock />
              </button>
            )}
            <button ref={menuBtnRef} className="win-btn" data-tip="Window menu" aria-label="Window menu" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <MoreHorizontal />
            </button>
            {IS_POPOUT && (
              <button className="win-btn" data-tip="Dock back into the main window" aria-label="Dock back to main window" onClick={dockBack}>
                <PanelTopClose />
              </button>
            )}
            <button className="win-btn" data-tip="Minimise to dock" aria-label="Minimise" onClick={() => toggleMinimize(f.id)}>
              <Minus />
            </button>
            <button className="win-btn" data-tip={f.maximized ? 'Restore' : 'Maximise'} aria-label={f.maximized ? 'Restore' : 'Maximise'} onClick={() => toggleMaximize(f.id)}>
              {f.maximized ? <Minimize2 /> : <Maximize2 />}
            </button>
            <button className="win-btn close" data-tip="Close" aria-label="Close window" onClick={() => closeWindow(f.id)}>
              <X />
            </button>
            {menu && (
              <WindowMenu
                f={f}
                anchor={menuBtnRef.current}
                portalRef={menuPortalRef}
                close={() => setMenu(false)}
                onRename={() => {
                  setTitle(f.title);
                  setRenaming(true);
                }}
              />
            )}
          </div>
        </header>
        <div className={`window-body ${meta.noPadding ? 'nopad' : ''}`}>
          <ErrorBoundary label={meta.title}>
            <Suspense
              fallback={
                <div className="col" style={{ padding: 16 }}>
                  <div className="skeleton" style={{ width: '40%' }} />
                  <div className="skeleton" style={{ width: '80%' }} />
                  <div className="skeleton" style={{ width: '65%' }} />
                </div>
              }
            >
              <Module frame={f} updateSettings={(s) => updateSettings(f.id, s)} />
            </Suspense>
          </ErrorBoundary>
        </div>
        {!f.locked && !f.maximized && <span className="resize-hint" />}
      </section>
    </Rnd>
  );
}

export const WindowFrame = memo(WindowFrameInner);
