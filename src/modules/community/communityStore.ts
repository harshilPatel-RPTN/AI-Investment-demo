import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  CommunityComment, CommunityId, CommunityNotification, CommunityPoll, CommunityPost, CommunityReport, IdeaStatus,
  PostAttachment, Stance, TradingIdea, DiscussionTimeframe,
} from '../../types/community';
import { buildSeed, ME, PROFILES } from '../../data/community/seed';
import { getCommunity, instrumentBelongs, isCommunityId } from '../../data/community/communities';
import { getInstrument } from '../../data/instruments';
import { safeStorage, STORAGE_KEYS } from '../../lib/persistence';
import { uid } from '../../lib/formatting';
import { applyVote, canTransition, pollClosed, tallyVotes, validateIdea, validatePost, type CommunityData, type IdeaDraft } from './logic';

type Result = { ok: true; id: string } | { ok: false; error: string };

interface CommunityState extends CommunityData {
  joined: CommunityId[];
  following: string[];
  saved: string[];
  reports: CommunityReport[];
  notifications: CommunityNotification[];
}

interface CommunityActions {
  join: (id: CommunityId) => void;
  leave: (id: CommunityId) => void;
  createPost: (d: { communityId: CommunityId; body: string; instrumentId?: string; timeframe?: DiscussionTimeframe; stance?: Stance; attachment?: PostAttachment }) => Result;
  editPost: (id: string, patch: { body: string; instrumentId?: string; timeframe?: DiscussionTimeframe; stance?: Stance }) => Result;
  deletePost: (id: string) => Result;
  toggleHelpful: (kind: 'post' | 'comment' | 'idea', id: string) => void;
  toggleSave: (id: string) => void;
  report: (targetId: string, reason: CommunityReport['reason'], note: string) => void;
  addComment: (targetId: string, body: string, parentId?: string | null) => Result;
  deleteComment: (id: string) => Result;
  createIdea: (d: IdeaDraft) => Result;
  setIdeaStatus: (id: string, status: IdeaStatus, note: string) => Result;
  createPoll: (d: { communityId: CommunityId; question: string; instrumentId: string; timeframe?: DiscussionTimeframe; hours: number }) => Result;
  vote: (pollId: string, choice: Stance) => Result;
  toggleFollow: (userId: string) => void;
  markAllRead: () => void;
  resetDemo: () => void;
}

const freshState = (): CommunityState => ({ ...buildSeed(Date.now()), joined: [], following: [], saved: [], reports: [] });

const now = () => new Date().toISOString();
const fail = (error: string): Result => ({ ok: false, error });

/** A demo trader from the same community answers the user's new post a few seconds later. */
const DEMO_REPLIES = [
  'Interesting take — where would you consider this view invalidated?',
  'Thanks for sharing. What timeframe are you watching this on?',
  'Good point. I see it a little differently, but the levels make sense.',
  'Useful context. Are you sizing down given the current volatility?',
];

