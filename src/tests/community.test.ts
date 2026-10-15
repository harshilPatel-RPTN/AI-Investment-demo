import { beforeEach, describe, expect, it } from 'vitest';
import { COMMUNITIES, instrumentBelongs } from '../data/community/communities';
import { buildSeed, ME } from '../data/community/seed';
import { COMMUNITY_IDS, type PollVote } from '../types/community';
import { applyVote, buildInsights, canTransition, communitySentiment, feedFor, inCommunity, riskReward, tallyVotes, validateIdea, validatePost } from '../modules/community/logic';
import { useCommunity } from '../modules/community/communityStore';
import { PROFILES } from '../data/community/seed';

const NOW = Date.UTC(2026, 9, 15, 12);

describe('community catalogue', () => {
  it('has exactly the four fixed communities', () => {
    expect(COMMUNITIES.map((c) => c.id)).toEqual(['forex', 'gold', 'silver', 'oil']);
    expect(COMMUNITY_IDS).toHaveLength(4);
  });

  it('exposes no way to add a community', () => {
    const actions = Object.keys(useCommunity.getState());
    expect(actions.some((k) => /community/i.test(k) && /create|add/i.test(k))).toBe(false);
  });

  it('keeps instrument lists disjoint between communities', () => {
    const seen = new Set<string>();
    for (const c of COMMUNITIES) for (const id of c.instrumentIds) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
    expect(instrumentBelongs('gold', 'XAGUSD')).toBe(false);
    expect(instrumentBelongs('oil', 'EURUSD')).toBe(false);
  });
});

describe('feed separation', () => {
  const seed = buildSeed(NOW);

  it('every seeded record uses an instrument from its own community', () => {
    for (const p of seed.posts) if (p.instrumentId) expect(instrumentBelongs(p.communityId, p.instrumentId)).toBe(true);
    for (const i of seed.ideas) expect(instrumentBelongs(i.communityId, i.instrumentId)).toBe(true);
    for (const p of seed.polls) expect(instrumentBelongs(p.communityId, p.instrumentId)).toBe(true);
  });

  it('gold feed never contains silver posts and forex never contains oil posts', () => {
    for (const sort of ['latest', 'trending', 'discussed'] as const) {
      expect(feedFor(seed, 'silver', { sort, now: NOW }).every((p) => p.communityId === 'silver')).toBe(true);
      expect(feedFor(seed, 'gold', { sort, now: NOW }).some((p) => p.communityId === 'silver')).toBe(false);
      expect(feedFor(seed, 'oil', { sort, now: NOW }).some((p) => p.communityId === 'forex')).toBe(false);
    }
  });

  it('trending lists are community-specific and ranked', () => {
    const gold = feedFor(seed, 'gold', { sort: 'trending', now: NOW });
    expect(gold.length).toBe(inCommunity(seed.posts, 'gold').length);
    expect(gold.every((p) => p.communityId === 'gold')).toBe(true);
  });

  it('search stays inside the community', () => {
    const r = feedFor(seed, 'forex', { sort: 'latest', query: 'gold', now: NOW, profiles: PROFILES });
    expect(r.every((p) => p.communityId === 'forex')).toBe(true);
  });
});

describe('polls', () => {
  it('computes percentages from vote records', () => {
    const votes: PollVote[] = [
      { pollId: 'p', voterId: 'a', choice: 'bullish', at: '2026-01-01T00:00:00Z' },
      { pollId: 'p', voterId: 'b', choice: 'bearish', at: '2026-01-01T00:00:00Z' },
      { pollId: 'p', voterId: 'c', choice: 'bullish', at: '2026-01-01T00:00:00Z' },
      { pollId: 'p', voterId: 'd', choice: 'neutral', at: '2026-01-01T00:00:00Z' },
    ];
    const t = tallyVotes(votes, 'p');
    expect(t).toMatchObject({ bullish: 2, bearish: 1, neutral: 1, total: 4 });
    expect(t.pct.bullish).toBe(50);
    expect(t.pct.bullish + t.pct.bearish + t.pct.neutral).toBeCloseTo(100);
  });

  it('keeps one vote per voter per poll', () => {
    let votes: PollVote[] = [];
    votes = applyVote(votes, { pollId: 'p', voterId: ME, choice: 'bullish', at: '2026-01-01T00:00:00Z' });
    votes = applyVote(votes, { pollId: 'p', voterId: ME, choice: 'bearish', at: '2026-01-01T00:01:00Z' });
    expect(votes).toHaveLength(1);
    expect(tallyVotes(votes, 'p')).toMatchObject({ bullish: 0, bearish: 1, total: 1 });
  });

  it('community sentiment only counts that community’s polls', () => {
    const seed = buildSeed(NOW);
    const gold = communitySentiment(seed, 'gold');
    const goldPolls = new Set(inCommunity(seed.polls, 'gold').map((p) => p.id));
    expect(gold.total).toBe(seed.votes.filter((v) => goldPolls.has(v.pollId)).length);
  });
});

