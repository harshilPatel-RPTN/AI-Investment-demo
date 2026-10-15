import { create } from 'zustand';
import { CURRENT_SCREEN, screenLabel } from '../workspace/screen';
import { useApp } from '../store/appStore';

/* ---------- Physical displays (Window Management API, Chromium) ---------- */

interface ScreenDetailed extends Screen {
  readonly availLeft: number;
  readonly availTop: number;
  readonly left: number;
  readonly top: number;
  readonly isPrimary: boolean;
  readonly isInternal: boolean;
  readonly label: string;
  readonly devicePixelRatio: number;
}
interface ScreenDetails extends EventTarget {
  readonly screens: ScreenDetailed[];
  readonly currentScreen: ScreenDetailed;
}
type WindowWithScreens = Window & { getScreenDetails?: () => Promise<ScreenDetails> };

export interface DisplayInfo {
  key: string;
  label: string;
  width: number;
  height: number;
  left: number;
  top: number;
  primary: boolean;
  internal: boolean;
  current: boolean;
}

/* ---------- Presence of screen windows ---------- */

interface ScreensState {
  /** screenId → last heartbeat (ms). The current window is always present. */
  seen: Record<string, number>;
  displays: DisplayInfo[];
  /** 'unsupported' = no Window Management API (Firefox/Safari): screens open as normal windows. */
  displayAccess: 'unknown' | 'granted' | 'denied' | 'unsupported';
}

export const useScreens = create<ScreensState>(() => ({
  seen: { [CURRENT_SCREEN]: Date.now() },
  displays: [],
  displayAccess: typeof window !== 'undefined' && 'getScreenDetails' in window ? 'unknown' : 'unsupported',
}));

let details: ScreenDetails | null = null;
const opened = new Map<string, Window>();
type PresenceMsg = { t: 'here' | 'bye'; screen: string } | { t: 'close' | 'focus'; screen: string };
let channel: BroadcastChannel | null = null;

export function isScreenOpen(id: string, seen = useScreens.getState().seen) {
  return id === CURRENT_SCREEN || Date.now() - (seen[id] ?? 0) < 6000;
}

function toDisplays(d: ScreenDetails): DisplayInfo[] {
  return d.screens.map((s, i) => ({
    key: `${i}:${s.label || 'display'}`,
    label: s.label || `Display ${i + 1}`,
    width: s.width,
    height: s.height,
    left: s.availLeft,
    top: s.availTop,
    primary: s.isPrimary,
    internal: s.isInternal,
    current: s === d.currentScreen,
  }));
}

/** Asks the browser for the list of connected monitors (may show a permission prompt). */
export async function detectDisplays(): Promise<DisplayInfo[]> {
  const w = window as WindowWithScreens;
  if (!w.getScreenDetails) {
    useScreens.setState({ displayAccess: 'unsupported' });
    return [];
  }
  try {
    details = await w.getScreenDetails();
    const update = () => details && useScreens.setState({ displays: toDisplays(details), displayAccess: 'granted' });
    update();
    details.addEventListener('screenschange', update);
    details.addEventListener('currentscreenchange', update);
    return useScreens.getState().displays;
  } catch {
    useScreens.setState({ displayAccess: 'denied' });
    return [];
  }
}

/** Opens (or focuses) the browser window for a screen, on the assigned monitor when known. */
export function openScreenWindow(
  screenId: string,
  displayKey?: string,
  opts?: { popout?: boolean; rect?: { left: number; top: number; width: number; height: number } },
): { ok: boolean; message?: string } {
  if (screenId === CURRENT_SCREEN) return { ok: true };
  const key = displayKey ?? useApp.getState().screenDisplays[screenId];
  const target = useScreens.getState().displays.find((d) => d.key === key);
  const r = opts?.rect;
  const features = r
    ? `popup,left=${Math.round(r.left)},top=${Math.round(r.top)},width=${Math.round(r.width)},height=${Math.round(r.height)}`
    : target
      ? `popup,left=${target.left},top=${target.top},width=${target.width},height=${target.height}`
      : `popup,width=${Math.min(1600, window.screen.availWidth)},height=${Math.min(1000, window.screen.availHeight)}`;
  const url = `${window.location.pathname}?screen=${screenId}${opts?.popout ? '&popout=1' : ''}`;
  const win = window.open(url, `aitos-${screenId}`, features);
  if (!win) return { ok: false, message: 'The browser blocked the new window. Allow pop-ups for this site, then try again.' };
  opened.set(screenId, win);
  try {
    win.focus();
  } catch {
    /* cross-window focus may be ignored */
  }
  if (displayKey) useApp.getState().set({ screenDisplays: { ...useApp.getState().screenDisplays, [screenId]: displayKey } });
  return { ok: true };
}

export function focusScreen(screenId: string) {
  const w = opened.get(screenId);
  if (w && !w.closed) w.focus();
  channel?.postMessage({ t: 'focus', screen: screenId } satisfies PresenceMsg);
}

export function closeScreenWindow(screenId: string) {
  opened.get(screenId)?.close();
  opened.delete(screenId);
  channel?.postMessage({ t: 'close', screen: screenId } satisfies PresenceMsg);
  useScreens.setState((s) => ({ seen: { ...s.seen, [screenId]: 0 } }));
}

/** Puts THIS window full-screen on a chosen monitor (needs a click; Chromium supports the screen option). */
export async function fullscreenOnDisplay(displayKey?: string): Promise<string | null> {
  const idx = details?.screens.findIndex((_, i) => `${i}:${details!.screens[i].label || 'display'}` === displayKey) ?? -1;
  try {
    const el = document.documentElement as HTMLElement & { requestFullscreen(o?: FullscreenOptions & { screen?: ScreenDetailed }): Promise<void> };
    await el.requestFullscreen(idx >= 0 && details ? { screen: details.screens[idx] } : undefined);
    return null;
  } catch {
    return 'The browser refused the full-screen request.';
  }
}

export function startPresence() {
  if (typeof window === 'undefined' || channel || typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel('aitos-screens');
  const here = () => channel?.postMessage({ t: 'here', screen: CURRENT_SCREEN } satisfies PresenceMsg);
  channel.onmessage = (ev: MessageEvent<PresenceMsg>) => {
    const m = ev.data;
    if (m.t === 'here') useScreens.setState((s) => ({ seen: { ...s.seen, [m.screen]: Date.now() } }));
    else if (m.t === 'bye') useScreens.setState((s) => ({ seen: { ...s.seen, [m.screen]: 0 } }));
    else if (m.t === 'close' && m.screen === CURRENT_SCREEN && CURRENT_SCREEN !== 'main') window.close();
    else if (m.t === 'focus' && m.screen === CURRENT_SCREEN) window.focus();
  };
  here();
  setInterval(() => {
    here();
    useScreens.setState((s) => ({ seen: { ...s.seen, [CURRENT_SCREEN]: Date.now() } }));
  }, 2000);
  window.addEventListener('beforeunload', () => channel?.postMessage({ t: 'bye', screen: CURRENT_SCREEN } satisfies PresenceMsg));
  // Re-use monitor access silently if it was granted before.
  const perms = navigator.permissions as Permissions | undefined;
  perms
    ?.query({ name: 'window-management' as PermissionName })
    .then((st) => {
      if (st.state === 'granted') void detectDisplays();
      else if (st.state === 'denied') useScreens.setState({ displayAccess: 'denied' });
    })
    .catch(() => undefined);
  document.title = CURRENT_SCREEN === 'main' ? 'AI Trading Assistance OS' : `AI-TOS — ${screenLabel(CURRENT_SCREEN)}`;
}
