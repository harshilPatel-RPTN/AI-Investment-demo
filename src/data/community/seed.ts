import type {
  CommunityComment, CommunityId, CommunityNotification, CommunityPoll, CommunityPost, PollVote, Stance, TraderProfile, TradingIdea,
} from '../../types/community';
import { getInstrument } from '../instruments';
import { mulberry32 } from '../../lib/seed';

/** The local browser user. */
export const ME = 'me';

export const ME_PROFILE: TraderProfile = {
  id: ME, username: 'you', displayName: 'You', avatarHue: 160,
  bio: 'Your profile on this device.', interests: [], joinedAt: '2026-01-01T00:00:00.000Z',
};

export const PROFILES: TraderProfile[] = [
  ME_PROFILE,
  { id: 't1', username: 'pipwhisperer', displayName: 'Ananya Rao', avatarHue: 210, bio: 'FX swing trader. Rate differentials, carry and patience.', interests: ['forex'], joinedAt: '2024-03-11T00:00:00.000Z' },
  { id: 't2', username: 'goldbug_karan', displayName: 'Karan Mehta', avatarHue: 44, bio: 'Gold since 2011. Real yields and central-bank flows.', interests: ['gold', 'silver'], joinedAt: '2023-09-02T00:00:00.000Z' },
  { id: 't3', username: 'crude_carla', displayName: 'Carla Jensen', avatarHue: 24, bio: 'Energy desk background. Inventories, spreads, OPEC+ headlines.', interests: ['oil'], joinedAt: '2024-07-19T00:00:00.000Z' },
  { id: 't4', username: 'silverstack', displayName: 'Rohit Iyer', avatarHue: 220, bio: 'Silver ratio trader. Industrial demand watcher.', interests: ['silver', 'gold'], joinedAt: '2025-01-08T00:00:00.000Z' },
  { id: 't5', username: 'yen_carry', displayName: 'Mei Tanaka', avatarHue: 340, bio: 'JPY crosses and BoJ watcher. Mostly intraday.', interests: ['forex'], joinedAt: '2024-11-23T00:00:00.000Z' },
  { id: 't6', username: 'brent_bear', displayName: 'Omar Haddad', avatarHue: 8, bio: 'Contrarian on crude. Demand-side skeptic.', interests: ['oil', 'forex'], joinedAt: '2023-05-30T00:00:00.000Z' },
  { id: 't7', username: 'macro_meera', displayName: 'Meera Pillai', avatarHue: 280, bio: 'Macro-first. Dollar, inflation prints and cross-asset flows.', interests: ['forex', 'gold', 'oil'], joinedAt: '2024-02-14T00:00:00.000Z' },
  { id: 't8', username: 'rupee_ravi', displayName: 'Ravi Kumar', avatarHue: 130, bio: 'INR pairs and MCX bullion. Position sizing nerd.', interests: ['forex', 'gold', 'silver'], joinedAt: '2025-04-01T00:00:00.000Z' },
  { id: 't9', username: 'chartist_jo', displayName: 'Jo Fischer', avatarHue: 190, bio: 'Pure price action. Levels, structure, no opinions.', interests: ['gold', 'silver', 'oil'], joinedAt: '2024-08-08T00:00:00.000Z' },
  { id: 't10', username: 'cable_sam', displayName: 'Sam Clarke', avatarHue: 0, bio: 'GBP and EUR crosses. London session only.', interests: ['forex'], joinedAt: '2025-06-17T00:00:00.000Z' },
];

export interface CommunitySeed {
  posts: CommunityPost[];
  comments: CommunityComment[];
  ideas: TradingIdea[];
  polls: CommunityPoll[];
  votes: PollVote[];
  notifications: CommunityNotification[];
}

interface PostSeed { id: string; c: CommunityId; a: string; h: number; body: string; inst?: string; tf?: CommunityPost['timeframe']; stance?: Stance; chart?: boolean; helpful: number }

