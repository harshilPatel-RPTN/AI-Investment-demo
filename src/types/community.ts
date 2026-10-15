/** Frontend-only community models. Every record carries the id of exactly one of the four fixed communities. */

export type CommunityId = 'forex' | 'gold' | 'silver' | 'oil';
export const COMMUNITY_IDS: readonly CommunityId[] = ['forex', 'gold', 'silver', 'oil'];

export type Stance = 'bullish' | 'bearish' | 'neutral';
export type DiscussionTimeframe = 'intraday' | 'swing' | 'position' | 'long-term';
export const DISCUSSION_TIMEFRAMES: Array<{ id: DiscussionTimeframe; label: string }> = [
  { id: 'intraday', label: 'Intraday' },
  { id: 'swing', label: 'Swing' },
  { id: 'position', label: 'Position' },
  { id: 'long-term', label: 'Long-term' },
];

export interface Community {
  id: CommunityId;
  name: string;
  short: string;
  description: string;
  /** Only these instruments may be tagged in this community. */
  instrumentIds: string[];
  accent: string;
  /** Demo member count before the local user joins. */
  baseMembers: number;
}

export interface TraderProfile {
  id: string;
  username: string;
  displayName: string;
  avatarHue: number;
  bio: string;
  interests: CommunityId[];
  joinedAt: string;
}

export type PostAttachment = { kind: 'chart'; instrumentId: string } | { kind: 'image'; dataUrl: string; name: string };

export interface CommunityPost {
  id: string;
  communityId: CommunityId;
  authorId: string;
  body: string;
  instrumentId?: string;
  timeframe?: DiscussionTimeframe;
  stance?: Stance;
  attachment?: PostAttachment;
  createdAt: string;
  editedAt?: string;
  helpfulBy: string[];
}

/** A comment on a post or a trading idea. `parentId` set = reply to another comment. */
export interface CommunityComment {
  id: string;
  communityId: CommunityId;
  targetId: string;
  parentId: string | null;
  authorId: string;
  body: string;
  createdAt: string;
  helpfulBy: string[];
}

export type IdeaStatus = 'open' | 'updated' | 'invalidated' | 'closed' | 'expired';
export type IdeaDirection = 'bullish' | 'bearish';

export interface IdeaHistoryEntry {
  at: string;
  status: IdeaStatus;
  note: string;
}

export interface TradingIdea {
  id: string;
  communityId: CommunityId;
  authorId: string;
  instrumentId: string;
  direction: IdeaDirection;
  timeframe: DiscussionTimeframe;
  title: string;
  thesis: string;
  entryLow?: number;
  entryHigh?: number;
  stop?: number;
  targets: number[];
  status: IdeaStatus;
  createdAt: string;
  updatedAt?: string;
  history: IdeaHistoryEntry[];
  helpfulBy: string[];
}

export interface CommunityPoll {
  id: string;
  communityId: CommunityId;
  authorId: string;
  question: string;
  instrumentId: string;
  timeframe?: DiscussionTimeframe;
  createdAt: string;
  closesAt: string;
}

export interface PollVote {
  pollId: string;
  voterId: string;
  choice: Stance;
  at: string;
}

export type CommunityNotificationKind = 'reply' | 'idea' | 'poll' | 'follow' | 'system';

export interface CommunityNotification {
  id: string;
  communityId: CommunityId;
  kind: CommunityNotificationKind;
  text: string;
  createdAt: string;
  read: boolean;
}

export type ReportReason = 'spam' | 'misleading' | 'abuse' | 'promotion' | 'other';
export interface CommunityReport {
  targetId: string;
  reason: ReportReason;
  note: string;
  at: string;
}
