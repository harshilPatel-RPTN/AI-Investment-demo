import type { BriefingContext, ContextInstrument } from './briefingContext';

export interface BriefingSection {
  id: string;
  title: string;
  script: string;
  evidenceIds: string[];
  instrumentIds: string[];
}

const num = (n: number | null | undefined) => (n == null ? 'n/a' : String(n));
const pct = (n: number | null | undefined) => (n == null ? 'n/a' : `${n > 0 ? 'up ' : n < 0 ? 'down ' : 'flat at '}${Math.abs(n)} percent`);

function describe(i: ContextInstrument) {
  return `${i.symbol} sits at ${i.price} ${i.quote}, ${pct(i.changePercent)} on the day, with RSI at ${num(i.rsi14)} and a ${i.trend} classification`;
}

function biggestMover(list: ContextInstrument[]) {
  return [...list].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))[0];
}

/**
 * Deterministic briefing used when the AI is unavailable. Built purely from the context,
 * so every number is supplied evidence. Clearly labelled as a local summary.
 */
export function localBriefing(ctx: BriefingContext, length: 'short' | 'full'): BriefingSection[] {
  const g = (id: string) => ctx.groups.find((x) => x.id === id)?.instruments ?? [];
  const metals = g('metals');
  const oil = g('oil');
  const fx = g('forex');
  const pos = ctx.evidence.filter((e) => e.direction === 'positive');
  const neg = ctx.evidence.filter((e) => e.direction === 'negative');
  const full = length === 'full';
  const gold = metals.find((i) => i.id === 'XAUUSD');
  const silver = metals.find((i) => i.id === 'XAGUSD');
  const fxMover = biggestMover(fx);
  const sc = ctx.scenarios[0];

  const sections: BriefingSection[] = [
    {
      id: 'mood', title: 'Market mood', evidenceIds: [], instrumentIds: [],
      script: `Alright, here's your quick briefing. Across the board, ${ctx.derived.instrumentsUp} instruments are up and ${ctx.derived.instrumentsDown} are down, so it's a mixed picture rather than a one-way story.`,
    },
    {
      id: 'metals', title: 'Gold & silver', evidenceIds: [], instrumentIds: ['XAUUSD', 'XAGUSD'],
      script: [gold && `${describe(gold)}.`, full && silver && `${describe(silver)}.`, full && ctx.derived.goldSilverRatio != null && `The gold to silver ratio is ${ctx.derived.goldSilverRatio}.`].filter(Boolean).join(' '),
    },
    {
      id: 'oil', title: 'Oil & energy', evidenceIds: [], instrumentIds: oil.map((i) => i.id),
      script: [oil[0] && `${describe(oil[0])}.`, full && oil[1] && `${describe(oil[1])}.`, ctx.derived.brentWtiSpreadUsd != null && `The Brent to WTI spread is ${ctx.derived.brentWtiSpreadUsd} dollars a barrel.`].filter(Boolean).join(' '),
    },
    {
      id: 'forex', title: 'Forex', evidenceIds: [], instrumentIds: fxMover ? [fxMover.id] : [],
      script: fxMover ? `In currencies, the biggest mover is ${fxMover.symbol}, ${pct(fxMover.changePercent)}, trend classified as ${fxMover.trend}.${full ? ` ${fx.filter((i) => i.id !== fxMover.id).slice(0, 2).map((i) => `${i.symbol} is ${pct(i.changePercent)}`).join(', and ')}.` : ''}` : 'No forex data in this snapshot.',
    },
    {
      id: 'opportunities', title: 'Setups worth investigating', evidenceIds: pos.slice(0, 3).map((e) => e.id), instrumentIds: [...new Set(pos.slice(0, 3).map((e) => e.instrumentId))],
      script: pos.length ? `On the positive side, worth a closer look: ${pos.slice(0, full ? 3 : 2).map((e) => e.text).join('; ')}. Those are things to investigate, not signals to act on.` : 'There is not much positive evidence in this snapshot.',
    },
    {
      id: 'risks', title: 'Risks & conflicting signals', evidenceIds: neg.slice(0, 3).map((e) => e.id), instrumentIds: [...new Set(neg.slice(0, 3).map((e) => e.instrumentId))],
      script: neg.length ? `Now the other side of the coin: ${neg.slice(0, full ? 3 : 2).map((e) => e.text).join('; ')}. When evidence conflicts like this, patience is a position too.` : 'No strong negative evidence stands out, which is itself worth being sceptical about.',
    },
    {
      id: 'events', title: 'Upcoming events', evidenceIds: [], instrumentIds: [],
      script: ctx.events.length ? `On the calendar: ${ctx.events.slice(0, full ? 3 : 2).map((e) => `${e.title.replace(' (sample)', '')} on ${e.date}`).join(', ')}.` : 'No upcoming events.',
    },
    {
      id: 'scenarios', title: 'Bull / base / bear', evidenceIds: [], instrumentIds: sc ? [sc.instrumentId] : [],
      script: sc ? `Over ${sc.horizonBars} bars, the bull case for ${sc.instrumentId} is around ${sc.bull.level}, the base case near ${sc.base.level}, and the bear case near ${sc.bear.level}. ${sc.invalidation[0] ? `A key invalidation: ${sc.invalidation[0].toLowerCase()}.` : ''}` : 'Scenario data is unavailable.',
    },
    {
      id: 'closing', title: 'Wrap-up', evidenceIds: [], instrumentIds: [],
      script: 'That is the briefing. Mixed signals, a few interesting setups, and real risks on both sides. Ask me anything about it.',
    },
  ];
  return sections.filter((s) => s.script.trim());
}
