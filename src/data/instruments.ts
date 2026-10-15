import type { AssetClass, Instrument, SessionStatus } from '../types/market';
import { FIXTURE_NOW_ISO } from '../lib/seed';
import { getDailySeries, getDataEpoch } from './priceSeries';

export interface InstrumentSeed {
  id: string;
  symbol: string;
  displayName: string;
  assetClass: AssetClass;
  quoteCurrency: string;
  baseCurrency?: string;
  unit: string;
  precision: number;
  pipSize?: number;
  basePrice: number;
  vol: number; // daily volatility (fraction)
  drift: number; // daily drift (fraction)
  baseVolume?: number;
  tags: string[];
  description: string;
  sector?: string;
}

export const INSTRUMENT_SEEDS: InstrumentSeed[] = [
  // Gold
  { id: 'XAUUSD', symbol: 'XAU/USD', displayName: 'Gold Spot', assetClass: 'gold', quoteCurrency: 'USD', baseCurrency: 'XAU', unit: 'troy ounce', precision: 2, basePrice: 2650, vol: 0.009, drift: 0.0008, baseVolume: 1.8e5, tags: ['metals', 'safe-haven', 'precious'], description: 'Gold priced in US dollars per troy ounce.' },
  { id: 'GOLDINR', symbol: 'GOLD-INR', displayName: 'Gold (INR)', assetClass: 'gold', quoteCurrency: 'INR', baseCurrency: 'XAU', unit: '10 grams', precision: 0, basePrice: 76500, vol: 0.009, drift: 0.0008, baseVolume: 2.2e4, tags: ['metals', 'safe-haven', 'precious', 'india'], description: 'INR-denominated gold price per 10 grams.' },
  // Silver
  { id: 'XAGUSD', symbol: 'XAG/USD', displayName: 'Silver Spot', assetClass: 'silver', quoteCurrency: 'USD', baseCurrency: 'XAG', unit: 'troy ounce', precision: 3, basePrice: 31.2, vol: 0.017, drift: 0.0009, baseVolume: 9.5e4, tags: ['metals', 'precious', 'industrial'], description: 'Silver priced in US dollars per troy ounce.' },
  { id: 'SILVERINR', symbol: 'SILVER-INR', displayName: 'Silver (INR)', assetClass: 'silver', quoteCurrency: 'INR', baseCurrency: 'XAG', unit: 'kg', precision: 0, basePrice: 92000, vol: 0.017, drift: 0.0009, baseVolume: 1.6e4, tags: ['metals', 'precious', 'india'], description: 'INR-denominated silver price per kilogram.' },

  // Oil
  { id: 'WTIUSD', symbol: 'WTI/USD', displayName: 'WTI Crude', assetClass: 'oil', quoteCurrency: 'USD', unit: 'barrel', precision: 2, basePrice: 74.2, vol: 0.021, drift: -0.0007, baseVolume: 3.1e5, tags: ['energy', 'commodity', 'crude'], description: 'West Texas Intermediate crude, USD per barrel.' },
  { id: 'BRENTUSD', symbol: 'BRENT/USD', displayName: 'Brent Crude', assetClass: 'oil', quoteCurrency: 'USD', unit: 'barrel', precision: 2, basePrice: 78.1, vol: 0.019, drift: -0.0006, baseVolume: 2.7e5, tags: ['energy', 'commodity', 'crude'], description: 'Brent crude benchmark, USD per barrel.' },

  // Forex
  { id: 'EURUSD', symbol: 'EUR/USD', displayName: 'Euro / US Dollar', assetClass: 'forex', baseCurrency: 'EUR', quoteCurrency: 'USD', unit: 'EUR', precision: 5, pipSize: 0.0001, basePrice: 1.0912, vol: 0.0045, drift: 0.0001, tags: ['fx', 'major'], description: 'Price of 1 EUR in USD.' },
  { id: 'GBPUSD', symbol: 'GBP/USD', displayName: 'British Pound / US Dollar', assetClass: 'forex', baseCurrency: 'GBP', quoteCurrency: 'USD', unit: 'GBP', precision: 5, pipSize: 0.0001, basePrice: 1.3045, vol: 0.005, drift: 0.0001, tags: ['fx', 'major'], description: 'Price of 1 GBP in USD.' },
  { id: 'USDJPY', symbol: 'USD/JPY', displayName: 'US Dollar / Japanese Yen', assetClass: 'forex', baseCurrency: 'USD', quoteCurrency: 'JPY', unit: 'USD', precision: 3, pipSize: 0.01, basePrice: 149.25, vol: 0.006, drift: -0.0001, tags: ['fx', 'major', 'carry'], description: 'Price of 1 USD in JPY.' },
  { id: 'AUDUSD', symbol: 'AUD/USD', displayName: 'Australian Dollar / US Dollar', assetClass: 'forex', baseCurrency: 'AUD', quoteCurrency: 'USD', unit: 'AUD', precision: 5, pipSize: 0.0001, basePrice: 0.6712, vol: 0.006, drift: 0, tags: ['fx', 'major', 'commodity-fx'], description: 'Price of 1 AUD in USD.' },
  { id: 'USDINR', symbol: 'USD/INR', displayName: 'US Dollar / Indian Rupee', assetClass: 'forex', baseCurrency: 'USD', quoteCurrency: 'INR', unit: 'USD', precision: 4, pipSize: 0.0025, basePrice: 83.95, vol: 0.002, drift: 0.00005, tags: ['fx', 'inr', 'emerging'], description: 'Price of 1 USD in INR.' },
  { id: 'USDCHF', symbol: 'USD/CHF', displayName: 'US Dollar / Swiss Franc', assetClass: 'forex', baseCurrency: 'USD', quoteCurrency: 'CHF', unit: 'USD', precision: 5, pipSize: 0.0001, basePrice: 0.8615, vol: 0.005, drift: -0.0001, tags: ['fx', 'major', 'safe-haven'], description: 'Price of 1 USD in CHF.' },
  { id: 'USDCAD', symbol: 'USD/CAD', displayName: 'US Dollar / Canadian Dollar', assetClass: 'forex', baseCurrency: 'USD', quoteCurrency: 'CAD', unit: 'USD', precision: 5, pipSize: 0.0001, basePrice: 1.3580, vol: 0.004, drift: 0.00005, tags: ['fx', 'major', 'commodity-fx', 'oil-linked'], description: 'Price of 1 USD in CAD. Often sensitive to crude prices.' },
  { id: 'NZDUSD', symbol: 'NZD/USD', displayName: 'New Zealand Dollar / US Dollar', assetClass: 'forex', baseCurrency: 'NZD', quoteCurrency: 'USD', unit: 'NZD', precision: 5, pipSize: 0.0001, basePrice: 0.6105, vol: 0.0065, drift: 0, tags: ['fx', 'major', 'commodity-fx'], description: 'Price of 1 NZD in USD.' },
  { id: 'EURGBP', symbol: 'EUR/GBP', displayName: 'Euro / British Pound', assetClass: 'forex', baseCurrency: 'EUR', quoteCurrency: 'GBP', unit: 'EUR', precision: 5, pipSize: 0.0001, basePrice: 0.8365, vol: 0.0035, drift: 0, tags: ['fx', 'cross'], description: 'Price of 1 EUR in GBP.' },
  { id: 'EURJPY', symbol: 'EUR/JPY', displayName: 'Euro / Japanese Yen', assetClass: 'forex', baseCurrency: 'EUR', quoteCurrency: 'JPY', unit: 'EUR', precision: 3, pipSize: 0.01, basePrice: 162.85, vol: 0.006, drift: 0, tags: ['fx', 'cross', 'carry'], description: 'Price of 1 EUR in JPY.' },
  { id: 'EURINR', symbol: 'EUR/INR', displayName: 'Euro / Indian Rupee', assetClass: 'forex', baseCurrency: 'EUR', quoteCurrency: 'INR', unit: 'EUR', precision: 4, pipSize: 0.0025, basePrice: 91.62, vol: 0.0045, drift: 0.0001, tags: ['fx', 'inr', 'cross'], description: 'Price of 1 EUR in INR.' },
];

