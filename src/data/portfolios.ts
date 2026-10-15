export interface Holding {
  id: string;
  instrumentId: string;
  quantity: number;
  avgCost: number;
  note?: string;
}

/** Default starter holdings. */
export const DEFAULT_HOLDINGS: Holding[] = [
  { id: 'h1', instrumentId: 'XAUUSD', quantity: 5, avgCost: 2480 },
  { id: 'h2', instrumentId: 'XAGUSD', quantity: 150, avgCost: 29.4 },
  { id: 'h3', instrumentId: 'BRENTUSD', quantity: 80, avgCost: 82.1 },
  { id: 'h4', instrumentId: 'GOLDINR', quantity: 3, avgCost: 71200 },
  { id: 'h5', instrumentId: 'SILVERINR', quantity: 1, avgCost: 88500 },
  { id: 'h6', instrumentId: 'USDJPY', quantity: 20000, avgCost: 146.8 },
  { id: 'h7', instrumentId: 'WTIUSD', quantity: 100, avgCost: 79.4 },
  { id: 'h8', instrumentId: 'EURUSD', quantity: 10000, avgCost: 1.0825 },
];

/** Fixed FX rates into INR for aggregating the portfolio. */
export const DEMO_FX_TO_INR: Record<string, number> = { INR: 1, USD: 83.95, EUR: 91.62, GBP: 109.5, JPY: 0.5625, CHF: 97.45, CAD: 61.82 };
