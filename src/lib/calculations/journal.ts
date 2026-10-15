import type { JournalEntry } from '../../store/appStore';

/** P&L of a closed paper trade in its quote currency; null if not closed or incomplete. */
export function tradePnl(j: Pick<JournalEntry, 'status' | 'exit' | 'entry' | 'quantity' | 'direction'>): number | null {
  if (j.status !== 'closed' || j.exit == null || !Number.isFinite(j.exit) || !(j.entry > 0) || !(j.quantity > 0)) return null;
  return (j.direction === 'long' ? j.exit - j.entry : j.entry - j.exit) * j.quantity;
}

export interface JournalStats {
  closed: number;
  open: number;
  planned: number;
  wins: number;
  losses: number;
  winRate: number | null; // %
  avgReturn: number | null; // % per closed trade
  avgWin: number | null; // %
  avgLoss: number | null; // % (negative)
  bestReturn: number | null;
  worstReturn: number | null;
  /** Expected % per trade = win% × avg win + loss% × avg loss. */
  expectancy: number | null;
  /** Gross profit ÷ gross loss (in the reporting currency); null when there are no losses. */
  profitFactor: number | null;
  totalPnl: number; // reporting currency
  missingFx: string[];
}

/**
 * Deterministic journal performance. Percentages are currency-neutral; money totals are converted
 * into one reporting currency with the supplied rates (quote currency → reporting currency).
 */
export function journalStats(entries: JournalEntry[], quoteOf: (instrumentId: string) => string | undefined, fx: Record<string, number>): JournalStats {
  const closed = entries
    .map((e) => ({ e, pnl: tradePnl(e) }))
    .filter((x): x is { e: JournalEntry; pnl: number } => x.pnl != null);
  const rets = closed.map(({ e, pnl }) => (pnl / (e.entry * e.quantity)) * 100);
  const winsR = rets.filter((r) => r > 0);
  const lossR = rets.filter((r) => r < 0);
  const missing = new Set<string>();
  let gp = 0;
  let gl = 0;
  for (const { e, pnl } of closed) {
    const q = quoteOf(e.instrumentId) ?? '';
    const rate = fx[q];
    if (rate == null) {
      missing.add(q || e.instrumentId);
      continue;
    }
    if (pnl > 0) gp += pnl * rate;
    else gl += -pnl * rate;
  }
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const n = rets.length;
  const winRate = n ? (winsR.length / n) * 100 : null;
  const avgWin = avg(winsR);
  const avgLoss = avg(lossR);
  return {
    closed: n,
    open: entries.filter((e) => e.status === 'open').length,
    planned: entries.filter((e) => e.status === 'planned').length,
    wins: winsR.length,
    losses: lossR.length,
    winRate,
    avgReturn: avg(rets),
    avgWin,
    avgLoss,
    bestReturn: n ? Math.max(...rets) : null,
    worstReturn: n ? Math.min(...rets) : null,
    expectancy: n ? (winsR.length / n) * (avgWin ?? 0) + (lossR.length / n) * (avgLoss ?? 0) : null,
    profitFactor: gl > 0 ? gp / gl : null,
    totalPnl: gp - gl,
    missingFx: Array.from(missing),
  };
}
