import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, CrosshairMode, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import { BellPlus, CandlestickChart, ShieldCheck, Users } from 'lucide-react';
import type { ModuleProps } from '../types';
import type { Timeframe } from '../../types/market';
import { useApp } from '../../store/appStore';
import { useWorkspace } from '../../workspace/WorkspaceStore';
import { getInstrument } from '../../data/instruments';
import { getSeries } from '../../data/priceSeries';
import { fmtNum, fmtPrice, uid } from '../../lib/formatting';
import { Change, Tabs } from '../../components/ui';
import { useMetrics } from '../shared';
import { activateApp } from '../../shell/Sidebar';

/** The four markets this OS covers, with the instrument each card leads with. */
const ASSETS = [
  { key: 'gold', label: 'Gold', ids: ['XAUUSD', 'GOLDINR'] },
  { key: 'silver', label: 'Silver', ids: ['XAGUSD', 'SILVERINR'] },
  { key: 'oil', label: 'Oil', ids: ['WTIUSD', 'BRENTUSD'] },
  { key: 'forex', label: 'Forex', ids: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDINR'] },
] as const;
const TFS: Timeframe[] = ['1h', '4h', '1D', '1W'];

const cssVar = (n: string, f: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || f;

function MiniChart({ id, tf, kind }: { id: string; tf: Timeframe; kind: 'area' | 'candles' }) {
  const ref = useRef<HTMLDivElement>(null);
  const colors = useApp((s) => s.chartColors);
  const themeId = useApp((s) => s.themeId);
  const epoch = useApp((s) => s.dataEpoch);
  const inst = getInstrument(id)!;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const candles = getSeries(id, tf).slice(-120);
    const chart: IChartApi = createChart(el, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: cssVar('--text-muted', '#7f8a99'), fontSize: 10, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: colors.grid } },
      crosshair: { mode: CrosshairMode.Magnet, vertLine: { color: colors.crosshair, labelBackgroundColor: colors.crosshair }, horzLine: { color: colors.crosshair, labelBackgroundColor: colors.crosshair } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: tf !== '1D' && tf !== '1W', fixLeftEdge: true, fixRightEdge: true },
      localization: { priceFormatter: (p: number) => fmtNum(p, inst.precision) },
    });
    const priceFormat = { type: 'price' as const, precision: inst.precision, minMove: 1 / 10 ** inst.precision };
    const up = candles.length > 1 && candles[candles.length - 1].close >= candles[0].close;
    if (kind === 'candles') {
      const s = chart.addCandlestickSeries({ upColor: colors.up, downColor: colors.down, wickUpColor: colors.wickUp, wickDownColor: colors.wickDown, borderVisible: false, priceFormat });
      s.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));
    } else {
      const line = up ? colors.up : colors.down;
      const s = chart.addAreaSeries({ lineColor: line, topColor: `${line}44`, bottomColor: `${line}04`, lineWidth: 2, priceFormat });
      s.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })));
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [id, tf, kind, colors, themeId, epoch, inst.precision]);
  return <div ref={ref} className="dash-chart" />;
}

