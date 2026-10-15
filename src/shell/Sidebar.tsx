import { useState } from 'react';
import { ChevronsLeft, ChevronsRight, EyeOff, Grid3x3, Pin } from 'lucide-react';
import { useApp } from '../store/appStore';
import { useWorkspace } from '../workspace/WorkspaceStore';
import { useScreenWindows } from '../workspace/useScreenWindows';
import { CURRENT_SCREEN, onScreen } from '../workspace/screen';
import { APP_MAP } from '../workspace/registry';
import type { WidgetType } from '../types/widgets';

export function activateApp(type: WidgetType) {
  const ws = useWorkspace.getState();
  const wins = ws.active().windows.filter((w) => w.type === type && onScreen(CURRENT_SCREEN)(w));
  useApp.getState().noteRecentApp(type);
  if (!wins.length) return ws.openApp(type);
  const top = [...wins].sort((a, b) => b.zIndex - a.zIndex)[0];
  if (top.minimized) ws.toggleMinimize(top.id);
  ws.focusWindow(top.id);
}

export function Sidebar() {
  const pinned = useApp((s) => s.pinnedApps);
  const expanded = useApp((s) => s.sidebarExpanded);
  const autohide = useApp((s) => s.sidebarAutohide);
  const { set, reorderPinned } = useApp.getState();
  const windows = useScreenWindows();
  const focusedId = useWorkspace((s) => s.focusedId);
  const { toggleMinimize, focusWindow } = useWorkspace.getState();
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const running = windows.filter((w) => w.visible);
  const unpinnedRunning = running.filter((w) => !pinned.includes(w.type));
  const focusedType = windows.find((w) => w.id === focusedId)?.type;

  const tip = (label: string) => (expanded ? {} : { 'data-tip': label, 'data-tip-pos': 'right' });

  return (
    <nav className={`sidebar ${expanded ? 'expanded' : ''} ${autohide ? 'autohide neu-raised' : ''}`} aria-label="App dock">
      <button className="dock-item" onClick={() => set({ launcherOpen: true })} aria-label="Open app launcher" {...tip('App launcher')}>
        <Grid3x3 />
        {expanded && <span className="dock-label">All apps</span>}
      </button>
      <div className="sidebar-section">Pinned</div>
      {pinned.map((type, i) => {
        const meta = APP_MAP[type];
        if (!meta) return null;
        const Icon = meta.icon;
        const wins = running.filter((w) => w.type === type);
        const allMin = wins.length > 0 && wins.every((w) => w.minimized);
        return (
          <button
            key={type}
            draggable
            onDragStart={(e) => {
              setDrag(i);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(i);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              if (drag != null && drag !== i) reorderPinned(drag, i);
              setDrag(null);
              setOver(null);
            }}
            onDragEnd={() => {
              setDrag(null);
              setOver(null);
            }}
            className={`dock-item ${focusedType === type ? 'active' : ''} ${allMin ? 'minimized' : ''} ${drag === i ? 'dragging' : ''} ${over === i && drag !== i ? 'drop-target' : ''}`}
            onClick={() => activateApp(type)}
            aria-label={`${meta.title}${wins.length ? ` (${wins.length} open${allMin ? ', minimised' : ''})` : ''}`}
            {...tip(`${meta.title}${allMin ? ' (minimised)' : ''}`)}
          >
            {wins.length > 0 && <span className="run-dot" />}
            <Icon />
            {expanded && <span className="dock-label">{meta.title}</span>}
            {wins.length > 1 && <span className="count">{wins.length}</span>}
          </button>
        );
      })}
      {unpinnedRunning.length > 0 && <div className="sidebar-section">Open</div>}
      {unpinnedRunning.map((w) => {
        const meta = APP_MAP[w.type];
        const Icon = meta.icon;
        return (
          <button
            key={w.id}
            className={`dock-item ${focusedId === w.id ? 'active' : ''} ${w.minimized ? 'minimized' : ''}`}
            onClick={() => {
              if (w.minimized) toggleMinimize(w.id);
              focusWindow(w.id);
            }}
            aria-label={`${w.title}${w.minimized ? ' (minimised)' : ''}`}
            {...tip(`${w.title}${w.minimized ? ' (minimised)' : ''}`)}
          >
            <span className="run-dot" />
            <Icon />
            {expanded && <span className="dock-label">{w.title}</span>}
          </button>
        );
      })}
      <div style={{ flex: 1 }} />
      <button className="dock-item" onClick={() => set({ sidebarAutohide: !autohide })} aria-label={autohide ? 'Keep dock visible' : 'Auto-hide dock'} {...tip(autohide ? 'Keep dock visible' : 'Auto-hide dock')}>
        {autohide ? <Pin /> : <EyeOff />}
        {expanded && <span className="dock-label">{autohide ? 'Keep visible' : 'Auto-hide'}</span>}
      </button>
      <button className="dock-item" onClick={() => set({ sidebarExpanded: !expanded })} aria-label={expanded ? 'Collapse dock' : 'Expand dock'} {...tip(expanded ? 'Collapse' : 'Expand')}>
        {expanded ? <ChevronsLeft /> : <ChevronsRight />}
        {expanded && <span className="dock-label">Collapse</span>}
      </button>
    </nav>
  );
}
