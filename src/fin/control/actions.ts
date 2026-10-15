import type { WidgetFrame, WidgetType } from '../../types/widgets';
import { useWorkspace, LAYOUT_MODES } from '../../workspace/WorkspaceStore';
import { APP_MAP } from '../../workspace/registry';
import { CURRENT_SCREEN, onScreen } from '../../workspace/screen';
import { useApp } from '../../store/appStore';
import { getInstrument } from '../../data/instruments';
import { WORKSPACE_PRESETS } from '../../data/workspaces';
import { THEMES } from '../../design-system/themes';
import { getCommunity } from '../../data/community/communities';
import { useFin } from '../finStore';
import { useVoiceControl } from './voiceControl';
import type { CommandResult, VoiceCommand } from './types';

const ok = (message: string): CommandResult => ({ ok: true, message });
const fail = (message: string): CommandResult => ({ ok: false, message });

/** Visible windows on this screen. */
function windows(): WidgetFrame[] {
  return useWorkspace.getState().active().windows.filter((w) => w.visible && onScreen(CURRENT_SCREEN)(w));
}

/** The window a command means: the focused one when it matches, otherwise the top-most of that type. */
function findWindow(type?: WidgetType): WidgetFrame | undefined {
  const ws = windows();
  const focused = useWorkspace.getState().focusedId;
  if (!type) return ws.find((w) => w.id === focused) ?? [...ws].filter((w) => !w.minimized).sort((a, b) => b.zIndex - a.zIndex)[0];
  const ofType = ws.filter((w) => w.type === type);
  return ofType.find((w) => w.id === focused) ?? [...ofType].sort((a, b) => Number(a.minimized) - Number(b.minimized) || b.zIndex - a.zIndex)[0];
}

const title = (type: WidgetType) => APP_MAP[type]?.title ?? type;
const sym = (id: string) => getInstrument(id)?.symbol ?? id;

function scrollCanvas(by: number | 'top') {
  const el = document.getElementById('workspace-canvas');
  if (!el) return;
  if (by === 'top') el.scrollTo({ top: 0, behavior: 'smooth' });
  else el.scrollBy({ top: by * el.clientHeight * 0.8, behavior: 'smooth' });
}

