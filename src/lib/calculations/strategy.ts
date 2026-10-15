import { z } from 'zod';
import type { Candle } from '../../types/market';
import { bollinger, macd, pctChange, rsi, sma, type Series } from '../indicators';

/** Supported, executable rule types. Anything outside this list is rejected, never improvised. */
export const RULE_DEFS = {
  priceAboveSMA: { label: 'Price above SMA', params: { period: { min: 2, max: 250, default: 50 } } },
  priceBelowSMA: { label: 'Price below SMA', params: { period: { min: 2, max: 250, default: 50 } } },
  smaAboveSMA: { label: 'Fast SMA above slow SMA', params: { fast: { min: 2, max: 200, default: 20 }, slow: { min: 3, max: 250, default: 50 } } },
  rsiBetween: { label: 'RSI(14) between', params: { min: { min: 0, max: 100, default: 50 }, max: { min: 0, max: 100, default: 65 } } },
  rsiAbove: { label: 'RSI(14) above', params: { value: { min: 0, max: 100, default: 55 } } },
  rsiBelow: { label: 'RSI(14) below', params: { value: { min: 0, max: 100, default: 30 } } },
  macdAboveSignal: { label: 'MACD above signal', params: {} },
  macdBelowSignal: { label: 'MACD below signal', params: {} },
  returnAbove: { label: 'N-bar return above %', params: { lookback: { min: 1, max: 120, default: 20 }, pct: { min: -100, max: 1000, default: 0 } } },
  returnBelow: { label: 'N-bar return below %', params: { lookback: { min: 1, max: 120, default: 20 }, pct: { min: -100, max: 1000, default: 0 } } },
  closeAboveUpperBB: { label: 'Close above upper Bollinger', params: {} },
  closeBelowLowerBB: { label: 'Close below lower Bollinger', params: {} },
} as const;

export type RuleType = keyof typeof RULE_DEFS;
export const RULE_TYPES = Object.keys(RULE_DEFS) as RuleType[];

export const ruleSchema = z.object({
  id: z.string().default(() => Math.random().toString(36).slice(2, 9)),
  type: z.enum(RULE_TYPES as [RuleType, ...RuleType[]]),
  params: z.record(z.number()).default({}),
});
export type StrategyRule = z.infer<typeof ruleSchema>;

export function defaultParams(type: RuleType): Record<string, number> {
  const p: Record<string, number> = {};
  const defs = RULE_DEFS[type].params as Record<string, { default: number }>;
  for (const [k, v] of Object.entries(defs)) p[k] = v.default;
  return p;
}

/** Returns a list of human-readable problems; empty = valid. */
export function validateRule(r: StrategyRule): string[] {
  const errs: string[] = [];
  const def = RULE_DEFS[r.type];
  if (!def) return [`Unsupported rule type "${String(r.type)}".`];
  const pdefs = def.params as Record<string, { min: number; max: number }>;
  for (const [k, lim] of Object.entries(pdefs)) {
    const v = r.params[k];
    if (v == null || !Number.isFinite(v)) errs.push(`${def.label}: missing "${k}".`);
    else if (v < lim.min || v > lim.max) errs.push(`${def.label}: "${k}" must be between ${lim.min} and ${lim.max}.`);
  }
  if (r.type === 'smaAboveSMA' && r.params.fast >= r.params.slow) errs.push('Fast SMA period must be smaller than slow SMA period.');
  if (r.type === 'rsiBetween' && r.params.min >= r.params.max) errs.push('RSI min must be below RSI max.');
  return errs;
}

export function describeRule(r: StrategyRule): string {
  const p = r.params;
  switch (r.type) {
    case 'priceAboveSMA': return `Price above SMA(${p.period})`;
    case 'priceBelowSMA': return `Price below SMA(${p.period})`;
    case 'smaAboveSMA': return `SMA(${p.fast}) above SMA(${p.slow})`;
    case 'rsiBetween': return `RSI(14) between ${p.min} and ${p.max}`;
    case 'rsiAbove': return `RSI(14) above ${p.value}`;
    case 'rsiBelow': return `RSI(14) below ${p.value}`;
    case 'macdAboveSignal': return 'MACD(12,26,9) above signal';
    case 'macdBelowSignal': return 'MACD(12,26,9) below signal';
    case 'returnAbove': return `${p.lookback}-bar return above ${p.pct}%`;
    case 'returnBelow': return `${p.lookback}-bar return below ${p.pct}%`;
    case 'closeAboveUpperBB': return 'Close above upper Bollinger Band (20,2)';
    case 'closeBelowLowerBB': return 'Close below lower Bollinger Band (20,2)';
  }
}

/** Precomputes indicator series once, then evaluates a rule at any bar index. */
export function buildEvaluator(candles: Candle[]) {
  const closes = candles.map((c) => c.close);
  const smaCache = new Map<number, Series>();
  const getSma = (p: number) => {
    let s = smaCache.get(p);
    if (!s) smaCache.set(p, (s = sma(closes, p)));
    return s;
  };
  const r14 = rsi(closes, 14);
  const m = macd(closes);
  const bb = bollinger(closes, 20, 2);

  return function evalAt(rule: StrategyRule, i: number): boolean | null {
    const c = closes[i];
    const p = rule.params;
    const v = (s: Series) => s[i];
    switch (rule.type) {
      case 'priceAboveSMA': { const s = v(getSma(p.period)); return s == null ? null : c > s; }
      case 'priceBelowSMA': { const s = v(getSma(p.period)); return s == null ? null : c < s; }
      case 'smaAboveSMA': { const f = v(getSma(p.fast)); const s = v(getSma(p.slow)); return f == null || s == null ? null : f > s; }
      case 'rsiBetween': { const x = v(r14); return x == null ? null : x >= p.min && x <= p.max; }
      case 'rsiAbove': { const x = v(r14); return x == null ? null : x > p.value; }
      case 'rsiBelow': { const x = v(r14); return x == null ? null : x < p.value; }
      case 'macdAboveSignal': { const a = v(m.macd); const b = v(m.signal); return a == null || b == null ? null : a > b; }
      case 'macdBelowSignal': { const a = v(m.macd); const b = v(m.signal); return a == null || b == null ? null : a < b; }
      case 'returnAbove': { if (i - p.lookback < 0) return null; const r = pctChange(closes[i - p.lookback], c); return r == null ? null : r > p.pct; }
      case 'returnBelow': { if (i - p.lookback < 0) return null; const r = pctChange(closes[i - p.lookback], c); return r == null ? null : r < p.pct; }
      case 'closeAboveUpperBB': { const u = v(bb.upper); return u == null ? null : c > u; }
      case 'closeBelowLowerBB': { const l = v(bb.lower); return l == null ? null : c < l; }
    }
  };
}

export function evaluateRules(candles: Candle[], rules: StrategyRule[], logic: 'AND' | 'OR') {
  const evalAt = buildEvaluator(candles);
  const i = candles.length - 1;
  const details = rules.map((r) => ({ rule: r, label: describeRule(r), result: evalAt(r, i) }));
  const bools = details.map((d) => d.result === true);
  const matched = rules.length > 0 && (logic === 'AND' ? bools.every(Boolean) : bools.some(Boolean));
  return { matched, details };
}
