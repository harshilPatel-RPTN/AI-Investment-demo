import type { WidgetType } from '../types/widgets';

/** Preset windows use fractional coordinates (0..1) of the canvas so they fit any screen. */
export interface PresetWindow {
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  settings?: Record<string, unknown>;
  title?: string;
  /** Target screen for multi-monitor presets (default: main). */
  screen?: 's2' | 's3';
}

export interface WorkspacePreset {
  id: string;
  name: string;
  description: string;
  selectInstrument?: string;
  windows: PresetWindow[];
}

export const WORKSPACE_PRESETS: WorkspacePreset[] = [
  {
    id: 'starter-dashboard', name: 'Starter Dashboard', description: 'Clean default for new users: chart, upcoming events, live market news and communities.',
    selectInstrument: 'XAUUSD',
    windows: [
      { type: 'chart-studio', x: 0, y: 0, w: 0.6, h: 0.5, settings: { simple: true, timeframe: '1D', indicators: { sma: true, ema: false, bb: false, vwap: false, sr: false, rsi: false, macd: false, atr: false, volume: true } } },
      { type: 'upcoming', x: 0.6, y: 0, w: 0.4, h: 0.5 },
      { type: 'market-news', x: 0, y: 0.5, w: 0.6, h: 0.5 },
      { type: 'community', x: 0.6, y: 0.5, w: 0.4, h: 0.5 },
    ],
  },
  {
    id: 'market-overview', name: 'Market Overview', description: 'Default desk: four-market summary, one primary chart, watchlist and upcoming events.',
    selectInstrument: 'XAUUSD',
    windows: [
      { type: 'market-summary', x: 0, y: 0, w: 1, h: 0.17 },
      { type: 'chart-studio', x: 0, y: 0.17, w: 0.72, h: 0.83, settings: { linked: true } },
      { type: 'watchlist', x: 0.72, y: 0.17, w: 0.28, h: 0.45 },
      { type: 'calendar', x: 0.72, y: 0.62, w: 0.28, h: 0.38 },
    ],
  },
  {
    id: 'technical', name: 'Technical Analysis', description: 'Large primary chart with indicators and drawing tools, a secondary timeframe chart and the watchlist.',
    windows: [
      { type: 'chart-studio', x: 0, y: 0, w: 0.72, h: 0.64, settings: { linked: true, indicators: { sma: true, ema: true, bb: true, rsi: true, macd: false, vwap: false, atr: false } } },
      { type: 'watchlist', x: 0.72, y: 0, w: 0.28, h: 0.64 },
      { type: 'chart-studio', x: 0, y: 0.64, w: 0.5, h: 0.36, title: 'Secondary chart (4h)', settings: { linked: true, timeframe: '4h', indicators: { sma: false, ema: false, bb: false, rsi: true, macd: true, vwap: false, atr: false } } },
      { type: 'evidence', x: 0.5, y: 0.64, w: 0.5, h: 0.36 },
    ],
  },
  {
    id: 'metals-energy', name: 'Metals & Energy', description: 'Gold, Silver, WTI and Brent side by side for quick comparison.', selectInstrument: 'XAUUSD',
    windows: [
      { type: 'market-summary', x: 0, y: 0, w: 1, h: 0.17 },
      { type: 'chart-studio', x: 0, y: 0.17, w: 0.5, h: 0.415, title: 'Gold · XAU/USD', settings: { linked: false, instrumentId: 'XAUUSD' } },
      { type: 'chart-studio', x: 0.5, y: 0.17, w: 0.5, h: 0.415, title: 'Silver · XAG/USD', settings: { linked: false, instrumentId: 'XAGUSD' } },
      { type: 'chart-studio', x: 0, y: 0.585, w: 0.5, h: 0.415, title: 'WTI Crude', settings: { linked: false, instrumentId: 'WTIUSD' } },
      { type: 'chart-studio', x: 0.5, y: 0.585, w: 0.5, h: 0.415, title: 'Brent Crude', settings: { linked: false, instrumentId: 'BRENTUSD' } },
    ],
  },
  {
    id: 'risk', name: 'Risk Lab', description: 'Position sizing and reward:risk with scenarios and the concepts behind them.',
    windows: [
      { type: 'risk-lab', x: 0, y: 0, w: 0.42, h: 1 },
      { type: 'scenarios', x: 0.42, y: 0, w: 0.58, h: 0.6 },
      { type: 'learning', x: 0.42, y: 0.6, w: 0.58, h: 0.4, settings: { topic: 'rr' } },
    ],
  },
  {
    id: 'research', name: 'Research', description: 'Fundamentals and drivers, news, macro events and the evidence behind them — all timestamped.',
    windows: [
      { type: 'fundamentals', x: 0, y: 0, w: 0.5, h: 0.55 },
      { type: 'news', x: 0.5, y: 0, w: 0.5, h: 0.55 },
      { type: 'calendar', x: 0, y: 0.55, w: 0.4, h: 0.45 },
      { type: 'evidence', x: 0.4, y: 0.55, w: 0.6, h: 0.45 },
    ],
  },
  {
    id: 'ai-research', name: 'AI Research Desk', description: 'Copilot, evidence lanes, report and chart.',
    windows: [
      { type: 'ai-copilot', x: 0, y: 0, w: 0.3, h: 1 },
      { type: 'chart-studio', x: 0.3, y: 0, w: 0.4, h: 0.5 },
      { type: 'report', x: 0.7, y: 0, w: 0.3, h: 1 },
      { type: 'evidence', x: 0.3, y: 0.5, w: 0.4, h: 0.5 },
    ],
  },
  {
    id: 'precious', name: 'Gold & Silver Desk', description: 'Gold and silver charts, drivers and news.', selectInstrument: 'XAUUSD',
    windows: [
      { type: 'chart-studio', x: 0, y: 0, w: 0.5, h: 0.6, settings: { linked: false, instrumentId: 'XAUUSD', timeframe: '4h' } },
      { type: 'chart-studio', x: 0.5, y: 0, w: 0.5, h: 0.6, settings: { linked: false, instrumentId: 'XAGUSD', timeframe: '4h' } },
      { type: 'fundamentals', x: 0, y: 0.6, w: 0.5, h: 0.4 },
      { type: 'news', x: 0.5, y: 0.6, w: 0.5, h: 0.4, settings: { assetClass: 'gold' } },
    ],
  },
  {
    id: 'forex', name: 'Forex Desk', description: 'Majors and INR pairs with calendar and risk.', selectInstrument: 'EURUSD',
    windows: [
      { type: 'chart-studio', x: 0, y: 0, w: 0.55, h: 0.6, settings: { linked: true, timeframe: '1h' } },
      { type: 'asset-explorer', x: 0.55, y: 0, w: 0.45, h: 0.6, settings: { tab: 'forex' } },
      { type: 'calendar', x: 0, y: 0.6, w: 0.5, h: 0.4, settings: { assetClass: 'forex' } },
      { type: 'risk-lab', x: 0.5, y: 0.6, w: 0.5, h: 0.4 },
    ],
  },
  {
    id: 'news-events', name: 'News & Events', description: 'Headlines, calendar and AI summaries.',
    windows: [
      { type: 'news', x: 0, y: 0, w: 0.45, h: 1 },
      { type: 'calendar', x: 0.45, y: 0, w: 0.55, h: 0.5 },
      { type: 'ai-copilot', x: 0.45, y: 0.5, w: 0.55, h: 0.5 },
    ],
  },
  {
    id: 'portfolio', name: 'Portfolio Review', description: 'Holdings, journal and macro context.',
    windows: [
      { type: 'portfolio', x: 0, y: 0, w: 0.58, h: 0.6 },
      { type: 'macro-board', x: 0.58, y: 0, w: 0.42, h: 0.6 },
      { type: 'journal', x: 0, y: 0.6, w: 0.58, h: 0.4 },
      { type: 'notebook', x: 0.58, y: 0.6, w: 0.42, h: 0.4 },
    ],
  },
  {
    id: 'multi-monitor', name: 'Multi-Monitor Desk', description: 'Two screens: charts & AI on screen 1, markets, macro and risk on screen 2.',
    windows: [
      { type: 'chart-studio', x: 0, y: 0, w: 0.62, h: 0.62, settings: { indicators: { sma: true, ema: true, bb: false, rsi: true, macd: true, vwap: false, atr: false } } },
      { type: 'watchlist', x: 0.62, y: 0, w: 0.38, h: 0.62 },
      { type: 'ai-copilot', x: 0, y: 0.62, w: 0.5, h: 0.38 },
      { type: 'news', x: 0.5, y: 0.62, w: 0.5, h: 0.38 },
      { type: 'market-terminal', x: 0, y: 0, w: 0.5, h: 0.5, screen: 's2' },
      { type: 'macro-board', x: 0.5, y: 0, w: 0.5, h: 0.5, screen: 's2' },
      { type: 'calendar', x: 0, y: 0.5, w: 0.5, h: 0.5, screen: 's2' },
      { type: 'risk-lab', x: 0.5, y: 0.5, w: 0.5, h: 0.5, screen: 's2' },
    ],
  },
  {
    id: 'starter', name: 'Everything Desk', description: 'Dashboard, communities, chart, risk, watchlist, alerts and journal on one screen (dense).',
    selectInstrument: 'XAUUSD',
    windows: [
      { type: 'dashboard', x: 0, y: 0, w: 0.6, h: 0.34 },
      { type: 'community', x: 0.6, y: 0, w: 0.4, h: 0.67 },
      { type: 'chart-studio', x: 0, y: 0.34, w: 0.6, h: 0.33 },
      { type: 'risk-lab', x: 0, y: 0.67, w: 0.25, h: 0.33 },
      { type: 'watchlist', x: 0.25, y: 0.67, w: 0.25, h: 0.33 },
      { type: 'alerts', x: 0.5, y: 0.67, w: 0.25, h: 0.33 },
      { type: 'journal', x: 0.75, y: 0.67, w: 0.25, h: 0.33 },
    ],
  },
  { id: 'blank', name: 'Blank Canvas', description: 'Start from scratch.', windows: [] },
];

/** Task workspaces offered as one-click tabs in the workspace toolbar (all other presets stay in the Workspaces menu). */
export const TASK_PRESET_IDS = ['market-overview', 'technical', 'metals-energy', 'risk', 'research'] as const;
