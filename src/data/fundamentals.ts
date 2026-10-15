import type { Instrument } from '../types/market';
import { hashString, mulberry32 } from '../lib/seed';

/** Fundamentals metrics per instrument. */
export interface EquityFundamentals {
  kind: 'equity';
  currency: string;
  unitLabel: string; // e.g. "₹ Cr" or "$ M"
  revenue: number;
  netIncome: number;
  operatingMargin: number;
  netMargin: number;
  eps: number;
  pe: number;
  pb: number;
  roe: number;
  debtToEquity: number;
  freeCashFlow: number;
  dividendYield: number;
  quarters: Array<{ q: string; revenue: number; eps: number }>;
  overview: string;
}

export interface DriverCard {
  title: string;
  value?: string;
  note: string;
  direction?: 'positive' | 'negative' | 'neutral' | 'unknown';
}

export interface AssetFundamentals {
  kind: 'metal' | 'crypto' | 'oil' | 'forex' | 'index';
  overview: string;
  stats: Array<{ label: string; value: string; hint?: string }>;
  drivers: DriverCard[];
}

export const FORMULAS: Record<string, string> = {
  'P/E': 'Price ÷ Earnings per share (trailing).',
  'P/B': 'Price ÷ Book value per share.',
  ROE: 'Net income ÷ Shareholders’ equity.',
  'Debt/Equity': 'Total debt ÷ Shareholders’ equity.',
  'Operating margin': 'Operating profit ÷ Revenue.',
  'Net margin': 'Net income ÷ Revenue.',
  EPS: 'Net income ÷ Shares outstanding.',
  'Free cash flow': 'Operating cash flow − Capital expenditure.',
  'Dividend yield': 'Annual dividend per share ÷ Price.',
};

const cache = new Map<string, EquityFundamentals | AssetFundamentals>();

function equity(inst: Instrument): EquityFundamentals {
  const r = mulberry32(hashString(`fund|${inst.id}`));
  const inr = inst.quoteCurrency === 'INR';
  const pe = 14 + r() * 30;
  const eps = inst.price / pe;
  const revenue = (inr ? 20000 : 50000) + r() * (inr ? 220000 : 300000);
  const netMargin = 0.06 + r() * 0.2;
  const netIncome = revenue * netMargin;
  const quarters = Array.from({ length: 8 }, (_, i) => {
    const g = 1 + (r() - 0.35) * 0.06;
    return { q: `Q${((i + 2) % 4) + 1} FY${24 + Math.floor((i + 2) / 4)}`, revenue: (revenue / 4) * (0.86 + i * 0.02) * g, eps: (eps / 4) * (0.85 + i * 0.022) * g };
  });
  const isBank = inst.tags.includes('banking');
  return {
    kind: 'equity',
    currency: inst.quoteCurrency,
    unitLabel: inr ? '₹ Cr' : '$ M',
    revenue,
    netIncome,
    operatingMargin: netMargin + 0.05 + r() * 0.08,
    netMargin,
    eps,
    pe,
    pb: isBank ? 1.5 + r() * 2.5 : 2 + r() * 10,
    roe: 0.1 + r() * 0.22,
    debtToEquity: isBank ? 6 + r() * 4 : r() * 1.2,
    freeCashFlow: netIncome * (0.5 + r() * 0.7),
    dividendYield: r() * 0.035,
    quarters,
    overview: `${inst.displayName} — ${inst.description} Sector: ${inst.sector ?? 'n/a'}.`,
  };
}

