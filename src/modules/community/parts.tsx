import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeftRight, Coins, Droplet, Flag, Gem, UserCheck, UserPlus, X } from 'lucide-react';
import type { CommunityId, ReportReason, Stance, TraderProfile } from '../../types/community';
import { getCommunity } from '../../data/community/communities';
import { ME, PROFILES } from '../../data/community/seed';
import { getInstrument } from '../../data/instruments';
import { getCloses } from '../../data/priceSeries';
import { fmtDate } from '../../lib/formatting';
import { Sparkline } from '../../components/ui';
import { useApp } from '../../store/appStore';
import { useCommunity } from './communityStore';
import type { Tally } from './logic';

export const COMMUNITY_ICON: Record<CommunityId, typeof Coins> = { forex: ArrowLeftRight, gold: Coins, silver: Gem, oil: Droplet };

const PROFILE_MAP = new Map(PROFILES.map((p) => [p.id, p]));
export const profileOf = (id: string): TraderProfile =>
  PROFILE_MAP.get(id) ?? { id, username: 'trader', displayName: 'Trader', avatarHue: 200, bio: '', interests: [], joinedAt: new Date(0).toISOString() };

/** Re-renders every minute so relative timestamps stay fresh. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

/** Marks demo statistics and generated summaries. */
export function DemoTag({ children = 'Demo', title = 'Demo data stored in this browser — not real users or market sentiment' }: { children?: ReactNode; title?: string }) {
  return <span className="cm-demo" title={title}>{children}</span>;
}

export function Avatar({ id, size = 32 }: { id: string; size?: number }) {
  const p = profileOf(id);
  const initials = p.displayName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span className="cm-avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${p.avatarHue} 45% 32%)`, color: `hsl(${p.avatarHue} 80% 88%)` }} aria-hidden>
      {initials}
    </span>
  );
}

