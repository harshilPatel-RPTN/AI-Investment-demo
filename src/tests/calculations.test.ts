import { describe, expect, it } from 'vitest';
import { atr, bollinger, correlation, ema, macd, pctChange, realisedVol, rsi, sma, vwap } from '../lib/indicators';
import { computeRisk, fxPositionSize, priceToPips, type RiskInput } from '../lib/risk';
import { computePortfolio, goldSilverRatio } from '../lib/calculations/portfolio';
import { runBacktest } from '../lib/calculations/backtest';
import { validateRule, evaluateRules } from '../lib/calculations/strategy';
import { runScreen } from '../lib/calculations/screener';
import { computeScenarios, DEFAULT_ASSUMPTIONS } from '../lib/calculations/scenarios';
import { parseLayoutFile } from '../workspace/layoutSchema';
import { getInstruments } from '../data/instruments';
import { getSeries } from '../data/priceSeries';
import { allMetrics } from '../lib/calculations/metrics';
import type { Candle } from '../types/market';

const candles = (closes: number[]): Candle[] => closes.map((c, i) => ({ time: i * 86400, open: c, high: c + 1, low: c - 1, close: c, volume: 100 }));

describe('indicators', () => {
  it('SMA aligns output and handles short/invalid input', () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
    expect(sma([1, 2], 5)).toEqual([null, null]);
    expect(sma([1, 2, 3], 0)).toEqual([null, null, null]);
    expect(sma([], 3)).toEqual([]);
  });
  it('SMA skips windows containing missing values', () => {
    expect(sma([1, NaN, 3, 4, 5], 2)).toEqual([null, null, null, 3.5, 4.5]);
  });
  it('EMA seeds with SMA', () => {
    const e = ema([2, 4, 6, 8], 2);
    expect(e[1]).toBe(3);
    expect(e[2]).toBeCloseTo(5);
  });
  it('RSI is 100 with only gains, 50 when flat, and bounded', () => {
    expect(rsi([1, 2, 3, 4, 5, 6], 3).at(-1)).toBe(100);
    expect(rsi([5, 5, 5, 5, 5], 3).at(-1)).toBe(50);
    const r = rsi(getSeries('XAGUSD', '1D').map((c) => c.close));
    r.filter((x): x is number => x != null).forEach((x) => expect(x >= 0 && x <= 100).toBe(true));
    expect(rsi([1, 2], 14)).toEqual([null, null]);
  });
  it('MACD histogram = macd − signal', () => {
    const closes = getSeries('WTIUSD', '1D').map((c) => c.close);
    const m = macd(closes);
    const i = closes.length - 1;
    expect(m.histogram[i]).toBeCloseTo((m.macd[i] as number) - (m.signal[i] as number));
  });
  it('Bollinger is symmetric and collapses on flat data', () => {
    const b = bollinger([10, 10, 10, 10], 4, 2);
    expect(b.upper[3]).toBe(10);
    expect(b.lower[3]).toBe(10);
  });
  it('ATR and VWAP handle edge cases', () => {
    expect(atr(candles([1, 2]), 14)).toEqual([null, null]);
    expect(atr(candles([10, 10, 10]), 2)[1]).toBe(2);
    expect(vwap([{ time: 0, open: 1, high: 1, low: 1, close: 1, volume: 0 }])).toEqual([null]);
  });
  it('pctChange guards zero denominators', () => {
    expect(pctChange(0, 5)).toBeNull();
    expect(pctChange(100, 110)).toBeCloseTo(10);
  });
  it('correlation: self = 1, flat = null, too short = null', () => {
    const a = getSeries('XAUUSD', '1D').map((c) => c.close);
    expect(correlation(a, a, 60)).toBeCloseTo(1);
    expect(correlation([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull();
    expect(correlation([1, 2], [1, 2])).toBeNull();
    expect(realisedVol([1, 2], 20)).toBeNull();
  });
});

describe('risk', () => {
  const base: RiskInput = { capital: 100000, entry: 100, stop: 95, target: 110, riskMode: 'percent', riskPercent: 1, riskAmount: 0, lotSize: 1, feesPerUnit: 0 };
  it('sizes a long position', () => {
    const r = computeRisk(base);
    expect(r.ok).toBe(true);
    expect(r.direction).toBe('long');
    expect(r.riskBudget).toBe(1000);
    expect(r.quantity).toBe(200);
    expect(r.riskReward).toBeCloseTo(2);
    expect(r.potentialLoss).toBe(1000);
  });
  it('sizes a short position and rounds to lot size', () => {
    const r = computeRisk({ ...base, stop: 105, target: 90, lotSize: 50 });
    expect(r.direction).toBe('short');
    expect(r.quantity).toBe(200);
    expect(computeRisk({ ...base, lotSize: 150 }).quantity).toBe(150);
  });
  it('rejects invalid inputs instead of computing', () => {
    expect(computeRisk({ ...base, stop: 100 }).ok).toBe(false);
    expect(computeRisk({ ...base, capital: -1 }).ok).toBe(false);
    expect(computeRisk({ ...base, entry: NaN }).ok).toBe(false);
    expect(computeRisk({ ...base, target: 90 }).errors.length).toBeGreaterThan(0);
    expect(computeRisk({ ...base, riskPercent: 150 }).ok).toBe(false);
  });
  it('warns on leverage and poor R:R', () => {
    const r = computeRisk({ ...base, stop: 99.9, target: 100.05 });
    expect(r.warnings.some((w) => /leverage/i.test(w))).toBe(true);
    expect(r.warnings.some((w) => /below 1:1/.test(w))).toBe(true);
  });
  it('FX sizing uses a configurable pip value', () => {
    expect(fxPositionSize({ accountRisk: 100, stopPips: 25, pipValuePerLot: 10 })).toBeCloseTo(0.4);
    expect(fxPositionSize({ accountRisk: 100, stopPips: 0, pipValuePerLot: 10 })).toBeNull();
    expect(priceToPips(0.0025, 0.0001)).toBeCloseTo(25);
    expect(priceToPips(1, 0)).toBeNull();
  });
});

describe('portfolio & ratios', () => {
  it('aggregates P&L in base currency and reports missing FX', () => {
    const inst = getInstruments().find((i) => i.id === 'XAUUSD')!;
    const map = new Map([[inst.id, inst]]);
    const p = computePortfolio([{ id: 'a', instrumentId: inst.id, quantity: 2, avgCost: inst.price - 10 }], map, { USD: 80 });
    expect(p.totalPnl).toBeCloseTo(2 * 10 * 80);
    expect(p.rows[0].weight).toBeCloseTo(100);
    expect(computePortfolio([{ id: 'a', instrumentId: inst.id, quantity: 1, avgCost: 1 }], map, {}).missingFx).toEqual(['USD']);
  });
  it('gold/silver ratio guards zero', () => {
    expect(goldSilverRatio(2650, 31.2)).toBeCloseTo(84.94, 1);
    expect(goldSilverRatio(2650, 0)).toBeNull();
  });
});

describe('strategy, screener, backtest, scenarios', () => {
  it('validates rule parameters', () => {
    expect(validateRule({ id: 'x', type: 'smaAboveSMA', params: { fast: 50, slow: 20 } }).length).toBe(1);
    expect(validateRule({ id: 'x', type: 'rsiBetween', params: { min: 50, max: 65 } })).toEqual([]);
    expect(validateRule({ id: 'x', type: 'priceAboveSMA', params: {} }).length).toBe(1);
  });
  it('reports null (insufficient data) instead of guessing', () => {
    const r = evaluateRules(candles([1, 2, 3]), [{ id: 'a', type: 'priceAboveSMA', params: { period: 50 } }], 'AND');
    expect(r.details[0].result).toBeNull();
    expect(r.matched).toBe(false);
  });
  it('screener AND/OR logic', () => {
    const inst = getInstruments();
    const m = allMetrics();
    const all = runScreen({ logic: 'AND', conditions: [] }, inst, m);
    expect(all.length).toBe(inst.length);
    const oil = runScreen({ logic: 'AND', conditions: [{ id: '1', field: 'assetClass', op: 'is', value: 'oil' }] }, inst, m);
    expect(oil.every((r) => r.inst.assetClass === 'oil')).toBe(true);
    expect(oil.length).toBe(2);
    const either = runScreen({ logic: 'OR', conditions: [{ id: '1', field: 'assetClass', op: 'is', value: 'gold' }, { id: '2', field: 'assetClass', op: 'is', value: 'oil' }] }, inst, m);
    expect(either.length).toBe(4);
  });
  it('backtest is deterministic and accounts consistently', () => {
    const c = getSeries('XAUUSD', '1D');
    const rules = [{ id: 'a', type: 'priceAboveSMA' as const, params: { period: 20 } }];
    const cfg = { initialCapital: 100000, feeBps: 5, slippageBps: 5, startIndex: c.length - 250, endIndex: c.length - 1, logic: 'AND' as const };
    const r1 = runBacktest(c, rules, cfg);
    const r2 = runBacktest(c, rules, cfg);
    expect(r1).toEqual(r2);
    expect(r1.netPnl).toBeCloseTo(r1.equity.at(-1)!.value - 100000);
    expect(r1.maxDrawdownPct).toBeGreaterThanOrEqual(0);
    expect(runBacktest(c, [], cfg).trades.length).toBe(0);
  });
  it('scenario weights normalise and fall back when all zero', () => {
    const inst = getInstruments()[0];
    const s = computeScenarios(inst, 20, DEFAULT_ASSUMPTIONS);
    expect(s.cases.reduce((a, c) => a + c.probability, 0)).toBeCloseTo(100);
    const z = computeScenarios(inst, null, { ...DEFAULT_ASSUMPTIONS, bullProb: 0, baseProb: 0, bearProb: 0 });
    expect(z.weightsValid).toBe(false);
    expect(z.cases[0].probability).toBeCloseTo(33.33, 1);
  });
});

describe('fixtures & layout validation', () => {
  it('fixtures are deterministic and consistent across timeframes', () => {
    const d = getSeries('EURUSD', '1D');
    const h = getSeries('EURUSD', '1h');
    expect(h.at(-1)!.close).toBeCloseTo(d.at(-1)!.close, 10);
    expect(getInstruments().every((i) => i.dataMode === 'SIMULATED')).toBe(true);
  });
  it('covers exactly gold, silver, oil and forex', () => {
    const classes = new Set(getInstruments().map((i) => i.assetClass));
    expect([...classes].sort()).toEqual(['forex', 'gold', 'oil', 'silver']);
  });
  it('rejects malformed layout files', () => {
    expect(parseLayoutFile('not json').ok).toBe(false);
    expect(parseLayoutFile('{}').ok).toBe(false);
    expect(parseLayoutFile(JSON.stringify({ app: 'ai-trading-os', schemaVersion: 99, exportedAt: 'x', workspace: { id: 'a', name: 'n', updatedAt: 'x', windows: [] } })).ok).toBe(false);
  });
  it('migrates v1 layout files', () => {
    const v1 = { app: 'ai-trading-os', schemaVersion: 1, exportedAt: 'x', layout: { id: 'a', name: 'Old', updatedAt: 'x', windows: [{ id: 'w1', type: 'news', title: 'News', x: 0, y: 0, w: 400, h: 300, zIndex: 1, minimized: false, maximized: false, locked: false }] } };
    const r = parseLayoutFile(JSON.stringify(v1));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.workspace.windows[0].width).toBe(400);
  });
});