const POSTS: PostSeed[] = [
  // Forex
  { id: 'p-fx-1', c: 'forex', a: 't1', h: 1.2, inst: 'EURUSD', tf: 'swing', stance: 'bearish', chart: true, helpful: 14, body: 'EUR/USD keeps failing at the same supply zone. Until the rate-differential story changes I prefer selling rallies rather than chasing breakdowns. Invalidation for me is a daily close above the last swing high.' },
  { id: 'p-fx-2', c: 'forex', a: 't5', h: 3.5, inst: 'USDJPY', tf: 'intraday', stance: 'bullish', helpful: 9, body: 'USD/JPY carry is still doing the heavy lifting. Watching for intervention headlines though — the risk is very asymmetric near the highs, so stops stay tight.' },
  { id: 'p-fx-3', c: 'forex', a: 't10', h: 6, inst: 'GBPUSD', tf: 'swing', stance: 'neutral', helpful: 6, body: 'Cable is stuck in a range. Sticky services inflation supports GBP, but the dollar side is noisy. Range trading until one of the two breaks.' },
  { id: 'p-fx-4', c: 'forex', a: 't8', h: 10, inst: 'USDINR', tf: 'position', stance: 'neutral', helpful: 11, body: 'USD/INR realised volatility remains very low. Central-bank smoothing makes breakout trades poor value; I size down and think in weeks, not days.' },
  { id: 'p-fx-5', c: 'forex', a: 't7', h: 20, inst: 'AUDUSD', tf: 'swing', stance: 'bullish', helpful: 7, body: 'AUD/USD tends to track metals and risk appetite. If China activity data surprises higher, the Aussie is my preferred expression over equities.' },
  { id: 'p-fx-6', c: 'forex', a: 't1', h: 30, inst: 'EURJPY', tf: 'intraday', stance: 'bearish', helpful: 4, body: 'Question for the group: how are you handling EUR/JPY around BoJ meetings? I flatten everything the day before — curious if anyone holds through.' },
  // Gold
  { id: 'p-au-1', c: 'gold', a: 't2', h: 0.8, inst: 'XAUUSD', tf: 'swing', stance: 'bullish', chart: true, helpful: 21, body: 'Gold dips keep getting bought. Central-bank demand plus easing real yields is a strong base. I am adding on pullbacks to the 20-day average, not at highs.' },
  { id: 'p-au-2', c: 'gold', a: 't9', h: 2.5, inst: 'XAUUSD', tf: 'intraday', stance: 'neutral', helpful: 8, body: 'Structure on the 1h is a tight range after the impulse. Breakout traders should wait for a retest; the last two breakouts both failed on the first attempt.' },
  { id: 'p-au-3', c: 'gold', a: 't7', h: 5, inst: 'XAUUSD', tf: 'position', stance: 'bearish', helpful: 12, body: 'The bearish case nobody wants to hear: a stronger dollar and a hawkish inflation surprise could easily take gold back to the breakout zone. RSI is stretched on the daily.' },
  { id: 'p-au-4', c: 'gold', a: 't8', h: 9, inst: 'GOLDINR', tf: 'long-term', stance: 'bullish', helpful: 10, body: 'GOLD-INR gets a double tailwind when the rupee is weak. For long-term savers, staggered buying beats trying to time festive-season demand.' },
  { id: 'p-au-5', c: 'gold', a: 't2', h: 26, inst: 'XAUUSD', tf: 'swing', stance: 'bullish', helpful: 5, body: 'ETF holdings were flat this week while price held up — that tells me the bid is coming from somewhere else. Watching official-sector flows.' },
  // Silver
  { id: 'p-ag-1', c: 'silver', a: 't4', h: 1.5, inst: 'XAGUSD', tf: 'swing', stance: 'bullish', chart: true, helpful: 16, body: 'Gold/silver ratio is still elevated. Historically that has favoured silver catching up, and solar demand gives the industrial side a real story.' },
  { id: 'p-ag-2', c: 'silver', a: 't9', h: 4, inst: 'XAGUSD', tf: 'intraday', stance: 'bearish', helpful: 7, body: 'Silver moves twice as fast as gold in both directions. The last leg up came on thin volume — I would not trust it until it holds above the prior high.' },
  { id: 'p-ag-3', c: 'silver', a: 't8', h: 8, inst: 'SILVERINR', tf: 'position', stance: 'bullish', helpful: 9, body: 'SILVER-INR per kg: I scale in with three tranches and a fixed rupee risk per tranche. Volatility is the price of admission here.' },
  { id: 'p-ag-4', c: 'silver', a: 't2', h: 15, inst: 'XAGUSD', tf: 'swing', stance: 'neutral', helpful: 4, body: 'If China industrial production disappoints, silver is the first metal to feel it. Neutral until we see the data.' },
  { id: 'p-ag-5', c: 'silver', a: 't4', h: 28, inst: 'XAGUSD', tf: 'long-term', stance: 'bullish', helpful: 6, body: 'Long-term thesis unchanged: supply growth is slow and electronics plus solar keep absorbing more ounces every year.' },
  // Oil
  { id: 'p-oil-1', c: 'oil', a: 't3', h: 0.6, inst: 'WTIUSD', tf: 'swing', stance: 'bearish', chart: true, helpful: 18, body: 'Crude inventories built again. Combined with refinery maintenance season, I expect WTI to struggle at resistance. Selling bounces with a tight invalidation.' },
  { id: 'p-oil-2', c: 'oil', a: 't6', h: 3, inst: 'BRENTUSD', tf: 'position', stance: 'bearish', helpful: 10, body: 'Demand-growth estimates keep getting trimmed. Brent risk premium has faded with shipping concerns easing. Structural bear until OPEC+ cuts deeper.' },
  { id: 'p-oil-3', c: 'oil', a: 't9', h: 7, inst: 'WTIUSD', tf: 'intraday', stance: 'neutral', helpful: 6, body: 'WTI respecting a clean channel on the 4h. Trade the edges, not the middle. Volume dries up mid-channel every time.' },
  { id: 'p-oil-4', c: 'oil', a: 't3', h: 12, inst: 'BRENTUSD', tf: 'swing', stance: 'bullish', helpful: 9, body: 'Counterpoint to the bears: OPEC+ has signalled output discipline repeatedly. A surprise cut would squeeze a crowded short.' },
  { id: 'p-oil-5', c: 'oil', a: 't7', h: 22, inst: 'WTIUSD', tf: 'swing', stance: 'neutral', helpful: 5, body: 'Watching the Brent–WTI spread more than outright price this week. It has been a cleaner signal of physical tightness.' },
];

