import { PERSISTED_APP_KEYS, useApp } from '../store/appStore';
import { useWorkspace } from '../workspace/WorkspaceStore';
import { STORAGE_KEYS } from './persistence';
import { CURRENT_SCREEN } from '../workspace/screen';

/**
 * Keeps every screen (browser window) of the OS in sync.
 * BroadcastChannel delivers changes instantly; the `storage` event is a fallback.
 * `applyingRemote` prevents echo loops: changes received from another window are never re-broadcast.
 */
const WS_KEYS = ['workspaces', 'activeId', 'snapToGrid', 'showGuides', 'autoArrange'] as const;
let applyingRemote = false;
let started = false;

type Msg =
  | { t: 'app'; from: string; patch: Record<string, unknown> }
  | { t: 'ws'; from: string; patch: Record<string, unknown> }
  | { t: 'snapshot-request'; from: string }
  | { t: 'snapshot'; from: string; app: Record<string, unknown>; ws: Record<string, unknown> };

const pick = <T extends object>(obj: T, keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, (obj as Record<string, unknown>)[k]]));

function applyWs(patch: Record<string, unknown>) {
  const before = useWorkspace.getState().activeId;
  useWorkspace.setState(patch as never);
  if (patch.activeId !== undefined && patch.activeId !== before) {
    // Another screen switched workspace: reset local history and fit this screen.
    useWorkspace.setState({ past: [], future: [], focusedId: null });
    applyingRemote = false;
    useWorkspace.getState().setCanvas(useWorkspace.getState().canvas);
  }
}

export function startSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const me = `${CURRENT_SCREEN}:${Math.random().toString(36).slice(2, 8)}`;

  if (typeof BroadcastChannel === 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEYS.app) void useApp.persist.rehydrate();
      if (e.key === STORAGE_KEYS.workspace) void useWorkspace.persist.rehydrate();
    });
    return;
  }

  const ch = new BroadcastChannel('aitos-sync');
  const post = (m: Msg) => {
    try {
      ch.postMessage(m);
    } catch {
      /* non-cloneable value — skip */
    }
  };

  useApp.subscribe((s, prev) => {
    if (applyingRemote) return;
    const changed = PERSISTED_APP_KEYS.filter((k) => s[k] !== prev[k]);
    if (changed.length) post({ t: 'app', from: me, patch: pick(s, changed) });
  });
  useWorkspace.subscribe((s, prev) => {
    if (applyingRemote) return;
    const changed = WS_KEYS.filter((k) => s[k] !== prev[k]);
    if (changed.length) post({ t: 'ws', from: me, patch: pick(s, changed) });
  });

  ch.onmessage = (ev: MessageEvent<Msg>) => {
    const m = ev.data;
    if (!m || m.from === me) return;
    if (m.t === 'snapshot-request') {
      if (CURRENT_SCREEN !== 'main') return;
      post({ t: 'snapshot', from: me, app: pick(useApp.getState(), PERSISTED_APP_KEYS), ws: pick(useWorkspace.getState(), WS_KEYS) });
      return;
    }
    applyingRemote = true;
    try {
      if (m.t === 'app') useApp.setState(m.patch as never);
      else if (m.t === 'ws') applyWs(m.patch);
      else if (m.t === 'snapshot' && CURRENT_SCREEN !== 'main') {
        useApp.setState(m.app as never);
        applyWs(m.ws);
      }
    } finally {
      applyingRemote = false;
    }
  };

  // A freshly opened screen asks for the latest state (localStorage writes are debounced).
  if (CURRENT_SCREEN !== 'main') post({ t: 'snapshot-request', from: me });
}
