import type { Candle } from '../../types/market';
import { buildEvaluator, type StrategyRule } from './strategy';

export interface BacktestConfig {
  initialCapital: number;
  feeBps: number; // per side
  slippageBps: number; // per side
  startIndex: number;
  endIndex: number;
  logic: 'AND' | 'OR';
}

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
  pnl: number;
}

export interface BacktestResult {
  equity: Array<{ time: number; value: number }>;
  trades: BacktestTrade[];
  winRate: number | null;
  netPnl: number;
  netReturnPct: number;
  maxDrawdownPct: number;
  avgReturnPct: number | null;
  exposurePct: number;
  buyHoldReturnPct: number | null;
}

/**
 * Illustrative long-only backtest: enter at the NEXT bar's open when the rule set becomes true,
 * exit at the next bar's open when it turns false. Fully invested while in a position.
 */
export function runBacktest(candles: Candle[], rules: StrategyRule[], cfg: BacktestConfig): BacktestResult {
  const start = Math.max(0, Math.min(cfg.startIndex, candles.length - 1));
  const end = Math.max(start, Math.min(cfg.endIndex, candles.length - 1));
  const evalAt = buildEvaluator(candles);
  const cost = (cfg.feeBps + cfg.slippageBps) / 10000;
  let cash = cfg.initialCapital;
  let units = 0;
  let entryPrice = 0;
  let entryTime = 0;
  let entryCash = 0;
  let barsIn = 0;
  const trades: BacktestTrade[] = [];
  const equity: Array<{ time: number; value: number }> = [];
  let peak = cfg.initialCapital;
  let maxDD = 0;

  const signal = (i: number) => {
    if (!rules.length) return false;
    const r = rules.map((rule) => evalAt(rule, i) === true);
    return cfg.logic === 'AND' ? r.every(Boolean) : r.some(Boolean);
  };

  for (let i = start; i <= end; i++) {
    const bar = candles[i];
    // Execute decisions made on the previous bar's close at this bar's open.
    if (i > start) {
      const prevSignal = signal(i - 1);
      if (prevSignal && units === 0 && cash > 0) {
        const px = bar.open * (1 + cost);
        units = cash / px;
        entryPrice = px;
        entryTime = bar.time;
        entryCash = cash;
        cash = 0;
      } else if (!prevSignal && units > 0) {
        const px = bar.open * (1 - cost);
        cash = units * px;
        trades.push({ entryTime, exitTime: bar.time, entryPrice, exitPrice: px, returnPct: (px / entryPrice - 1) * 100, pnl: cash - entryCash });
        units = 0;
      }
    }
    if (units > 0) barsIn++;
    const value = cash + units * bar.close;
    equity.push({ time: bar.time, value });
    peak = Math.max(peak, value);
    if (peak > 0) maxDD = Math.max(maxDD, ((peak - value) / peak) * 100);
  }
  // Close any open position at the final close for reporting.
  if (units > 0) {
    const bar = candles[end];
    const px = bar.close * (1 - cost);
    cash = units * px;
    trades.push({ entryTime, exitTime: bar.time, entryPrice, exitPrice: px, returnPct: (px / entryPrice - 1) * 100, pnl: cash - entryCash });
    units = 0;
    equity[equity.length - 1] = { time: bar.time, value: cash };
  }
  const finalValue = equity.length ? equity[equity.length - 1].value : cfg.initialCapital;
  const wins = trades.filter((t) => t.pnl > 0).length;
  const span = end - start + 1;
  return {
    equity,
    trades,
    winRate: trades.length ? (wins / trades.length) * 100 : null,
    netPnl: finalValue - cfg.initialCapital,
    netReturnPct: cfg.initialCapital > 0 ? (finalValue / cfg.initialCapital - 1) * 100 : 0,
    maxDrawdownPct: maxDD,
    avgReturnPct: trades.length ? trades.reduce((a, t) => a + t.returnPct, 0) / trades.length : null,
    exposurePct: span > 0 ? (barsIn / span) * 100 : 0,
    buyHoldReturnPct: candles[start] && candles[end] ? (candles[end].close / candles[start].close - 1) * 100 : null,
  };
}