interface CommentSeed { id: string; target: string; parent?: string; a: string; h: number; body: string; helpful: number }

const COMMENTS: CommentSeed[] = [
  { id: 'c1', target: 'p-fx-1', a: 't10', h: 1, body: 'Same zone on my chart. What timeframe are you using for the invalidation close?', helpful: 3 },
  { id: 'c2', target: 'p-fx-1', parent: 'c1', a: 't1', h: 0.9, body: 'Daily close. Intraday wicks above it do not count for me.', helpful: 2 },
  { id: 'c3', target: 'p-fx-2', a: 't7', h: 3, body: 'Intervention risk is the whole trade. I would rather hold a smaller size than a tight stop.', helpful: 4 },
  { id: 'c4', target: 'p-fx-6', a: 't5', h: 28, body: 'I hold a quarter size through BoJ. Never full size — the gaps are brutal.', helpful: 5 },
  { id: 'c5', target: 'p-au-1', a: 't7', h: 0.5, body: 'Agree on central-bank demand, but a hot CPI print is the risk to this view.', helpful: 6 },
  { id: 'c6', target: 'p-au-1', parent: 'c5', a: 't2', h: 0.4, body: 'Fair. That is why I only add on pullbacks — keeps the average price sane.', helpful: 3 },
  { id: 'c7', target: 'p-au-3', a: 't8', h: 4, body: 'Useful counterpoint. Where would you consider the bearish case invalidated?', helpful: 2 },
  { id: 'c8', target: 'p-au-2', a: 't2', h: 2, body: 'Good reminder. The failed breakouts trapped a lot of people last week.', helpful: 1 },
  { id: 'c9', target: 'p-ag-1', a: 't9', h: 1.2, body: 'The ratio can stay elevated for a long time. What is your trigger to enter?', helpful: 4 },
  { id: 'c10', target: 'p-ag-1', parent: 'c9', a: 't4', h: 1, body: 'A daily close back above the 50-day on XAG/USD. Until then I just watch.', helpful: 3 },
  { id: 'c11', target: 'p-ag-2', a: 't8', h: 3, body: 'Thin-volume rallies in silver have burned me before. Good call.', helpful: 2 },
  { id: 'c12', target: 'p-oil-1', a: 't6', h: 0.4, body: 'Agree. Builds into maintenance season rarely end well for the bulls.', helpful: 3 },
  { id: 'c13', target: 'p-oil-1', parent: 'c12', a: 't3', h: 0.3, body: 'Unless OPEC+ surprises. That is the only thing keeping my size small.', helpful: 2 },
  { id: 'c14', target: 'p-oil-4', a: 't6', h: 11, body: 'They have signalled discipline many times — compliance is the question.', helpful: 4 },
];

