import { useRef } from 'react';
import {
  Bell, Check, ChevronDown, Copy, Download, Expand, Keyboard, LayoutTemplate, Palette, Pencil, RotateCcw,
  Save, Search, Settings, Shrink, Trash2, TrendingUp, Upload,
} from 'lucide-react';
import { useApp } from '../store/appStore';
import { useWorkspace } from '../workspace/WorkspaceStore';
import { WORKSPACE_PRESETS } from '../data/workspaces';
import { useFullscreen, usePopover } from '../components/hooks';
import { confirmAction, promptText } from '../components/ui';
import { clearAllLocalData, downloadFile, readFileAsText, flushAll } from '../lib/persistence';
import { NotificationCentre } from './NotificationCentre';
import { FinTopButton } from '../fin/ui/FinSurfaces';
import { VoiceControlButton } from '../fin/control/VoiceControlUI';
import { ScreensMenu } from './ScreensMenu';
import { AccountButton } from './Account';
import { CURRENT_SCREEN, IS_MAIN_SCREEN, screenLabel } from '../workspace/screen';

export async function saveWorkspaceAs() {
  const name = await promptText({ title: 'Save workspace as', label: 'Workspace name', value: 'My Custom Desk' });
  if (!name) return;
  useWorkspace.getState().saveAs(name);
  flushAll();
  const app = useApp.getState();
  app.toast({ title: 'Workspace saved', body: `"${name}" is stored in this browser.`, tone: 'success' });
  app.notify({ title: 'Workspace saved', body: `"${name}" saved locally.`, category: 'workspace', severity: 'success' });
}

function WorkspaceMenu() {
  const pop = usePopover();
  const fileRef = useRef<HTMLInputElement>(null);
  const ws = useWorkspace();
  const active = ws.active();
  const toast = useApp((s) => s.toast);
  const userWs = ws.workspaces.filter((w) => !w.presetId);
  const presetWs = new Set(ws.workspaces.filter((w) => w.presetId).map((w) => w.presetId));

  const act = (fn: () => void) => () => {
    fn();
    pop.setOpen(false);
  };

  return (
    <div ref={pop.ref} style={{ position: 'relative' }}>
      <button className="btn" onClick={pop.toggle} aria-haspopup="menu" aria-expanded={pop.open} data-tip="Workspaces & presets">
        <LayoutTemplate />
        <span className="ellipsis" style={{ maxWidth: 160 }}>{active.name}</span>
        <ChevronDown />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          if (file.size > 512_000) return toast({ title: 'Import failed', body: 'File is larger than 500 KB.', tone: 'error' });
          const res = ws.importWorkspace(await readFileAsText(file));
          if (res.ok) toast({ title: 'Layout imported', body: res.name, tone: 'success' });
          else toast({ title: 'Import failed', body: res.error, tone: 'error' });
        }}
      />
      {pop.open && (
        <div className="menu neu-raised" style={{ width: 300, maxHeight: '75vh', overflow: 'auto' }} role="menu">
          <div className="palette-group">My workspaces</div>
          {userWs.length === 0 && <div className="tiny muted" style={{ padding: '2px 10px 6px' }}>None yet — use “Save as…”.</div>}
          {userWs.map((w) => (
            <button key={w.id} className={`menu-item ${w.id === active.id ? 'active' : ''}`} onClick={act(() => ws.switchWorkspace(w.id))}>
              {w.id === active.id ? <Check /> : <LayoutTemplate />}
              <span className="ellipsis">{w.name}</span>
            </button>
          ))}
          <div className="palette-group">Presets</div>
          {WORKSPACE_PRESETS.map((p) => (
            <button key={p.id} className={`menu-item ${active.presetId === p.id ? 'active' : ''}`} onClick={act(() => {
              ws.openPreset(p.id);
              if (p.selectInstrument) useApp.getState().selectInstrument(p.selectInstrument);
            })} title={p.description}>
              {active.presetId === p.id ? <Check /> : <LayoutTemplate />}
              <span className="ellipsis">{p.name}</span>
              {presetWs.has(p.id) && active.presetId !== p.id && <span className="tiny muted" style={{ marginLeft: 'auto' }}>edited</span>}
            </button>
          ))}
          <div className="menu-sep" />
          <button className="menu-item" onClick={act(saveWorkspaceAs)}><Save />Save as…</button>
          <button className="menu-item" onClick={act(async () => {
            const name = await promptText({ title: 'Rename workspace', label: 'Name', value: active.name });
            if (name) ws.renameWorkspace(active.id, name);
          })}><Pencil />Rename</button>
          <button className="menu-item" onClick={act(() => {
            const id = ws.duplicateWorkspace(active.id);
            ws.switchWorkspace(id);
            toast({ title: 'Workspace duplicated', tone: 'success' });
          })}><Copy />Duplicate</button>
          <button className="menu-item" onClick={act(() => downloadFile(`${active.name.replace(/[^\w-]+/g, '_')}.layout.json`, ws.exportWorkspace()))}><Download />Export JSON</button>
          <button className="menu-item" onClick={act(() => fileRef.current?.click())}><Upload />Import JSON…</button>
          <button className="menu-item" onClick={act(async () => {
            if (await confirmAction({ title: 'Reset workspace?', body: active.presetId ? 'Restore this preset to its default windows. You can undo this.' : 'Remove all windows from this workspace. You can undo this.', confirmLabel: 'Reset' }))
              ws.resetWorkspace();
          })}><RotateCcw />Reset workspace</button>
          <button className="menu-item danger" disabled={ws.workspaces.length <= 1} onClick={act(async () => {
            if (await confirmAction({ title: `Delete “${active.name}”?`, body: 'This workspace and its layout will be removed from this browser.', confirmLabel: 'Delete' })) {
              if (!ws.deleteWorkspace(active.id)) toast({ title: 'Cannot delete the only workspace', tone: 'warning' });
            }
          })}><Trash2 />Delete workspace</button>
        </div>
      )}
    </div>
  );
}

