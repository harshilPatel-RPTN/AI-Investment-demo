import { useMemo, useState } from 'react';
import {
  ArrowLeft, Bell, Bookmark, Flame, Lightbulb, ListChecks, LogIn, LogOut, MessagesSquare, PenSquare, Plus, RotateCcw, Search, Sparkles, TrendingUp,
} from 'lucide-react';
import type { ModuleProps } from '../types';
import type { Community as CommunityT, CommunityId } from '../../types/community';
import { COMMUNITIES, getCommunity, isCommunityId } from '../../data/community/communities';
import { PROFILES } from '../../data/community/seed';
import { getInstrument } from '../../data/instruments';
import { confirmAction, Empty, Tabs } from '../../components/ui';
import { usePopover } from '../../components/hooks';
import { useApp } from '../../store/appStore';
import { useCommunity } from './communityStore';
import { buildInsights, communitySentiment, dominantStance, feedFor, inCommunity, pollClosed, timeAgo, type FeedSort } from './logic';
import { COMMUNITY_ICON, DemoTag, Modal, profileOf, ProfileModal, SentimentBar, STANCE_CLASS, STANCE_LABEL, useNow } from './parts';
import { Composer, PostCard } from './Feed';
import { IdeaCard, IdeaForm, IdeaModal, RiskDisclaimer } from './Ideas';
import { PollCard, PollForm, SentimentPanel } from './Polls';
import './community.css';

type Tab = 'discussions' | 'ideas' | 'polls' | 'sentiment' | 'trending';

function JoinButton({ id, small }: { id: CommunityId; small?: boolean }) {
  const joined = useCommunity((s) => s.joined.includes(id));
  const { join, leave } = useCommunity.getState();
  const toast = useApp((s) => s.toast);
  const c = getCommunity(id)!;
  return joined ? (
    <button className={`btn ${small ? 'sm' : ''}`} aria-pressed onClick={() => { leave(id); toast({ title: `Left the ${c.name}`, tone: 'info' }); }} data-tip="Leave community">
      <LogOut /> Leave
    </button>
  ) : (
    <button className={`btn primary ${small ? 'sm' : ''}`} onClick={() => { join(id); toast({ title: `Joined the ${c.name}`, tone: 'success' }); }}>
      <LogIn /> Join community
    </button>
  );
}

function useMemberCount(c: CommunityT) {
  return useCommunity((s) => c.baseMembers + (s.joined.includes(c.id) ? 1 : 0));
}

function HubCard({ c, now, onOpen }: { c: CommunityT; now: number; onOpen: () => void }) {
  const posts = useCommunity((s) => s.posts);
  const comments = useCommunity((s) => s.comments);
  const polls = useCommunity((s) => s.polls);
  const votes = useCommunity((s) => s.votes);
  const joined = useCommunity((s) => s.joined.includes(c.id));
  const members = useMemberCount(c);
  const Icon = COMMUNITY_ICON[c.id];
  const tally = useMemo(() => communitySentiment({ polls, votes }, c.id), [polls, votes, c.id]);
  const top = useMemo(() => feedFor({ posts, comments }, c.id, { sort: 'trending', now })[0], [posts, comments, c.id, now]);
  const lead = dominantStance(tally);
  return (
    <article className="neu-raised cm-hub-card" style={{ ['--cm-accent' as string]: c.accent }}>
      <div className="row gap-2">
        <span className="cm-icon"><Icon size={22} /></span>
        <div className="col grow" style={{ gap: 0 }}>
          <h3>{c.name}</h3>
          <span className="tiny muted">{c.instrumentIds.slice(0, 4).map((id) => getInstrument(id)?.symbol).join(' · ')}{c.instrumentIds.length > 4 ? ' …' : ''}</span>
        </div>
        {joined && <span className="chip accent">Joined</span>}
      </div>
      <p className="small secondary">{c.description}</p>
      <div className="cm-hub-stats">
        <div><span className="tiny muted">Members</span><b className="mono">{members.toLocaleString()}</b></div>
        <div><span className="tiny muted">Posts</span><b className="mono">{inCommunity(posts, c.id).length}</b></div>
        <div><span className="tiny muted">Sentiment</span><b className={lead ? STANCE_CLASS[lead] : ''}>{lead ? `${STANCE_LABEL[lead]} ${tally.pct[lead].toFixed(0)}%` : '—'}</b></div>
      </div>
      <SentimentBar tally={tally} height={6} />
      {top && (
        <div className="cm-preview">
          <span className="tiny muted row gap-1"><Flame size={12} /> Trending · @{profileOf(top.authorId).username}</span>
          <p className="small cm-clamp2">{top.body}</p>
        </div>
      )}
      <div className="row gap-1 cm-hub-actions">
        <button className="btn grow" onClick={onOpen}>View community</button>
        <JoinButton id={c.id} />
      </div>
      <div className="tiny muted"><DemoTag /> member, post and vote counts are demo data.</div>
    </article>
  );
}