interface IdeaSeed { id: string; c: CommunityId; a: string; inst: string; dir: 'bullish' | 'bearish'; tf: TradingIdea['timeframe']; title: string; thesis: string; entry: [number, number]; stop: number; targets: number[]; h: number; helpful: number; status?: TradingIdea['status'] }

/** Levels are offsets (fractions) from the instrument's current price, so they always sit near the chart. */
const IDEAS: IdeaSeed[] = [
  { id: 'i-fx-1', c: 'forex', a: 't1', inst: 'EURUSD', dir: 'bearish', tf: 'swing', title: 'Sell EUR/USD rallies into supply', thesis: 'Repeated rejection at a well-defined supply zone while the rate differential favours USD. Selling strength rather than breakdowns.', entry: [0.002, 0.004], stop: 0.009, targets: [-0.008, -0.015], h: 2, helpful: 12 },
  { id: 'i-fx-2', c: 'forex', a: 't5', inst: 'USDJPY', dir: 'bullish', tf: 'intraday', title: 'USD/JPY carry continuation', thesis: 'Carry demand remains strong; buying shallow pullbacks during the Tokyo session with a tight stop due to intervention risk.', entry: [-0.003, -0.001], stop: -0.007, targets: [0.004, 0.008], h: 5, helpful: 7 },
  { id: 'i-fx-3', c: 'forex', a: 't10', inst: 'GBPUSD', dir: 'bullish', tf: 'swing', title: 'Cable range low bounce', thesis: 'Range support has held three times. Long near the lows with invalidation just below the range.', entry: [-0.006, -0.004], stop: -0.01, targets: [0.002, 0.006], h: 30, helpful: 5, status: 'invalidated' },
  { id: 'i-au-1', c: 'gold', a: 't2', inst: 'XAUUSD', dir: 'bullish', tf: 'swing', title: 'Gold: buy the pullback to the 20-day', thesis: 'Central-bank demand and easing real yields support the trend. Waiting for a pullback toward the 20-day average rather than chasing highs.', entry: [-0.012, -0.006], stop: -0.022, targets: [0.01, 0.025], h: 1, helpful: 19 },
  { id: 'i-au-2', c: 'gold', a: 't7', inst: 'XAUUSD', dir: 'bearish', tf: 'position', title: 'Gold mean-reversion if the dollar firms', thesis: 'Daily RSI is stretched. A stronger dollar and a hawkish inflation surprise could pull price back to the breakout zone.', entry: [0.004, 0.01], stop: 0.022, targets: [-0.02, -0.035], h: 6, helpful: 9 },
  { id: 'i-ag-1', c: 'silver', a: 't4', inst: 'XAGUSD', dir: 'bullish', tf: 'swing', title: 'Silver catch-up trade via the ratio', thesis: 'Gold/silver ratio is elevated; industrial demand gives silver room to outperform. Entry only on a daily close above the 50-day.', entry: [0.002, 0.008], stop: -0.03, targets: [0.04, 0.07], h: 2, helpful: 14 },
  { id: 'i-ag-2', c: 'silver', a: 't9', inst: 'XAGUSD', dir: 'bearish', tf: 'intraday', title: 'Fade the thin-volume rally', thesis: 'Last leg up printed on weak volume. Short below the prior high with a stop above it.', entry: [0.004, 0.007], stop: 0.014, targets: [-0.01, -0.02], h: 9, helpful: 6 },
  { id: 'i-oil-1', c: 'oil', a: 't3', inst: 'WTIUSD', dir: 'bearish', tf: 'swing', title: 'WTI: sell resistance after inventory build', thesis: 'Back-to-back inventory builds into refinery maintenance season. Selling bounces into resistance with tight invalidation.', entry: [0.008, 0.015], stop: 0.03, targets: [-0.02, -0.04], h: 1, helpful: 15 },
  { id: 'i-oil-2', c: 'oil', a: 't6', inst: 'BRENTUSD', dir: 'bearish', tf: 'position', title: 'Brent risk premium unwind', thesis: 'Shipping risk premium has faded and demand growth estimates are being trimmed. Position short with a wide stop.', entry: [0.005, 0.015], stop: 0.045, targets: [-0.05, -0.09], h: 8, helpful: 8 },
  { id: 'i-oil-3', c: 'oil', a: 't9', inst: 'WTIUSD', dir: 'bullish', tf: 'intraday', title: 'WTI channel-bottom long', thesis: 'Price respecting a clean 4h channel. Long the lower edge, exit at the midline.', entry: [-0.012, -0.008], stop: -0.018, targets: [0.002], h: 26, helpful: 4, status: 'closed' },
];

