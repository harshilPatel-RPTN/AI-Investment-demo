import type { Candle } from '../../types/market';

/** All indicator outputs are aligned to the input: index i corresponds to input i. `null` = not enough data. */
export type Series = Array<number | null>;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (!Number.isInteger(period) || period <= 0) return out;
  let sum = 0;
  let valid = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (isNum(v)) {
      sum += v;
      valid++;
    }
    if (i >= period) {
      const old = values[i - period];
      if (isNum(old)) {
        sum -= old;
        valid--;
      }
    }
    if (i >= period - 1 && valid === period) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (!Number.isInteger(period) || period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) {
    if (!isNum(values[i])) return out;
    seed += values[i];
  }
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    const v = values[i];
    if (!isNum(v)) {
      out[i] = prev;
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI. Returns 100 when there are no losses and 50 when flat. */
export function rsi(values: number[], period = 14): Series {
  const out: Series = new Array(values.length).fill(null);
  if (!Number.isInteger(period) || period <= 0 || values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgG = gain / period;
  let avgL = loss / period;
  const calc = () => (avgG === 0 && avgL === 0 ? 50 : avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL));
  out[period] = calc();
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = calc();
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line: Series = values.map((_, i) => (f[i] != null && s[i] != null ? (f[i] as number) - (s[i] as number) : null));
  const firstIdx = line.findIndex((v) => v != null);
  const sig: Series = new Array(values.length).fill(null);
  if (firstIdx >= 0) {
    const compact = line.slice(firstIdx) as number[];
    const e = ema(compact, signal);
    e.forEach((v, j) => (sig[firstIdx + j] = v));
  }
  const hist: Series = line.map((v, i) => (v != null && sig[i] != null ? v - (sig[i] as number) : null));
  return { macd: line, signal: sig, histogram: hist };
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper: Series = new Array(values.length).fill(null);
  const lower: Series = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const m = mid[i];
    if (m == null) continue;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += (values[j] - m) ** 2;
    const sd = Math.sqrt(sq / period);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { middle: mid, upper, lower };
}

export function trueRange(c: Candle[]): number[] {
  return c.map((k, i) => (i === 0 ? k.high - k.low : Math.max(k.high - k.low, Math.abs(k.high - c[i - 1].close), Math.abs(k.low - c[i - 1].close))));
}

export function atr(candles: Candle[], period = 14): Series {
  const out: Series = new Array(candles.length).fill(null);
  if (candles.length < period || period <= 0) return out;
  const tr = trueRange(candles);
  let prev = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** Cumulative VWAP over the supplied window. Returns null where cumulative volume is zero. */
export function vwap(candles: Candle[]): Series {
  let pv = 0;
  let vol = 0;
  return candles.map((c) => {
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    vol += c.volume;
    return vol > 0 ? pv / vol : null;
  });
}

export function last(series: Series): number | null {
  for (let i = series.length - 1; i >= 0; i--) if (series[i] != null) return series[i] as number;
  return null;
}

export function pctChange(from: number, to: number): number | null {
  if (!isNum(from) || !isNum(to) || from === 0) return null;
  return ((to - from) / from) * 100;
}

/** Annualised-ish realised volatility (stdev of log returns × sqrt(periods)). */
export function realisedVol(values: number[], window = 20, periodsPerYear = 252): number | null {
  if (values.length < window + 1) return null;
  const slice = values.slice(-window - 1);
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    if (slice[i - 1] <= 0 || slice[i] <= 0) return null;
    rets.push(Math.log(slice[i] / slice[i - 1]));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(periodsPerYear) * 100;
}

/** Pearson correlation of simple returns over the last `window` points. */
export function correlation(a: number[], b: number[], window = 60): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const w = Math.min(window, n - 1);
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = n - w; i < n; i++) {
    const pa = a[i - 1];
    const pb = b[i - 1];
    if (!pa || !pb) continue;
    ra.push(a[i] / pa - 1);
    rb.push(b[i] / pb - 1);
  }
  if (ra.length < 2) return null;
  const ma = ra.reduce((x, y) => x + y, 0) / ra.length;
  const mb = rb.reduce((x, y) => x + y, 0) / rb.length;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < ra.length; i++) {
    cov += (ra[i] - ma) * (rb[i] - mb);
    va += (ra[i] - ma) ** 2;
    vb += (rb[i] - mb) ** 2;
  }
  if (va === 0 || vb === 0) return null;
  return cov / Math.sqrt(va * vb);
}
