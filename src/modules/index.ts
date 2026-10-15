import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { WidgetType } from '../types/widgets';
import type { ModuleProps } from './types';

/** Lazy-loaded so modules that are not open never load their code. */
export const MODULES: Record<WidgetType, LazyExoticComponent<ComponentType<ModuleProps>>> = {
  'market-terminal': lazy(() => import('./market-terminal/MarketTerminal')),
  'asset-explorer': lazy(() => import('./asset-explorer/AssetExplorer')),
  watchlist: lazy(() => import('./watchlist/Watchlist')),
  'macro-board': lazy(() => import('./macro-board/MacroBoard')),
  alerts: lazy(() => import('./alerts/Alerts')),
  'chart-studio': lazy(() => import('./chart-studio/ChartStudio')),
  screener: lazy(() => import('./screener/Screener')),
  'ai-copilot': lazy(() => import('./ai-copilot/AICopilot')),
  evidence: lazy(() => import('./evidence/Evidence')),
  report: lazy(() => import('./report/Report')),
  scenarios: lazy(() => import('./scenarios/Scenarios')),
  strategy: lazy(() => import('./strategy/Strategy')),
  'risk-lab': lazy(() => import('./risk-lab/RiskLab')),
  backtest: lazy(() => import('./backtest/Backtest')),
  portfolio: lazy(() => import('./portfolio/Portfolio')),
  journal: lazy(() => import('./journal/Journal')),
  news: lazy(() => import('./news/News')),
  fundamentals: lazy(() => import('./fundamentals/Fundamentals')),
  calendar: lazy(() => import('./calendar/Calendar')),
  notebook: lazy(() => import('./notebook/Notebook')),
  learning: lazy(() => import('./learning/Learning')),
  settings: lazy(() => import('./settings/Settings')),
  community: lazy(() => import('./community/Community')),
  'market-summary': lazy(() => import('./market-summary/MarketSummary')),
  'market-news': lazy(() => import('./market-news/MarketNews')),
  upcoming: lazy(() => import('./upcoming/UpcomingEvents')),
  dashboard: lazy(() => import('./dashboard/Dashboard')),
};