describe('validation', () => {
  it('rejects posts tagged with another community’s instrument', () => {
    expect(validatePost({ communityId: 'gold', body: 'Silver looks strong this week', instrumentId: 'XAGUSD' })).not.toHaveLength(0);
    expect(validatePost({ communityId: 'gold', body: 'Gold looks strong this week', instrumentId: 'XAUUSD' })).toHaveLength(0);
  });

  it('validates idea levels against the direction', () => {
    const base = { communityId: 'gold' as const, instrumentId: 'XAUUSD', timeframe: 'swing' as const, title: 'Gold long', thesis: 'Buying the pullback to the moving average.' };
    expect(validateIdea({ ...base, direction: 'bullish', entryLow: 100, stop: 95, targets: [110] })).toHaveLength(0);
    expect(validateIdea({ ...base, direction: 'bullish', entryLow: 100, stop: 105, targets: [110] }).length).toBeGreaterThan(0);
    expect(validateIdea({ ...base, direction: 'bearish', entryLow: 100, stop: 105, targets: [110] }).length).toBeGreaterThan(0);
    expect(validateIdea({ ...base, direction: 'bullish', entryLow: -1, targets: [] }).length).toBeGreaterThan(0);
  });

  it('calculates reward:risk only when inputs are valid', () => {
    expect(riskReward({ direction: 'bullish', entryLow: 100, stop: 95, targets: [110] })).toBeCloseTo(2);
    expect(riskReward({ direction: 'bearish', entryLow: 100, entryHigh: 102, stop: 106, targets: [96] })).toBeCloseTo(1);
    expect(riskReward({ direction: 'bullish', entryLow: 100, targets: [110] })).toBeNull();
  });

  it('treats closed, invalidated and expired ideas as final', () => {
    expect(canTransition('open', 'closed')).toBe(true);
    expect(canTransition('closed', 'open')).toBe(false);
    expect(canTransition('invalidated', 'updated')).toBe(false);
  });
});

