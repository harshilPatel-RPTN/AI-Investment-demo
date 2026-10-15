import type { WidgetType } from '../../types/widgets';
import type { Timeframe } from '../../types/market';
import type { CommunityId } from '../../types/community';
import type { LayoutMode } from '../../workspace/WorkspaceStore';

export type WindowAction = 'close' | 'minimize' | 'maximize' | 'restore' | 'focus';
export type CommunityTab = 'discussions' | 'ideas' | 'polls' | 'sentiment' | 'trending';

export type UiAction =
  | 'undo' | 'redo'
  | 'fullscreen' | 'exit-fullscreen'
  | 'palette' | 'launcher' | 'appearance' | 'close-overlays'
  | 'auto-arrange-on' | 'auto-arrange-off' | 'snap-on' | 'snap-off'
  | 'scroll-down' | 'scroll-up' | 'scroll-top'
  | 'fin-open' | 'fin-close' | 'fin-stop' | 'fin-pause' | 'fin-resume'
  | 'voice-off' | 'help';

/** One app action. Every input path (local parser, Gemini tool call) produces these. */
export type VoiceCommand =
  | { kind: 'open-app'; app: WidgetType; instrument?: string }
  | { kind: 'window'; action: WindowAction; app?: WidgetType }
  | { kind: 'all-windows'; action: 'close' | 'minimize' | 'restore' }
  | { kind: 'swap'; a: WidgetType; b: WidgetType }
  | { kind: 'instrument'; id: string }
  | { kind: 'timeframe'; tf: Timeframe }
  | { kind: 'preset'; id: string }
  | { kind: 'layout'; mode: LayoutMode }
  | { kind: 'theme'; id: string }
  | { kind: 'community'; id: CommunityId; tab?: CommunityTab }
  | { kind: 'briefing'; length: 'short' | 'full' }
  | { kind: 'watchlist'; action: 'add' | 'remove'; instrument?: string }
  | { kind: 'ui'; action: UiAction }
  | { kind: 'ask-fin'; text: string };

export interface CommandResult {
  ok: boolean;
  message: string;
}
