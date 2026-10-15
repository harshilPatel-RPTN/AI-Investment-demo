import { useMemo, useState } from 'react';
import { BarChart3, Check, Clock } from 'lucide-react';
import type { Community, CommunityPoll, DiscussionTimeframe, Stance } from '../../types/community';
import { DISCUSSION_TIMEFRAMES } from '../../types/community';
import { ME } from '../../data/community/seed';
import { getInstrument } from '../../data/instruments';
import { useApp } from '../../store/appStore';
import { useCommunity } from './communityStore';
import { communitySentiment, inCommunity, myVote, pollClosed, sentimentExplanation, tallyVotes } from './logic';
import { DemoTag, InstrumentChip, Modal, SentimentBar, STANCE_CLASS, STANCE_LABEL } from './parts';

const CHOICES: Stance[] = ['bullish', 'bearish', 'neutral'];

function closesIn(p: CommunityPoll, now: number): string {
  const ms = Date.parse(p.closesAt) - now;
  if (ms <= 0) return `Closed ${new Date(p.closesAt).toLocaleDateString()}`;
  const h = Math.round(ms / 3_600_000);
  return h < 48 ? `Closes in ${Math.max(1, h)}h` : `Closes in ${Math.round(h / 24)}d`;
}

export function PollCard({ poll, now }: { poll: CommunityPoll; now: number }) {
  const votes = useCommunity((s) => s.votes);
  const vote = useCommunity((s) => s.vote);
  const toast = useApp((s) => s.toast);
  const tally = useMemo(() => tallyVotes(votes, poll.id), [votes, poll.id]);
  const mine = myVote(votes, poll.id, ME);
  const closed = pollClosed(poll, now);
  const [changing, setChanging] = useState(false);
  const showResults = closed || (mine && !changing);

  const cast = (c: Stance) => {
    const r = vote(poll.id, c);
    if (!r.ok) return toast({ title: 'Vote not recorded', body: r.error, tone: 'error' });
    setChanging(false);
    toast({ title: mine ? 'Vote changed' : 'Vote recorded', tone: 'success' });
  };

  return (
    <article className="neu-soft card col gap-2">
      <div className="row between gap-2">
        <span className="bold">{poll.question}</span>
        <span className={`chip ${closed ? '' : 'accent'}`}><Clock size={12} /> {closesIn(poll, now)}</span>
      </div>
      <div className="row wrap gap-1"><InstrumentChip id={poll.instrumentId} />{poll.timeframe && <span className="chip">{poll.timeframe}</span>}</div>
      {showResults ? (
        <div className="col gap-1" aria-live="polite">
          {CHOICES.map((c) => (
            <div key={c} className="cm-result">
              <div className="row between small">
                <span className={`row gap-1 ${STANCE_CLASS[c]}`}>{STANCE_LABEL[c]}{mine === c && <Check size={14} aria-label="your vote" />}</span>
                <span className="mono">{tally.pct[c].toFixed(1)}% · {tally[c]}</span>
              </div>
              <div className="cm-track"><span className={`fill ${c}`} style={{ width: `${tally.pct[c]}%` }} /></div>
            </div>
          ))}
          <div className="row between tiny muted">
            <span>{tally.total} votes <DemoTag /></span>
            {!closed && mine && <button className="btn sm ghost" onClick={() => setChanging(true)}>Change vote</button>}
          </div>
        </div>
      ) : (
        <div className="col gap-1">
          <div className="row wrap gap-1" role="group" aria-label="Cast your vote">
            {CHOICES.map((c) => <button key={c} className={`btn ${mine === c ? 'active' : ''} cm-vote ${c}`} onClick={() => cast(c)}>{STANCE_LABEL[c]}</button>)}
            {changing && <button className="btn ghost" onClick={() => setChanging(false)}>Cancel</button>}
          </div>
          <span className="tiny muted">One vote per person. Results appear after you vote.</span>
        </div>
      )}
    </article>
  );
}