export const useCommunity = create<CommunityState & CommunityActions>()(
  persist(
    (set, get) => {
      const notify = (communityId: CommunityId, kind: CommunityNotification['kind'], text: string) =>
        set((s) => ({ notifications: [{ id: uid('cn'), communityId, kind, text, createdAt: now(), read: false }, ...s.notifications].slice(0, 50) }));

      const scheduleDemoReply = (post: CommunityPost) => {
        if (typeof window === 'undefined') return;
        const pool = PROFILES.filter((p) => p.id !== ME && p.interests.includes(post.communityId));
        const author = pool[Math.floor(Math.random() * pool.length)];
        if (!author) return;
        window.setTimeout(() => {
          if (!get().posts.some((p) => p.id === post.id)) return;
          const c: CommunityComment = { id: uid('c'), communityId: post.communityId, targetId: post.id, parentId: null, authorId: author.id, body: DEMO_REPLIES[Math.floor(Math.random() * DEMO_REPLIES.length)], createdAt: now(), helpfulBy: [] };
          set((s) => ({ comments: [...s.comments, c] }));
          notify(post.communityId, 'reply', `@${author.username} replied to your post in ${getCommunity(post.communityId)?.short}.`);
        }, 6000);
      };

      return {
        ...freshState(),

        join: (id) => {
          if (!isCommunityId(id) || get().joined.includes(id)) return;
          set((s) => ({ joined: [...s.joined, id] }));
          notify(id, 'system', `You joined the ${getCommunity(id)?.name}.`);
        },
        leave: (id) => set((s) => ({ joined: s.joined.filter((x) => x !== id) })),

        createPost: (d) => {
          const errors = validatePost(d);
          if (errors.length) return fail(errors[0]);
          if (d.attachment?.kind === 'chart' && !instrumentBelongs(d.communityId, d.attachment.instrumentId)) return fail('Chart instrument is not part of this community.');
          const post: CommunityPost = { id: uid('p'), communityId: d.communityId, authorId: ME, body: d.body.trim(), instrumentId: d.instrumentId || undefined, timeframe: d.timeframe, stance: d.stance, attachment: d.attachment, createdAt: now(), helpfulBy: [] };
          set((s) => ({ posts: [post, ...s.posts] }));
          scheduleDemoReply(post);
          return { ok: true, id: post.id };
        },
        editPost: (id, patch) => {
          const post = get().posts.find((p) => p.id === id);
          if (!post) return fail('Post not found.');
          if (post.authorId !== ME) return fail('You can only edit your own posts.');
          const errors = validatePost({ communityId: post.communityId, body: patch.body, instrumentId: patch.instrumentId });
          if (errors.length) return fail(errors[0]);
          set((s) => ({ posts: s.posts.map((p) => (p.id === id ? { ...p, ...patch, body: patch.body.trim(), instrumentId: patch.instrumentId || undefined, editedAt: now() } : p)) }));
          return { ok: true, id };
        },
        deletePost: (id) => {
          const post = get().posts.find((p) => p.id === id);
          if (!post) return fail('Post not found.');
          if (post.authorId !== ME) return fail('You can only delete your own posts.');
          set((s) => ({ posts: s.posts.filter((p) => p.id !== id), comments: s.comments.filter((c) => c.targetId !== id), saved: s.saved.filter((x) => x !== id) }));
          return { ok: true, id };
        },

        toggleHelpful: (kind, id) => {
          const flip = (arr: string[]) => (arr.includes(ME) ? arr.filter((x) => x !== ME) : [...arr, ME]);
          if (kind === 'post') set((s) => ({ posts: s.posts.map((p) => (p.id === id && p.authorId !== ME ? { ...p, helpfulBy: flip(p.helpfulBy) } : p)) }));
          else if (kind === 'comment') set((s) => ({ comments: s.comments.map((c) => (c.id === id && c.authorId !== ME ? { ...c, helpfulBy: flip(c.helpfulBy) } : c)) }));
          else set((s) => ({ ideas: s.ideas.map((i) => (i.id === id && i.authorId !== ME ? { ...i, helpfulBy: flip(i.helpfulBy) } : i)) }));
        },
        toggleSave: (id) => set((s) => ({ saved: s.saved.includes(id) ? s.saved.filter((x) => x !== id) : [...s.saved, id] })),
        report: (targetId, reason, note) => set((s) => ({ reports: [...s.reports.filter((r) => r.targetId !== targetId), { targetId, reason, note: note.slice(0, 500), at: now() }] })),

        addComment: (targetId, body, parentId = null) => {
          const s = get();
          const target = s.posts.find((p) => p.id === targetId) ?? s.ideas.find((i) => i.id === targetId);
          if (!target) return fail('Discussion not found.');
          const text = body.trim();
          if (text.length < 2) return fail('Write a comment first.');
          if (text.length > 1000) return fail('Keep comments under 1,000 characters.');
          if (parentId && !s.comments.some((c) => c.id === parentId && c.targetId === targetId)) return fail('Reply target not found.');
          const c: CommunityComment = { id: uid('c'), communityId: target.communityId, targetId, parentId, authorId: ME, body: text, createdAt: now(), helpfulBy: [] };
          set((st) => ({ comments: [...st.comments, c] }));
          return { ok: true, id: c.id };
        },
        deleteComment: (id) => {
          const c = get().comments.find((x) => x.id === id);
          if (!c) return fail('Comment not found.');
          if (c.authorId !== ME) return fail('You can only delete your own comments.');
          set((s) => ({ comments: s.comments.filter((x) => x.id !== id && x.parentId !== id) }));
          return { ok: true, id };
        },

        createIdea: (d) => {
          const errors = validateIdea(d);
          if (errors.length) return fail(errors[0]);
          const idea: TradingIdea = { ...d, id: uid('i'), authorId: ME, title: d.title.trim(), thesis: d.thesis.trim(), status: 'open', createdAt: now(), history: [{ at: now(), status: 'open', note: 'Idea published.' }], helpfulBy: [] };
          set((s) => ({ ideas: [idea, ...s.ideas] }));
          return { ok: true, id: idea.id };
        },
        setIdeaStatus: (id, status, note) => {
          const idea = get().ideas.find((i) => i.id === id);
          if (!idea) return fail('Idea not found.');
          if (idea.authorId !== ME) return fail('Only the author can change an idea’s status.');
          if (!canTransition(idea.status, status)) return fail(`A ${idea.status} idea cannot move to ${status}.`);
          const entry = { at: now(), status, note: note.trim() || `Marked ${status}.` };
          set((s) => ({ ideas: s.ideas.map((i) => (i.id === id ? { ...i, status, updatedAt: entry.at, history: [...i.history, entry] } : i)) }));
          return { ok: true, id };
        },

        createPoll: (d) => {
          if (!isCommunityId(d.communityId)) return fail('Unknown community.');
          if (!instrumentBelongs(d.communityId, d.instrumentId)) return fail('That instrument is not part of this community.');
          if (d.question.trim().length < 8) return fail('Write a question of at least 8 characters.');
          const hours = Math.min(24 * 30, Math.max(1, Math.round(d.hours)));
          const poll: CommunityPoll = { id: uid('poll'), communityId: d.communityId, authorId: ME, question: d.question.trim(), instrumentId: d.instrumentId, timeframe: d.timeframe, createdAt: now(), closesAt: new Date(Date.now() + hours * 3_600_000).toISOString() };
          set((s) => ({ polls: [poll, ...s.polls] }));
          return { ok: true, id: poll.id };
        },
        vote: (pollId, choice) => {
          const poll = get().polls.find((p) => p.id === pollId);
          if (!poll) return fail('Poll not found.');
          if (pollClosed(poll, Date.now())) return fail('This poll has closed.');
          set((s) => ({ votes: applyVote(s.votes, { pollId, voterId: ME, choice, at: now() }) }));
          const t = tallyVotes(get().votes, pollId);
          notify(poll.communityId, 'poll', `Poll updated — “${poll.question}”: ${t.pct.bullish.toFixed(0)}% bullish, ${t.pct.bearish.toFixed(0)}% bearish, ${t.pct.neutral.toFixed(0)}% neutral.`);
          return { ok: true, id: pollId };
        },

        toggleFollow: (userId) => {
          if (userId === ME) return;
          const was = get().following.includes(userId);
          set((s) => ({ following: was ? s.following.filter((x) => x !== userId) : [...s.following, userId] }));
          if (was) return;
          const prof = PROFILES.find((p) => p.id === userId);
          const latest = get().ideas.filter((i) => i.authorId === userId).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
          if (prof && latest) notify(latest.communityId, 'idea', `@${prof.username} (followed) published “${latest.title}” on ${getInstrument(latest.instrumentId)?.symbol ?? latest.instrumentId}.`);
          else if (prof) notify(prof.interests[0] ?? 'forex', 'follow', `You now follow @${prof.username}.`);
        },
        markAllRead: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
        resetDemo: () => set(freshState()),
      };
    },
    {
      name: STORAGE_KEYS.community,
      version: 1,
      storage: createJSONStorage(() => safeStorage()),
      partialize: (s) => ({ posts: s.posts, comments: s.comments, ideas: s.ideas, polls: s.polls, votes: s.votes, joined: s.joined, following: s.following, saved: s.saved, reports: s.reports, notifications: s.notifications }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<CommunityState>;
        const out = { ...current };
        // Drop anything malformed or tagged with a community that does not exist.
        const scoped = <T extends { communityId: CommunityId }>(v: unknown): T[] | null => (Array.isArray(v) && v.every((x) => x && isCommunityId((x as T).communityId)) ? (v as T[]) : null);
        out.posts = scoped<CommunityPost>(p.posts) ?? current.posts;
        out.comments = scoped<CommunityComment>(p.comments) ?? current.comments;
        out.ideas = scoped<TradingIdea>(p.ideas) ?? current.ideas;
        out.polls = scoped<CommunityPoll>(p.polls) ?? current.polls;
        out.notifications = scoped<CommunityNotification>(p.notifications) ?? current.notifications;
        if (Array.isArray(p.votes)) out.votes = p.votes;
        if (Array.isArray(p.joined)) out.joined = p.joined.filter(isCommunityId);
        if (Array.isArray(p.following)) out.following = p.following.filter((x): x is string => typeof x === 'string');
        if (Array.isArray(p.saved)) out.saved = p.saved.filter((x): x is string => typeof x === 'string');
        if (Array.isArray(p.reports)) out.reports = p.reports;
        return out;
      },
    },
  ),
);
