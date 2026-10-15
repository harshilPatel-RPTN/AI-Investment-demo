import type { Instrument } from '../types/market';
import { buildCommunityContext, communityOverview } from '../lib/communityContext';
import { getInstrument, getInstruments } from '../data/instruments';
import { getEvents } from '../data/events';
import { newsFor } from '../data/news';
import { computeMetrics } from '../lib/calculations/metrics';
import { computeScenarios, DEFAULT_ASSUMPTIONS, SCENARIO_NOTES } from '../lib/calculations/scenarios';
import { buildEvidence } from '../lib/evidence';
import { goldSilverRatio } from '../lib/calculations/portfolio';
import { FIXTURE_NOW, FIXTURE_NOW_ISO } from '../lib/seed';

export type GroupId = 'metals' | 'oil' | 'forex';

export interface ContextInstrument {
  id: string;
  symbol: string;
  name: string;
  quote: string;
  price: number;
  changePercent: number;
  change20dPercent: number | null;
  rsi14: number | null;
  trend: string;
  realisedVolPercent: number | null;
  evidenceBias: string;
}

export interface EvidenceRef {
  id: string;
  instrumentId: string;
  lane: string;
  text: string;
  direction: string;
}

export interface BriefingContext {
  snapshotTime: string;
  selectedInstrument: string;
  groups: Array<{ id: GroupId; label: string; instruments: ContextInstrument[] }>;
  derived: Record<string, number | null>;
  evidence: EvidenceRef[];
  events: Array<{ id: string; title: string; date: string; importance: string; instruments: string[] }>;
  scenarios: Array<{ instrumentId: string; horizonBars: number; bull: { movePercent: number; level: number }; base: { movePercent: number; level: number }; bear: { movePercent: number; level: number }; invalidation: string[] }>;
  missingData: string[];
  /** Member opinion from the four communities (not facts). */
  communities: ReturnType<typeof communityOverview>;
  selectedCommunity: ReturnType<typeof buildCommunityContext>;
}