export function PollForm({ community, onClose }: { community: Community; onClose: () => void }) {
  const createPoll = useCommunity((s) => s.createPoll);
  const toast = useApp((s) => s.toast);
  const [instrumentId, setInstrumentId] = useState(community.instrumentIds[0]);
  const [question, setQuestion] = useState('');
  const [timeframe, setTimeframe] = useState<DiscussionTimeframe | ''>('swing');
  const [hours, setHours] = useState(72);
  const submit = () => {
    const r = createPoll({ communityId: community.id, question, instrumentId, timeframe: timeframe || undefined, hours });
    if (!r.ok) return toast({ title: 'Could not create poll', body: r.error, tone: 'error' });
    toast({ title: 'Poll created', tone: 'success' });
    onClose();
  };
  return (
    <Modal title={`New poll · ${community.short}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={submit}>Create poll</button></>}>
      <div className="col gap-2">
        <div className="field"><label htmlFor="poll-q">Question</label><input id="poll-q" className="input" maxLength={140} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={`e.g. ${getInstrument(instrumentId)?.symbol ?? ''} by Friday?`} /></div>
        <div className="grid g3">
          <div className="field"><label htmlFor="poll-inst">Instrument</label>
            <select id="poll-inst" className="select" value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)}>
              {community.instrumentIds.map((id) => <option key={id} value={id}>{getInstrument(id)?.symbol ?? id}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="poll-tf">Timeframe</label>
            <select id="poll-tf" className="select" value={timeframe} onChange={(e) => setTimeframe(e.target.value as DiscussionTimeframe | '')}>
              <option value="">Not specified</option>
              {DISCUSSION_TIMEFRAMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="poll-h">Open for</label>
            <select id="poll-h" className="select" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {[24, 72, 168, 336].map((h) => <option key={h} value={h}>{h < 48 ? `${h} hours` : `${h / 24} days`}</option>)}
            </select>
          </div>
        </div>
        <span className="small muted">Options are fixed: Bullish, Bearish, Neutral.</span>
      </div>
    </Modal>
  );
}

export function SentimentPanel({ community, detailed }: { community: Community; detailed?: boolean }) {
  const polls = useCommunity((s) => s.polls);
  const votes = useCommunity((s) => s.votes);
  const tally = useMemo(() => communitySentiment({ polls, votes }, community.id), [polls, votes, community.id]);
  const byInstrument = useMemo(() => {
    if (!detailed) return [];
    const own = inCommunity(polls, community.id);
    return community.instrumentIds
      .map((id) => ({ id, t: tallyVotes(votes, new Set(own.filter((p) => p.instrumentId === id).map((p) => p.id))) }))
      .filter((x) => x.t.total > 0);
  }, [detailed, polls, votes, community]);

  return (
    <section className="neu-soft card col gap-2" aria-label="Community sentiment">
      <div className="row between">
        <span className="section-title row gap-1"><BarChart3 size={14} /> Community sentiment</span>
        <DemoTag />
      </div>
      <SentimentBar tally={tally} />
      <div className="cm-legend small">
        {CHOICES.map((c) => <span key={c} className={STANCE_CLASS[c]}><b className="mono">{tally.pct[c].toFixed(0)}%</b> {STANCE_LABEL[c]}</span>)}
      </div>
      <span className="tiny muted">{tally.total} poll votes across {inCommunity(polls, community.id).length} polls</span>
      <p className="small secondary">{sentimentExplanation(tally, community.name)}</p>
      {detailed && byInstrument.length > 0 && (
        <div className="col gap-2">
          <span className="section-title">By instrument</span>
          {byInstrument.map(({ id, t }) => (
            <div key={id} className="col gap-1">
              <div className="row between small"><span className="mono bold">{getInstrument(id)?.symbol}</span><span className="muted">{t.total} votes</span></div>
              <SentimentBar tally={t} height={8} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
