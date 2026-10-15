import type { Instrument } from '../../types/market';

const CURRENCY_SYMBOL: Record<string, string> = { INR: '₹', USD: '$', JPY: '¥', EUR: '€', GBP: '£' };

export function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPrice(inst: Pick<Instrument, 'precision'>, n: number | null | undefined): string {
  return fmtNum(n, inst.precision);
}

export function fmtMoney(n: number | null | undefined, currency = 'INR', digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sym = CURRENCY_SYMBOL[currency] ?? '';
  const sign = n < 0 ? '-' : '';
  return `${sign}${sym}${fmtNum(Math.abs(n), digits)}${sym ? '' : ` ${currency}`}`;
}

export function fmtPct(n: number | null | undefined, digits = 2, signed = true): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${signed && n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

export function fmtSigned(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n > 0 ? '+' : ''}${fmtNum(n, digits)}`;
}

export function fmtCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
}

export function fmtTime(iso: string | number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
}

export function fmtDate(iso: string | number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function currencySymbol(c: string) {
  return CURRENCY_SYMBOL[c] ?? c;
}

export function tone(n: number | null | undefined): 'pos' | 'neg' | 'flat' {
  if (n == null || !Number.isFinite(n) || n === 0) return 'flat';
  return n > 0 ? 'pos' : 'neg';
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}
