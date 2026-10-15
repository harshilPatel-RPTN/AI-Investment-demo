import { useState } from 'react';
import { History, Lightbulb, ShieldAlert, ThumbsUp } from 'lucide-react';
import type { Community, DiscussionTimeframe, IdeaDirection, IdeaStatus, TradingIdea } from '../../types/community';
import { DISCUSSION_TIMEFRAMES } from '../../types/community';
import { ME } from '../../data/community/seed';
import { getInstrument } from '../../data/instruments';
import { fmtNum } from '../../lib/formatting';
import { Tabs } from '../../components/ui';
import { useApp } from '../../store/appStore';
import { useCommunity } from './communityStore';
import { commentCount, IDEA_TRANSITIONS, riskReward, timeAgo, validateIdea, type IdeaDraft } from './logic';
import { AuthorButton, Avatar, ChartPreview, InstrumentChip, Modal } from './parts';
import { CommentThread } from './Feed';

const STATUS_CLASS: Record<IdeaStatus, string> = { open: 'accent', updated: 'info', invalidated: 'neg', closed: '', expired: 'warn' };
const STATUS_LABEL: Record<IdeaStatus, string> = { open: 'Open', updated: 'Updated', invalidated: 'Invalidated', closed: 'Closed', expired: 'Expired' };

export function RiskDisclaimer() {
  return (
    <div className="alert-box warning small row gap-2" role="note">
      <ShieldAlert size={16} style={{ flex: 'none' }} />
      <span>Trading ideas are members’ personal opinions for discussion — not investment advice or a recommendation to trade. Levels are examples; no outcome is guaranteed. Trading forex and commodities carries a high risk of loss.</span>
    </div>
  );
}

const px = (instrumentId: string, n?: number) => (n == null ? '—' : fmtNum(n, getInstrument(instrumentId)?.precision ?? 2));

function Levels({ idea }: { idea: TradingIdea }) {
  const rr = riskReward(idea);
  const entry = idea.entryLow == null ? '—' : idea.entryHigh != null && idea.entryHigh !== idea.entryLow ? `${px(idea.instrumentId, idea.entryLow)} – ${px(idea.instrumentId, idea.entryHigh)}` : px(idea.instrumentId, idea.entryLow);
  return (
    <div className="cm-levels">
      <div><span className="tiny muted">Entry</span><span className="mono">{entry}</span></div>
      <div><span className="tiny muted">Stop</span><span className="mono neg">{px(idea.instrumentId, idea.stop)}</span></div>
      <div><span className="tiny muted">Target{idea.targets.length > 1 ? 's' : ''}</span><span className="mono pos">{idea.targets.length ? idea.targets.map((t) => px(idea.instrumentId, t)).join(' / ') : '—'}</span></div>
      <div><span className="tiny muted">Reward : risk</span><span className="mono">{rr == null ? '—' : `${rr.toFixed(2)} : 1`}</span></div>
    </div>
  );
}

export function IdeaCard({ idea, now, onOpen, onOpenProfile }: { idea: TradingIdea; now: number; onOpen: () => void; onOpenProfile: (id: string) => void }) {
  const comments = useCommunity((s) => commentCount(s.comments, idea.id));
  return (
    <article className="neu-soft card col gap-2 cm-idea">
      <header className="row gap-2">
        <Avatar id={idea.authorId} />
        <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
          <AuthorButton id={idea.authorId} onOpen={onOpenProfile} />
          <span className="tiny muted">{timeAgo(idea.createdAt, now)}{idea.updatedAt && ` · updated ${timeAgo(idea.updatedAt, now)}`}</span>
        </div>
        <span className={`chip ${STATUS_CLASS[idea.status]}`}>{STATUS_LABEL[idea.status]}</span>
      </header>
      <button className="cm-idea-title" onClick={onOpen}>{idea.title}</button>
      <div className="row wrap gap-1">
        <InstrumentChip id={idea.instrumentId} />
        <span className={`chip ${idea.direction === 'bullish' ? 'pos' : 'neg'}`}>{idea.direction === 'bullish' ? 'Bullish' : 'Bearish'}</span>
        <span className="chip">{idea.timeframe}</span>
      </div>
      <p className="small secondary cm-clamp">{idea.thesis}</p>
      <Levels idea={idea} />
      <div className="row gap-2 small muted">
        <span className="row gap-1"><ThumbsUp size={14} /> {idea.helpfulBy.length}</span>
        <span>{comments} comment{comments === 1 ? '' : 's'}</span>
        <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={onOpen}>View details</button>
      </div>
    </article>
  );
}