function Hub({ now, onOpen }: { now: number; onOpen: (id: CommunityId) => void }) {
  const resetDemo = useCommunity((s) => s.resetDemo);
  const toast = useApp((s) => s.toast);
  return (
    <div className="col gap-3">
      <div className="row between wrap gap-2">
        <div className="col" style={{ gap: 2 }}>
          <span className="secondary">Four separate communities — each with its own feed, ideas, polls and sentiment.</span>
        </div>
        <button className="btn sm ghost" onClick={async () => {
          if (await confirmAction({ title: 'Reset community data?', body: 'Your posts, comments, votes, follows and memberships stored in this browser will be cleared and the starter content restored.', confirmLabel: 'Reset' })) {
            resetDemo();
            toast({ title: 'Community data reset', tone: 'success' });
          }
        }}><RotateCcw /> Reset demo data</button>
      </div>
      <div className="cm-hub-grid">
        {COMMUNITIES.map((c) => <HubCard key={c.id} c={c} now={now} onOpen={() => onOpen(c.id)} />)}
      </div>
    </div>
  );
}

function NotificationsButton() {
  const pop = usePopover();
  const items = useCommunity((s) => s.notifications);
  const markAllRead = useCommunity((s) => s.markAllRead);
  const unread = items.filter((n) => !n.read).length;
  const now = useNow();
  return (
    <div ref={pop.ref} style={{ position: 'relative' }}>
      <button className="btn icon sm" onClick={pop.toggle} aria-label={`Community notifications (${unread} unread)`} aria-expanded={pop.open} data-tip="Community notifications">
        <Bell />
        {unread > 0 && <span className="badge-count">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {pop.open && (
        <div className="popover neu-raised cm-notifs" role="dialog" aria-label="Community notifications">
          <div className="row between" style={{ padding: '10px 12px' }}>
            <span className="bold">Notifications</span>
            <button className="btn sm" disabled={!unread} onClick={markAllRead}>Mark all read</button>
          </div>
          <div className="scroll">
            {items.length === 0 && <Empty icon={<Bell />} title="No notifications yet" />}
            {items.map((n) => (
              <div key={n.id} className={`notif ${n.read ? '' : 'unread'}`}>
                <span className="dot" style={{ background: getCommunity(n.communityId)?.accent }} />
                <div className="grow">
                  <div className="small">{n.text}</div>
                  <div className="tiny muted">{getCommunity(n.communityId)?.short} · {timeAgo(n.createdAt, now)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TrendingPanel({ c, now, onFocus }: { c: CommunityT; now: number; onFocus: (postId: string) => void }) {
  const posts = useCommunity((s) => s.posts);
  const comments = useCommunity((s) => s.comments);
  const top = useMemo(() => feedFor({ posts, comments }, c.id, { sort: 'trending', now }).slice(0, 5), [posts, comments, c.id, now]);
  return (
    <section className="neu-soft card col gap-2" aria-label="Trending discussions">
      <span className="section-title row gap-1"><Flame size={14} /> Trending in {c.short}</span>
      {top.length === 0 && <span className="small muted">Nothing trending yet.</span>}
      <ol className="cm-trending">
        {top.map((p, i) => (
          <li key={p.id}>
            <button onClick={() => onFocus(p.id)}>
              <span className="cm-rank">{i + 1}</span>
              <span className="col" style={{ gap: 2, minWidth: 0 }}>
                <span className="small cm-clamp2">{p.body}</span>
                <span className="tiny muted">@{profileOf(p.authorId).username} · {p.helpfulBy.length} helpful · {comments.filter((x) => x.targetId === p.id).length} comments</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function InsightsPanel({ c }: { c: CommunityT }) {
  const posts = useCommunity((s) => s.posts);
  const comments = useCommunity((s) => s.comments);
  const ideas = useCommunity((s) => s.ideas);
  const polls = useCommunity((s) => s.polls);
  const votes = useCommunity((s) => s.votes);
  const ins = useMemo(() => buildInsights({ posts, comments, ideas, polls, votes }, c.id, PROFILES), [posts, comments, ideas, polls, votes, c.id]);
  const list = (items: typeof ins.bullish, empty: string) =>
    items.length ? <ul className="list-clean small">{items.map((x) => <li key={x.sourceId}>{x.text} <span className="muted">— @{x.by}</span></li>)}</ul> : <span className="small muted">{empty}</span>;
  return (
    <section className="neu-soft card col gap-2" aria-label="Community insights">
      <div className="row between">
        <span className="section-title row gap-1"><Sparkles size={14} /> Community insights</span>
        <DemoTag title="Built on this device by simple rules from the posts, ideas and votes shown — no AI model was used.">Illustrative summary</DemoTag>
      </div>
      <div className="col gap-1"><span className="small bold pos">Main bullish arguments</span>{list(ins.bullish, 'No bullish arguments posted.')}</div>
      <div className="col gap-1"><span className="small bold neg">Main bearish arguments</span>{list(ins.bearish, 'No bearish arguments posted.')}</div>
      <div className="col gap-1">
        <span className="small bold">Common themes</span>
        {ins.themes.length ? <div className="row wrap gap-1">{ins.themes.map((t) => <span key={t.label} className="chip">{t.label} · {t.count}</span>)}</div> : <span className="small muted">Not enough posts.</span>}
      </div>
      <div className="col gap-1">
        <span className="small bold">Points of disagreement</span>
        {ins.disagreements.length ? <ul className="list-clean small">{ins.disagreements.map((d) => <li key={d}>{d}</li>)}</ul> : <span className="small muted">Members broadly agree right now.</span>}
      </div>
      <div className="col gap-1"><span className="small bold">Sentiment</span><span className="small secondary">{ins.sentiment}</span></div>
      <span className="tiny muted">Based on {ins.basedOn.posts} posts, {ins.basedOn.ideas} ideas and {ins.basedOn.votes} votes in this community.</span>
    </section>
  );
}

function CommunityView({ c, tab, sort, setTab, setSort, onBack, onSwitch }: { c: CommunityT; tab: Tab; sort: FeedSort; setTab: (t: Tab) => void; setSort: (s: FeedSort) => void; onBack: () => void; onSwitch: (id: CommunityId) => void }) {
  const now = useNow();
  const posts = useCommunity((s) => s.posts);
  const comments = useCommunity((s) => s.comments);
  const ideas = useCommunity((s) => s.ideas);
  const polls = useCommunity((s) => s.polls);
  const saved = useCommunity((s) => s.saved);
  const members = useMemberCount(c);
  const Icon = COMMUNITY_ICON[c.id];
  const [query, setQuery] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [composing, setComposing] = useState(false);
  const [ideaForm, setIdeaForm] = useState(false);
  const [pollForm, setPollForm] = useState(false);
  const [openIdea, setOpenIdea] = useState<string | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const [focusPost, setFocusPost] = useState<string | null>(null);

  const feed = useMemo(() => {
    const list = feedFor({ posts, comments }, c.id, { sort: tab === 'trending' ? 'trending' : sort, query, profiles: PROFILES, now });
    return savedOnly && tab === 'discussions' ? list.filter((p) => saved.includes(p.id)) : list;
  }, [posts, comments, c.id, sort, tab, query, now, savedOnly, saved]);
  const myIdeas = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inCommunity(ideas, c.id)
      .filter((i) => !q || `${i.title} ${i.thesis} ${getInstrument(i.instrumentId)?.symbol}`.toLowerCase().includes(q))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [ideas, c.id, query]);
  const myPolls = useMemo(() => inCommunity(polls, c.id).sort((a, b) => Number(pollClosed(a, now)) - Number(pollClosed(b, now)) || Date.parse(b.createdAt) - Date.parse(a.createdAt)), [polls, c.id, now]);
  const focused = focusPost ? posts.find((p) => p.id === focusPost && p.communityId === c.id) : undefined;

  const create = () => {
    if (tab === 'ideas') setIdeaForm(true);
    else if (tab === 'polls') setPollForm(true);
    else { setTab('discussions'); setComposing(true); }
  };

  return (
    <div className="col gap-3" style={{ ['--cm-accent' as string]: c.accent }}>
      <header className="cm-header neu-raised">
        <div className="row gap-2 wrap">
          <button className="btn icon sm ghost" onClick={onBack} aria-label="All communities" data-tip="All communities"><ArrowLeft /></button>
          <span className="cm-icon"><Icon size={20} /></span>
          <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
            <h2 className="ellipsis">{c.name}</h2>
            <span className="tiny muted">{members.toLocaleString()} members <DemoTag /> · {inCommunity(posts, c.id).length} posts</span>
          </div>
          <NotificationsButton />
          <JoinButton id={c.id} small />
        </div>
        <div className="row gap-2 wrap">
          <div className="tabs" role="tablist" aria-label="Switch community">
            {COMMUNITIES.map((x) => {
              const I = COMMUNITY_ICON[x.id];
              return <button key={x.id} role="tab" aria-selected={x.id === c.id} className={`tab ${x.id === c.id ? 'active' : ''}`} onClick={() => onSwitch(x.id)} style={x.id === c.id ? { color: x.accent } : undefined}><I size={14} /> {x.short}</button>;
            })}
          </div>
          <label className="cm-search neu-inset">
            <Search size={14} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${c.short}…`} aria-label={`Search the ${c.name}`} />
          </label>
          <button className="btn primary sm" onClick={create}><Plus /> {tab === 'ideas' ? 'New idea' : tab === 'polls' ? 'New poll' : 'Create post'}</button>
        </div>
      </header>

      <Tabs value={tab} onChange={setTab} options={[
        { id: 'discussions', label: <span className="row gap-1"><MessagesSquare size={14} /> Discussions</span> },
        { id: 'ideas', label: <span className="row gap-1"><Lightbulb size={14} /> Trading Ideas</span> },
        { id: 'polls', label: <span className="row gap-1"><ListChecks size={14} /> Polls</span> },
        { id: 'sentiment', label: <span className="row gap-1"><TrendingUp size={14} /> Sentiment</span> },
        { id: 'trending', label: <span className="row gap-1"><Flame size={14} /> Trending</span> },
      ]} />

      <div className="cm-layout">
        <main className="col gap-2 cm-main">
          {tab === 'discussions' && (
            <>
              <div className="row wrap gap-2">
                <Tabs value={sort} onChange={setSort} options={[{ id: 'latest', label: 'Latest' }, { id: 'trending', label: 'Trending' }, { id: 'discussed', label: 'Most discussed' }]} />
                <button className={`btn sm ${savedOnly ? 'active' : ''}`} aria-pressed={savedOnly} onClick={() => setSavedOnly((v) => !v)}><Bookmark /> Saved</button>
              </div>
              {composing ? <Composer community={c} onDone={() => setComposing(false)} /> : (
                <button className="cm-compose-prompt neu-inset" onClick={() => setComposing(true)}><PenSquare size={16} /> Share a view with the {c.name}…</button>
              )}
              {feed.length === 0 && <Empty icon={<MessagesSquare />} title={query ? 'No posts match your search' : savedOnly ? 'No saved posts here' : 'No posts yet'} hint={query ? 'Try a different word or instrument symbol.' : 'Be the first to start a discussion.'} />}
              {feed.map((p) => <PostCard key={p.id} post={p} community={c} now={now} onOpenProfile={setProfile} />)}
            </>
          )}
          {tab === 'ideas' && (
            <>
              <RiskDisclaimer />
              {myIdeas.length === 0 && <Empty icon={<Lightbulb />} title="No trading ideas yet" hint="Publish a structured idea with entry, stop and targets."><button className="btn primary sm" onClick={() => setIdeaForm(true)}><Plus /> New idea</button></Empty>}
              <div className="cm-cards">{myIdeas.map((i) => <IdeaCard key={i.id} idea={i} now={now} onOpen={() => setOpenIdea(i.id)} onOpenProfile={setProfile} />)}</div>
            </>
          )}
          {tab === 'polls' && (
            <>
              {myPolls.length === 0 && <Empty icon={<ListChecks />} title="No polls yet"><button className="btn primary sm" onClick={() => setPollForm(true)}><Plus /> New poll</button></Empty>}
              <div className="cm-cards">{myPolls.map((p) => <PollCard key={p.id} poll={p} now={now} />)}</div>
            </>
          )}
          {tab === 'sentiment' && (
            <>
              <SentimentPanel community={c} detailed />
              <div className="alert-box info small">Community sentiment shows what poll participants think. It is not market analysis and does not predict price direction.</div>
            </>
          )}
          {tab === 'trending' && (
            <>
              <span className="small secondary">Ranked by helpful reactions and comments, weighted toward recent activity — {c.short} posts only.</span>
              {feed.length === 0 && <Empty icon={<Flame />} title="Nothing trending yet" />}
              {feed.slice(0, 10).map((p, i) => (
                <div key={p.id} className="cm-ranked"><span className="cm-rank big">{i + 1}</span><PostCard post={p} community={c} now={now} onOpenProfile={setProfile} /></div>
              ))}
            </>
          )}
        </main>
        <aside className="col gap-2 cm-side">
          {tab !== 'sentiment' && <SentimentPanel community={c} />}
          {tab !== 'trending' && <TrendingPanel c={c} now={now} onFocus={setFocusPost} />}
          <InsightsPanel c={c} />
        </aside>
      </div>

      {ideaForm && <IdeaForm community={c} onClose={() => setIdeaForm(false)} />}
      {pollForm && <PollForm community={c} onClose={() => setPollForm(false)} />}
      {openIdea && <IdeaModal ideaId={openIdea} now={now} onClose={() => setOpenIdea(null)} onOpenProfile={(id) => { setOpenIdea(null); setProfile(id); }} />}
      {profile && <ProfileModal userId={profile} onClose={() => setProfile(null)} />}
      {focused && (
        <Modal title={`Trending in ${c.short}`} onClose={() => setFocusPost(null)} wide>
          <PostCard post={focused} community={c} now={now} onOpenProfile={(id) => { setFocusPost(null); setProfile(id); }} />
        </Modal>
      )}
    </div>
  );
}

export default function Community({ frame, updateSettings }: ModuleProps) {
  const now = useNow();
  const raw = frame.settings.communityId;
  const c = isCommunityId(raw) ? getCommunity(raw)! : null;
  const tab = (frame.settings.tab as Tab) ?? 'discussions';
  const sort = (frame.settings.sort as FeedSort) ?? 'latest';
  return (
    <div className="module cm-root">
      {c ? (
        <CommunityView
          key={c.id}
          c={c}
          tab={tab}
          sort={sort}
          setTab={(t) => updateSettings({ tab: t })}
          setSort={(s) => updateSettings({ sort: s })}
          onBack={() => updateSettings({ communityId: null })}
          onSwitch={(id) => updateSettings({ communityId: id })}
        />
      ) : (
        <Hub now={now} onOpen={(id) => updateSettings({ communityId: id, tab: 'discussions' })} />
      )}
    </div>
  );
}
