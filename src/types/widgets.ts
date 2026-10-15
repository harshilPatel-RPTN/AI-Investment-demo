export type WidgetType =
  | 'market-terminal' | 'asset-explorer' | 'chart-studio' | 'screener' | 'news'
  | 'fundamentals' | 'ai-copilot' | 'evidence' | 'report' | 'scenarios'
  | 'strategy' | 'risk-lab' | 'backtest' | 'portfolio' | 'journal' | 'alerts'
  | 'calendar' | 'notebook' | 'learning' | 'settings' | 'macro-board' | 'watchlist' | 'community' | 'dashboard' | 'market-summary' | 'market-news' | 'upcoming';

export interface WidgetAppearance {
  background?: string;
  textColor?: string;
  accent?: string;
  borderColor?: string;
  radius?: number;
  opacity?: number;
  surface?: 'raised' | 'inset' | 'flat';
  shadowIntensity?: number; // 0..2
  fontSize?: number;
  fontFamily?: string;
  padding?: number;
  gradient?: boolean;
}

export interface WidgetFrame {
  id: string;
  type: WidgetType;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  /** Size the card would like (user resize or preset); smart arrange stretches around it. */
  prefW?: number;
  prefH?: number;
  minimized: boolean;
  maximized: boolean;
  locked: boolean;
  visible: boolean;
  dockSide?: 'left' | 'right' | 'top' | 'bottom' | null;
  /** Which physical screen (browser window) shows this widget: 'main' or 's2'…'s6'. */
  screenId?: string;
  appearance: WidgetAppearance;
  settings: Record<string, unknown>;
}

export interface Workspace {
  id: string;
  name: string;
  presetId?: string;
  /** Canvas size the layout was last arranged for; used to rescale on viewport changes. */
  canvas?: { w: number; h: number };
  /** Per-screen canvas sizes for multi-monitor layouts. */
  screenCanvas?: Record<string, { w: number; h: number }>;
  /** Extra screens (beyond the main one) used by this workspace. */
  screens?: string[];
  windows: WidgetFrame[];
  updatedAt: string;
}
