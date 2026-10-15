import { useEffect, useState } from 'react';
import { ExternalLink, Focus, Monitor, MonitorSmartphone, Plus, ScanSearch, Trash2, X } from 'lucide-react';
import { useApp } from '../store/appStore';
import { useWorkspace } from '../workspace/WorkspaceStore';
import { CURRENT_SCREEN, screenLabel, screenOf, workspaceScreens } from '../workspace/screen';
import { closeScreenWindow, detectDisplays, focusScreen, fullscreenOnDisplay, isScreenOpen, openScreenWindow, useScreens } from '../lib/screens';
import { usePopover } from '../components/hooks';
import { confirmAction } from '../components/ui';

/** Top-bar control for multi-monitor setups: one browser window per screen, all kept in sync. */
export function ScreensMenu() {
  const pop = usePopover();
  const ws = useWorkspace((s) => s.active());
  const { addScreen, removeScreen } = useWorkspace.getState();
  const seen = useScreens((s) => s.seen);
  const displays = useScreens((s) => s.displays);
  const access = useScreens((s) => s.displayAccess);
  const assigned = useApp((s) => s.screenDisplays);
  const toast = useApp((s) => s.toast);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!pop.open) return;
    const t = setInterval(() => tick((x) => x + 1), 2000);
    return () => clearInterval(t);
  }, [pop.open]);

  const screens = workspaceScreens(ws);
  const openCount = screens.filter((id) => isScreenOpen(id, seen)).length;

  const open = (id: string, key?: string) => {
    const r = openScreenWindow(id, key);
    if (!r.ok) toast({ title: 'Could not open screen', body: r.message, tone: 'warning' });
  };
  const assign = (id: string, key: string) => useApp.getState().set({ screenDisplays: { ...assigned, [id]: key } });

  return (
    <div ref={pop.ref} style={{ position: 'relative' }}>
      <button className={`btn ${openCount > 1 ? 'active' : ''}`} onClick={pop.toggle} aria-haspopup="dialog" aria-expanded={pop.open} data-tip="Multi-monitor screens">
        <MonitorSmartphone />
        {CURRENT_SCREEN === 'main' ? `Screens ${openCount}/${screens.length}` : screenLabel(CURRENT_SCREEN)}
      </button>
      {pop.open && (
        <div className="popover neu-raised" style={{ width: 430 }} role="dialog" aria-label="Screens">
          <div className="row between" style={{ padding: '12px 14px 6px' }}>
            <h3>Screens · {ws.name}</h3>
            <button className="btn icon sm ghost" onClick={() => pop.setOpen(false)} aria-label="Close"><X /></button>
          </div>
          <p className="tiny muted" style={{ padding: '0 14px 8px' }}>
            Each screen is its own browser window — put one on every monitor. Instrument, theme, watchlist, alerts and layouts stay in sync across all of them.
          </p>
          <div className="scroll col gap-2" style={{ padding: '0 12px 12px' }}>
            {screens.map((id) => {
              const isOpen = isScreenOpen(id, seen);
              const count = ws.windows.filter((w) => screenOf(w) === id).length;
              const here = id === CURRENT_SCREEN;
              return (
                <div key={id} className="neu-soft card col gap-2" style={{ padding: 10 }}>
                  <div className="row between">
                    <div className="row gap-2">
                      <span className={`status-dot ${isOpen ? 'ok' : ''}`} />
                      <span className="bold">{screenLabel(id)}</span>
                      {here && <span className="chip accent tiny">this window</span>}
                    </div>
                    <span className="tiny muted">{count} window{count === 1 ? '' : 's'} · {isOpen ? 'open' : 'closed'}</span>
                  </div>
                  {displays.length > 0 && (
                    <div className="row">
                      <span className="tiny muted">Monitor</span>
                      <select className="select" style={{ height: 26 }} value={assigned[id] ?? ''} onChange={(e) => assign(id, e.target.value)} aria-label={`Monitor for ${screenLabel(id)}`}>
                        <option value="">Auto</option>
                        {displays.map((d) => <option key={d.key} value={d.key}>{d.label} · {d.width}×{d.height}{d.primary ? ' · primary' : ''}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="row wrap gap-1">
                    {here ? (
                      <button className="btn sm" onClick={async () => { const err = await fullscreenOnDisplay(assigned[id]); if (err) toast({ title: err, tone: 'warning' }); }}>
                        <Monitor /> Full screen{assigned[id] ? ' on its monitor' : ''}
                      </button>
                    ) : isOpen ? (
                      <>
                        <button className="btn sm" onClick={() => focusScreen(id)}><Focus /> Focus</button>
                        <button className="btn sm" onClick={() => closeScreenWindow(id)}><X /> Close window</button>
                      </>
                    ) : (
                      <button className="btn sm primary" onClick={() => open(id, assigned[id])}><ExternalLink /> Open{assigned[id] ? ' on its monitor' : ''}</button>
                    )}
                    {id !== 'main' && (
                      <button className="btn sm danger" onClick={async () => {
                        if (count && !(await confirmAction({ title: `Remove ${screenLabel(id)}?`, body: `Its ${count} window(s) move back to Screen 1.`, confirmLabel: 'Remove', danger: false }))) return;
                        closeScreenWindow(id);
                        removeScreen(id);
                      }}><Trash2 /> Remove</button>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="row wrap gap-1">
              <button className="btn sm primary" disabled={screens.length >= 6} onClick={() => {
                const id = addScreen();
                if (id) open(id, assigned[id]);
              }}><Plus /> Add screen</button>
              {screens.length > 1 && (
                <button className="btn sm" onClick={() => screens.filter((id) => !isScreenOpen(id, seen)).forEach((id) => open(id, assigned[id]))}>
                  <ExternalLink /> Open all screens
                </button>
              )}
            </div>
            <div className="divider" />
            <div className="col gap-1">
              <div className="row between">
                <span className="section-title">Monitors</span>
                {access !== 'unsupported' && (
                  <button className="btn sm" onClick={() => void detectDisplays()}><ScanSearch /> {displays.length ? 'Refresh' : 'Detect monitors'}</button>
                )}
              </div>
              {access === 'unsupported' && <span className="tiny muted">This browser can't place windows on specific monitors. Screens open as normal windows — drag each to a monitor and press full screen there. Chrome or Edge can place them automatically.</span>}
              {access === 'denied' && <span className="tiny warn">Monitor access was blocked. Allow "Window management" in the site settings to place screens automatically.</span>}
              {access === 'unknown' && <span className="tiny muted">Detect monitors (Chrome/Edge asks once) to open each screen directly on a chosen display.</span>}
              {displays.map((d) => (
                <span key={d.key} className="small">{d.label} — {d.width}×{d.height}{d.primary ? ' · primary' : ''}{d.current ? ' · this window' : ''}</span>
              ))}
              <span className="tiny muted">Tip: opening several windows at once may need pop-ups allowed for this site.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