export function IdeaModal({ ideaId, now, onClose, onOpenProfile }: { ideaId: string; now: number; onClose: () => void; onOpenProfile: (id: string) => void }) {
  const idea = useCommunity((s) => s.ideas.find((i) => i.id === ideaId));
  const { setIdeaStatus, toggleHelpful } = useCommunity.getState();
  const toast = useApp((s) => s.toast);
  const [note, setNote] = useState('');
  if (!idea) return null;
  const mine = idea.authorId === ME;
  const next = IDEA_TRANSITIONS[idea.status];
  const change = (status: IdeaStatus) => {
    if (status === 'updated' && note.trim().length < 5) return toast({ title: 'Describe the update', body: 'Add a short note (5+ characters) so readers see what changed.', tone: 'warning' });
    const r = setIdeaStatus(idea.id, status, note);
    if (!r.ok) return toast({ title: 'Status not changed', body: r.error, tone: 'error' });
    setNote('');
    toast({ title: `Idea ${STATUS_LABEL[status].toLowerCase()}`, tone: 'success' });
  };
  return (
    <Modal title={idea.title} onClose={onClose} wide>
      <div className="col gap-3">
        <div className="row gap-2">
          <Avatar id={idea.authorId} />
          <div className="col grow" style={{ gap: 0 }}>
            <AuthorButton id={idea.authorId} onOpen={onOpenProfile} />
            <span className="tiny muted">Published {new Date(idea.createdAt).toLocaleString()}</span>
          </div>
          <span className={`chip ${STATUS_CLASS[idea.status]}`}>{STATUS_LABEL[idea.status]}</span>
        </div>
        <div className="row wrap gap-1">
          <InstrumentChip id={idea.instrumentId} />
          <span className={`chip ${idea.direction === 'bullish' ? 'pos' : 'neg'}`}>{idea.direction === 'bullish' ? 'Bullish' : 'Bearish'}</span>
          <span className="chip">{idea.timeframe}</span>
        </div>
        <ChartPreview instrumentId={idea.instrumentId} />
        <div className="col gap-1"><span className="section-title">Thesis</span><p className="cm-body">{idea.thesis}</p></div>
        <Levels idea={idea} />
        <RiskDisclaimer />
        <div className="col gap-1">
          <span className="section-title row gap-1"><History size={14} /> Update history</span>
          <ol className="cm-history">
            {idea.history.map((h, i) => (
              <li key={i}><span className={`chip ${STATUS_CLASS[h.status]}`}>{STATUS_LABEL[h.status]}</span> <span className="small">{h.note}</span> <span className="tiny muted">{new Date(h.at).toLocaleString()}</span></li>
            ))}
          </ol>
          <span className="tiny muted">The original thesis and levels are never rewritten — changes are added here.</span>
        </div>
        {mine && next.length > 0 && (
          <div className="neu-inset card col gap-2">
            <span className="section-title">Manage your idea</span>
            <textarea className="input" rows={2} maxLength={300} placeholder="What changed? (shown in the update history)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Update note" />
            <div className="row wrap gap-1">
              {next.includes('updated') && <button className="btn sm primary" onClick={() => change('updated')}>Post update</button>}
              {next.includes('invalidated') && <button className="btn sm danger" onClick={() => change('invalidated')}>Mark invalidated</button>}
              {next.includes('closed') && <button className="btn sm" onClick={() => change('closed')}>Close idea</button>}
              {next.includes('expired') && <button className="btn sm" onClick={() => change('expired')}>Mark expired</button>}
            </div>
          </div>
        )}
        <div className="row gap-1">
          <button className={`btn sm ${idea.helpfulBy.includes(ME) ? 'active' : ''}`} disabled={mine} aria-pressed={idea.helpfulBy.includes(ME)} onClick={() => toggleHelpful('idea', idea.id)}><ThumbsUp /> Helpful · {idea.helpfulBy.length}</button>
        </div>
        <div className="col gap-1"><span className="section-title">Discussion</span><CommentThread targetId={idea.id} now={now} onOpenProfile={onOpenProfile} /></div>
      </div>
    </Modal>
  );
}

const numOrUndef = (v: string) => (v.trim() === '' ? undefined : Number(v));