function SettingsMenu() {
  const pop = usePopover();
  const openApp = useWorkspace((s) => s.openApp);
  const set = useApp((s) => s.set);
  const act = (fn: () => void) => () => {
    fn();
    pop.setOpen(false);
  };
  return (
    <div ref={pop.ref} style={{ position: 'relative' }}>
      <button className="btn icon" onClick={pop.toggle} aria-label="Settings menu" data-tip="Settings">
        <Settings />
      </button>
      {pop.open && (
        <div className="menu neu-raised" role="menu">
          <button className="menu-item" onClick={act(() => openApp('settings'))}><Settings />Settings & data health</button>
          <button className="menu-item" onClick={act(() => set({ appearanceOpen: true, appearanceTarget: null }))}><Palette />Appearance editor</button>
          <button className="menu-item" onClick={act(() => openApp('settings', { settings: { tab: 'shortcuts' } }))}><Keyboard />Keyboard shortcuts</button>
          <div className="menu-sep" />
          <button className="menu-item danger" onClick={act(async () => {
            if (await confirmAction({ title: 'Clear all local data?', body: 'Workspaces, themes, notebook, journal, alerts and holdings stored in this browser will be deleted and the page reloaded.', confirmLabel: 'Clear & reload' })) {
              clearAllLocalData();
              window.location.reload();
            }
          })}><Trash2 />Clear local data…</button>
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const set = useApp((s) => s.set);
  const toast = useApp((s) => s.toast);
  const unread = useApp((s) => s.notifications.filter((n) => !n.read).length);
  const wsName = useWorkspace((s) => s.active().name);
  const notif = usePopover();
  const fs = useFullscreen();

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-logo neu-raised">
          <TrendingUp size={18} />
        </div>
        <div className="col" style={{ gap: 0 }}>
          <span className="brand-name">AI Trading OS</span>
          {!IS_MAIN_SCREEN && <span className="brand-ws">{`${screenLabel(CURRENT_SCREEN)} · ${wsName}`}</span>}
        </div>
      </div>
      <button className="cmd-trigger neu-inset" onClick={() => set({ paletteOpen: true })} aria-label="Open command palette">
        <Search size={15} />
        <span className="ellipsis">Search instruments, apps, commands…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div className="topbar-spacer" />
      <WorkspaceMenu />
      <ScreensMenu />
      <span className="topbar-sep" />
      <FinTopButton />
      <VoiceControlButton />
      <span className="topbar-sep" />
      <div ref={notif.ref} style={{ position: 'relative' }}>
        <button className="btn icon" onClick={notif.toggle} aria-label={`Notifications (${unread} unread)`} data-tip="Notifications">
          <Bell />
          {unread > 0 && <span className="badge-count">{unread > 9 ? '9+' : unread}</span>}
        </button>
        {notif.open && <NotificationCentre />}
      </div>
      <SettingsMenu />
      <AccountButton />
      <button
        className="btn icon"
        onClick={async () => {
          const err = await fs.toggle();
          if (err) toast({ title: 'Full screen unavailable', body: err, tone: 'warning' });
        }}
        aria-label={fs.isFs ? 'Exit full screen' : 'Enter full screen'}
        data-tip={fs.isFs ? 'Exit full screen (Esc)' : 'Full screen'}
      >
        {fs.isFs ? <Shrink /> : <Expand />}
      </button>
    </header>
  );
}
