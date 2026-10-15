import { describe, expect, it } from 'vitest';
import { journalStats, tradePnl } from '../lib/calculations/journal';
import type { JournalEntry } from '../store/appStore';

const j = (p: Partial<JournalEntry>): JournalEntry => ({
  id: Math.random().toString(36), instrumentId: 'XAUUSD', direction: 'long', status: 'closed', entry: 100, exit: 110, quantity: 1,
  setup: '', thesis: '', notes: '', lessons: '', tags: [], createdAt: '2026-01-01T00:00:00Z', ...p,
});
const quote = (id: string) => ({ XAUUSD: 'USD', USDJPY: 'JPY', GOLDINR: 'INR' } as Record<string, string>)[id];
const fx = { USD: 80, INR: 1, JPY: 0.5 };

describe('journal statistics', () => {
  it('computes long and short P&L, ignores unfinished trades', () => {
    expect(tradePnl(j({ entry: 100, exit: 110, quantity: 2 }))).toBe(20);
    expect(tradePnl(j({ direction: 'short', entry: 100, exit: 90, quantity: 3 }))).toBe(30);
    expect(tradePnl(j({ status: 'open' }))).toBeNull();
    expect(tradePnl(j({ exit: undefined }))).toBeNull();
    expect(tradePnl(j({ quantity: 0 }))).toBeNull();
  });
  it('win rate, expectancy, best/worst and profit factor', () => {
    const s = journalStats([j({ exit: 110 }), j({ exit: 95 }), j({ exit: 120 }), j({ status: 'planned' }), j({ status: 'open' })], quote, fx);
    expect(s.closed).toBe(3);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(s.winRate).toBeCloseTo(66.667, 2);
    expect(s.bestReturn).toBeCloseTo(20);
    expect(s.worstReturn).toBeCloseTo(-5);
    expect(s.avgWin).toBeCloseTo(15);
    expect(s.avgLoss).toBeCloseTo(-5);
    expect(s.expectancy).toBeCloseTo((2 / 3) * 15 + (1 / 3) * -5);
    expect(s.profitFactor).toBeCloseTo((30 * 80) / (5 * 80));
    expect(s.totalPnl).toBeCloseTo(25 * 80);
    expect(s.planned).toBe(1);
    expect(s.open).toBe(1);
  });
  it('converts mixed currencies and reports missing FX instead of guessing', () => {
    const s = journalStats([j({ exit: 110 }), j({ instrumentId: 'USDJPY', entry: 150, exit: 140, quantity: 100 }), j({ instrumentId: 'EURCHF', exit: 120 })], quote, fx);
    expect(s.totalPnl).toBeCloseTo(10 * 80 - 1000 * 0.5);
    expect(s.missingFx).toEqual(['EURCHF']);
  });
  it('empty journal gives nulls, not NaN', () => {
    const s = journalStats([], quote, fx);
    expect([s.winRate, s.avgReturn, s.expectancy, s.profitFactor, s.bestReturn]).toEqual([null, null, null, null, null]);
    expect(s.totalPnl).toBe(0);
  });
  it('profit factor is null with no losing trades', () => {
    expect(journalStats([j({ exit: 120 })], quote, fx).profitFactor).toBeNull();
  });
});
