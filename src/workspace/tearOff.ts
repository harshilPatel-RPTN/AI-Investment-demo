import { create } from 'zustand';
import { useWorkspace } from './WorkspaceStore';
import { useApp } from '../store/appStore';
import { openScreenWindow } from '../lib/screens';
import { CURRENT_SCREEN, IS_POPOUT, onScreen } from './screen';

/** Live drag state used to show the tear-off drop zone and the "release to pop out" hint. */
export const useTearOff = create<{ dragging: string | null; outside: boolean; overTarget: boolean }>(() => ({
  dragging: null,
  outside: false,
  overTarget: false,
}));

export const TEAROFF_TARGET_ID = 'tearoff-target';

/** True when the pointer is at/over the edge of the browser viewport (i.e. dragged out of the page). */
export function pointerOutside(x: number, y: number) {
  return x <= 1 || y <= 1 || x >= window.innerWidth - 1 || y >= window.innerHeight - 1;
}

export function pointerOverTarget(x: number, y: number) {
  const r = document.getElementById(TEAROFF_TARGET_ID)?.getBoundingClientRect();
  return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

/**
 * Tears a card out into its own browser window. The window is opened FIRST, synchronously,
 * so it counts as part of the user's drag/click gesture and isn't pop-up blocked.
 * `at` is the drop point in physical screen coordinates.
 */
export function popOutWindow(frameId: string, at?: { x: number; y: number }) {
  const ws = useWorkspace.getState();
  const f = ws.active().windows.find((w) => w.id === frameId);
  if (!f) return;
  const sid = ws.addScreen();
  if (!sid) {
    useApp.getState().toast({ title: 'Too many screens', body: 'Up to 6 screens/pop-outs are supported. Dock one back first.', tone: 'warning' });
    return;
  }
  const width = Math.max(380, Math.round(f.width));
  const height = Math.max(300, Math.round(f.height) + 80); // + slim header and browser chrome
  const left = at ? at.x - Math.min(160, width / 2) : window.screenX + 80;
  const top = at ? at.y - 24 : window.screenY + 80;
  const res = openScreenWindow(sid, undefined, { popout: true, rect: { left, top, width, height } });
  if (!res.ok) {
    ws.removeScreen(sid);
    useApp.getState().toast({ title: 'Pop-out blocked', body: res.message, tone: 'warning' });
    return;
  }
  ws.moveToScreen(frameId, sid);
}

/** From a pop-out window: send its card(s) back to the main screen and close this window. */
export function dockBack() {
  if (!IS_POPOUT) return;
  useWorkspace.getState().removeScreen(CURRENT_SCREEN);
  setTimeout(() => window.close(), 150);
}

/** Cards currently on this pop-out screen. */
export function popoutCards() {
  return useWorkspace.getState().active().windows.filter(onScreen(CURRENT_SCREEN));
}
