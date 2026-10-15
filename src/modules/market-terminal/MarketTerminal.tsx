import { useMemo } from 'react';
import { Activity, BellRing, CalendarDays, Gauge } from 'lucide-react';
import type { ModuleProps } from '../types';
import type { AssetClass } from '../../types/market';
import { useApp } from '../../store/appStore';
import { ASSET_CLASS_LABEL, ASSET_CLASSES } from '../../data/instruments';
import { getSeries } from '../../data/priceSeries';
import { getEvents } from '../../data/events';
import { Change, Sparkline, Tabs } from '../../components/ui';
import { fmtCompact, fmtDate, fmtPct, fmtPrice, fmtTime } from '../../lib/formatting';
import { heatColor, useAllMetrics, useInstruments, unitLabel } from '../shared';
import { activateApp } from '../../shell/Sidebar';

type Group = 'all' | 'metals' | 'oil' | 'forex';
const GROUPS: Array<{ id: Group; label: string; classes: AssetClass[] }> = [
  { id: 'all', label: 'All', classes: ASSET_CLASSES },
  { id: 'metals', label: 'Metals', classes: ['gold', 'silver'] },
  { id: 'oil', label: 'Oil/Energy', classes: ['oil'] },
  { id: 'forex', label: 'Forex', classes: ['forex'] },
];

