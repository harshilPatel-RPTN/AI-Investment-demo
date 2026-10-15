export type AssetClass = 'equity' | 'index' | 'gold' | 'silver' | 'crypto' | 'oil' | 'forex';

export type SessionStatus = 'OPEN' | 'CLOSED' | 'PRE_OPEN' | '24/7';

export interface Fundamentals {
  kind: 'equity' | 'metal' | 'crypto' | 'oil' | 'forex' | 'index';
  [key: string]: unknown;
}

export interface Instrument {
  id: string;
  symbol: string;
  displayName: string;
  assetClass: AssetClass;
  quoteCurrency: string;
  baseCurrency?: string;
  unit: string;
  precision: number;
  pipSize?: number;
  price: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  open: number;
  previousClose: number;
  volume?: number;
  lastUpdatedAt: string;
  dataMode: 'SIMULATED';
  sessionStatus: SessionStatus;
  tags: string[];
  description: string;
  sector?: string;
  newsIds?: string[];
}

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D' | '1W' | '1M';

export type Sentiment = 'bullish' | 'bearish' | 'mixed' | 'neutral';

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  publishedAt: string;
  instrumentIds: string[];
  assetClass: AssetClass | 'macro';
  category: 'earnings' | 'macro' | 'policy' | 'supply' | 'regulation' | 'corporate' | 'market' | 'technology';
  sentiment: Sentiment;
  dataMode: 'SIMULATED';
}

export interface MarketEvent {
  id: string;
  title: string;
  date: string;
  type: 'earnings' | 'central-bank' | 'inventory' | 'token' | 'macro';
  importance: 'high' | 'medium' | 'low';
  assetClass: AssetClass | 'macro';
  instrumentIds: string[];
  description: string;
  dataMode: 'SIMULATED';
}