interface PollSeed { id: string; c: CommunityId; a: string; q: string; inst: string; tf?: CommunityPoll['timeframe']; h: number; closeH: number; weights: [number, number, number]; n: number }

const POLLS: PollSeed[] = [
  { id: 'poll-fx-1', c: 'forex', a: 't7', q: 'EUR/USD by the end of this week?', inst: 'EURUSD', tf: 'swing', h: 4, closeH: 68, weights: [0.32, 0.46, 0.22], n: 148 },
  { id: 'poll-fx-2', c: 'forex', a: 't5', q: 'USD/JPY into the next BoJ meeting?', inst: 'USDJPY', tf: 'swing', h: 20, closeH: 100, weights: [0.51, 0.27, 0.22], n: 96 },
  { id: 'poll-au-1', c: 'gold', a: 't2', q: 'XAU/USD over the next two weeks?', inst: 'XAUUSD', tf: 'swing', h: 3, closeH: 140, weights: [0.58, 0.24, 0.18], n: 212 },
  { id: 'poll-au-2', c: 'gold', a: 't8', q: 'GOLD-INR into the festive season?', inst: 'GOLDINR', tf: 'position', h: 30, closeH: 200, weights: [0.62, 0.15, 0.23], n: 87 },
  { id: 'poll-ag-1', c: 'silver', a: 't4', q: 'XAG/USD this month?', inst: 'XAGUSD', tf: 'position', h: 5, closeH: 300, weights: [0.55, 0.28, 0.17], n: 131 },
  { id: 'poll-ag-2', c: 'silver', a: 't9', q: 'Does the gold/silver ratio fall this quarter?', inst: 'XAGUSD', tf: 'long-term', h: 40, closeH: 600, weights: [0.47, 0.31, 0.22], n: 64 },
  { id: 'poll-oil-1', c: 'oil', a: 't3', q: 'WTI after this week’s inventory report?', inst: 'WTIUSD', tf: 'intraday', h: 2, closeH: 46, weights: [0.29, 0.52, 0.19], n: 119 },
  { id: 'poll-oil-2', c: 'oil', a: 't6', q: 'Brent by the next OPEC+ meeting?', inst: 'BRENTUSD', tf: 'swing', h: 18, closeH: 160, weights: [0.38, 0.41, 0.21], n: 83 },
];