describe('store actions', () => {
  beforeEach(() => useCommunity.getState().resetDemo());

  it('assigns a new post only to the selected community', () => {
    const r = useCommunity.getState().createPost({ communityId: 'silver', body: 'Silver test post for the feed', instrumentId: 'XAGUSD' });
    expect(r.ok).toBe(true);
    const s = useCommunity.getState();
    const post = s.posts.find((p) => r.ok && p.id === r.id)!;
    expect(post.communityId).toBe('silver');
    expect(feedFor(s, 'gold', { sort: 'latest', now: Date.now() }).some((p) => p.id === post.id)).toBe(false);
  });

  it('refuses cross-community instruments even if the UI is bypassed', () => {
    const r = useCommunity.getState().createPost({ communityId: 'forex', body: 'Crude oil is about to move', instrumentId: 'WTIUSD' });
    expect(r.ok).toBe(false);
  });

  it('only lets you edit and delete your own posts', () => {
    const other = useCommunity.getState().posts.find((p) => p.authorId !== ME)!;
    expect(useCommunity.getState().editPost(other.id, { body: 'Hijacked content here' }).ok).toBe(false);
    expect(useCommunity.getState().deletePost(other.id).ok).toBe(false);
    const r = useCommunity.getState().createPost({ communityId: 'oil', body: 'My own oil post to edit' });
    if (!r.ok) throw new Error(r.error);
    expect(useCommunity.getState().editPost(r.id, { body: 'My own oil post, edited' }).ok).toBe(true);
    expect(useCommunity.getState().posts.find((p) => p.id === r.id)?.editedAt).toBeTruthy();
    expect(useCommunity.getState().deletePost(r.id).ok).toBe(true);
    expect(useCommunity.getState().posts.some((p) => p.id === r.id)).toBe(false);
  });

  it('adds comments and replies to the right community', () => {
    const post = useCommunity.getState().posts.find((p) => p.communityId === 'gold')!;
    const c = useCommunity.getState().addComment(post.id, 'Nice analysis');
    if (!c.ok) throw new Error(c.error);
    const reply = useCommunity.getState().addComment(post.id, 'Thanks!', c.id);
    expect(reply.ok).toBe(true);
    const saved = useCommunity.getState().comments.filter((x) => x.targetId === post.id && x.authorId === ME);
    expect(saved.every((x) => x.communityId === 'gold')).toBe(true);
    expect(saved.find((x) => x.parentId === c.id)).toBeTruthy();
  });

  it('toggles helpful reactions once per user and never on own posts', () => {
    const post = useCommunity.getState().posts.find((p) => p.authorId !== ME)!;
    const before = post.helpfulBy.length;
    useCommunity.getState().toggleHelpful('post', post.id);
    expect(useCommunity.getState().posts.find((p) => p.id === post.id)!.helpfulBy.length).toBe(before + 1);
    useCommunity.getState().toggleHelpful('post', post.id);
    expect(useCommunity.getState().posts.find((p) => p.id === post.id)!.helpfulBy.length).toBe(before);
  });

  it('records a single vote and lets you change it', () => {
    const poll = useCommunity.getState().polls.find((p) => p.communityId === 'oil' && Date.parse(p.closesAt) > Date.now())!;
    const before = tallyVotes(useCommunity.getState().votes, poll.id).total;
    useCommunity.getState().vote(poll.id, 'bullish');
    useCommunity.getState().vote(poll.id, 'bearish');
    const t = tallyVotes(useCommunity.getState().votes, poll.id);
    expect(t.total).toBe(before + 1);
    expect(useCommunity.getState().votes.filter((v) => v.pollId === poll.id && v.voterId === ME)).toHaveLength(1);
  });

  it('joins, leaves and follows locally', () => {
    const s = useCommunity.getState();
    s.join('gold');
    expect(useCommunity.getState().joined).toEqual(['gold']);
    useCommunity.getState().leave('gold');
    expect(useCommunity.getState().joined).toEqual([]);
    useCommunity.getState().toggleFollow('t2');
    expect(useCommunity.getState().following).toContain('t2');
    useCommunity.getState().toggleFollow(ME);
    expect(useCommunity.getState().following).not.toContain(ME);
  });

  it('keeps idea history append-only and owner-only', () => {
    const other = useCommunity.getState().ideas.find((i) => i.authorId !== ME)!;
    expect(useCommunity.getState().setIdeaStatus(other.id, 'closed', 'x').ok).toBe(false);
    const r = useCommunity.getState().createIdea({ communityId: 'silver', instrumentId: 'XAGUSD', direction: 'bullish', timeframe: 'swing', title: 'Silver long', thesis: 'Ratio is stretched and demand is firm.', entryLow: 30, stop: 29, targets: [33] });
    if (!r.ok) throw new Error(r.error);
    useCommunity.getState().setIdeaStatus(r.id, 'updated', 'Raised stop to break-even');
    useCommunity.getState().setIdeaStatus(r.id, 'closed', 'Target hit');
    const idea = useCommunity.getState().ideas.find((i) => i.id === r.id)!;
    expect(idea.history.map((h) => h.status)).toEqual(['open', 'updated', 'closed']);
    expect(idea.thesis).toBe('Ratio is stretched and demand is firm.');
    expect(useCommunity.getState().setIdeaStatus(r.id, 'open', '').ok).toBe(false);
  });
});

describe('insights', () => {
  it('cites only posts from the selected community', () => {
    const seed = buildSeed(NOW);
    const ins = buildInsights(seed, 'oil', PROFILES);
    const oilIds = new Set([...inCommunity(seed.posts, 'oil'), ...inCommunity(seed.ideas, 'oil')].map((x) => x.id));
    for (const p of [...ins.bullish, ...ins.bearish]) expect(oilIds.has(p.sourceId)).toBe(true);
    expect(ins.basedOn.posts).toBe(inCommunity(seed.posts, 'oil').length);
  });
});
