import type {
  CommunityComment, CommunityId, CommunityPoll, CommunityPost, IdeaStatus, PollVote, Stance, TraderProfile, TradingIdea,
} from '../../types/community';
import { getCommunity, instrumentBelongs, isCommunityId } from '../../data/community/communities';
import { getInstrument } from '../../data/instruments';

export type FeedSort = 'latest' | 'trending' | 'discussed';

export interface CommunityData {
  posts: CommunityPost[];
  comments: CommunityComment[];
  ideas: TradingIdea[];
  polls: CommunityPoll[];
  votes: PollVote[];
}

const H = 3_600_000;

/** Strict community filter — the single gate every feed, panel and count goes through. */
export function inCommunity<T extends { communityId: CommunityId }>(items: T[], id: CommunityId): T[] {
  return items.filter((x) => x.communityId === id);
}

export function commentCount(comments: CommunityComment[], targetId: string): number {
  let n = 0;
  for (const c of comments) if (c.targetId === targetId) n++;
  return n;
}

/** Engagement score with time decay: helpful ×1, comments ×2, halves roughly every 18 hours. */
export function trendingScore(post: CommunityPost, comments: CommunityComment[], now: number): number {
  const ageH = Math.max(0, (now - Date.parse(post.createdAt)) / H);
  const engagement = post.helpfulBy.length + 2 * commentCount(comments, post.id) + 1;
  return engagement / Math.pow(1 + ageH / 18, 1.2);
}

