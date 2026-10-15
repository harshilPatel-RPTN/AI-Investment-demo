import type { Instrument, Timeframe } from '../types/market';
import { getNews } from '../data/news';
import { buildCommunityContext, communityLines, communityOverview } from './communityContext';
import type { AIAnalysis, AIContext, Bias } from '../types/ai';
import { computeMetrics } from './calculations/metrics';
import { getFundamentals, peersOf, type EquityFundamentals } from '../data/fundamentals';
import { newsFor } from '../data/news';
import { eventsFor } from '../data/events';
import { getInstrument, getInstruments } from '../data/instruments';
import { FIXTURE_NOW, FIXTURE_NOW_ISO } from './seed';
import { fmtNum, fmtPrice } from './formatting';
import { goldSilverRatio } from './calculations/portfolio';

export type Direction = 'positive' | 'negative' | 'neutral' | 'unknown';
export type LaneId = 'technical' | 'drivers' | 'news' | 'macro';

export interface EvidenceItem {
  id: string;
  text: string;
  direction: Direction;
  source: string;
  timestamp: string;
}

export interface Lane {
  id: LaneId;
  title: string;
  items: EvidenceItem[];
  missing: string[];
  bias: 'positive' | 'negative' | 'neutral' | 'mixed' | 'no-evidence';
  score: number;
}

export interface EvidenceSet {
  instrumentId: string;
  timeframe: Timeframe;
  lanes: Lane[];
  combined: { bias: Bias; label: string; explanation: string };
  coverage: { lanesWithEvidence: number; directional: number; total: number };
  generatedAt: string;
}

const LOCAL = 'Local indicator calculation';

