import { useMemo, useState } from 'react';
import { NotebookPen, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ModuleProps } from '../types';
import { useApp, type JournalEntry } from '../../store/appStore';
import { getInstrument } from '../../data/instruments';
import { DEMO_FX_TO_INR } from '../../data/portfolios';
import { journalStats } from '../../lib/calculations/journal';
import { fmtDate, fmtMoney, fmtNum, fmtPct, uid } from '../../lib/formatting';
import { confirmAction, Empty, InstrumentSelect, Stat, Tabs } from '../../components/ui';

type Filter = 'all' | JournalEntry['status'];

function pnlOf(j: JournalEntry) {
  if (j.status !== 'closed' || j.exit == null) return null;
  return (j.direction === 'long' ? j.exit - j.entry : j.entry - j.exit) * j.quantity;
}

function Editor({ initial, onSave, onCancel }: { initial: JournalEntry; onSave: (j: JournalEntry) => void; onCancel: () => void }) {
  const [j, setJ] = useState(initial);
  const set = (p: Partial<JournalEntry>) => setJ((x) => ({ ...x, ...p }));
  const errors: string[] = [];
  if (!(j.entry > 0)) errors.push('Entry must be positive.');
  if (!(j.quantity > 0)) errors.push('Quantity must be positive.');
  if (j.status === 'closed' && !(j.exit != null && j.exit > 0)) errors.push('Closed trades need an exit price.');
  const num = (v: string) => (v === '' ? undefined : Number(v));
  return (
    <div className="neu-soft card col gap-2">
      <div className="grid g4">
        <div className="field"><label>Instrument</label><InstrumentSelect value={j.instrumentId} onChange={(id) => set({ instrumentId: id })} /></div>
        <div className="field"><label>Direction</label><Tabs value={j.direction} onChange={(v) => set({ direction: v })} options={[{ id: 'long', label: 'Long' }, { id: 'short', label: 'Short' }]} /></div>
        <div className="field"><label>Lifecycle</label><Tabs value={j.status} onChange={(v) => set({ status: v, closedAt: v === 'closed' ? new Date().toISOString() : undefined })} options={[{ id: 'planned', label: 'Planned' }, { id: 'open', label: 'Open' }, { id: 'closed', label: 'Closed' }]} /></div>
        <div className="field"><label>Quantity</label><input className="input num" type="number" step="any" value={j.quantity} onChange={(e) => set({ quantity: Number(e.target.value) })} /></div>
        <div className="field"><label>Entry</label><input className="input num" type="number" step="any" value={j.entry} onChange={(e) => set({ entry: Number(e.target.value) })} /></div>
        <div className="field"><label>Stop</label><input className="input num" type="number" step="any" value={j.stop ?? ''} onChange={(e) => set({ stop: num(e.target.value) })} /></div>
        <div className="field"><label>Target</label><input className="input num" type="number" step="any" value={j.target ?? ''} onChange={(e) => set({ target: num(e.target.value) })} /></div>
        <div className="field"><label>Exit</label><input className="input num" type="number" step="any" value={j.exit ?? ''} disabled={j.status !== 'closed'} onChange={(e) => set({ exit: num(e.target.value) })} /></div>
      </div>
      <div className="grid g2">
        <div className="field"><label>Setup</label><input className="input" value={j.setup} maxLength={120} onChange={(e) => set({ setup: e.target.value })} placeholder="e.g. Pullback to SMA(50)" /></div>
        <div className="field"><label>Tags (comma separated)</label><input className="input" value={j.tags.join(', ')} onChange={(e) => set({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 8) })} /></div>
      </div>
      <div className="grid g3">
        <div className="field"><label>Thesis</label><textarea className="input" rows={3} value={j.thesis} onChange={(e) => set({ thesis: e.target.value })} /></div>
        <div className="field"><label>Notes / risk plan</label><textarea className="input" rows={3} value={j.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
        <div className="field"><label>Lessons learned</label><textarea className="input" rows={3} value={j.lessons} onChange={(e) => set({ lessons: e.target.value })} /></div>
      </div>
      {errors.length > 0 && <div className="alert-box error small">{errors.join(' ')}</div>}
      <div className="row end">
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" disabled={errors.length > 0} onClick={() => onSave(j)}>Save entry</button>
      </div>
    </div>
  );
}