export function IdeaForm({ community, onClose }: { community: Community; onClose: () => void }) {
  const createIdea = useCommunity((s) => s.createIdea);
  const toast = useApp((s) => s.toast);
  const [instrumentId, setInstrumentId] = useState(community.instrumentIds[0]);
  const [direction, setDirection] = useState<IdeaDirection>('bullish');
  const [timeframe, setTimeframe] = useState<DiscussionTimeframe>('swing');
  const [title, setTitle] = useState('');
  const [thesis, setThesis] = useState('');
  const [entryLow, setEntryLow] = useState('');
  const [entryHigh, setEntryHigh] = useState('');
  const [stop, setStop] = useState('');
  const [targets, setTargets] = useState('');
  const [touched, setTouched] = useState(false);
  const inst = getInstrument(instrumentId);

  const parsedTargets = targets.split(',').map((t) => t.trim()).filter(Boolean).map(Number);
  const draft: IdeaDraft = { communityId: community.id, instrumentId, direction, timeframe, title, thesis, entryLow: numOrUndef(entryLow), entryHigh: numOrUndef(entryHigh), stop: numOrUndef(stop), targets: parsedTargets.slice(0, 3) };
  const errors = validateIdea(draft);
  if (parsedTargets.length > 3) errors.push('Up to three targets.');
  const rr = errors.length ? null : riskReward(draft);

  const submit = () => {
    setTouched(true);
    if (errors.length) return;
    const r = createIdea(draft);
    if (!r.ok) return toast({ title: 'Could not publish idea', body: r.error, tone: 'error' });
    toast({ title: 'Idea published', body: `Shared with the ${community.name}.`, tone: 'success' });
    onClose();
  };

  return (
    <Modal title={<span className="row gap-1"><Lightbulb size={18} /> New trading idea · {community.short}</span>} onClose={onClose} wide footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={submit}>Publish idea</button>
    </>}>
      <div className="col gap-2">
        <div className="grid g3">
          <div className="field"><label htmlFor="idea-inst">Instrument</label>
            <select id="idea-inst" className="select" value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)}>
              {community.instrumentIds.map((id) => <option key={id} value={id}>{getInstrument(id)?.symbol ?? id}</option>)}
            </select>
          </div>
          <div className="field"><label>Direction</label><Tabs value={direction} onChange={setDirection} options={[{ id: 'bullish', label: 'Bullish' }, { id: 'bearish', label: 'Bearish' }]} /></div>
          <div className="field"><label htmlFor="idea-tf">Timeframe</label>
            <select id="idea-tf" className="select" value={timeframe} onChange={(e) => setTimeframe(e.target.value as DiscussionTimeframe)}>
              {DISCUSSION_TIMEFRAMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div className="field"><label htmlFor="idea-title">Title</label><input id="idea-title" className="input" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Buy the pullback to support" /></div>
        <div className="field"><label htmlFor="idea-thesis">Thesis & reasoning</label><textarea id="idea-thesis" className="input" rows={4} maxLength={1500} value={thesis} onChange={(e) => setThesis(e.target.value)} placeholder="Why this trade? What would prove you wrong?" /></div>
        <div className="grid g4">
          <div className="field"><label htmlFor="idea-el">Entry (from)</label><input id="idea-el" className="input num" type="number" step="any" value={entryLow} onChange={(e) => setEntryLow(e.target.value)} placeholder={inst ? fmtNum(inst.price, inst.precision) : ''} /></div>
          <div className="field"><label htmlFor="idea-eh">Entry (to, optional)</label><input id="idea-eh" className="input num" type="number" step="any" value={entryHigh} onChange={(e) => setEntryHigh(e.target.value)} /></div>
          <div className="field"><label htmlFor="idea-stop">Stop-loss</label><input id="idea-stop" className="input num" type="number" step="any" value={stop} onChange={(e) => setStop(e.target.value)} /></div>
          <div className="field"><label htmlFor="idea-t">Targets (comma separated)</label><input id="idea-t" className="input num" value={targets} onChange={(e) => setTargets(e.target.value)} /></div>
        </div>
        <div className="small secondary">
          {inst && <>Current {inst.symbol} price in this app: <span className="mono">{fmtNum(inst.price, inst.precision)}</span> {inst.quoteCurrency}. </>}
          Reward : risk {rr == null ? '— (needs entry, stop and a target)' : <b className="mono">{rr.toFixed(2)} : 1</b>}
        </div>
        {touched && errors.length > 0 && <div className="alert-box error small" role="alert">{errors.join(' ')}</div>}
        <RiskDisclaimer />
      </div>
    </Modal>
  );
}