export function AuthorButton({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const p = profileOf(id);
  return (
    <button className="cm-author" onClick={() => onOpen(id)} aria-label={`Open profile of ${p.displayName}`}>
      <span className="bold">{p.displayName}</span>
      <span className="muted small">@{p.username}</span>
    </button>
  );
}

export const STANCE_LABEL: Record<Stance, string> = { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' };
export const STANCE_CLASS: Record<Stance, string> = { bullish: 'pos', bearish: 'neg', neutral: 'info' };

export function StanceChip({ stance }: { stance: Stance }) {
  return <span className={`chip ${STANCE_CLASS[stance]}`}>{STANCE_LABEL[stance]}</span>;
}

export function InstrumentChip({ id }: { id: string }) {
  const inst = getInstrument(id);
  return <span className="chip mono">{inst?.symbol ?? id}</span>;
}

export function SentimentBar({ tally, height = 10 }: { tally: Tally; height?: number }) {
  if (!tally.total) return <div className="cm-bar empty" style={{ height }} />;
  return (
    <div className="cm-bar" style={{ height }} role="img" aria-label={`Bullish ${tally.pct.bullish.toFixed(0)}%, bearish ${tally.pct.bearish.toFixed(0)}%, neutral ${tally.pct.neutral.toFixed(0)}%`}>
      <span className="bull" style={{ width: `${tally.pct.bullish}%` }} />
      <span className="neu" style={{ width: `${tally.pct.neutral}%` }} />
      <span className="bear" style={{ width: `${tally.pct.bearish}%` }} />
    </div>
  );
}

export function ChartPreview({ instrumentId }: { instrumentId: string }) {
  const inst = getInstrument(instrumentId);
  const closes = useMemo(() => getCloses(instrumentId, '1D').slice(-90), [instrumentId]);
  if (!inst || closes.length < 2) return null;
  const chg = ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100;
  return (
    <div className="cm-chart neu-inset">
      <div className="row between small">
        <span className="bold mono">{inst.symbol}</span>
        <span className="muted">90 sessions · <span className={chg >= 0 ? 'pos' : 'neg'}>{chg >= 0 ? '+' : ''}{chg.toFixed(2)}%</span></span>
      </div>
      <Sparkline values={closes} width={560} height={80} />
    </div>
  );
}

export function Modal({ title, onClose, children, wide, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className={`modal neu-raised ${wide ? 'wide' : ''}`} role="dialog" aria-modal aria-label={typeof title === 'string' ? title : undefined} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 className="grow">{title}</h3>
          <button className="btn icon sm ghost" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

const REASONS: Array<{ id: ReportReason; label: string }> = [
  { id: 'spam', label: 'Spam or repetitive' },
  { id: 'misleading', label: 'Misleading or fake performance claim' },
  { id: 'promotion', label: 'Promotion / paid signals' },
  { id: 'abuse', label: 'Abusive or harassing' },
  { id: 'other', label: 'Something else' },
];

export function ReportDialog({ targetId, what, onClose }: { targetId: string; what: string; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason>('spam');
  const [note, setNote] = useState('');
  const report = useCommunity((s) => s.report);
  const toast = useApp((s) => s.toast);
  return (
    <Modal
      title={`Report ${what}`}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn danger" onClick={() => { report(targetId, reason, note); toast({ title: 'Report submitted', body: 'Thanks — it has been recorded on this device.', tone: 'success' }); onClose(); }}><Flag /> Submit report</button>
      </>}
    >
      <div className="col gap-2">
        <fieldset className="cm-radios">
          <legend className="small secondary">Why are you reporting this {what}?</legend>
          {REASONS.map((r) => (
            <label key={r.id} className="row gap-1 small">
              <input type="radio" name="reason" checked={reason === r.id} onChange={() => setReason(r.id)} /> {r.label}
            </label>
          ))}
        </fieldset>
        <div className="field"><label htmlFor="report-note">Details (optional)</label><textarea id="report-note" className="input" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
    </Modal>
  );
}

export function FollowButton({ userId, small }: { userId: string; small?: boolean }) {
  const following = useCommunity((s) => s.following.includes(userId));
  const toggle = useCommunity((s) => s.toggleFollow);
  if (userId === ME) return null;
  return (
    <button className={`btn ${small ? 'sm' : ''} ${following ? 'active' : 'primary'}`} aria-pressed={following} onClick={() => toggle(userId)}>
      {following ? <><UserCheck /> Following</> : <><UserPlus /> Follow</>}
    </button>
  );
}

export function ProfileModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const p = profileOf(userId);
  const posts = useCommunity((s) => s.posts.filter((x) => x.authorId === userId));
  const ideas = useCommunity((s) => s.ideas.filter((x) => x.authorId === userId));
  const comments = useCommunity((s) => s.comments.filter((x) => x.authorId === userId).length);
  const helpful = posts.reduce((a, x) => a + x.helpfulBy.length, 0) + ideas.reduce((a, x) => a + x.helpfulBy.length, 0);
  const recent = [...posts].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 5);
  return (
    <Modal title="Trader profile" onClose={onClose}>
      <div className="col gap-3">
        <div className="row gap-3">
          <Avatar id={userId} size={56} />
          <div className="col grow" style={{ gap: 2 }}>
            <span className="bold" style={{ fontSize: '1.1em' }}>{p.displayName}</span>
            <span className="muted small">@{p.username} · joined {fmtDate(p.joinedAt)}</span>
          </div>
          <FollowButton userId={userId} />
        </div>
        {p.bio && <p className="secondary">{p.bio}</p>}
        {p.interests.length > 0 && (
          <div className="row wrap gap-1">{p.interests.map((c) => <span key={c} className="chip" style={{ color: getCommunity(c)?.accent }}>{getCommunity(c)?.short}</span>)}</div>
        )}
        <div className="grid g4">
          <div className="stat neu-inset"><span className="small muted">Posts</span><span className="bold">{posts.length}</span></div>
          <div className="stat neu-inset"><span className="small muted">Ideas</span><span className="bold">{ideas.length}</span></div>
          <div className="stat neu-inset"><span className="small muted">Comments</span><span className="bold">{comments}</span></div>
          <div className="stat neu-inset"><span className="small muted">Helpful received</span><span className="bold">{helpful}</span></div>
        </div>
        <div className="tiny muted">Contribution counts only — no trading performance is measured or implied. <DemoTag /></div>
        <div className="col gap-1">
          <span className="section-title">Recent posts</span>
          {recent.length === 0 && <span className="small muted">No posts yet.</span>}
          {recent.map((x) => (
            <div key={x.id} className="neu-soft card col gap-1">
              <div className="row gap-1"><span className="chip" style={{ color: getCommunity(x.communityId)?.accent }}>{getCommunity(x.communityId)?.short}</span>{x.instrumentId && <InstrumentChip id={x.instrumentId} />}<span className="tiny muted">{fmtDate(x.createdAt)}</span></div>
              <p className="small">{x.body.length > 220 ? `${x.body.slice(0, 220)}…` : x.body}</p>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
