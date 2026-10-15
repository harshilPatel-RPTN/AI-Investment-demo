import type { Holding } from '../../data/portfolios';
import type { AssetClass, Instrument } from '../../types/market';

export interface PositionRow {
  holding: Holding;
  inst: Instrument;
  cost: number; // quote currency
  value: number; // quote currency
  pnl: number; // quote currency
  pnlPct: number | null;
  valueBase: number; // base (reporting) currency
  pnlBase: number;
  weight: number; // % of total base value
}

export interface PortfolioSummary {
  rows: PositionRow[];
  totalValue: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPct: number | null;
  byClass: Array<{ assetClass: AssetClass; value: number; weight: number }>;
  missingFx: string[];
}

export function computePortfolio(holdings: Holding[], instruments: Map<string, Instrument>, fxToBase: Record<string, number>): PortfolioSummary {
  const rows: PositionRow[] = [];
  const missingFx = new Set<string>();
  for (const h of holdings) {
    const inst = instruments.get(h.instrumentId);
    if (!inst || !Number.isFinite(h.quantity) || !Number.isFinite(h.avgCost)) continue;
    const fx = fxToBase[inst.quoteCurrency];
    if (fx == null) missingFx.add(inst.quoteCurrency);
    const rate = fx ?? 0;
    const cost = h.quantity * h.avgCost;
    const value = h.quantity * inst.price;
    rows.push({
      holding: h, inst, cost, value, pnl: value - cost,
      pnlPct: cost !== 0 ? ((value - cost) / Math.abs(cost)) * 100 : null,
      valueBase: value * rate, pnlBase: (value - cost) * rate, weight: 0,
    });
  }
  const totalValue = rows.reduce((a, r) => a + r.valueBase, 0);
  const totalPnl = rows.reduce((a, r) => a + r.pnlBase, 0);
  const totalCost = totalValue - totalPnl;
  rows.forEach((r) => (r.weight = totalValue > 0 ? (r.valueBase / totalValue) * 100 : 0));
  const classMap = new Map<AssetClass, number>();
  rows.forEach((r) => classMap.set(r.inst.assetClass, (classMap.get(r.inst.assetClass) ?? 0) + r.valueBase));
  const byClass = Array.from(classMap.entries())
    .map(([assetClass, value]) => ({ assetClass, value, weight: totalValue > 0 ? (value / totalValue) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
  return { rows, totalValue, totalCost, totalPnl, totalPnlPct: totalCost !== 0 ? (totalPnl / totalCost) * 100 : null, byClass, missingFx: Array.from(missingFx) };
}

export function goldSilverRatio(goldUsdOz: number, silverUsdOz: number): number | null {
  if (!Number.isFinite(goldUsdOz) || !Number.isFinite(silverUsdOz) || silverUsdOz <= 0) return null;
  return goldUsdOz / silverUsdOz;
}