export function executeCommand(cmd: VoiceCommand): CommandResult {
  const ws = useWorkspace.getState();
  const app = useApp.getState();
  switch (cmd.kind) {
    case 'open-app': {
      if (cmd.instrument) {
        if (!getInstrument(cmd.instrument)) return fail(`I don't have ${cmd.instrument} in this app.`);
        app.selectInstrument(cmd.instrument);
      }
      ws.openApp(cmd.app);
      return ok(`Opened ${title(cmd.app)}${cmd.instrument ? ` · ${sym(cmd.instrument)}` : ''}.`);
    }
    case 'window': {
      const w = findWindow(cmd.app);
      if (!w) {
        if (cmd.app && (cmd.action === 'focus' || cmd.action === 'restore' || cmd.action === 'maximize')) {
          const id = ws.openApp(cmd.app);
          if (cmd.action === 'maximize') useWorkspace.getState().toggleMaximize(id);
          return ok(`Opened ${title(cmd.app)}.`);
        }
        return fail(cmd.app ? `${title(cmd.app)} isn't open.` : 'No window is open.');
      }
      const name = w.title || title(w.type);
      switch (cmd.action) {
        case 'close':
          ws.closeWindow(w.id);
          return ok(`Closed ${name}. Say "undo" to bring it back.`);
        case 'minimize':
          if (!w.minimized) ws.toggleMinimize(w.id);
          return ok(`Minimised ${name}.`);
        case 'maximize':
          if (w.minimized) ws.toggleMinimize(w.id);
          if (!useWorkspace.getState().active().windows.find((x) => x.id === w.id)?.maximized) useWorkspace.getState().toggleMaximize(w.id);
          return ok(`Maximised ${name}.`);
        case 'restore':
          if (w.minimized) ws.toggleMinimize(w.id);
          if (useWorkspace.getState().active().windows.find((x) => x.id === w.id)?.maximized) useWorkspace.getState().toggleMaximize(w.id);
          ws.focusWindow(w.id);
          return ok(`Restored ${name}.`);
        case 'focus':
          if (w.minimized) ws.toggleMinimize(w.id);
          ws.focusWindow(w.id);
          return ok(`Switched to ${name}.`);
      }
      return fail('Unknown window action.');
    }
    case 'all-windows': {
      if (!windows().length) return fail('No windows are open.');
      if (cmd.action === 'close') ws.closeAllWindows();
      else if (cmd.action === 'minimize') ws.minimizeAllWindows();
      else ws.restoreAllWindows();
      return ok(cmd.action === 'close' ? 'Closed all windows. Say "undo" to bring them back.' : cmd.action === 'minimize' ? 'Minimised all windows.' : 'Restored all windows.');
    }
    case 'swap': {
      const a = findWindow(cmd.a);
      const b = findWindow(cmd.b);
      if (!a || !b) return fail(`Both windows must be open to swap — ${!a ? title(cmd.a) : title(cmd.b)} isn't.`);
      if (a.id === b.id) return fail('Those are the same window.');
      if (a.locked || b.locked) return fail('One of those windows is locked.');
      ws.swapWindows(a.id, b.id);
      return ok(`Swapped ${title(cmd.a)} and ${title(cmd.b)}.`);
    }
    case 'instrument': {
      if (!getInstrument(cmd.id)) return fail(`I don't have ${cmd.id} in this app.`);
      app.selectInstrument(cmd.id);
      return ok(`Switched to ${sym(cmd.id)}.`);
    }
    case 'timeframe': {
      let chart = findWindow('chart-studio');
      if (!chart) {
        ws.openApp('chart-studio');
        chart = findWindow('chart-studio');
      }
      if (!chart) return fail('Could not open Chart Studio.');
      useWorkspace.getState().updateSettings(chart.id, { timeframe: cmd.tf });
      return ok(`Chart timeframe set to ${cmd.tf}.`);
    }
    case 'preset': {
      const p = WORKSPACE_PRESETS.find((x) => x.id === cmd.id);
      if (!p) return fail('Unknown workspace preset.');
      ws.openPreset(p.id);
      if (p.selectInstrument) app.selectInstrument(p.selectInstrument);
      return ok(`Opened the ${p.name} workspace.`);
    }
    case 'layout': {
      ws.applyLayout(cmd.mode);
      return ok(`Arranged windows: ${LAYOUT_MODES.find((m) => m.id === cmd.mode)?.label ?? cmd.mode}.`);
    }
    case 'theme': {
      const th = THEMES.find((x) => x.id === cmd.id);
      if (!th) return fail('Unknown theme.');
      app.setTheme(th.id);
      return ok(`Theme changed to ${th.name}.`);
    }
    case 'community': {
      const c = getCommunity(cmd.id);
      if (!c) return fail('Unknown community.');
      const settings = { communityId: c.id, ...(cmd.tab ? { tab: cmd.tab } : {}) };
      const w = findWindow('community');
      if (w) {
        ws.updateSettings(w.id, settings);
        if (w.minimized) ws.toggleMinimize(w.id);
        ws.focusWindow(w.id);
      } else ws.openApp('community', { settings });
      return ok(`Opened the ${c.name}${cmd.tab ? ` · ${cmd.tab}` : ''}.`);
    }
    case 'watchlist': {
      const id = cmd.instrument ?? app.selectedInstrumentId;
      if (!getInstrument(id)) return fail('Which instrument?');
      const on = app.watchlist.includes(id);
      if (cmd.action === 'add' ? !on : on) app.toggleWatch(id);
      return ok(cmd.action === 'add' ? `${sym(id)} is on your watchlist.` : `Removed ${sym(id)} from your watchlist.`);
    }
    case 'briefing': {
      const fin = useFin.getState();
      if (fin.mode === 'closed') fin.open('compact');
      void fin.startBriefing(cmd.length);
      return ok(cmd.length === 'short' ? 'Starting a short briefing.' : 'Starting your briefing.');
    }
    case 'ask-fin': {
      const fin = useFin.getState();
      if (fin.mode === 'closed') fin.open('compact');
      void fin.sendText(cmd.text);
      return ok('Asking FIN…');
    }
    case 'ui':
      return runUi(cmd.action);
  }
}

