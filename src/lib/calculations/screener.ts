import { z } from 'zod';
import type { Instrument } from '../../types/market';
import type { InstrumentMetrics } from './metrics';

export const SCREEN_FIELDS = {
  assetClass: { label: 'Asset class', kind: 'enum' },
  price: { label: 'Price', kind: 'number' },
  changePercent: { label: 'Day change %', kind: 'number' },
  change20d: { label: '20-bar change %', kind: 'number' },
  volume: { label: 'Volume', kind: 'number' },
  rsi14: { label: 'RSI (14)', kind: 'number' },
  vol20: { label: 'Volatility (ann. %)', kind: 'number' },
  trend: { label: 'Trend', kind: 'enum' },
  maRelation: { label: 'Price vs MA', kind: 'enum' },
  tag: { label: 'Tag', kind: 'text' },
} as const;

export type ScreenField = keyof typeof SCREEN_FIELDS;
export type ScreenOp = 'gt' | 'lt' | 'between' | 'is' | 'contains';

export const conditionSchema = z.object({
  id: z.string(),
  field: z.enum(Object.keys(SCREEN_FIELDS) as [ScreenField, ...ScreenField[]]),
  op: z.enum(['gt', 'lt', 'between', 'is', 'contains']),
  value: z.union([z.number(), z.string()]),
  value2: z.number().optional(),
});
export type ScreenCondition = z.infer<typeof conditionSchema>;

export const screenSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(80),
  logic: z.enum(['AND', 'OR']),
  conditions: z.array(conditionSchema).max(20),
});
export type ScreenDefinition = z.infer<typeof screenSchema>;

export const MA_RELATIONS = ['above-sma20', 'below-sma20', 'above-sma50', 'below-sma50', 'above-sma200', 'below-sma200', 'sma20-above-sma50', 'sma20-below-sma50'] as const;

function maMatch(rel: string, m: InstrumentMetrics): boolean | null {
  const p = m.price;
  switch (rel) {
    case 'above-sma20': return m.sma20 == null ? null : p > m.sma20;
    case 'below-sma20': return m.sma20 == null ? null : p < m.sma20;
    case 'above-sma50': return m.sma50 == null ? null : p > m.sma50;
    case 'below-sma50': return m.sma50 == null ? null : p < m.sma50;
    case 'above-sma200': return m.sma200 == null ? null : p > m.sma200;
    case 'below-sma200': return m.sma200 == null ? null : p < m.sma200;
    case 'sma20-above-sma50': return m.sma20 == null || m.sma50 == null ? null : m.sma20 > m.sma50;
    case 'sma20-below-sma50': return m.sma20 == null || m.sma50 == null ? null : m.sma20 < m.sma50;
    default: return null;
  }
}

function numCompare(v: number | null | undefined, c: ScreenCondition): boolean {
  if (v == null || !Number.isFinite(v)) return false; // missing data never matches
  const a = Number(c.value);
  if (!Number.isFinite(a)) return false;
  if (c.op === 'gt') return v > a;
  if (c.op === 'lt') return v < a;
  if (c.op === 'between') {
    const b = c.value2;
    if (b == null || !Number.isFinite(b)) return false;
    return v >= Math.min(a, b) && v <= Math.max(a, b);
  }
  return false;
}

export function evaluateCondition(inst: Instrument, m: InstrumentMetrics, c: ScreenCondition): boolean {
  switch (c.field) {
    case 'assetClass': return inst.assetClass === c.value;
    case 'trend': return m.trend === c.value;
    case 'maRelation': return maMatch(String(c.value), m) === true;
    case 'tag': {
      const q = String(c.value).toLowerCase().trim();
      return q.length > 0 && inst.tags.some((t) => t.toLowerCase().includes(q));
    }
    case 'price': return numCompare(m.price, c);
    case 'changePercent': return numCompare(m.changePercent, c);
    case 'change20d': return numCompare(m.change20d, c);
    case 'volume': return numCompare(m.volume, c);
    case 'rsi14': return numCompare(m.rsi14, c);
    case 'vol20': return numCompare(m.vol20, c);
  }
}

export function runScreen(
  screen: Pick<ScreenDefinition, 'logic' | 'conditions'>,
  instruments: Instrument[],
  metrics: Map<string, InstrumentMetrics>,
): Array<{ inst: Instrument; m: InstrumentMetrics; matched: string[] }> {
  const out: Array<{ inst: Instrument; m: InstrumentMetrics; matched: string[] }> = [];
  for (const inst of instruments) {
    const m = metrics.get(inst.id);
    if (!m) continue;
    if (!screen.conditions.length) {
      out.push({ inst, m, matched: [] });
      continue;
    }
    const results = screen.conditions.map((c) => evaluateCondition(inst, m, c));
    const ok = screen.logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
    if (ok) out.push({ inst, m, matched: screen.conditions.filter((_, i) => results[i]).map(describeCondition) });
  }
  return out;
}

export function describeCondition(c: ScreenCondition): string {
  const label = SCREEN_FIELDS[c.field].label;
  if (c.op === 'between') return `${label} between ${c.value} and ${c.value2}`;
  if (c.op === 'gt') return `${label} > ${c.value}`;
  if (c.op === 'lt') return `${label} < ${c.value}`;
  if (c.op === 'contains') return `${label} contains "${c.value}"`;
  return `${label} is ${c.value}`;
}
