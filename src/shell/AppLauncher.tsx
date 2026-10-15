import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Star, X } from 'lucide-react';
import { useApp } from '../store/appStore';
import { useWorkspace } from '../workspace/WorkspaceStore';
import { APP_CATEGORIES, APPS, APP_MAP, type AppCategory } from '../workspace/registry';
import type { WidgetType } from '../types/widgets';
import { activateApp } from './Sidebar';

type Tab = 'All' | 'Favourites' | 'Recent' | AppCategory;

export function AppLauncher() {
  const open = useApp((s) => s.launcherOpen);
  const pinned = useApp((s) => s.pinnedApps);
  const recent = useApp((s) => s.recentApps);
  const { set, togglePin, reorderPinned } = useApp.getState();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('All');
  const [cursor, setCursor] = useState(0);
  const [drag, setDrag] = useState<WidgetType | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const list = useMemo(() => {
    let items = APPS;
    if (tab === 'Favourites') items = pinned.map((t) => APP_MAP[t]).filter(Boolean);
    else if (tab === 'Recent') items = recent.map((t) => APP_MAP[t]).filter(Boolean);
    else if (tab !== 'All') items = APPS.filter((a) => a.category === tab);
    const s = q.trim().toLowerCase();
    if (s) items = items.filter((a) => [a.title, a.description, a.category, ...(a.keywords ?? [])].join(' ').toLowerCase().includes(s));
    return items;
  }, [tab, q, pinned, recent]);

  useEffect(() => setCursor(0), [q, tab]);
  useEffect(() => {
    if (open) {
      setQ('');
      setTab('All');
    }
  }, [open]);

  if (!open) return null;
  const close = () => set({ launcherOpen: false });
  const launch = (type: WidgetType, forceNew = false) => {
    if (forceNew) {
      useWorkspace.getState().openApp(type, { forceNew: true });
      useApp.getState().noteRecentApp(type);
    } else activateApp(type);
    close();
  };

  const cols = () => {
    const el = gridRef.current;
    if (!el) return 4;
    return getComputedStyle(el).gridTemplateColumns.split(' ').length || 4;
  };

  return (
    <div className="overlay" onMouseDown={close}>
      <div
        className="modal wide neu-raised"
        role="dialog"
        aria-modal
        aria-label="App launcher"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') return close();
          const c = cols();
          const mv = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: c, ArrowUp: -c }[e.key];
          if (mv && (e.target as HTMLElement).tagName !== 'INPUT' || (mv && (e.key === 'ArrowDown' || e.key === 'ArrowUp'))) {
            e.preventDefault();
            setCursor((x) => Math.max(0, Math.min(list.length - 1, x + (mv as number))));
          }
          if (e.key === 'Enter' && list[cursor]) {
            e.preventDefault();
            launch(list[cursor].type, e.shiftKey);
          }
        }}
      >
        <div className="modal-head">
          <div className="neu-inset row grow" style={{ padding: '0 10px', height: 36 }}>
            <Search size={15} className="muted" />
            <input className="input" style={{ boxShadow: 'none', background: 'transparent' }} autoFocus placeholder="Search apps…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search apps" />
          </div>
          <button className="btn icon" onClick={close} aria-label="Close launcher" data-tip="Close (Esc)">
            <X />
          </button>
        </div>
        <div style={{ padding: '10px 16px 0' }}>
          <div className="tabs">
            {(['All', 'Favourites', 'Recent', ...APP_CATEGORIES] as Tab[]).map((t) => (
              <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="modal-body">
          {list.length === 0 ? (
            <div className="empty">No apps match. {tab === 'Recent' ? 'Open an app to see it here.' : ''}</div>
          ) : (
            <div className="launcher-grid" ref={gridRef}>
              {list.map((a, i) => {
                const Icon = a.icon;
                const isPinned = pinned.includes(a.type);
                return (
                  <div
                    key={a.type}
                    role="button"
                    tabIndex={0}
                    className={`app-tile neu-raised ${cursor === i ? 'neu-pressed' : ''}`}
                    style={cursor === i ? { color: 'var(--accent)' } : undefined}
                    onClick={(e) => launch(a.type, e.shiftKey)}
                    onFocus={() => setCursor(i)}
                    draggable={tab === 'Favourites'}
                    onDragStart={() => setDrag(a.type)}
                    onDragOver={(e) => tab === 'Favourites' && e.preventDefault()}
                    onDrop={() => {
                      if (drag && drag !== a.type) reorderPinned(pinned.indexOf(drag), pinned.indexOf(a.type));
                      setDrag(null);
                    }}
                    title={`${a.description}\nShift+click opens a new window.`}
                  >
                    <button
                      className="btn icon sm ghost pin"
                      aria-label={isPinned ? 'Unpin from dock' : 'Pin to dock'}
                      data-tip={isPinned ? 'Unpin' : 'Pin to dock'}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(a.type);
                      }}
                    >
                      <Star style={{ fill: isPinned ? 'var(--warning)' : 'none', color: isPinned ? 'var(--warning)' : undefined }} />
                    </button>
                    <div className="tile-icon neu-inset">
                      <Icon />
                    </div>
                    <div className="tile-name">{a.title}</div>
                    <div className="tile-desc">{a.description}</div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="tiny muted mt-3">
            Arrow keys to move · Enter to open · Shift+Enter / Shift+click opens a new instance · {tab === 'Favourites' ? 'Drag tiles to reorder favourites' : 'Star an app to pin it to the dock'}
          </div>
        </div>
      </div>
    </div>
  );
}
