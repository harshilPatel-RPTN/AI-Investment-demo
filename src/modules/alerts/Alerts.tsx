import { useState } from 'react';
import { BellRing, FlaskConical, Plus, Shuffle, Trash2 } from 'lucide-react';
import type { ModuleProps } from '../types';
import { useApp, type AlertKind, type AlertRule } from '../../store/appStore';
import { getInstrument, getInstruments } from '../../data/instruments';
import { getEvents } from '../../data/events';
import { fmtPct, fmtPrice, fmtTime, uid } from '../../lib/formatting';
import { confirmAction, Empty, InstrumentSelect } from '../../components/ui';
import { checkAlert, fireAlert } from './engine';

const KIND_LABEL: Record<AlertKind, string> = {
  'price-above': 'Price crosses above', 'price-below': 'Price crosses below', 'pct-move': 'Day move ≥ ±%', 'rsi-above': 'RSI(14) above', 'rsi-below': 'RSI(14) below', screener: 'Screener has matches', event: 'Scheduled event',
};
const needsInstrument = (k: AlertKind) => !['screener', 'event'].includes(k);
const needsThreshold = (k: AlertKind) => !['screener', 'event'].includes(k);

export default function Alerts(_: ModuleProps) {
  const alerts = useApp((s) => s.alerts);
  const screens = useApp((s) => s.screens);
  const selected = useApp((s) => s.selectedInstrumentId);
  const { upsertAlert, deleteAlert, toast, notify } = useApp.getState();
  const inst0 = getInstrument(selected);
  const [form, setForm] = useState<Omit<AlertRule, 'id' | 'createdAt'>>({ name: '', kind: 'price-above', instrumentId: selected, threshold: inst0 ? Number((inst0.price * 1.02).toFixed(inst0.precision)) : 0, severity: 'info', enabled: true });
  const [testMsg, setTestMsg] = useState<Record<string, string>>({});

  const errors: string[] = [];
  if (needsInstrument(form.kind) && !form.instrumentId) errors.push('Choose an instrument.');
  if (needsThreshold(form.kind) && !Number.isFinite(form.threshold)) errors.push('Enter a numeric threshold.');
  if ((form.kind === 'rsi-above' || form.kind === 'rsi-below') && (form.threshold! < 0 || form.threshold! > 100)) errors.push('RSI threshold must be 0–100.');
  if (form.kind === 'screener' && !form.screenId) errors.push('Choose a saved screen (save one in Smart Screener first).');
  if (form.kind === 'event' && !form.eventId) errors.push('Choose an event.');

  const create = () => {
    if (errors.length) return;
    const inst = form.instrumentId ? getInstrument(form.instrumentId) : undefined;
    const name = form.name.trim() || `${inst?.symbol ?? ''} ${KIND_LABEL[form.kind]} ${form.threshold ?? ''}`.trim();
    upsertAlert({ ...form, name, id: uid('al'), createdAt: new Date().toISOString() });
    toast({ title: 'Alert rule created', tone: 'success' });
  };

  /** Simulated event generator: a random synthetic price move, checked against all enabled rules. */
  const simulate = () => {
    const list = getInstruments();
    const inst = list[Math.floor(Math.random() * list.length)];
    const move = (Math.random() - 0.5) * 8;
    const price = inst.price * (1 + move / 100);
    const override = { instrumentId: inst.id, price, changePercent: inst.changePercent + move };
    notify({ title: `Test move: ${inst.symbol} ${fmtPct(move)}`, body: `Test tick to ${fmtPrice(inst, price)} ${inst.quoteCurrency}.`, category: 'price', severity: 'info' });
    let fired = 0;
    for (const r of alerts.filter((a) => a.enabled && a.instrumentId === inst.id && a.kind.startsWith('p'))) {
      const c = checkAlert(r, override);
      if (c.triggered) {
        fireAlert(r, c.message, 'Test trigger');
        fired++;
      }
    }
    toast({ title: `Test move ${inst.symbol} ${fmtPct(move)}`, body: fired ? `${fired} rule(s) triggered — see notifications.` : 'No price rules on this instrument triggered.', tone: fired ? 'warning' : 'info' });
  };

  return (
    <div className="module">
      <div className="neu-soft card col gap-2">
        <span className="section-title">New rule</span>
        <div className="grid g3">
          <div className="field"><label>Condition</label>
            <select className="select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AlertKind })}>
              {(Object.keys(KIND_LABEL) as AlertKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </div>
          {needsInstrument(form.kind) && (
            <div className="field"><label>Instrument</label><InstrumentSelect value={form.instrumentId ?? ''} onChange={(id) => setForm({ ...form, instrumentId: id, threshold: form.kind.startsWith('price') ? Number(getInstrument(id)!.price.toFixed(getInstrument(id)!.precision)) : form.threshold })} /></div>
          )}
          {needsThreshold(form.kind) && (
            <div className="field"><label>Threshold {form.kind === 'pct-move' ? '(%)' : form.kind.startsWith('rsi') ? '(0–100)' : `(${getInstrument(form.instrumentId ?? '')?.quoteCurrency ?? ''})`}</label>
              <input className="input num" type="number" step="any" value={Number.isFinite(form.threshold) ? form.threshold : ''} onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })} />
            </div>
          )}
          {form.kind === 'screener' && (
            <div className="field"><label>Saved screen</label>
              <select className="select" value={form.screenId ?? ''} onChange={(e) => setForm({ ...form, screenId: e.target.value })}>
                <option value="">{screens.length ? 'Choose…' : 'No saved screens'}</option>
                {screens.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          {form.kind === 'event' && (
            <div className="field"><label>Event</label>
              <select className="select" value={form.eventId ?? ''} onChange={(e) => setForm({ ...form, eventId: e.target.value })}>
                <option value="">Choose…</option>
                {getEvents().map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
              </select>
            </div>
          )}
          <div className="field"><label>Severity</label>
            <select className="select" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as AlertRule['severity'] })}>
              <option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option>
            </select>
          </div>
          <div className="field"><label>Name (optional)</label><input className="input" maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        </div>
        {errors.length > 0 && <span className="tiny neg">{errors.join(' ')}</span>}
        <div className="row">
          <button className="btn sm primary" disabled={errors.length > 0} onClick={create}><Plus /> Create rule</button>
          <button className="btn sm" onClick={simulate} data-tip="Apply a random price move and check rules"><Shuffle /> Trigger test move</button>
        </div>
      </div>
      {alerts.length === 0 && <Empty icon={<BellRing />} title="No alert rules" hint="Create one above, or from Screener / Calendar." />}
      <div className="col gap-2">
        {alerts.map((a) => {
          const inst = a.instrumentId ? getInstrument(a.instrumentId) : undefined;
          return (
            <div key={a.id} className="neu-soft card col gap-1">
              <div className="row between">
                <label className="row gap-2" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={a.enabled} onChange={(e) => upsertAlert({ ...a, enabled: e.target.checked, lastTriggeredAt: undefined })} aria-label="Enabled" />
                  <span className="bold">{a.name}</span>
                </label>
                <div className="row gap-1">
                  <span className="chip" style={{ color: a.severity === 'critical' ? 'var(--sev-crit)' : a.severity === 'warning' ? 'var(--sev-warn)' : 'var(--sev-info)' }}>{a.severity}</span>
                  <button className="btn sm" onClick={() => {
                    const c = checkAlert(a);
                    setTestMsg((m) => ({ ...m, [a.id]: `${c.triggered ? 'Would trigger' : 'Would not trigger'}: ${c.message}` }));
                    fireAlert(a, c.message, 'Test alert');
                  }}><FlaskConical /> Test</button>
                  <button className="btn icon sm ghost danger" aria-label="Delete rule" onClick={async () => { if (await confirmAction({ title: 'Delete alert rule?', body: a.name, confirmLabel: 'Delete' })) deleteAlert(a.id); }}><Trash2 /></button>
                </div>
              </div>
              <span className="small secondary">
                {KIND_LABEL[a.kind]} {a.threshold != null && needsThreshold(a.kind) ? (a.kind.startsWith('price') && inst ? fmtPrice(inst, a.threshold) : a.threshold) : ''} {inst ? `· ${inst.symbol}` : ''}
                {a.lastTriggeredAt ? ` · last triggered ${fmtTime(a.lastTriggeredAt)}` : ' · armed'}
              </span>
              {testMsg[a.id] && <span className="tiny info">{testMsg[a.id]}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