const seedMap = new Map(INSTRUMENT_SEEDS.map((s) => [s.id, s]));
export function getSeed(id: string): InstrumentSeed | undefined {
  return seedMap.get(id);
}

function sessionFor(ac: AssetClass, quote: string): SessionStatus {
  if (ac === 'crypto') return '24/7';
  if (ac === 'forex') return 'OPEN';
  if (quote === 'INR') return 'OPEN';
  return 'PRE_OPEN';
}

function buildInstrument(seed: InstrumentSeed): Instrument {
  const series = getDailySeries(seed.id);
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const change = last.close - prev.close;
  return {
    id: seed.id,
    symbol: seed.symbol,
    displayName: seed.displayName,
    assetClass: seed.assetClass,
    quoteCurrency: seed.quoteCurrency,
    baseCurrency: seed.baseCurrency,
    unit: seed.unit,
    precision: seed.precision,
    pipSize: seed.pipSize,
    price: last.close,
    change,
    changePercent: (change / prev.close) * 100,
    dayHigh: last.high,
    dayLow: last.low,
    open: last.open,
    previousClose: prev.close,
    volume: seed.baseVolume ? last.volume : undefined,
    lastUpdatedAt: FIXTURE_NOW_ISO,
    dataMode: 'SIMULATED',
    sessionStatus: sessionFor(seed.assetClass, seed.quoteCurrency),
    tags: seed.tags,
    description: seed.description,
    sector: seed.sector,
  };
}

let cache: { epoch: number; list: Instrument[] } | null = null;
export function getInstruments(): Instrument[] {
  const epoch = getDataEpoch();
  if (!cache || cache.epoch !== epoch) cache = { epoch, list: INSTRUMENT_SEEDS.map(buildInstrument) };
  return cache.list;
}

export function getInstrument(id: string): Instrument | undefined {
  return getInstruments().find((i) => i.id === id);
}

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  equity: 'Equities',
  index: 'Indices',
  gold: 'Gold',
  silver: 'Silver',
  crypto: 'Crypto',
  oil: 'Oil & Energy',
  forex: 'Forex',
};

/** Market groups enabled in this build: metals, energy and currencies only. */
export const ASSET_CLASSES: AssetClass[] = ['gold', 'silver', 'oil', 'forex'];
