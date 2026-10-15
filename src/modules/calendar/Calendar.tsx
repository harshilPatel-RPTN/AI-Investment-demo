import { useMemo, useState } from 'react';
import { BellPlus, CalendarDays, ChevronDown, ChevronRight } from 'lucide-react';
import type { ModuleProps } from '../types';
import type { AssetClass } from '../../types/market';
import { useApp } from '../../store/appStore';
import { getEvents } from '../../data/events';
import { ASSET_CLASS_LABEL, ASSET_CLASSES, getInstrument } from '../../data/instruments';
import { FIXTURE_NOW } from '../../lib/seed';
import { fmtDate, fmtTime, uid } from '../../lib/formatting';
import { Empty } from '../../components/ui';

const IMP_COLOR = { high: 'var(--negative)', medium: 'var(--warning)', low: 'var(--text-muted)' };

export default function Calendar({ frame, updateSettings }: ModuleProps) {
  const assetClass = (frame.settings.assetClass as AssetClass | 'macro' | '') ?? '';
  const [importance, setImportance] = useState('');
  const [type, setType] = useState('');
  const [days, setDays] = useState(14);
  const [open, setOpen] = useState<string | null>(null);
  const { selectInstrument, upsertAlert, toast } = useApp.getState();

  const list = useMemo(() => {
    const from = FIXTURE_NOW - 2 * 86_400_000;
    const to = days ? FIXTURE_NOW + days * 86_400_000 : Infinity;
    return getEvents()
      .filter((e) => {
        const t = new Date(e.date).getTime();
        const cls = e.assetClass === assetClass || (assetClass && e.instrumentIds.some((id) => getInstrument(id)?.assetClass === assetClass));
        return (!assetClass || cls) && (!importance || e.importance === importance) && (!type || e.type === type) && t >= from && t <= to;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [assetClass, importance, type, days]);

  const groups = useMemo(() => {
    const m = new Map<string, typeof list>();
    list.forEach((e) => {
      const k = e.date.slice(0, 10);
      m.set(k, [...(m.get(k) ?? []), e]);
    });
    return Array.from(m.entries());
  }, [list]);

  return (
    <div className="module">
      <div className="module-head">
        <select className="select" value={assetClass} onChange={(e) => updateSettings({ assetClass: e.target.value })} aria-label="Asset class">
          <option value="">All classes</option>
          {ASSET_CLASSES.map((a) => <option key={a} value={a}>{ASSET_CLASS_LABEL[a]}</option>)}
          <option value="macro">Macro</option>
        </select>
        <select className="select" value={importance} onChange={(e) => setImportance(e.target.value)} aria-label="Importance">
          <option value="">Any importance</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Event type">
          <option value="">All types</option>
          <option value="earnings">Earnings</option>
          <option value="central-bank">Central bank</option>
          <option value="inventory">Inventory / supply</option>
          <option value="token">Token events</option>
          <option value="macro">Macro releases</option>
        </select>
        <select className="select" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Date range">
          <option value={7}>Next 7 days</option>
          <option value={14}>Next 14 days</option>
          <option value={0}>All dates</option>
        </select>
        <div style={{ flex: 1 }} />
      </div>
      {groups.length === 0 && <Empty icon={<CalendarDays />} title="No events match" />}
      {groups.map(([day, evs]) => (
        <div key={day} className="col gap-1">
          <div className="section-title">
            {fmtDate(day)} {new Date(day).getTime() < FIXTURE_NOW - 86_400_000 ? '· past' : ''}
          </div>
          {evs.map((e) => (
            <div key={e.id} className="neu-soft card col gap-1" style={{ padding: '8px 12px' }}>
              <button className="row" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit' }} onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                {open === e.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="status-dot" style={{ background: IMP_COLOR[e.importance] }} title={`${e.importance} importance`} />
                <span className="bold grow">{e.title}</span>
                <span className="chip">{e.type}</span>
                <span className="tiny muted mono">{fmtTime(e.date).slice(-9)}</span>
              </button>
              {open === e.id && (
                <div className="col gap-2" style={{ paddingLeft: 22 }}>
                  <p className="small secondary">{e.description}</p>
                  <div className="row wrap gap-1">
                    <span className="tiny muted">Related:</span>
                    {e.instrumentIds.map((id) => (
                      <button key={id} className="chip clickable" onClick={() => selectInstrument(id)}>{getInstrument(id)?.symbol ?? id}</button>
                    ))}
                    <span className="chip">{e.importance} importance</span>
                  </div>
                  <button
                    className="btn sm"
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => {
                      upsertAlert({ id: uid('al'), name: e.title, kind: 'event', eventId: e.id, instrumentId: e.instrumentIds[0], severity: e.importance === 'high' ? 'warning' : 'info', enabled: true, createdAt: new Date().toISOString() });
                      toast({ title: 'Event reminder added to Alert Builder', tone: 'success' });
                    }}
                  >
                    <BellPlus /> Remind me
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
