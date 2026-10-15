import { getInstruments } from '../../data/instruments';
import { getDataEpoch, getSeries } from '../../data/priceSeries';
import type { Instrument, Timeframe } from '../../types/market';
import { atr, bollinger, last, macd, pctChange, realisedVol, rsi, sma, ema } from '../indicators';

export type Trend = 'uptrend' | 'downtrend' | 'sideways';

export interface InstrumentMetrics {
  id: string;
  price: number;
  changePercent: number;
  volume: number | null;
  rsi14: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema21: number | null;
  macd: number | null;
  macdSignal: number | null;
  bbUpper: number | null;
  bbLower: number | null;
  atr14: number | null;
  vol20: number | null; // annualised %
  change5d: number | null;
  change20d: number | null;
  high52: number | null;
  low52: number | null;
  trend: Trend;
}

const cache = new Map<string, InstrumentMetrics>();

export function computeMetrics(inst: Instrument, tf: Timeframe = '1D'): InstrumentMetrics {
  const key = `${inst.id}|${tf}|${getDataEpoch()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const candles = getSeries(inst.id, tf);
  const closes = candles.map((c) => c.close);
  const n = closes.length;
  const s20 = last(sma(closes, 20));
  const s50 = last(sma(closes, 50));
  const s200 = last(sma(closes, 200));
  const m = macd(closes);
  const bb = bollinger(closes, 20, 2);
  const periods = inst.assetClass === 'crypto' ? 365 : inst.assetClass === 'forex' ? 260 : 252;
  let trend: Trend = 'sideways';
  if (s20 != null && s50 != null) {
    const gap = (s20 - s50) / s50;
    if (gap > 0.01 && inst.price > s50) trend = 'uptrend';
    else if (gap < -0.01 && inst.price < s50) trend = 'downtrend';
  }
  const year = closes.slice(-252);
  const out: InstrumentMetrics = {
    id: inst.id,
    price: inst.price,
    changePercent: inst.changePercent,
    volume: inst.volume ?? null,
    rsi14: last(rsi(closes, 14)),
    sma20: s20,
    sma50: s50,
    sma200: s200,
    ema21: last(ema(closes, 21)),
    macd: last(m.macd),
    macdSignal: last(m.signal),
    bbUpper: last(bb.upper),
    bbLower: last(bb.lower),
    atr14: last(atr(candles, 14)),
    vol20: realisedVol(closes, 20, periods),
    change5d: n > 5 ? pctChange(closes[n - 6], closes[n - 1]) : null,
    change20d: n > 20 ? pctChange(closes[n - 21], closes[n - 1]) : null,
    high52: year.length ? Math.max(...candles.slice(-252).map((c) => c.high)) : null,
    low52: year.length ? Math.min(...candles.slice(-252).map((c) => c.low)) : null,
    trend,
  };
  cache.set(key, out);
  return out;
}

export function allMetrics(): Map<string, InstrumentMetrics> {
  const map = new Map<string, InstrumentMetrics>();
  for (const i of getInstruments()) map.set(i.id, computeMetrics(i));
  return map;
}