export default function MarketTerminal({ frame, updateSettings }: ModuleProps) {
  const group = (frame.settings.group as Group) ?? 'all';
  const instruments = useInstruments();
  const metrics = useAllMetrics();
  const select = useApp((s) => s.selectInstrument);
  const watch = useApp((s) => s.watchlist);
  const notifications = useApp((s) => s.notifications);
  const classes = GROUPS.find((g) => g.id === group)!.classes;
  const scoped = instruments.filter((i) => classes.includes(i.assetClass));
  // Headline cards: the key benchmark of each market group.
  const indices = ['XAUUSD', 'XAGUSD', 'WTIUSD', 'BRENTUSD', 'EURUSD', 'USDINR'].map((id) => instruments.find((i) => i.id === id)).filter((i): i is NonNullable<typeof i> => !!i);

  const movers = useMemo(() => {
    const sorted = [...scoped].filter((i) => i.assetClass !== 'index').sort((a, b) => b.changePercent - a.changePercent);
    const active = [...scoped].filter((i) => i.volume).sort((a, b) => (b.volume! * b.price) / 1 - (a.volume! * a.price) / 1);
    return { gainers: sorted.slice(0, 5), losers: sorted.slice(-5).reverse(), active: active.slice(0, 5) };
  }, [scoped]);

  const classPerf = ASSET_CLASSES.map((ac) => {
    const list = instruments.filter((i) => i.assetClass === ac);
    return { ac, avg: list.reduce((a, i) => a + i.changePercent, 0) / (list.length || 1), n: list.length };
  });
  const adv = scoped.filter((i) => i.changePercent > 0).length;
  const dec = scoped.filter((i) => i.changePercent < 0).length;
  const vols = scoped.map((i) => metrics.get(i.id)?.vol20).filter((v): v is number => v != null);
  const avgVol = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : null;
  const above50 = scoped.filter((i) => {
    const m = metrics.get(i.id);
    return m?.sma50 != null && i.price > m.sma50;
  }).length;

  const open = (id: string) => {
    select(id);
    activateApp('chart-studio');
  };
  const events = getEvents().filter((e) => e.date >= new Date(Date.UTC(2026, 8, 30)).toISOString()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  const alerts = notifications.filter((n) => ['price', 'screener', 'event'].includes(n.category)).slice(0, 3);

  return (
    <div className="module">
      <div className="module-head">
        <Tabs value={group} onChange={(g) => updateSettings({ group: g })} options={GROUPS.map((g) => ({ id: g.id, label: g.label }))} />
        <div style={{ flex: 1 }} />
      </div>

      <div className="grid gauto">
        {indices.map((i) => (
          <div key={i.id} className="neu-soft quote-card" onClick={() => open(i.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open(i.id)}>
            <div className="row between">
              <span className="sym">{i.symbol}</span>
              <span className="tiny muted">{i.quoteCurrency}</span>
            </div>
            <span className="px">{fmtPrice(i, i.price)}</span>
            <div className="row between">
              <Change value={i.changePercent} />
              <Sparkline values={getSeries(i.id, '1D').slice(-40).map((c) => c.close)} width={70} height={22} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid g4">
        <div className="neu-soft card col gap-1">
          <span className="label row gap-1"><Activity size={12} /> Breadth</span>
          <span className="bold">
            <span className="pos">{adv} up</span> · <span className="neg">{dec} down</span>
          </span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(adv / Math.max(1, adv + dec)) * 100}%`, background: 'var(--positive)' }} /></div>
        </div>
        <div className="neu-soft card col gap-1">
          <span className="label row gap-1"><Gauge size={12} /> Avg realised vol (20)</span>
          <span className="bold num">{avgVol == null ? '—' : `${avgVol.toFixed(1)}% ann.`}</span>
          <span className="tiny muted">Computed from price series</span>
        </div>
        <div className="neu-soft card col gap-1">
          <span className="label">Above SMA(50)</span>
          <span className="bold num">{above50} / {scoped.length}</span>
          <span className="tiny muted">Trend participation</span>
        </div>
        <div className="neu-soft card col gap-1">
          <span className="label">Watchlist</span>
          <span className="bold num">{watch.length} instruments</span>
          <button className="btn sm" onClick={() => activateApp('watchlist')}>Open watchlist</button>
        </div>
      </div>

      <div className="grid g3">
        {(['gainers', 'losers', 'active'] as const).map((k) => (
          <div key={k} className="neu-soft card col gap-1">
            <span className="section-title">{k === 'gainers' ? 'Top gainers' : k === 'losers' ? 'Top losers' : 'Most active (value)'}</span>
            {movers[k].length === 0 && <span className="small muted">No instruments in this group.</span>}
            {movers[k].map((i) => (
              <div key={i.id} className="row between clickable" style={{ cursor: 'pointer' }} onClick={() => open(i.id)}>
                <span className="bold small">{i.symbol}</span>
                <span className="row gap-1">
                  <span className="small num secondary">{k === 'active' ? fmtCompact(i.volume) : fmtPrice(i, i.price)}</span>
                  <Change value={i.changePercent} />
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="neu-soft card col gap-2">
        <span className="section-title">Asset-class performance (avg day change)</span>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${ASSET_CLASSES.length}, minmax(0,1fr))` }}>
          {classPerf.map((c) => (
            <div key={c.ac} className="heat-cell" style={{ background: heatColor(c.avg, 2), color: 'var(--text-primary)' }} onClick={() => updateSettings({ group: c.ac === 'gold' || c.ac === 'silver' ? 'metals' : (c.ac as Group) })}>
              <span className="small">{ASSET_CLASS_LABEL[c.ac]}</span>
              <span className="num">{fmtPct(c.avg)}</span>
              <span className="s">{c.n} instruments</span>
            </div>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 6 }}>
          {scoped.filter((i) => i.assetClass !== 'index').map((i) => (
            <div key={i.id} className="heat-cell" style={{ background: heatColor(i.changePercent), color: 'var(--text-primary)', minHeight: 44 }} onClick={() => open(i.id)} title={`${i.displayName} — ${unitLabel(i)}`}>
              <span className="small">{i.symbol}</span>
              <span className="s num">{fmtPct(i.changePercent)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid g2">
        <div className="neu-soft card col gap-1">
          <span className="section-title row gap-1"><BellRing size={12} /> Recent alerts</span>
          {alerts.length === 0 && <span className="small muted">No alerts yet. Create rules in Alert Builder.</span>}
          {alerts.map((a) => (
            <div key={a.id} className="small">
              <span className="bold">{a.title}</span> <span className="muted tiny">{fmtTime(a.createdAt)}</span>
            </div>
          ))}
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => activateApp('alerts')}>Alert Builder</button>
        </div>
        <div className="neu-soft card col gap-1">
          <span className="section-title row gap-1"><CalendarDays size={12} /> Scheduled events</span>
          {events.map((e) => (
            <div key={e.id} className="row between small">
              <span className="ellipsis">{e.title}</span>
              <span className="muted tiny" style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.date)}</span>
            </div>
          ))}
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => activateApp('calendar')}>Open calendar</button>
        </div>
      </div>
    </div>
  );
}