function AssetCard({ asset, tf, kind }: { asset: (typeof ASSETS)[number]; tf: Timeframe; kind: 'area' | 'candles' }) {
  const [id, setId] = useState<string>(asset.ids[0]);
  const inst = getInstrument(id)!;
  const m = useMetrics(inst);
  const selected = useApp((s) => s.selectedInstrumentId);
  const { selectInstrument, upsertAlert, toast } = useApp.getState();
  const open = (type: 'chart-studio' | 'risk-lab' | 'community') => {
    selectInstrument(id);
    if (type === 'risk-lab') useWorkspace.getState().openApp('risk-lab', { settings: { prefillFrom: id, prefillAt: Date.now() } });
    else if (type === 'community') useWorkspace.getState().openApp('community', { settings: { communityId: asset.key } });
    else activateApp(type);
  };
  return (
    <div className={`dash-card neu-soft ${selected === id ? 'selected' : ''}`} onClick={() => selectInstrument(id)}>
      <div className="row between">
        <div className="col" style={{ gap: 0 }}>
          <span className="section-title">{asset.label}</span>
          <select className="select dash-select no-drag" value={id} onClick={(e) => e.stopPropagation()} onChange={(e) => setId(e.target.value)} aria-label={`${asset.label} instrument`}>
            {asset.ids.map((x) => <option key={x} value={x}>{getInstrument(x)?.symbol}</option>)}
          </select>
        </div>
        <div className="col" style={{ gap: 0, alignItems: 'flex-end' }}>
          <span className="mono bold dash-price">{fmtPrice(inst, inst.price)}</span>
          <span className="row gap-1"><Change value={inst.changePercent} /><span className="tiny muted">{inst.quoteCurrency}/{inst.unit}</span></span>
        </div>
      </div>
      <MiniChart id={id} tf={tf} kind={kind} />
      <div className="dash-stats">
        <span><span className="muted">Range</span> {fmtPrice(inst, inst.dayLow)}–{fmtPrice(inst, inst.dayHigh)}</span>
        <span><span className="muted">RSI</span> {fmtNum(m.rsi14, 1)}</span>
        <span><span className="muted">Trend</span> <span className={m.trend === 'uptrend' ? 'pos' : m.trend === 'downtrend' ? 'neg' : ''}>{m.trend}</span></span>
        <span><span className="muted">Vol</span> {fmtNum(m.vol20, 1)}%</span>
      </div>
      <div className="row gap-1 no-drag" onClick={(e) => e.stopPropagation()}>
        <button className="btn sm" onClick={() => open('chart-studio')} data-tip="Full chart with indicators & drawing tools"><CandlestickChart /> Chart</button>
        <button className="btn sm" onClick={() => open('risk-lab')} data-tip="Position size & risk/reward"><ShieldCheck /> Risk</button>
        <button className="btn sm" onClick={() => open('community')} data-tip={`${asset.label} community`}><Users /> Community</button>
        <button
          className="btn icon sm"
          aria-label="Alert 1% above"
          data-tip="Alert when price is 1% higher"
          onClick={() => {
            const t = Number((inst.price * 1.01).toFixed(inst.precision));
            upsertAlert({ id: uid('al'), name: `${inst.symbol} above ${fmtPrice(inst, t)}`, kind: 'price-above', instrumentId: id, threshold: t, severity: 'info', enabled: true, createdAt: new Date().toISOString() });
            toast({ title: 'Alert created', body: `${inst.symbol} above ${fmtPrice(inst, t)} — see Alert Builder.`, tone: 'success' });
          }}
        >
          <BellPlus />
        </button>
      </div>
    </div>
  );
}

/** Four-asset overview: Gold, Silver, Oil and Forex with interactive charts and quick actions. */
export default function Dashboard({ frame, updateSettings }: ModuleProps) {
  const tf = (frame.settings.timeframe as Timeframe) ?? '1D';
  const kind = (frame.settings.kind as 'area' | 'candles') ?? 'area';
  const up = useMemo(() => ASSETS.map((a) => getInstrument(a.ids[0])!).filter((i) => i.changePercent > 0).length, []);
  return (
    <div className="module">
      <div className="module-head">
        <span className="title">Markets overview</span>
        <span className="tiny muted">{up} of 4 up today</span>
        <div style={{ flex: 1 }} />
        <Tabs value={kind} onChange={(k) => updateSettings({ kind: k })} options={[{ id: 'area', label: 'Line' }, { id: 'candles', label: 'Candles' }]} />
        <Tabs value={tf} onChange={(t) => updateSettings({ timeframe: t })} options={TFS.map((t) => ({ id: t, label: t }))} />
      </div>
      <div className="dash-grid">
        {ASSETS.map((a) => (
          <AssetCard key={a.key} asset={a} tf={tf} kind={kind} />
        ))}
      </div>
    </div>
  );
}
