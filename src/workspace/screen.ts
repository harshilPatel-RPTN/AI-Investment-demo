import type { WidgetFrame, Workspace } from '../types/widgets';

/** Up to six screens: the main window plus five extra monitors. */
export const SCREEN_IDS = ['main', 's2', 's3', 's4', 's5', 's6'] as const;
export type ScreenId = (typeof SCREEN_IDS)[number];

function readScreen(): ScreenId {
  if (typeof window === 'undefined') return 'main';
  const v = new URLSearchParams(window.location.search).get('screen');
  return (SCREEN_IDS as readonly string[]).includes(v ?? '') ? (v as ScreenId) : 'main';
}

/** Which screen this browser window renders. Fixed for the lifetime of the window. */
export const CURRENT_SCREEN: ScreenId = readScreen();
export const IS_MAIN_SCREEN = CURRENT_SCREEN === 'main';
/** A torn-off card: a lean window that shows just the card(s) on this screen. */
export const IS_POPOUT = CURRENT_SCREEN !== 'main' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('popout') === '1';

export const screenOf = (w: Pick<WidgetFrame, 'screenId'>): string => w.screenId ?? 'main';
export const onScreen = (screen: string) => (w: Pick<WidgetFrame, 'screenId'>) => screenOf(w) === screen;

export function screenNumber(id: string) {
  return id === 'main' ? 1 : Number(id.slice(1));
}
export function screenLabel(id: string) {
  return id === 'main' ? 'Screen 1 (main)' : `Screen ${screenNumber(id)}`;
}

/** All screens a workspace uses: main, declared extra screens, and any screen holding a window. */
export function workspaceScreens(ws: Workspace): string[] {
  const set = new Set<string>(['main', ...(ws.screens ?? []), ...ws.windows.map(screenOf)]);
  return SCREEN_IDS.filter((id) => set.has(id));
}
