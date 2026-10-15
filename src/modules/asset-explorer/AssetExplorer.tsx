import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Bot, Building2, CandlestickChart, Newspaper, Search, ShieldCheck, X } from 'lucide-react';
import type { ModuleProps } from '../types';
import type { AssetClass, Instrument } from '../../types/market';
import { useApp } from '../../store/appStore';
import { ASSET_CLASS_LABEL, ASSET_CLASSES } from '../../data/instruments';
import { getSeries } from '../../data/priceSeries';
import { newsFor } from '../../data/news';
import { Change, Empty, Sparkline, Tabs, WatchStar } from '../../components/ui';
import { fmtCompact, fmtNum, fmtPrice, fmtTime } from '../../lib/formatting';
import { unitLabel, useAllMetrics, useInstruments } from '../shared';
import { activateApp } from '../../shell/Sidebar';
import { useWorkspace } from '../../workspace/WorkspaceStore';

type Tab = 'all' | AssetClass;
type SortKey = 'symbol' | 'price' | 'changePercent' | 'volume' | 'assetClass';

function Detail({ inst, onClose }: { inst: Instrument; onClose: () => void }) {
  const metrics = useAllMetrics();
  const m = metrics.get(inst.id);
  const { selectInstrument, sendToAI } = useApp.getState();
  const go = (fn: () => void) => () => {
    selectInstrument(inst.id);
    fn();
  };
  const news = newsFor(inst.id).slice(0, 3);
  return (
    <div className="drawer neu-raised no-drag" role="dialog" aria-label={`${inst.symbol} details`}>
      <div className="modal-head">
        <div className="col grow" style={{ gap: 0 }}>
          <span className="bold">{inst.symbol}</span>
          <span className="tiny muted">{inst.displayName}</span>
        </div>
        <WatchStar id={inst.id} />
        <button className="btn icon sm" onClick={onClose} aria-label="Close details"><X /></button>
      </div>
      <div className="modal-body col gap-3">
        <div className="row between">
          <span className="mono bold" style={{ fontSize: '1.5em' }}>{fmtPrice(inst, inst.price)}</span>
          <Change value={inst.changePercent} />
        </div>
        <div className="row wrap gap-1">
          <span className="chip">{ASSET_CLASS_LABEL[inst.assetClass]}</span>
          <span className="chip">{unitLabel(inst)}</span>
          {inst.assetClass === 'crypto' && <span className="chip info">24/7 market</span>}
          {inst.pipSize && <span className="chip">pip {inst.pipSize}</span>}
        </div>
        <Sparkline values={getSeries(inst.id, '1D').slice(-90).map((c) => c.close)} width={320} height={60} />
        <div className="kv small">
          <span>Open</span><span>{fmtPrice(inst, inst.open)}</span>
          <span>Day range</span><span>{fmtPrice(inst, inst.dayLow)} – {fmtPrice(inst, inst.dayHigh)}</span>
          <span>Prev close</span><span>{fmtPrice(inst, inst.previousClose)}</span>
          {inst.volume != null && (<><span>Volume</span><span>{fmtCompact(inst.volume)}</span></>)}
          <span>RSI(14)</span><span>{fmtNum(m?.rsi14, 1)}</span>
          <span>SMA 50 / 200</span><span>{fmtPrice(inst, m?.sma50 ?? NaN)} / {fmtPrice(inst, m?.sma200 ?? NaN)}</span>
          <span>Trend</span><span>{m?.trend ?? '—'}</span>
          <span>Realised vol</span><span>{m?.vol20 == null ? '—' : `${m.vol20.toFixed(1)}% ann.`}</span>
          <span>52-bar range</span><span>{fmtPrice(inst, m?.low52 ?? NaN)} – {fmtPrice(inst, m?.high52 ?? NaN)}</span>
          <span>Snapshot</span><span>{fmtTime(inst.lastUpdatedAt)}</span>
        </div>
        <p className="small secondary">{inst.description}</p>
        <div className="grid g2">
          <button className="btn" onClick={go(() => activateApp('chart-studio'))}><CandlestickChart /> Chart</button>
          <button className="btn" onClick={go(() => { sendToAI({ question: `Analyse ${inst.symbol} using the supplied evidence.`, autoSend: true }); activateApp('ai-copilot'); })}><Bot /> AI analysis</button>
          <button className="btn" onClick={go(() => activateApp('news'))}><Newspaper /> News</button>
          <button className="btn" onClick={go(() => activateApp('fundamentals'))}><Building2 /> {inst.assetClass === 'equity' ? 'Fundamentals' : 'Drivers'}</button>
          <button className="btn" onClick={go(() => useWorkspace.getState().openApp('risk-lab', { settings: { prefillFrom: inst.id, prefillAt: Date.now() } }))}><ShieldCheck /> Risk tool</button>
        </div>
        <div className="col gap-1">
          <span className="section-title">Related headlines</span>
          {news.length === 0 && <span className="small muted">No headlines for this instrument.</span>}
          {news.map((n) => (
            <div key={n.id} className="small">
              <span className={`dir ${n.sentiment === 'bullish' ? 'positive' : n.sentiment === 'bearish' ? 'negative' : 'neutral'}`}>{n.sentiment}</span> {n.headline}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AssetExplorer({ frame, updateSettings }: ModuleProps) {
  const tab = (frame.settings.tab as Tab) ?? 'all';
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'assetClass', dir: 1 });
  const [detail, setDetail] = useState<string | null>(null);
  const instruments = useInstruments();
  const selected = useApp((s) => s.selectedInstrumentId);
  const select = useApp((s) => s.selectInstrument);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = instruments.filter(
      (i) => (tab === 'all' || i.assetClass === tab) && (!s || [i.symbol, i.displayName, i.assetClass, ASSET_CLASS_LABEL[i.assetClass], i.sector ?? '', ...i.tags].join(' ').toLowerCase().includes(s)),
    );
    const order = (i: Instrument) => ASSET_CLASSES.indexOf(i.assetClass);
    return [...list].sort((a, b) => {
      const k = sort.key;
      const va = k === 'assetClass' ? order(a) : k === 'symbol' ? a.symbol : (a[k] ?? -Infinity);
      const vb = k === 'assetClass' ? order(b) : k === 'symbol' ? b.symbol : (b[k] ?? -Infinity);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [instruments, q, tab, sort]);

  const th = (key: SortKey, label: string, right = false) => (
    <th className={`sortable ${right ? 'right' : ''}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : key === 'symbol' || key === 'assetClass' ? 1 : -1 }))} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      {label} {sort.key === key && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
    </th>
  );
  const detailInst = instruments.find((i) => i.id === detail);

  return (
    <div className="module" style={{ position: 'relative' }}>
      <div className="module-head">
        <div className="neu-inset row" style={{ padding: '0 8px', height: 30, flex: '1 1 200px' }}>
          <Search size={14} className="muted" />
          <input className="input" style={{ boxShadow: 'none', background: 'transparent', height: 28 }} placeholder="Search name, symbol, category, tag…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search instruments" />
        </div>
      </div>
      <Tabs value={tab} onChange={(t) => updateSettings({ tab: t })} options={[{ id: 'all' as Tab, label: 'All' }, ...ASSET_CLASSES.map((a) => ({ id: a as Tab, label: ASSET_CLASS_LABEL[a] }))]} />
      {rows.length === 0 ? (
        <Empty title="No instruments match" hint="Try another search or tab." />
      ) : (
        <div className="scroll grow">
          <table className="table">
            <thead>
              <tr>
                <th />
                {th('symbol', 'Symbol')}
                {th('assetClass', 'Class')}
                <th>Quote</th>
                {th('price', 'Price', true)}
                {th('changePercent', 'Chg %', true)}
                {th('volume', 'Volume', true)}
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className={`clickable ${selected === i.id ? 'selected' : ''}`} onClick={() => { select(i.id); setDetail(i.id); }}>
                  <td style={{ width: 30 }}><WatchStar id={i.id} /></td>
                  <td>
                    <div className="bold">{i.symbol}</div>
                    <div className="tiny muted ellipsis" style={{ maxWidth: 180 }}>{i.displayName}</div>
                  </td>
                  <td><span className="chip">{ASSET_CLASS_LABEL[i.assetClass]}</span>{i.assetClass === 'crypto' && <span className="chip info" style={{ marginLeft: 4 }}>24/7</span>}</td>
                  <td className="small secondary">{unitLabel(i)}</td>
                  <td className="right mono">{fmtPrice(i, i.price)}</td>
                  <td className="right"><Change value={i.changePercent} /></td>
                  <td className="right small">{i.volume != null ? fmtCompact(i.volume) : <span className="muted">n/a</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detailInst && <Detail inst={detailInst} onClose={() => setDetail(null)} />}
    </div>
  );
}