export default function Journal({ frame, updateSettings }: ModuleProps) {
  const entries = useApp((s) => s.journal);
  const selected = useApp((s) => s.selectedInstrumentId);
  const { upsertJournal, deleteJournal } = useApp.getState();
  const filter = (frame.settings.filter as Filter) ?? 'all';
  const [editing, setEditing] = useState<JournalEntry | null>(null);

  const list = entries.filter((e) => filter === 'all' || e.status === filter);
  const stats = useMemo(() => journalStats(entries, (id) => getInstrument(id)?.quoteCurrency, DEMO_FX_TO_INR), [entries]);
  const lessons = entries.filter((e) => e.lessons.trim()).slice(0, 4);

  const blank = (): JournalEntry => ({ id: uid('j'), instrumentId: selected, direction: 'long', status: 'planned', entry: getInstrument(selected)?.price ?? 100, quantity: 1, setup: '', thesis: '', notes: '', lessons: '', tags: [], createdAt: new Date().toISOString() });

  return (
    <div className="module">
      <div className="module-head">
        <Tabs value={filter} onChange={(f) => updateSettings({ filter: f })} options={[{ id: 'all', label: `All (${entries.length})` }, { id: 'planned', label: `Planned (${stats.planned})` }, { id: 'open', label: `Open (${stats.open})` }, { id: 'closed', label: `Closed (${stats.closed})` }]} />
        <div style={{ flex: 1 }} />
        <button className="btn sm primary" onClick={() => setEditing(blank())} disabled={!!editing}><Plus /> New paper trade</button>
      </div>
      <div className="grid g4">
        <Stat label="Closed trades" value={stats.closed} sub={`${stats.wins} won · ${stats.losses} lost · win rate ${stats.winRate == null ? '—' : `${fmtNum(stats.winRate, 0)}%`}`} />
        <Stat label="Total P&L (INR, demo FX)" value={<span className={stats.totalPnl >= 0 ? 'pos' : 'neg'}>{fmtMoney(stats.totalPnl, 'INR', 0)}</span>} sub={`Profit factor ${stats.profitFactor == null ? '—' : fmtNum(stats.profitFactor, 2)}`} />
        <Stat label="Expectancy / trade" value={fmtPct(stats.expectancy)} sub={`Avg ${fmtPct(stats.avgReturn)} · avg win ${fmtPct(stats.avgWin)} · avg loss ${fmtPct(stats.avgLoss)}`} />
        <Stat label="Best / worst trade" value={<span><span className="pos">{fmtPct(stats.bestReturn)}</span> / <span className="neg">{fmtPct(stats.worstReturn)}</span></span>} sub={`Planned ${stats.planned} · open ${stats.open}`} />
      </div>
      {editing && <Editor initial={editing} onCancel={() => setEditing(null)} onSave={(j) => { upsertJournal(j); setEditing(null); }} />}
      {list.length === 0 && !editing && <Empty icon={<NotebookPen />} title="No journal entries" hint="Create a trade plan, or log one from Risk Lab." />}
      <div className="col gap-2">
        {list.map((e) => {
          const inst = getInstrument(e.instrumentId);
          const pnl = pnlOf(e);
          return (
            <div key={e.id} className="neu-soft card col gap-1">
              <div className="row between">
                <div className="row gap-2">
                  <span className="bold">{inst?.symbol ?? e.instrumentId}</span>
                  <span className={`chip ${e.direction === 'long' ? 'pos' : 'neg'}`}>{e.direction}</span>
                  <span className={`chip ${e.status === 'closed' ? '' : e.status === 'open' ? 'info' : 'warn'}`}>{e.status}</span>
                  {e.setup && <span className="small secondary">{e.setup}</span>}
                </div>
                <div className="row gap-1">
                  {pnl != null && <span className={`bold ${pnl >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(pnl, inst?.quoteCurrency ?? 'INR')}</span>}
                  <button className="btn icon sm ghost" aria-label="Edit entry" onClick={() => setEditing(e)}><Pencil /></button>
                  <button className="btn icon sm ghost danger" aria-label="Delete entry" onClick={async () => { if (await confirmAction({ title: 'Delete journal entry?', body: 'This paper-trade record will be removed.', confirmLabel: 'Delete' })) deleteJournal(e.id); }}><Trash2 /></button>
                </div>
              </div>
              <div className="small secondary">
                Entry {fmtNum(e.entry, inst?.precision ?? 2)} · Qty {fmtNum(e.quantity, e.quantity % 1 ? 3 : 0)}
                {e.stop != null && ` · Stop ${fmtNum(e.stop, inst?.precision ?? 2)}`}
                {e.target != null && ` · Target ${fmtNum(e.target, inst?.precision ?? 2)}`}
                {e.exit != null && ` · Exit ${fmtNum(e.exit, inst?.precision ?? 2)}`} · {fmtDate(e.createdAt)}
              </div>
              {e.thesis && <p className="small"><span className="muted">Thesis:</span> {e.thesis}</p>}
              {e.notes && <p className="small"><span className="muted">Notes:</span> {e.notes}</p>}
              {e.tags.length > 0 && <div className="row wrap gap-1">{e.tags.map((t) => <span key={t} className="chip">{t}</span>)}</div>}
            </div>
          );
        })}
      </div>
      {lessons.length > 0 && (
        <div className="neu-soft card col gap-1">
          <span className="section-title">Lessons learned</span>
          <ul className="list-clean small">{lessons.map((l) => <li key={l.id}><b>{getInstrument(l.instrumentId)?.symbol}:</b> {l.lessons}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