const H = 3_600_000;

function level(instrumentId: string, offset: number): number {
  const inst = getInstrument(instrumentId);
  const p = inst?.price ?? 1;
  const f = 10 ** (inst?.precision ?? 2);
  return Math.round(p * (1 + offset) * f) / f;
}

/** Fake helpful-reaction voters so counts come from records rather than a stored number. */
const crowd = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}-v${i}`);

/** Builds the initial demo data. `now` anchors relative timestamps so the feed looks recent on first load. */
export function buildSeed(now: number): CommunitySeed {
  const iso = (hAgo: number) => new Date(now - hAgo * H).toISOString();

  const posts: CommunityPost[] = POSTS.map((p) => ({
    id: p.id, communityId: p.c, authorId: p.a, body: p.body, instrumentId: p.inst, timeframe: p.tf, stance: p.stance,
    attachment: p.chart && p.inst ? { kind: 'chart', instrumentId: p.inst } : undefined,
    createdAt: iso(p.h), helpfulBy: crowd(p.id, p.helpful),
  }));
  const postCommunity = new Map(posts.map((p) => [p.id, p.communityId]));

  const comments: CommunityComment[] = COMMENTS.map((c) => ({
    id: c.id, communityId: postCommunity.get(c.target)!, targetId: c.target, parentId: c.parent ?? null,
    authorId: c.a, body: c.body, createdAt: iso(c.h), helpfulBy: crowd(c.id, c.helpful),
  }));

  const ideas: TradingIdea[] = IDEAS.map((i) => {
    const status = i.status ?? 'open';
    const history: TradingIdea['history'] = [{ at: iso(i.h), status: 'open', note: 'Idea published.' }];
    if (status !== 'open') history.push({ at: iso(i.h - 4), status, note: status === 'invalidated' ? 'Stop level reached — idea invalidated by the author.' : 'Closed by the author at the first target.' });
    return {
      id: i.id, communityId: i.c, authorId: i.a, instrumentId: i.inst, direction: i.dir, timeframe: i.tf, title: i.title, thesis: i.thesis,
      entryLow: level(i.inst, Math.min(...i.entry)), entryHigh: level(i.inst, Math.max(...i.entry)), stop: level(i.inst, i.stop),
      targets: i.targets.map((t) => level(i.inst, t)), status, createdAt: iso(i.h), updatedAt: status === 'open' ? undefined : iso(i.h - 4),
      history, helpfulBy: crowd(i.id, i.helpful),
    };
  });

  const polls: CommunityPoll[] = POLLS.map((p) => ({
    id: p.id, communityId: p.c, authorId: p.a, question: p.q, instrumentId: p.inst, timeframe: p.tf, createdAt: iso(p.h), closesAt: new Date(now + (p.closeH - p.h) * H).toISOString(),
  }));

  const votes: PollVote[] = [];
  for (const p of POLLS) {
    const rand = mulberry32(p.n * 7919 + p.id.length);
    for (let i = 0; i < p.n; i++) {
      const r = rand();
      const choice: Stance = r < p.weights[0] ? 'bullish' : r < p.weights[0] + p.weights[1] ? 'bearish' : 'neutral';
      votes.push({ pollId: p.id, voterId: `${p.id}-u${i}`, choice, at: iso(p.h * rand()) });
    }
  }

  const notifications: CommunityNotification[] = [
    { id: 'n-welcome', communityId: 'gold', kind: 'system', text: 'Welcome! Join a community to follow its feed, ideas and polls.', createdAt: iso(0.1), read: false },
  ];

  return { posts, comments, ideas, polls, votes, notifications };
}