function laneBias(items: EvidenceItem[]): { bias: Lane['bias']; score: number } {
  const pos = items.filter((i) => i.direction === 'positive').length;
  const neg = items.filter((i) => i.direction === 'negative').length;
  const score = pos - neg;
  if (!items.length) return { bias: 'no-evidence', score: 0 };
  if (pos && neg && Math.abs(score) <= 1) return { bias: 'mixed', score };
  return { bias: score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral', score };
}

function technical(inst: Instrument, tf: Timeframe): Lane {
  const m = computeMetrics(inst, tf);
  const items: EvidenceItem[] = [];
  const missing: string[] = [];
  const p = (v: number | null) => (v == null ? 'n/a' : fmtPrice(inst, v));
  const push = (id: string, text: string, direction: Direction) => items.push({ id, text, direction, source: `${LOCAL} (${tf})`, timestamp: FIXTURE_NOW_ISO });
  if (m.sma50 != null) push('sma50', `Price ${p(m.price)} is ${m.price > m.sma50 ? 'above' : 'below'} SMA(50) ${p(m.sma50)}`, m.price > m.sma50 ? 'positive' : 'negative');
  else missing.push('SMA(50) — insufficient bars');
  if (m.sma200 != null) push('sma200', `Price is ${m.price > m.sma200 ? 'above' : 'below'} SMA(200) ${p(m.sma200)} (longer-term trend)`, m.price > m.sma200 ? 'positive' : 'negative');
  else missing.push('SMA(200) — insufficient bars for this timeframe');
  if (m.sma20 != null && m.sma50 != null) push('cross', `SMA(20) ${m.sma20 > m.sma50 ? 'above' : 'below'} SMA(50) — classified trend: ${m.trend}`, m.trend === 'uptrend' ? 'positive' : m.trend === 'downtrend' ? 'negative' : 'neutral');
  if (m.rsi14 != null) {
    const r = m.rsi14;
    const dir: Direction = r >= 70 ? 'negative' : r <= 30 ? 'positive' : r >= 50 ? 'positive' : 'negative';
    const note = r >= 70 ? 'overbought zone — stretched, pullback risk' : r <= 30 ? 'oversold zone — possible rebound, trend still weak' : r >= 50 ? 'momentum above midline' : 'momentum below midline';
    push('rsi', `RSI(14) ${r.toFixed(1)}: ${note}`, dir);
  } else missing.push('RSI(14)');
  if (m.macd != null && m.macdSignal != null) push('macd', `MACD ${m.macd > m.macdSignal ? 'above' : 'below'} signal line`, m.macd > m.macdSignal ? 'positive' : 'negative');
  if (m.bbUpper != null && m.bbLower != null) {
    const pos = (m.price - m.bbLower) / (m.bbUpper - m.bbLower || 1);
    push('bb', `Price sits at ${(pos * 100).toFixed(0)}% of the Bollinger(20,2) band width`, pos > 1 ? 'negative' : pos < 0 ? 'positive' : 'neutral');
  }
  if (m.change20d != null) push('ret20', `20-bar return ${m.change20d.toFixed(2)}%`, m.change20d > 1 ? 'positive' : m.change20d < -1 ? 'negative' : 'neutral');
  if (m.vol20 != null) push('vol', `Realised volatility ${m.vol20.toFixed(1)}% annualised (context for position sizing, not direction)`, 'neutral');
  return { id: 'technical', title: 'Technical evidence', items, missing, ...laneBias(items) };
}

function drivers(inst: Instrument): Lane {
  const f = getFundamentals(inst);
  const items: EvidenceItem[] = [];
  const missing: string[] = [];
  const src = 'Fundamentals data';
  const push = (id: string, text: string, direction: Direction, source = src) => items.push({ id, text, direction, source, timestamp: FIXTURE_NOW_ISO });
  if (f.kind === 'equity') {
    const ef = f as EquityFundamentals;
    const peers = peersOf(inst, getInstruments()).map((p) => getFundamentals(p) as EquityFundamentals);
    if (peers.length) {
      const med = [...peers.map((p) => p.pe)].sort((a, b) => a - b)[Math.floor(peers.length / 2)];
      push('pe', `P/E ${fmtNum(ef.pe, 1)} vs peer median ${fmtNum(med, 1)}`, ef.pe < med * 0.9 ? 'positive' : ef.pe > med * 1.1 ? 'negative' : 'neutral');
    } else missing.push('Peer valuation comparison (no peers in catalogue)');
    push('margin', `Net margin ${(ef.netMargin * 100).toFixed(1)}%`, ef.netMargin > 0.15 ? 'positive' : ef.netMargin < 0.08 ? 'negative' : 'neutral');
    push('roe', `ROE ${(ef.roe * 100).toFixed(1)}%`, ef.roe > 0.18 ? 'positive' : ef.roe < 0.12 ? 'negative' : 'neutral');
    if (!inst.tags.includes('banking')) push('de', `Debt/equity ${fmtNum(ef.debtToEquity, 2)}`, ef.debtToEquity > 1 ? 'negative' : ef.debtToEquity < 0.4 ? 'positive' : 'neutral');
    const q = ef.quarters;
    const g = (q[q.length - 1].revenue / q[q.length - 2].revenue - 1) * 100;
    push('qrev', `Latest quarter revenue ${g >= 0 ? 'grew' : 'fell'} ${Math.abs(g).toFixed(1)}% q/q`, g > 1 ? 'positive' : g < -1 ? 'negative' : 'neutral');
    missing.push('Forward guidance / consensus estimates');
  } else {
    f.drivers.forEach((d, i) => push(`d${i}`, `${d.title}: ${d.note}`, 'unknown', 'Educational driver card'));
    if (inst.assetClass === 'gold' || inst.assetClass === 'silver') {
      const g = getInstrument('XAUUSD');
      const s = getInstrument('XAGUSD');
      const r = g && s ? goldSilverRatio(g.price, s.price) : null;
      if (r != null) push('gsr', `Gold/silver ratio ${r.toFixed(1)}`, 'neutral', 'Local calculation');
      missing.push('Live real-yield and USD index data', 'Physical demand / ETF flow data');
    } else if (inst.assetClass === 'oil') missing.push('Actual inventory figures', 'Futures curve / roll structure');
    else if (inst.assetClass === 'crypto') missing.push('Real on-chain metrics', 'Real derivatives positioning');
    else if (inst.assetClass === 'forex') missing.push('Current policy rates and expectations');
    else missing.push('Constituent earnings revisions');
  }
  return { id: 'drivers', title: inst.assetClass === 'equity' ? 'Fundamentals' : 'Asset drivers', items, missing, ...laneBias(items) };
}

function news(inst: Instrument): Lane {
  const list = newsFor(inst.id).slice(0, 6);
  const items: EvidenceItem[] = list.map((n) => ({
    id: n.id,
    text: n.headline,
    direction: n.sentiment === 'bullish' ? 'positive' : n.sentiment === 'bearish' ? 'negative' : 'neutral',
    source: `${n.source} · ${n.category}`,
    timestamp: n.publishedAt,
  }));
  const upcoming = eventsFor(inst.id).filter((e) => new Date(e.date).getTime() >= FIXTURE_NOW).slice(0, 3);
  upcoming.forEach((e) => items.push({ id: e.id, text: `Upcoming: ${e.title}`, direction: 'unknown', source: `Economic calendar · ${e.importance} importance`, timestamp: e.date }));
  const missing = list.length ? [] : ['No headlines for this instrument'];
  return { id: 'news', title: 'News & events', items, missing, ...laneBias(items) };
}

function macro(inst: Instrument, tf: Timeframe): Lane {
  const items: EvidenceItem[] = [];
  const src = 'Cross-asset context';
  const trendOf = (id: string) => {
    const i = getInstrument(id);
    return i ? computeMetrics(i, tf).trend : null;
  };
  const push = (id: string, text: string, direction: Direction) => items.push({ id, text, direction, source: src, timestamp: FIXTURE_NOW_ISO });
  const eurusd = trendOf('EURUSD');
  const usdWeak = eurusd === 'uptrend' ? true : eurusd === 'downtrend' ? false : null;
  switch (inst.assetClass) {
    case 'equity':
    case 'index': {
      const bench = inst.quoteCurrency === 'INR' ? 'NIFTY50' : 'SPX';
      if (inst.id !== bench) {
        const t = trendOf(bench);
        push('bench', `Benchmark ${getInstrument(bench)?.symbol} classified as ${t}`, t === 'uptrend' ? 'positive' : t === 'downtrend' ? 'negative' : 'neutral');
      }
      if (inst.quoteCurrency === 'INR') {
        const t = trendOf('USDINR');
        push('inr', `USD/INR ${t} (a weaker rupee can weigh on foreign flows)`, t === 'uptrend' ? 'negative' : t === 'downtrend' ? 'positive' : 'neutral');
      }
      break;
    }
    case 'gold':
    case 'silver':
      if (usdWeak != null) push('usd', `USD proxy ${usdWeak ? 'weakening' : 'strengthening'} (EUR/USD ${eurusd})`, usdWeak ? 'positive' : 'negative');
      {
        const r = trendOf('AUDUSD');
        push('risk', `Risk-appetite proxy (AUD/USD) ${r}; safe-haven demand context only`, 'neutral');
      }
      break;
    case 'crypto': {
      const t = trendOf('NDX');
      push('risk', `Risk-appetite proxy (Nasdaq-100) ${t}`, t === 'uptrend' ? 'positive' : t === 'downtrend' ? 'negative' : 'neutral');
      if (inst.id !== 'BTCUSD') {
        const b = trendOf('BTCUSD');
        push('btc', `BTC/USD (market leader) ${b}`, b === 'uptrend' ? 'positive' : b === 'downtrend' ? 'negative' : 'neutral');
      }
      break;
    }
    case 'oil':
      if (usdWeak != null) push('usd', `USD proxy ${usdWeak ? 'weakening' : 'strengthening'}`, usdWeak ? 'positive' : 'negative');
      {
        const g = trendOf('AUDUSD');
        push('growth', `Growth / commodity-FX proxy (AUD/USD) ${g}`, g === 'uptrend' ? 'positive' : g === 'downtrend' ? 'negative' : 'neutral');
        const cad = trendOf('USDCAD');
        if (cad) push('cad', `USD/CAD ${cad} (oil-linked currency cross-check)`, 'neutral');
      }
      break;
    case 'forex':
      push('dxy', `Broad USD proxy (EUR/USD) ${eurusd}`, 'neutral');
      break;
  }
  const cb = eventsFor(inst.id).filter((e) => e.type === 'central-bank' || e.type === 'macro').filter((e) => new Date(e.date).getTime() >= FIXTURE_NOW);
  cb.slice(0, 2).forEach((e) => items.push({ id: e.id, text: `Event risk: ${e.title}`, direction: 'unknown', source: 'Economic calendar', timestamp: e.date }));
  const missing = ['Rates, PMIs and flow data'];
  return { id: 'macro', title: 'Macro / market context', items, missing, ...laneBias(items) };
}

export function buildEvidence(inst: Instrument, tf: Timeframe): EvidenceSet {
  const lanes = [technical(inst, tf), drivers(inst), news(inst), macro(inst, tf)];
  const directional = lanes.flatMap((l) => l.items).filter((i) => i.direction === 'positive' || i.direction === 'negative').length;
  const total = lanes.reduce((a, l) => a + l.items.length, 0);
  const lanesWithEvidence = lanes.filter((l) => l.items.some((i) => i.direction === 'positive' || i.direction === 'negative')).length;
  const pos = lanes.filter((l) => l.bias === 'positive').length;
  const neg = lanes.filter((l) => l.bias === 'negative').length;
  let combined: EvidenceSet['combined'];
  if (lanesWithEvidence < 2) combined = { bias: 'insufficient_data', label: 'Insufficient data', explanation: 'Fewer than two lanes contain directional evidence.' };
  else if (pos && neg) combined = { bias: 'conflicting', label: 'Conflicting — wait', explanation: `${pos} lane(s) lean positive and ${neg} lean negative.` };
  else if (pos > neg) combined = { bias: 'bullish', label: 'Bullish bias', explanation: `${pos} lane(s) lean positive; none lean negative.` };
  else if (neg > pos) combined = { bias: 'bearish', label: 'Bearish bias', explanation: `${neg} lane(s) lean negative; none lean positive.` };
  else combined = { bias: 'neutral', label: 'Neutral', explanation: 'No lane leans clearly in either direction.' };
  return { instrumentId: inst.id, timeframe: tf, lanes, combined, coverage: { lanesWithEvidence, directional, total }, generatedAt: FIXTURE_NOW_ISO };
}

export interface ContextOptions {
  technical: boolean;
  fundamentals: boolean;
  news: boolean;
  events: boolean;
  /** Community sentiment, top discussions and trading ideas. Included unless explicitly false. */
  community?: boolean;
}

/** Compact context — only what the user chose to include. */
export function buildAIContext(inst: Instrument, tf: Timeframe, opts: ContextOptions, extra?: string): AIContext {
  const ctx: AIContext = {
    instrument: {
      symbol: inst.symbol, name: inst.displayName, assetClass: inst.assetClass, quoteCurrency: inst.quoteCurrency, unit: inst.unit,
      price: Number(inst.price.toFixed(inst.precision)), changePercent: Number(inst.changePercent.toFixed(2)),
      dayHigh: Number(inst.dayHigh.toFixed(inst.precision)), dayLow: Number(inst.dayLow.toFixed(inst.precision)),
      snapshotTime: inst.lastUpdatedAt,
    },
    timeframe: tf,
  };
  const ev = buildEvidence(inst, tf);
  if (opts.technical) {
    const m = computeMetrics(inst, tf);
    const r = (v: number | null, d = inst.precision) => (v == null ? null : Number(v.toFixed(d)));
    ctx.technical = { sma20: r(m.sma20), sma50: r(m.sma50), sma200: r(m.sma200), rsi14: r(m.rsi14, 1), macd: r(m.macd, 5), macdSignal: r(m.macdSignal, 5), bbUpper: r(m.bbUpper), bbLower: r(m.bbLower), atr14: r(m.atr14), realisedVolAnnPct: r(m.vol20, 1), change20dPct: r(m.change20d, 2), trend: m.trend, evidence: ev.lanes[0].items.map((i) => `${i.text} [${i.direction}]`) };
  }
  if (opts.fundamentals) ctx.fundamentals = { lane: ev.lanes[1].title, evidence: ev.lanes[1].items.map((i) => `${i.text} [${i.direction}]`), missing: ev.lanes[1].missing };
  // News and community are mandatory inputs: every AI answer is built on them.
  ctx.news = newsFor(inst.id).slice(0, 6).map((n) => ({ headline: n.headline, summary: n.summary, sentiment: n.sentiment, publishedAt: n.publishedAt, source: n.source }));
  if (opts.events) ctx.events = [...eventsFor(inst.id).filter((e) => new Date(e.date).getTime() >= FIXTURE_NOW - 86_400_000).slice(0, 4).map((e) => ({ title: e.title, date: e.date, importance: e.importance, type: e.type })), { macroLane: ev.lanes[3].items.map((i) => `${i.text} [${i.direction}]`) }];
  {
    const cc = buildCommunityContext(inst.id);
    if (cc) ctx.community = { ...cc, otherCommunities: communityOverview().filter((o) => o.community !== cc.community) } as unknown as Record<string, unknown>;
  }
  // Market-wide headlines (other instruments) so the answer can account for the broader news flow.
  const own = new Set((ctx.news ?? []).map((n) => n.headline));
  ctx.marketNews = getNews()
    .filter((n) => !own.has(n.headline))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 5)
    .map((n) => ({ headline: n.headline, sentiment: n.sentiment, instruments: n.instrumentIds.map((id) => getInstrument(id)?.symbol ?? id), publishedAt: n.publishedAt, source: n.source }));
  if (extra) ctx.extra = extra.slice(0, 4000);
  return ctx;
}

