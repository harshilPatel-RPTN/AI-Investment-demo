import type { WidgetType } from '../../types/widgets';
import type { CommunityId } from '../../types/community';
import { APPS } from '../../workspace/registry';
import { LAYOUT_MODES, type LayoutMode } from '../../workspace/WorkspaceStore';
import { INSTRUMENT_SEEDS } from '../../data/instruments';
import { WORKSPACE_PRESETS } from '../../data/workspaces';
import { THEMES } from '../../design-system/themes';
import { COMMUNITY_IDS } from '../../types/community';
import { TIMEFRAMES } from '../../data/priceSeries';
import type { Timeframe } from '../../types/market';
import type { CommunityTab, UiAction, VoiceCommand, WindowAction } from './types';

/** Gemini function declarations (OpenAPI subset). Sent with the voice-token request so the server stays generic. */
export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: { type: 'OBJECT'; properties: Record<string, { type: 'STRING'; description?: string; enum?: string[] }>; required?: string[] };
}

const str = (description: string, values?: readonly string[]) => ({ type: 'STRING' as const, description, ...(values ? { enum: [...values] } : {}) });

const APP_IDS = APPS.map((a) => a.type);
const APP_HELP = APPS.map((a) => `${a.type} = ${a.title}`).join('; ');
const INST_IDS = INSTRUMENT_SEEDS.map((i) => i.id);
const INST_HELP = INSTRUMENT_SEEDS.map((i) => `${i.id} = ${i.symbol} ${i.displayName}`).join('; ');
const UI_ACTIONS: UiAction[] = ['undo', 'redo', 'fullscreen', 'exit-fullscreen', 'palette', 'launcher', 'appearance', 'close-overlays', 'auto-arrange-on', 'auto-arrange-off', 'snap-on', 'snap-off', 'scroll-down', 'scroll-up', 'scroll-top', 'help'];
const TABS: CommunityTab[] = ['discussions', 'ideas', 'polls', 'sentiment', 'trending'];

export const CONTROL_TOOLS: ToolDeclaration[] = [
  { name: 'open_app', description: `Open (or bring to front) an app window, optionally showing an instrument. Apps: ${APP_HELP}.`, parameters: { type: 'OBJECT', properties: { app: str('App id', APP_IDS), instrument: str(`Optional instrument id. ${INST_HELP}`, INST_IDS) }, required: ['app'] } },
  { name: 'window_action', description: 'Close, minimise, maximise, restore or focus one window. Omit app to act on the focused window.', parameters: { type: 'OBJECT', properties: { action: str('What to do', ['close', 'minimize', 'maximize', 'restore', 'focus']), app: str('App id of the window', APP_IDS) }, required: ['action'] } },
  { name: 'all_windows', description: 'Close, minimise or restore every window on the screen.', parameters: { type: 'OBJECT', properties: { action: str('What to do', ['close', 'minimize', 'restore']) }, required: ['action'] } },
  { name: 'swap_windows', description: 'Swap the positions and sizes of two open windows.', parameters: { type: 'OBJECT', properties: { a: str('First app id', APP_IDS), b: str('Second app id', APP_IDS) }, required: ['a', 'b'] } },
  { name: 'select_instrument', description: `Switch the selected instrument that linked windows follow. ${INST_HELP}`, parameters: { type: 'OBJECT', properties: { instrument: str('Instrument id', INST_IDS) }, required: ['instrument'] } },
  { name: 'set_chart_timeframe', description: 'Change the Chart Studio candle timeframe.', parameters: { type: 'OBJECT', properties: { timeframe: str('Timeframe', TIMEFRAMES) }, required: ['timeframe'] } },
  { name: 'open_workspace_preset', description: `Load a workspace preset: ${WORKSPACE_PRESETS.map((p) => `${p.id} = ${p.name}`).join('; ')}.`, parameters: { type: 'OBJECT', properties: { preset: str('Preset id', WORKSPACE_PRESETS.map((p) => p.id)) }, required: ['preset'] } },
  { name: 'arrange_windows', description: `Arrange the open windows: ${LAYOUT_MODES.map((m) => `${m.id} = ${m.label}`).join('; ')}.`, parameters: { type: 'OBJECT', properties: { mode: str('Layout mode', LAYOUT_MODES.map((m) => m.id)) }, required: ['mode'] } },
  { name: 'set_theme', description: `Change the colour theme: ${THEMES.map((t) => `${t.id} = ${t.name}`).join('; ')}.`, parameters: { type: 'OBJECT', properties: { theme: str('Theme id', THEMES.map((t) => t.id)) }, required: ['theme'] } },
  { name: 'open_community', description: 'Open one of the four trading communities, optionally on a tab.', parameters: { type: 'OBJECT', properties: { community: str('Community', COMMUNITY_IDS), tab: str('Optional tab', TABS) }, required: ['community'] } },
  { name: 'watchlist', description: 'Add or remove an instrument from the watchlist (defaults to the selected instrument).', parameters: { type: 'OBJECT', properties: { action: str('add or remove', ['add', 'remove']), instrument: str('Instrument id', INST_IDS) }, required: ['action'] } },
  { name: 'start_briefing', description: 'Start the spoken FIN market briefing.', parameters: { type: 'OBJECT', properties: { length: str('short or full', ['short', 'full']) } } },
  { name: 'ui_action', description: 'Other app controls: undo/redo layout changes, full screen, command palette, app launcher, appearance editor, close overlays, auto-arrange and snap toggles, scrolling, or the voice-command help list.', parameters: { type: 'OBJECT', properties: { action: str('Action', UI_ACTIONS) }, required: ['action'] } },
];