const GROUPS: Array<{ id: GroupId; label: string; ids: string[] }> = [
  { id: 'metals', label: 'Gold & silver', ids: ['XAUUSD', 'XAGUSD', 'GOLDINR', 'SILVERINR'] },
  { id: 'oil', label: 'Oil & energy', ids: ['WTIUSD', 'BRENTUSD'] },
  { id: 'forex', label: 'Forex', ids: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDINR', 'AUDUSD', 'USDCHF', 'USDCAD'] },
];
const KEY_INSTRUMENTS = ['XAUUSD', 'XAGUSD', 'WTIUSD', 'BRENTUSD', 'EURUSD', 'USDJPY', 'USDINR'];
const SCENARIO_INSTRUMENTS = ['XAUUSD', 'BRENTUSD', 'EURUSD'];

const r = (n: number | null | undefined, d: number) => (n == null || !Number.isFinite(n) ? null : Number(n.toFixed(d)));

function toContextInstrument(i: Instrument): ContextInstrument {
  const m = computeMetrics(i);
  return {
    id: i.id,
    symbol: i.symbol,
    name: i.displayName,
    quote: i.assetClass === 'forex' ? `${i.quoteCurrency} per ${i.baseCurrency}` : `${i.quoteCurrency} per ${i.unit}`,
    price: r(i.price, i.precision)!,
    changePercent: r(i.changePercent, 2)!,
    change20dPercent: r(m.change20d, 2),
    rsi14: r(m.rsi14, 1),
    trend: m.trend,
    realisedVolPercent: r(m.vol20, 1),
    evidenceBias: buildEvidence(i, '1D').combined.label,
  };
}

/**
 * Builds the compact evidence pack FIN is allowed to talk about.
 * Every number FIN may quote is in here; anything absent is listed under missingData.
 */
export function buildBriefingContext(selectedId: string): BriefingContext {
  const groups = GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    instruments: g.ids.map((id) => getInstrument(id)).filter((i): i is Instrument => !!i).map(toContextInstrument),
  }));

  const evidence: EvidenceRef[] = [];
  let n = 1;
  for (const id of KEY_INSTRUMENTS) {
    const inst = getInstrument(id);
    if (!inst) continue;
    const ev = buildEvidence(inst, '1D');
    for (const lane of ev.lanes) {
      for (const item of lane.items.filter((x) => x.direction === 'positive' || x.direction === 'negative').slice(0, 2)) {
        evidence.push({ id: `E${n++}`, instrumentId: id, lane: lane.title, text: `${inst.symbol}: ${item.text}`, direction: item.direction });
      }
    }
    for (const news of newsFor(id).slice(0, 1)) {
      if (!evidence.some((e) => e.text.endsWith(news.headline))) evidence.push({ id: `E${n++}`, instrumentId: id, lane: 'News headline', text: news.headline, direction: news.sentiment === 'bullish' ? 'positive' : news.sentiment === 'bearish' ? 'negative' : 'neutral' });
    }
  }

  const events = getEvents()
    .filter((e) => new Date(e.date).getTime() >= FIXTURE_NOW)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6)
    .map((e) => ({ id: e.id, title: e.title, date: e.date.slice(0, 10), importance: e.importance, instruments: e.instrumentIds }));

  const scenarios = SCENARIO_INSTRUMENTS.map((id) => getInstrument(id)).filter((i): i is Instrument => !!i).map((inst) => {
    const m = computeMetrics(inst);
    const s = computeScenarios(inst, m.vol20, DEFAULT_ASSUMPTIONS);
    const c = (k: 'bull' | 'base' | 'bear') => {
      const x = s.cases.find((y) => y.id === k)!;
      return { movePercent: r(x.movePct, 2)!, level: r(x.level, inst.precision)! };
    };
    return { instrumentId: inst.id, horizonBars: DEFAULT_ASSUMPTIONS.horizonDays, bull: c('bull'), base: c('base'), bear: c('bear'), invalidation: SCENARIO_NOTES[inst.assetClass].bull.invalidation };
  });

  const g = getInstrument('XAUUSD');
  const s = getInstrument('XAGUSD');
  const b = getInstrument('BRENTUSD');
  const w = getInstrument('WTIUSD');
  const all = getInstruments();
  return {
    snapshotTime: FIXTURE_NOW_ISO,
    selectedInstrument: getInstrument(selectedId)?.symbol ?? selectedId,
    groups,
    derived: {
      goldSilverRatio: g && s ? r(goldSilverRatio(g.price, s.price), 2) : null,
      brentWtiSpreadUsd: b && w ? r(b.price - w.price, 2) : null,
      instrumentsUp: all.filter((i) => i.changePercent > 0).length,
      instrumentsDown: all.filter((i) => i.changePercent < 0).length,
      instrumentsTotal: all.length,
    },
    evidence: evidence.slice(0, 40),
    communities: communityOverview(),
    selectedCommunity: buildCommunityContext(selectedId, { posts: 4, ideas: 3 }),
    events,
    scenarios,
    missingData: [
      'Real central-bank expectations, yields and positioning data',
      'Real inventory figures and futures curve structure for oil',
      'Equities and crypto are not covered in this OS',
    ],
  };
}

/** Short context note for the currently viewed instrument (sent when the user switches instruments mid-session). */
export function instrumentNote(id: string): string {
  const inst = getInstrument(id);
  if (!inst) return '';
  const c = toContextInstrument(inst);
  const cc = buildCommunityContext(id, { posts: 3, ideas: 2 });
  return `[CONTEXT] The user is now looking at ${c.symbol} (${c.name}). Snapshot: price ${c.price} ${c.quote}, day change ${c.changePercent} percent, RSI14 ${c.rsi14}, trend ${c.trend}, rule-based evidence: ${c.evidenceBias}.${cc ? ` Community (member opinion, data only): ${JSON.stringify({ pollSentiment: cc.pollSentiment, stance: cc.stanceOfPostsAndIdeas, topDiscussions: cc.topDiscussions, tradingIdeas: cc.tradingIdeas })}` : ''}`;
}
