import type { LucideIcon } from 'lucide-react';
import {
  Activity, BellRing, BookOpen, Bot, Building2, CalendarClock, CalendarDays, CandlestickChart, Compass, FileText, Filter, Gauge, GitBranch, Globe2, GraduationCap, History, Layers, LayoutDashboard, Newspaper, NotebookPen, PieChart, Radio, Settings, ShieldCheck, Star, Users, Wand2,
} from 'lucide-react';
import type { WidgetType } from '../types/widgets';

export type AppCategory = 'Markets' | 'Charts & Screening' | 'AI Intelligence' | 'Risk & Strategy' | 'Portfolio' | 'Research' | 'Community' | 'Workspace & Settings';
export const APP_CATEGORIES: AppCategory[] = ['Markets', 'Charts & Screening', 'AI Intelligence', 'Risk & Strategy', 'Portfolio', 'Research', 'Community', 'Workspace & Settings'];

export interface AppMeta {
  type: WidgetType;
  title: string;
  icon: LucideIcon;
  category: AppCategory;
  description: string;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  noPadding?: boolean;
  /** Compact strip: smart arrange keeps its height instead of stretching it to fill the screen. */
  fixedHeight?: boolean;
  keywords?: string[];
}

export const APPS: AppMeta[] = [
  { type: 'dashboard', title: 'Dashboard', icon: Gauge, category: 'Markets', description: 'Gold, Silver, Oil and Forex at a glance with interactive charts and quick actions.', defaultSize: { w: 1000, h: 620 }, minSize: { w: 480, h: 360 }, keywords: ['overview', 'home', 'gold', 'silver', 'oil', 'forex'] },
  { type: 'market-news', title: 'Market News', icon: Radio, category: 'Research', description: 'Live headlines that move gold, silver, oil and forex — AI-ranked by impact (free sources).', defaultSize: { w: 620, h: 560 }, minSize: { w: 340, h: 300 }, keywords: ['news', 'live', 'headlines', 'gdelt'] },
  { type: 'upcoming', title: 'Upcoming Events', icon: CalendarClock, category: 'Research', description: 'Live economic calendar: central-bank decisions and data releases (financecalendar.com).', defaultSize: { w: 520, h: 560 }, minSize: { w: 320, h: 300 }, keywords: ['calendar', 'events', 'fomc', 'cpi', 'live'] },
  { type: 'market-summary', title: 'Market Summary', icon: Activity, category: 'Markets', description: 'Compact Forex, Gold, Silver and Oil strip — click a tile to switch the workspace instrument.', defaultSize: { w: 1600, h: 152 }, minSize: { w: 420, h: 140 }, fixedHeight: true, keywords: ['summary', 'overview', 'ticker', 'strip'] },
  { type: 'market-terminal', title: 'Market Terminal', icon: LayoutDashboard, category: 'Markets', description: 'Indices, movers, breadth and volatility across all asset classes.', defaultSize: { w: 780, h: 520 }, minSize: { w: 420, h: 300 }, keywords: ['overview', 'gainers', 'losers'] },
  { type: 'asset-explorer', title: 'Asset Explorer', icon: Compass, category: 'Markets', description: 'Search and sort every instrument; open detail views.', defaultSize: { w: 720, h: 520 }, minSize: { w: 420, h: 300 }, keywords: ['search', 'instruments'] },
  { type: 'watchlist', title: 'Watchlist', icon: Star, category: 'Markets', description: 'Your favourite instruments with quick actions.', defaultSize: { w: 380, h: 520 }, minSize: { w: 280, h: 260 } },
  { type: 'macro-board', title: 'Global Macro Board', icon: Globe2, category: 'Markets', description: 'Cross-market view with calculated correlations.', defaultSize: { w: 840, h: 540 }, minSize: { w: 480, h: 320 }, keywords: ['correlation', 'cross-asset'] },
  { type: 'alerts', title: 'Alert Builder', icon: BellRing, category: 'Markets', description: 'Local alert rules, tests and triggers.', defaultSize: { w: 520, h: 500 }, minSize: { w: 360, h: 300 } },
  { type: 'chart-studio', title: 'Chart Studio', icon: CandlestickChart, category: 'Charts & Screening', description: 'Candles, indicators, timeframes and comparisons.', defaultSize: { w: 880, h: 560 }, minSize: { w: 440, h: 320 }, noPadding: true, keywords: ['candles', 'indicators', 'rsi', 'macd'] },
  { type: 'screener', title: 'Smart Screener', icon: Filter, category: 'Charts & Screening', description: 'Filter instruments by trend, RSI, volatility and more.', defaultSize: { w: 840, h: 520 }, minSize: { w: 480, h: 300 }, keywords: ['scan', 'filter'] },
  { type: 'ai-copilot', title: 'AI Copilot', icon: Bot, category: 'AI Intelligence', description: 'Context-aware research assistant (GPT-4o mini).', defaultSize: { w: 440, h: 640 }, minSize: { w: 340, h: 380 }, noPadding: true, keywords: ['chat', 'gpt', 'assistant'] },
  { type: 'evidence', title: 'Four-Lane Evidence', icon: Layers, category: 'AI Intelligence', description: 'Technical, drivers, news and macro evidence lanes.', defaultSize: { w: 900, h: 540 }, minSize: { w: 520, h: 320 }, keywords: ['lanes', 'bias'] },
  { type: 'report', title: 'AI Research Report', icon: FileText, category: 'AI Intelligence', description: 'Structured research report with export and print.', defaultSize: { w: 680, h: 660 }, minSize: { w: 440, h: 360 }, keywords: ['report', 'pdf', 'markdown'] },
  { type: 'scenarios', title: 'Scenario Simulator', icon: GitBranch, category: 'AI Intelligence', description: 'Bull/base/bear cases with sliders.', defaultSize: { w: 760, h: 540 }, minSize: { w: 460, h: 320 } },
  { type: 'strategy', title: 'Strategy Copilot', icon: Wand2, category: 'Risk & Strategy', description: 'Draft structured, validated rules from plain language.', defaultSize: { w: 700, h: 580 }, minSize: { w: 440, h: 340 }, keywords: ['rules'] },
  { type: 'risk-lab', title: 'Risk Lab', icon: ShieldCheck, category: 'Risk & Strategy', description: 'Position sizing and risk/reward calculator.', defaultSize: { w: 560, h: 580 }, minSize: { w: 400, h: 340 }, keywords: ['position size', 'stop loss'] },
  { type: 'backtest', title: 'Backtest Lab', icon: History, category: 'Risk & Strategy', description: 'Backtest strategies on price history.', defaultSize: { w: 840, h: 560 }, minSize: { w: 480, h: 340 } },
  { type: 'portfolio', title: 'Portfolio Tracker', icon: PieChart, category: 'Portfolio', description: 'Holdings, P&L and exposure.', defaultSize: { w: 800, h: 520 }, minSize: { w: 460, h: 300 } },
  { type: 'journal', title: 'Trade Journal', icon: NotebookPen, category: 'Portfolio', description: 'Paper-trade plans, entries, exits and lessons.', defaultSize: { w: 760, h: 560 }, minSize: { w: 460, h: 320 } },
  { type: 'news', title: 'News Intelligence', icon: Newspaper, category: 'Research', description: 'Headlines with sentiment and AI summary.', defaultSize: { w: 560, h: 620 }, minSize: { w: 380, h: 320 } },
  { type: 'fundamentals', title: 'Fundamentals', icon: Building2, category: 'Research', description: 'Company metrics or asset-specific drivers.', defaultSize: { w: 640, h: 560 }, minSize: { w: 420, h: 320 } },
  { type: 'calendar', title: 'Economic Calendar', icon: CalendarDays, category: 'Research', description: 'Earnings, central-bank and macro events.', defaultSize: { w: 560, h: 540 }, minSize: { w: 380, h: 300 } },
  { type: 'notebook', title: 'Research Notebook', icon: BookOpen, category: 'Research', description: 'Saved AI answers, reports and notes.', defaultSize: { w: 680, h: 560 }, minSize: { w: 440, h: 300 } },
  { type: 'learning', title: 'Learning Lab', icon: GraduationCap, category: 'Research', description: 'Concepts explained with market data.', defaultSize: { w: 680, h: 560 }, minSize: { w: 420, h: 300 } },
  { type: 'community', title: 'Trading Communities', icon: Users, category: 'Community', description: 'Separate Forex, Gold, Silver and Oil communities: discussions, ideas, polls and sentiment.', defaultSize: { w: 1000, h: 700 }, minSize: { w: 480, h: 380 }, keywords: ['community', 'social', 'forum', 'ideas', 'polls', 'sentiment', 'traders'] },
  { type: 'settings', title: 'Settings & Data Health', icon: Settings, category: 'Workspace & Settings', description: 'Theme, shortcuts, data and AI status.', defaultSize: { w: 720, h: 580 }, minSize: { w: 460, h: 340 } },
];

export const APP_MAP = Object.fromEntries(APPS.map((a) => [a.type, a])) as Record<WidgetType, AppMeta>;
export const WIDGET_TYPES = APPS.map((a) => a.type);