export function feedFor(data: Pick<CommunityData, 'posts' | 'comments'>, id: CommunityId, opts: { sort: FeedSort; query?: string; profiles?: TraderProfile[]; now: number }): CommunityPost[] {
  let list = inCommunity(data.posts, id);
  const q = opts.query?.trim().toLowerCase();
  if (q) {
    const names = new Map((opts.profiles ?? []).map((p) => [p.id, `${p.username} ${p.displayName}`.toLowerCase()]));
    list = list.filter((p) => {
      const sym = p.instrumentId ? getInstrument(p.instrumentId)?.symbol.toLowerCase() ?? '' : '';
      return p.body.toLowerCase().includes(q) || sym.includes(q) || (names.get(p.authorId) ?? '').includes(q);
    });
  }
  const sorted = [...list];
  if (opts.sort === 'latest') sorted.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  else if (opts.sort === 'discussed') sorted.sort((a, b) => commentCount(data.comments, b.id) - commentCount(data.comments, a.id) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  else sorted.sort((a, b) => trendingScore(b, data.comments, opts.now) - trendingScore(a, data.comments, opts.now));
  return sorted;
}

export interface Tally {
  bullish: number;
  bearish: number;
  neutral: number;
  total: number;
  pct: Record<Stance, number>;
}

/** Counts votes from records. Only the latest vote per voter per poll counts. */
export function tallyVotes(votes: PollVote[], pollIds: Set<string> | string): Tally {
  const ids = typeof pollIds === 'string' ? new Set([pollIds]) : pollIds;
  const latest = new Map<string, PollVote>();
  for (const v of votes) {
    if (!ids.has(v.pollId)) continue;
    const key = `${v.pollId}|${v.voterId}`;
    const prev = latest.get(key);
    if (!prev || Date.parse(v.at) >= Date.parse(prev.at)) latest.set(key, v);
  }
  const t = { bullish: 0, bearish: 0, neutral: 0 };
  for (const v of latest.values()) t[v.choice]++;
  const total = t.bullish + t.bearish + t.neutral;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  return { ...t, total, pct: { bullish: pct(t.bullish), bearish: pct(t.bearish), neutral: pct(t.neutral) } };
}

export function communitySentiment(data: Pick<CommunityData, 'polls' | 'votes'>, id: CommunityId): Tally {
  return tallyVotes(data.votes, new Set(inCommunity(data.polls, id).map((p) => p.id)));
}

export function dominantStance(t: Tally): Stance | null {
  if (!t.total) return null;
  const order: Stance[] = ['bullish', 'bearish', 'neutral'];
  return order.reduce((best, s) => (t[s] > t[best] ? s : best), order[0]);
}

export function sentimentExplanation(t: Tally, communityName: string): string {
  if (!t.total) return `No poll votes in the ${communityName} yet.`;
  const d = dominantStance(t)!;
  const lead = t.pct[d];
  const strength = lead >= 60 ? 'clearly' : lead >= 45 ? 'moderately' : 'slightly';
  return `Poll participants in the ${communityName} lean ${strength} ${d} (${lead.toFixed(0)}% of ${t.total} votes). This reflects members' opinions, not a forecast of price.`;
}

export function myVote(votes: PollVote[], pollId: string, voterId: string): Stance | null {
  let best: PollVote | null = null;
  for (const v of votes) if (v.pollId === pollId && v.voterId === voterId && (!best || Date.parse(v.at) >= Date.parse(best.at))) best = v;
  return best?.choice ?? null;
}

/** Replaces any earlier vote by the same voter on the same poll — one vote per voter per poll. */
export function applyVote(votes: PollVote[], vote: PollVote): PollVote[] {
  return [...votes.filter((v) => !(v.pollId === vote.pollId && v.voterId === vote.voterId)), vote];
}

export function pollClosed(p: CommunityPoll, now: number): boolean {
  return Date.parse(p.closesAt) <= now;
}

/** Reward/risk from the mid entry to the first target. Null when inputs are missing or inconsistent. */
export function riskReward(idea: Pick<TradingIdea, 'direction' | 'entryLow' | 'entryHigh' | 'stop' | 'targets'>): number | null {
  if (idea.entryLow == null || idea.stop == null || !idea.targets.length) return null;
  const entry = idea.entryHigh != null ? (idea.entryLow + idea.entryHigh) / 2 : idea.entryLow;
  const t = idea.targets[0];
  const risk = idea.direction === 'bullish' ? entry - idea.stop : idea.stop - entry;
  const reward = idea.direction === 'bullish' ? t - entry : entry - t;
  if (!(risk > 0) || !(reward > 0)) return null;
  return reward / risk;
}

export interface PostDraft {
  communityId: CommunityId;
  body: string;
  instrumentId?: string;
}

export function validatePost(d: PostDraft): string[] {
  const errors: string[] = [];
  if (!isCommunityId(d.communityId)) errors.push('Unknown community.');
  const len = d.body.trim().length;
  if (len < 10) errors.push('Write at least 10 characters.');
  if (len > 2000) errors.push('Keep posts under 2,000 characters.');
  if (d.instrumentId && isCommunityId(d.communityId) && !instrumentBelongs(d.communityId, d.instrumentId)) errors.push(`That instrument is not part of the ${getCommunity(d.communityId)?.name}.`);
  return errors;
}

export type IdeaDraft = Pick<TradingIdea, 'communityId' | 'instrumentId' | 'direction' | 'timeframe' | 'title' | 'thesis' | 'entryLow' | 'entryHigh' | 'stop' | 'targets'>;

export function validateIdea(d: IdeaDraft): string[] {
  const errors: string[] = [];
  if (!isCommunityId(d.communityId)) return ['Unknown community.'];
  if (!instrumentBelongs(d.communityId, d.instrumentId)) errors.push(`That instrument is not part of the ${getCommunity(d.communityId)?.name}.`);
  if (d.title.trim().length < 5) errors.push('Title needs at least 5 characters.');
  if (d.thesis.trim().length < 20) errors.push('Explain the thesis in at least 20 characters.');
  const nums = [d.entryLow, d.entryHigh, d.stop, ...d.targets].filter((n) => n != null) as number[];
  if (nums.some((n) => !Number.isFinite(n) || n <= 0)) errors.push('Prices must be positive numbers.');
  if (d.entryLow != null && d.entryHigh != null && d.entryHigh < d.entryLow) errors.push('Entry zone top must be above its bottom.');
  const entry = d.entryLow;
  if (entry != null && d.stop != null) {
    const top = d.entryHigh ?? entry;
    if (d.direction === 'bullish' && d.stop >= entry) errors.push('For a bullish idea the stop must be below the entry.');
    if (d.direction === 'bearish' && d.stop <= top) errors.push('For a bearish idea the stop must be above the entry.');
  }
  if (entry != null) {
    const top = d.entryHigh ?? entry;
    if (d.direction === 'bullish' && d.targets.some((t) => t <= top)) errors.push('Bullish targets must be above the entry.');
    if (d.direction === 'bearish' && d.targets.some((t) => t >= entry)) errors.push('Bearish targets must be below the entry.');
  }
  return errors;
}

/** Allowed lifecycle moves. Closed, invalidated and expired ideas are final. */
export const IDEA_TRANSITIONS: Record<IdeaStatus, IdeaStatus[]> = {
  open: ['updated', 'invalidated', 'closed', 'expired'],
  updated: ['updated', 'invalidated', 'closed', 'expired'],
  invalidated: [],
  closed: [],
  expired: [],
};

export function canTransition(from: IdeaStatus, to: IdeaStatus): boolean {
  return IDEA_TRANSITIONS[from].includes(to);
}

export function timeAgo(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/* ---------- Local, rule-based community summary (no AI model involved) ---------- */

const THEMES: Array<{ label: string; words: string[] }> = [
  { label: 'Central banks & rates', words: ['central bank', 'central-bank', 'rate', 'boj', 'fed', 'hawkish', 'yield', 'carry'] },
  { label: 'US dollar', words: ['dollar', 'usd'] },
  { label: 'Inflation data', words: ['inflation', 'cpi'] },
  { label: 'Supply & inventories', words: ['inventor', 'supply', 'opec', 'output', 'refinery'] },
  { label: 'Industrial demand', words: ['industrial', 'solar', 'electronics', 'china'] },
  { label: 'Technical levels', words: ['support', 'resistance', 'range', 'breakout', 'channel', 'rsi', 'average', 'swing high', 'structure'] },
  { label: 'Risk management', words: ['stop', 'invalidation', 'size', 'tranche', 'risk'] },
  { label: 'Fund & official flows', words: ['etf', 'flows', 'official-sector', 'holdings'] },
  { label: 'Intervention risk', words: ['intervention', 'smoothing'] },
];

export interface InsightPoint {
  text: string;
  by: string;
  sourceId: string;
}

export interface CommunityInsights {
  bullish: InsightPoint[];
  bearish: InsightPoint[];
  themes: Array<{ label: string; count: number }>;
  disagreements: string[];
  sentiment: string;
  basedOn: { posts: number; ideas: number; votes: number };
}

const firstSentence = (s: string) => {
  const m = s.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : s).trim();
};

/** Deterministic summary built only from the community's own posts, ideas and votes. */
export function buildInsights(data: CommunityData, id: CommunityId, profiles: TraderProfile[]): CommunityInsights {
  const name = new Map(profiles.map((p) => [p.id, p.username]));
  const posts = inCommunity(data.posts, id);
  const ideas = inCommunity(data.ideas, id);
  type Src = { text: string; stance?: Stance; helpful: number; by: string; id: string; inst?: string };
  const sources: Src[] = [
    ...posts.map((p) => ({ text: p.body, stance: p.stance, helpful: p.helpfulBy.length, by: name.get(p.authorId) ?? 'trader', id: p.id, inst: p.instrumentId })),
    ...ideas.map((i) => ({ text: `${i.title}. ${i.thesis}`, stance: i.direction as Stance, helpful: i.helpfulBy.length, by: name.get(i.authorId) ?? 'trader', id: i.id, inst: i.instrumentId })),
  ];
  const pick = (s: Stance) => sources.filter((x) => x.stance === s).sort((a, b) => b.helpful - a.helpful).slice(0, 3).map((x) => ({ text: firstSentence(x.text), by: x.by, sourceId: x.id }));

  const themes = THEMES.map((t) => ({ label: t.label, count: sources.filter((s) => t.words.some((w) => s.text.toLowerCase().includes(w))).length }))
    .filter((t) => t.count > 0).sort((a, b) => b.count - a.count).slice(0, 5);

  const byInst = new Map<string, Set<Stance>>();
  for (const s of sources) if (s.inst && s.stance && s.stance !== 'neutral') byInst.set(s.inst, (byInst.get(s.inst) ?? new Set()).add(s.stance));
  const disagreements = [...byInst.entries()].filter(([, set]) => set.size > 1).map(([inst]) => `${getInstrument(inst)?.symbol ?? inst}: members post both bullish and bearish views.`);

  const tally = communitySentiment(data, id);
  return {
    bullish: pick('bullish'),
    bearish: pick('bearish'),
    themes,
    disagreements,
    sentiment: sentimentExplanation(tally, getCommunity(id)?.name ?? 'community'),
    basedOn: { posts: posts.length, ideas: ideas.length, votes: tally.total },
  };
}