function runUi(action: Extract<VoiceCommand, { kind: 'ui' }>['action']): CommandResult {
  const ws = useWorkspace.getState();
  const app = useApp.getState();
  const fin = useFin.getState();
  switch (action) {
    case 'undo':
      if (!ws.past.length) return fail('Nothing to undo.');
      ws.undo();
      return ok('Undone.');
    case 'redo':
      if (!ws.future.length) return fail('Nothing to redo.');
      ws.redo();
      return ok('Redone.');
    case 'fullscreen':
      if (document.fullscreenElement) return ok('Already full screen.');
      document.documentElement.requestFullscreen?.().catch(() =>
        useApp.getState().toast({ title: 'Full screen blocked', body: 'The browser only allows full screen after a click — use the full-screen button in the top bar.', tone: 'warning' }));
      return ok('Going full screen.');
    case 'exit-fullscreen':
      if (!document.fullscreenElement) return ok('Not in full screen.');
      void document.exitFullscreen?.();
      return ok('Left full screen.');
    case 'palette':
      app.set({ paletteOpen: true, launcherOpen: false });
      return ok('Opened the command palette.');
    case 'launcher':
      app.set({ launcherOpen: true, paletteOpen: false });
      return ok('Opened the app launcher.');
    case 'appearance':
      app.set({ appearanceOpen: true, appearanceTarget: null });
      return ok('Opened the appearance editor.');
    case 'close-overlays':
      app.set({ paletteOpen: false, launcherOpen: false, appearanceOpen: false });
      useVoiceControl.getState().setHelp(false);
      return ok('Closed.');
    case 'auto-arrange-on':
    case 'auto-arrange-off':
      if (ws.autoArrange !== (action === 'auto-arrange-on')) ws.toggleAutoArrange();
      return ok(`Auto-arrange ${action === 'auto-arrange-on' ? 'on' : 'off'}.`);
    case 'snap-on':
    case 'snap-off':
      if (ws.snapToGrid !== (action === 'snap-on')) ws.toggleSnap();
      return ok(`Snap to grid ${action === 'snap-on' ? 'on' : 'off'}.`);
    case 'scroll-down':
      scrollCanvas(1);
      return ok('Scrolled down.');
    case 'scroll-up':
      scrollCanvas(-1);
      return ok('Scrolled up.');
    case 'scroll-top':
      scrollCanvas('top');
      return ok('Back to the top.');
    case 'fin-open':
      fin.open('compact');
      return ok('FIN is open.');
    case 'fin-close':
      fin.close();
      return ok('Closed FIN.');
    case 'fin-stop':
      fin.stop();
      return ok('Stopped.');
    case 'fin-pause':
      fin.pause();
      return ok('Paused.');
    case 'fin-resume':
      fin.resume();
      return ok('Resuming.');
    case 'voice-off':
      useVoiceControl.getState().stop();
      return ok('Voice control off.');
    case 'help':
      useVoiceControl.getState().setHelp(true);
      return ok('Here are the things you can say.');
  }
}

export function executeAll(cmds: VoiceCommand[]): CommandResult[] {
  return cmds.map((c) => {
    try {
      return executeCommand(c);
    } catch (e) {
      return fail(`That didn't work: ${(e as Error).message}`);
    }
  });
}