/** Deterministic analysis used when the AI is unavailable — clearly labelled as local. */
export function localAnalysis(inst: Instrument, tf: Timeframe): AIAnalysis {
  const ev = buildEvidence(inst, tf);
  const all = ev.lanes.flatMap((l) => l.items);
  const txt = (lane: LaneId) => ev.lanes.find((l) => l.id === lane)!.items.map((i) => i.text);
  return {
    summary: `Local rule-based summary for ${inst.symbol} (${tf}): ${ev.combined.label}. ${ev.combined.explanation} This is a deterministic evidence tally, not an AI interpretation or a forecast.`,
    bias: ev.combined.bias,
    supportingFactors: all.filter((i) => i.direction === 'positive').map((i) => i.text).slice(0, 6),
    opposingFactors: all.filter((i) => i.direction === 'negative').map((i) => i.text).slice(0, 6),
    technicalObservations: txt('technical').slice(0, 6),
    assetDrivers: txt('drivers').slice(0, 6),
    newsAndEvents: txt('news').slice(0, 6),
    macroContext: txt('macro').slice(0, 6),
    risks: ['Event risk from scheduled events', `Realised volatility: ${fmtNum(computeMetrics(inst, tf).vol20, 1)}% annualised`],
    invalidationConditions: (() => {
      const m = computeMetrics(inst, tf);
      const out: string[] = [];
      if (m.sma50 != null) out.push(`A close ${inst.price > m.sma50 ? 'below' : 'above'} SMA(50) ≈ ${fmtPrice(inst, m.sma50)} would change the trend read`);
      if (m.rsi14 != null) out.push(`RSI(14) crossing back ${m.rsi14 >= 50 ? 'below' : 'above'} 50`);
      return out;
    })(),
    missingData: ev.lanes.flatMap((l) => l.missing).slice(0, 8),
    assumptions: [`Snapshot time ${new Date(FIXTURE_NOW).toISOString()}`, 'Direction labels use the fixed rubric in the Evidence Engine'],
    communityView: communityLines(inst.id),
  };
}