const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : undefined);

/** Maps a Gemini tool call to a command; null when the call or its arguments are invalid. */
export function commandFromTool(name: string, args: Record<string, unknown> = {}): VoiceCommand | null {
  const app = oneOf<WidgetType>(args.app, APP_IDS);
  const inst = oneOf(args.instrument, INST_IDS);
  switch (name) {
    case 'open_app':
      return app ? { kind: 'open-app', app, instrument: inst } : null;
    case 'window_action': {
      const action = oneOf<WindowAction>(args.action, ['close', 'minimize', 'maximize', 'restore', 'focus']);
      return action ? { kind: 'window', action, app } : null;
    }
    case 'all_windows': {
      const action = oneOf(args.action, ['close', 'minimize', 'restore'] as const);
      return action ? { kind: 'all-windows', action } : null;
    }
    case 'swap_windows': {
      const a = oneOf<WidgetType>(args.a, APP_IDS);
      const b = oneOf<WidgetType>(args.b, APP_IDS);
      return a && b ? { kind: 'swap', a, b } : null;
    }
    case 'select_instrument':
      return inst ? { kind: 'instrument', id: inst } : null;
    case 'set_chart_timeframe': {
      const tf = oneOf<Timeframe>(args.timeframe, TIMEFRAMES);
      return tf ? { kind: 'timeframe', tf } : null;
    }
    case 'open_workspace_preset': {
      const id = oneOf(args.preset, WORKSPACE_PRESETS.map((p) => p.id));
      return id ? { kind: 'preset', id } : null;
    }
    case 'arrange_windows': {
      const mode = oneOf<LayoutMode>(args.mode, LAYOUT_MODES.map((m) => m.id));
      return mode ? { kind: 'layout', mode } : null;
    }
    case 'set_theme': {
      const id = oneOf(args.theme, THEMES.map((t) => t.id));
      return id ? { kind: 'theme', id } : null;
    }
    case 'open_community': {
      const id = oneOf<CommunityId>(args.community, COMMUNITY_IDS);
      return id ? { kind: 'community', id, tab: oneOf<CommunityTab>(args.tab, TABS) } : null;
    }
    case 'watchlist': {
      const action = oneOf(args.action, ['add', 'remove'] as const);
      return action ? { kind: 'watchlist', action, instrument: inst } : null;
    }
    case 'start_briefing':
      return { kind: 'briefing', length: args.length === 'short' ? 'short' : 'full' };
    case 'ui_action': {
      const action = oneOf<UiAction>(args.action, UI_ACTIONS);
      return action ? { kind: 'ui', action } : null;
    }
  }
  return null;
}