function asset(inst: Instrument): AssetFundamentals {
  const r = mulberry32(hashString(`fund|${inst.id}`));
  switch (inst.assetClass) {
    case 'gold':
    case 'silver': {
      const isGold = inst.assetClass === 'gold';
      return {
        kind: 'metal',
        overview: `${inst.displayName}: quoted in ${inst.quoteCurrency} per ${inst.unit}. Metals have no earnings — analysis focuses on macro drivers, flows and supply.`,
        stats: [
          { label: 'Quote', value: `${inst.quoteCurrency} per ${inst.unit}` },
          { label: 'Troy ounce', value: '31.1035 g', hint: 'Precious metals are priced per troy ounce (heavier than a 28.35 g avoirdupois ounce).' },
          { label: 'Mine supply growth', value: `${(r() * 3 - 0.5).toFixed(1)}% y/y` },
          { label: isGold ? 'Official-sector demand' : 'Industrial share of demand', value: isGold ? `${(800 + r() * 300).toFixed(0)} t/yr` : `${(50 + r() * 10).toFixed(0)}%` },
        ],
        drivers: [
          { title: 'US dollar strength', note: 'A stronger USD typically makes dollar-priced metals more expensive for other buyers (inverse tendency, not a rule).', direction: 'unknown' },
          { title: 'Real interest rates', note: 'Higher real yields raise the opportunity cost of holding non-yielding metals.', direction: 'unknown' },
          { title: 'Inflation expectations', note: 'Often cited as a long-run support; short-run relationship is unstable.', direction: 'unknown' },
          { title: isGold ? 'Safe-haven demand' : 'Industrial demand (solar, electronics)', note: isGold ? 'Risk-off episodes can lift demand.' : 'Silver is part precious, part industrial metal — more cyclical than gold.', direction: 'unknown' },
        ],
      };
    }
    case 'crypto': {
      const supply = { BTCUSD: 19.7e6, ETHUSD: 120e6, SOLUSD: 470e6, XRPUSD: 56e9 }[inst.id] ?? 1e8;
      return {
        kind: 'crypto',
        overview: `${inst.displayName} trades 24/7. Equity ratios do not apply; context uses market-structure metrics.`,
        stats: [
          { label: 'Circulating supply', value: Intl.NumberFormat('en-US', { notation: 'compact' }).format(supply) },
          { label: 'Market cap', value: `$${Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(supply * inst.price)}`, hint: 'Price × circulating supply.' },
          { label: 'Funding rate', value: `${((r() - 0.4) * 0.03).toFixed(3)}% / 8h` },
          { label: 'Open interest', value: `$${(r() * 20 + 1).toFixed(1)}B` },
          { label: 'Active addresses', value: Intl.NumberFormat('en-US', { notation: 'compact' }).format(2e5 + r() * 1e6) },
        ],
        drivers: [
          { title: 'Liquidity & risk appetite', note: 'Crypto tends to be high-beta to global liquidity conditions.', direction: 'unknown' },
          { title: 'Fund flows', note: 'Spot product flows are a commonly watched driver.', direction: 'unknown' },
          { title: 'Network activity', note: 'Fees, active addresses and throughput.', direction: 'unknown' },
          { title: 'Regulation', note: 'Policy news can cause discontinuous moves.', direction: 'unknown' },
        ],
      };
    }
    case 'oil':
      return {
        kind: 'oil',
        overview: `${inst.displayName}: USD per barrel. Key drivers are listed below.`,
        stats: [
          { label: 'Unit', value: 'USD per barrel (159 litres)' },
          { label: 'Weekly inventory change ', value: `${((r() - 0.5) * 8).toFixed(1)} M bbl` },
          { label: 'Spare capacity', value: `${(2 + r() * 3).toFixed(1)} M bbl/d` },
          { label: 'Brent–WTI spread', value: 'see Macro Board' },
        ],
        drivers: [
          { title: 'Inventories', note: 'Builds tend to pressure prices; draws tend to support them.', direction: 'unknown' },
          { title: 'Producer policy', note: 'Output decisions by major producer groups.', direction: 'unknown' },
          { title: 'Global demand', note: 'Industrial activity, travel, and seasonal patterns.', direction: 'unknown' },
          { title: 'Geopolitical supply risk', note: 'Disruptions can add a risk premium.', direction: 'unknown' },
        ],
      };
    case 'forex':
      return {
        kind: 'forex',
        overview: `${inst.symbol}: price of 1 ${inst.baseCurrency} in ${inst.quoteCurrency}. A rising rate means the base currency is strengthening against the quote currency.`,
        stats: [
          { label: 'Base / quote', value: `${inst.baseCurrency} / ${inst.quoteCurrency}` },
          { label: 'Pip size', value: String(inst.pipSize), hint: 'Smallest conventional price increment for this pair (display convention).' },
          { label: 'Display precision', value: `${inst.precision} decimals` },
          { label: 'Policy-rate differential', value: `${((r() - 0.3) * 5).toFixed(2)} pp` },
        ],
        drivers: [
          { title: 'Interest-rate differential', note: 'Higher relative rates can attract capital to a currency.', direction: 'unknown' },
          { title: 'Central-bank guidance', note: 'See Economic Calendar for upcoming policy dates.', direction: 'unknown' },
          { title: 'Growth & inflation data', note: 'Relative macro surprises shift expectations.', direction: 'unknown' },
          { title: 'Risk sentiment', note: 'Safe-haven vs. commodity/EM currencies respond differently.', direction: 'unknown' },
        ],
      };
    default:
      return {
        kind: 'index',
        overview: `${inst.displayName}: a benchmark index level (points). Metrics are aggregates of constituents.`,
        stats: [
          { label: 'Index P/E', value: (16 + r() * 10).toFixed(1) },
          { label: 'Dividend yield', value: `${(1 + r() * 1.5).toFixed(2)}%` },
          { label: 'Constituents', value: inst.id === 'SENSEX' ? '30' : inst.id === 'NIFTY50' ? '50' : inst.id === 'BANKNIFTY' ? '12' : inst.id === 'NDX' ? '100' : '500' },
        ],
        drivers: [
          { title: 'Earnings revisions', note: 'Aggregate earnings expectations of constituents.', direction: 'unknown' },
          { title: 'Foreign flows', note: 'Portfolio flows matter for emerging-market indices.', direction: 'unknown' },
          { title: 'Rates & liquidity', note: 'Discount-rate sensitivity of valuations.', direction: 'unknown' },
        ],
      };
  }
}

export function getFundamentals(inst: Instrument): EquityFundamentals | AssetFundamentals {
  const hit = cache.get(inst.id);
  if (hit) return hit;
  const f = inst.assetClass === 'equity' ? equity(inst) : asset(inst);
  cache.set(inst.id, f);
  return f;
}

export function peersOf(inst: Instrument, all: Instrument[]): Instrument[] {
  return all.filter((i) => i.assetClass === 'equity' && i.id !== inst.id && (i.sector === inst.sector || i.tags.some((t) => inst.tags.includes(t) && t !== 'large-cap' && t !== 'nifty50'))).slice(0, 5);
}
