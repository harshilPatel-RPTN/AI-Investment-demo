import type { Candle, Timeframe } from '../types/market';
import { FIXTURE_NOW, gaussian, hashString, mulberry32 } from '../lib/seed';
import { getSeed } from './instruments';

const TF_SECONDS: Record<Timeframe, number> = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1D': 86400, '1W': 604800, '1M': 2592000,
};
const TF_BARS: Record<Timeframe, number> = {
  '1m': 300, '5m': 300, '15m': 300, '1h': 300, '4h': 300, '1D': 400, '1W': 200, '1M': 120,
};

export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D', '1W', '1M'];

/** Data generation "epoch" — bumping it regenerates all demo data deterministically. */
let dataEpoch = 0;
const seriesCache = new Map<string, Candle[]>();

export function setDataEpoch(n: number) {
  dataEpoch = n;
  seriesCache.clear();
}
export function getDataEpoch() {
  return dataEpoch;
}

function generate(id: string, tf: Timeframe, endPrice?: number): Candle[] {
  const seed = getSeed(id);
  if (!seed) return [];
  const rand = mulberry32(hashString(`${id}|${tf}|${dataEpoch}`));
  const step = TF_SECONDS[tf];
  const bars = TF_BARS[tf];
  const dayFrac = step / 86400;
  const vol = seed.vol * Math.sqrt(dayFrac);
  const drift = seed.drift * dayFrac;
  // A slow regime wave produces trends and pullbacks rather than pure noise.
  const phase = rand() * Math.PI * 2;
  const closes: number[] = [];
  let p = 100;
  for (let i = 0; i < bars; i++) {
    const regime = Math.sin(phase + i / 38) * vol * 0.35;
    p = p * Math.exp(drift + regime + vol * gaussian(rand));
    closes.push(p);
  }
  // Anchor so the final close equals the target price.
  const target = endPrice ?? seed.basePrice;
  const k = target / closes[closes.length - 1];
  const end = Math.floor(FIXTURE_NOW / 1000 / step) * step;
  const baseVol = seed.baseVolume ?? 0;
  const candles: Candle[] = [];
  let prevClose = closes[0] * k * (1 - vol * 0.3 * gaussian(rand));
  for (let i = 0; i < bars; i++) {
    const close = closes[i] * k;
    const open = prevClose;
    const span = Math.abs(gaussian(rand)) * vol * close * 0.6;
    const high = Math.max(open, close) + span * rand();
    const low = Math.max(Math.min(open, close) - span * rand(), close * 0.0001);
    const volume = Math.round(baseVol * Math.max(dayFrac, 0.002) * (0.55 + rand() * 0.9) * (1 + (Math.abs(close - open) / close) * 30));
    candles.push({ time: end - (bars - 1 - i) * step, open, high, low, close, volume });
    prevClose = close;
  }
  return candles;
}

export function getSeries(id: string, tf: Timeframe): Candle[] {
  const key = `${id}|${tf}|${dataEpoch}`;
  const hit = seriesCache.get(key);
  if (hit) return hit;
  let end: number | undefined;
  if (tf !== '1D') {
    // Every timeframe ends at the daily close so all views agree on the price.
    const daily = getSeries(id, '1D');
    end = daily.length ? daily[daily.length - 1].close : undefined;
  }
  const s = generate(id, tf, end);
  seriesCache.set(key, s);
  return s;
}

export function getDailySeries(id: string): Candle[] {
  return getSeries(id, '1D');
}

export function getCloses(id: string, tf: Timeframe = '1D'): number[] {
  return getSeries(id, tf).map((c) => c.close);
}
