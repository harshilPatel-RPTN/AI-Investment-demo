import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart, CrosshairMode, LineStyle, type IChartApi, type ISeriesApi, type LogicalRange, type SeriesType, type Time, type UTCTimestamp,
} from 'lightweight-charts';
import { Bot, Maximize, Settings2 } from 'lucide-react';
import type { ModuleProps } from '../types';
import type { Candle, Timeframe } from '../../types/market';
import { useApp } from '../../store/appStore';
import { getSeries, TIMEFRAMES } from '../../data/priceSeries';
import { getInstrument } from '../../data/instruments';
import { atr, bollinger, ema, last, macd, rsi, sma, vwap, type Series } from '../../lib/indicators';
import { fmtNum, fmtPrice, fmtTime } from '../../lib/formatting';
import { usePopover } from '../../components/hooks';
import { InstrumentSelect, Change } from '../../components/ui';
import { LinkedPicker, useLinkedInstrument } from '../shared';
import { activateApp } from '../../shell/Sidebar';
import { DrawingLayer, DrawingToolbar, DRAW_COLORS, type Drawing, type DrawTool } from './DrawingLayer';

type ChartType = 'candles' | 'line' | 'area' | 'bars';
interface Indicators { sma: boolean; ema: boolean; bb: boolean; vwap: boolean; sr: boolean; rsi: boolean; macd: boolean; atr: boolean; volume: boolean }
interface Params { sma: number; ema: number; bb: number; bbMult: number; rsi: number; atr: number }

const DEF_IND: Indicators = { sma: true, ema: false, bb: false, vwap: false, sr: false, rsi: true, macd: false, atr: false, volume: true };
const DEF_PARAMS: Params = { sma: 20, ema: 50, bb: 20, bbMult: 2, rsi: 14, atr: 14 };

const cssVar = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const toLine = (candles: Candle[], s: Series) => candles.flatMap((c, i) => (s[i] == null ? [] : [{ time: c.time as UTCTimestamp, value: s[i] as number }]));
const clampInt = (n: number, lo: number, hi: number, d: number) => (Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d);

/** Illustrative support/resistance: highest high / lowest low of recent swing window. */
function srLevels(c: Candle[]) {
  const w = c.slice(-60);
  if (w.length < 10) return null;
  return { r: Math.max(...w.map((x) => x.high)), s: Math.min(...w.map((x) => x.low)) };
}

export default function ChartStudio({ frame, updateSettings }: ModuleProps) {
  const { inst } = useLinkedInstrument(frame);
  const globalTf = useApp((s) => s.timeframe);
  const colors = useApp((s) => s.chartColors);
  const themeId = useApp((s) => s.themeId);
  const customVars = useApp((s) => s.customVars);
  const epoch = useApp((s) => s.dataEpoch);
  const tf = (frame.settings.timeframe as Timeframe) ?? globalTf;
  const type = (frame.settings.chartType as ChartType) ?? 'candles';
  const ind: Indicators = { ...DEF_IND, ...((frame.settings.indicators as Partial<Indicators>) ?? {}) };
  /** Simple mode (Starter Dashboard): essentials only; everything else sits behind “Tools”. */
  const simple = frame.settings.simple === true;
  const [showTools, setShowTools] = useState(!simple);
  const tools = !simple || showTools;
  const params: Params = { ...DEF_PARAMS, ...((frame.settings.params as Partial<Params>) ?? {}) };
  const compareId = (frame.settings.compareId as string) || '';
  const cmpInst = compareId ? getInstrument(compareId) : undefined;

  const mainRef = useRef<HTMLDivElement>(null);
  const subRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const chartRef = useRef<IChartApi | null>(null);
  const [api, setApi] = useState<{ chart: IChartApi; series: ISeriesApi<SeriesType> } | null>(null);
  const [tool, setTool] = useState<DrawTool>('cursor');
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0]);
  const rangeRef = useRef<LogicalRange | null>(null);
  const [legend, setLegend] = useState<{ c?: Candle; time?: number }>({});
  const pop = usePopover();

  const candles = useMemo(() => getSeries(inst.id, tf), [inst.id, tf, epoch]);
  const closes = useMemo(() => candles.map((c) => c.close), [candles]);
  const calc = useMemo(
    () => ({
      sma: sma(closes, params.sma),
      ema: ema(closes, params.ema),
      bb: bollinger(closes, params.bb, params.bbMult),
      vwap: vwap(candles.slice(-Math.min(candles.length, tf === '1D' || tf === '1W' || tf === '1M' ? 60 : 120))),
      rsi: rsi(closes, params.rsi),
      macd: macd(closes),
      atr: atr(candles, params.atr),
    }),
    [closes, candles, params.sma, params.ema, params.bb, params.bbMult, params.rsi, params.atr, tf],
  );
  const subs = (['rsi', 'macd', 'atr'] as const).filter((k) => ind[k]);
  const indKey = JSON.stringify(ind);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const text = cssVar('--text-secondary', '#aab4c2');
    const border = cssVar('--border-subtle', 'rgba(255,255,255,.05)');
    const base = {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: text, fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 11 },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: colors.crosshair, labelBackgroundColor: colors.crosshair }, horzLine: { color: colors.crosshair, labelBackgroundColor: colors.crosshair } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, timeVisible: !['1D', '1W', '1M'].includes(tf), secondsVisible: false, rightOffset: 4 },
      localization: { priceFormatter: (p: number) => fmtNum(p, inst.precision) },
    };
    const chart = createChart(el, base);
    chartRef.current = chart;
    const priceFormat = { type: 'price' as const, precision: inst.precision, minMove: 1 / 10 ** inst.precision };
    const ohlc = candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }));
    let main: ISeriesApi<SeriesType>;
    if (type === 'candles') {
      main = chart.addCandlestickSeries({ upColor: colors.up, downColor: colors.down, wickUpColor: colors.wickUp, wickDownColor: colors.wickDown, borderVisible: false, priceFormat });
      main.setData(ohlc);
    } else if (type === 'bars') {
      main = chart.addBarSeries({ upColor: colors.up, downColor: colors.down, priceFormat });
      main.setData(ohlc);
    } else if (type === 'area') {
      main = chart.addAreaSeries({ lineColor: colors.up, topColor: `${colors.up}55`, bottomColor: `${colors.up}05`, lineWidth: 2, priceFormat });
      main.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })));
    } else {
      main = chart.addLineSeries({ color: colors.up, lineWidth: 2, priceFormat });
      main.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })));
    }
    if (ind.volume && candles.some((c) => c.volume > 0)) {
      const vol = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vol.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.volume, color: `${c.close >= c.open ? colors.up : colors.down}55` })));
    }
    const line = (s: Series, color: string, width: 1 | 2 = 1, style: LineStyle = LineStyle.Solid, data?: Candle[]) => {
      const ls = chart.addLineSeries({ color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceFormat });
      ls.setData(toLine(data ?? candles, s));
    };
    if (ind.sma) line(calc.sma, colors.sma, 2);
    if (ind.ema) line(calc.ema, colors.ema, 2);
    if (ind.bb) {
      line(calc.bb.upper, colors.bbands, 1, LineStyle.Dashed);
      line(calc.bb.middle, colors.bbands, 1, LineStyle.Dotted);
      line(calc.bb.lower, colors.bbands, 1, LineStyle.Dashed);
    }
    if (ind.vwap) line(calc.vwap, colors.vwap, 2, LineStyle.Solid, candles.slice(-calc.vwap.length));
    if (ind.sr) {
      const lv = srLevels(candles);
      if (lv) {
        main.createPriceLine({ price: lv.r, color: colors.down, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: 'R' });
        main.createPriceLine({ price: lv.s, color: colors.up, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: 'S' });
      }
    }
    if (cmpInst) {
      const cmp = getSeries(cmpInst.id, tf);
      const s = chart.addLineSeries({ color: colors.ema, lineWidth: 2, priceScaleId: 'left', title: cmpInst.symbol, priceFormat: { type: 'price', precision: cmpInst.precision, minMove: 1 / 10 ** cmpInst.precision } });
      chart.priceScale('left').applyOptions({ visible: true, borderColor: border });
      s.setData(cmp.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })));
    }

    // Sub-panes (separate charts with synced logical range).
    const subCharts: IChartApi[] = [];
    for (const k of subs) {
      const sel = subRefs.current[k];
      if (!sel) continue;
      const sc = createChart(sel, { ...base, layout: { ...base.layout, attributionLogo: false }, timeScale: { ...base.timeScale, visible: false }, rightPriceScale: { borderColor: border, minimumWidth: 70 }, localization: { priceFormatter: (p: number) => fmtNum(p, k === 'atr' ? inst.precision : 2) } });
      const add = (s: Series, color: string) => {
        const ls = sc.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
        ls.setData(toLine(candles, s));
        return ls;
      };
      if (k === 'rsi') {
        const r = add(calc.rsi, colors.rsi);
        r.createPriceLine({ price: 70, color: colors.down, lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false, title: '70' });
        r.createPriceLine({ price: 30, color: colors.up, lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false, title: '30' });
      } else if (k === 'macd') {
        const h = sc.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
        h.setData(candles.flatMap((c, i) => (calc.macd.histogram[i] == null ? [] : [{ time: c.time as UTCTimestamp, value: calc.macd.histogram[i] as number, color: (calc.macd.histogram[i] as number) >= 0 ? `${colors.up}88` : `${colors.down}88` }])));
        add(calc.macd.macd, colors.macd);
        add(calc.macd.signal, colors.signal);
      } else add(calc.atr, colors.vwap);
      subCharts.push(sc);
    }
    // Keep the main chart's right scale as wide as the sub panes so time axes line up.
    chart.applyOptions({ rightPriceScale: { minimumWidth: 70 } });
    const sync = (r: LogicalRange | null) => {
      rangeRef.current = r;
      if (r) subCharts.forEach((sc) => sc.timeScale().setVisibleLogicalRange(r));
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(sync);
    if (rangeRef.current) chart.timeScale().setVisibleLogicalRange(rangeRef.current);
    else chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 140), to: candles.length + 3 });
    chart.subscribeCrosshairMove((p) => {
      if (!p.time) return setLegend({});
      const idx = candles.findIndex((c) => c.time === (p.time as Time));
      setLegend(idx >= 0 ? { c: candles[idx], time: candles[idx].time } : {});
    });
    setApi({ chart, series: main });
    return () => {
      setApi(null);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(sync);
      subCharts.forEach((sc) => sc.remove());
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, type, indKey, calc, colors, themeId, customVars, compareId, inst.precision, tf]);

  // Reset zoom when instrument or timeframe changes.
  useEffect(() => {
    rangeRef.current = null;
  }, [inst.id, tf]);

  // Drawings are stored per instrument (absolute time/price), so they survive timeframe changes.
  const allDrawings = (frame.settings.drawings as Record<string, Drawing[]> | undefined) ?? {};
  const drawings = allDrawings[inst.id] ?? [];
  const setDrawings = (d: Drawing[]) => updateSettings({ drawings: { ...allDrawings, [inst.id]: d } });

  const lc = legend.c ?? candles[candles.length - 1];
  const setInd = (p: Partial<Indicators>) => updateSettings({ indicators: { ...ind, ...p } });
  const setParam = (p: Partial<Params>) => updateSettings({ params: { ...params, ...p } });

  const summary = () => {
    const r = last(calc.rsi);
    const s = last(calc.sma);
    const e = last(calc.ema);
    const m = last(calc.macd.macd);
    const sg = last(calc.macd.signal);
    const lv = srLevels(candles);
    return [
      `Chart summary (${inst.symbol}, ${tf}, ${candles.length} bars, last bar ${fmtTime(candles[candles.length - 1].time * 1000)}):`,
      `Last close ${fmtPrice(inst, inst.price)} ${inst.quoteCurrency}; day change ${inst.changePercent.toFixed(2)}%.`,
      `SMA(${params.sma}) ${s == null ? 'n/a' : fmtPrice(inst, s)} (price ${s != null && inst.price > s ? 'above' : 'below'}); EMA(${params.ema}) ${e == null ? 'n/a' : fmtPrice(inst, e)}.`,
      `RSI(${params.rsi}) ${r == null ? 'n/a' : r.toFixed(1)}; MACD ${m == null ? 'n/a' : m.toFixed(4)} vs signal ${sg == null ? 'n/a' : sg.toFixed(4)}.`,
      lv ? `60-bar range: support ~${fmtPrice(inst, lv.s)}, resistance ~${fmtPrice(inst, lv.r)}.` : '',
    ].filter(Boolean).join('\n');
  };

  return (
    <div className="col fill" style={{ gap: 0 }}>
      <div className="row wrap" style={{ padding: '8px 10px', gap: 6, borderBottom: '1px solid var(--border-subtle)' }}>
        <LinkedPicker frame={frame} update={updateSettings} />
        <div className="tabs" role="group" aria-label="Timeframe">
          {(simple ? (['1h', '4h', '1D', '1W'] as Timeframe[]) : TIMEFRAMES).map((t) => (
            <button key={t} className={`tab ${t === tf ? 'active' : ''}`} style={{ padding: '0 7px' }} onClick={() => updateSettings({ timeframe: t })}>
              {t}
            </button>
          ))}
        </div>
        <select className="select" style={{ width: 100, height: 28 }} value={type} onChange={(e) => updateSettings({ chartType: e.target.value })} aria-label="Chart type">
          <option value="candles">Candles</option>
          <option value="bars">OHLC bars</option>
          <option value="line">Line</option>
          <option value="area">Area</option>
        </select>
        {simple && (
          <button className={`btn sm ${showTools ? 'active' : ''}`} onClick={() => setShowTools((v) => !v)} aria-pressed={showTools} data-tip="Indicators, drawing tools, compare and AI">
            <Settings2 /> Tools
          </button>
        )}
        {tools && (<>
        <div ref={pop.ref} style={{ position: 'relative' }}>
          <button className={`btn sm ${pop.open ? 'active' : ''}`} onClick={pop.toggle} aria-haspopup="dialog">
            <Settings2 /> Indicators
          </button>
          {pop.open && (
            <div className="menu neu-raised col gap-2" style={{ left: 0, right: 'auto', width: 290, padding: 12 }}>
              {([
                ['sma', `SMA (${params.sma})`],
                ['ema', `EMA (${params.ema})`],
                ['bb', `Bollinger (${params.bb}, ${params.bbMult})`],
                ['vwap', 'VWAP (anchored, recent window)'],
                ['sr', 'Support/resistance'],
                ['volume', 'Volume'],
                ['rsi', `RSI (${params.rsi}) pane`],
                ['macd', 'MACD (12,26,9) pane'],
                ['atr', `ATR (${params.atr}) pane`],
              ] as Array<[keyof Indicators, string]>).map(([k, label]) => (
                <label key={k} className="row" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={ind[k]} onChange={(e) => setInd({ [k]: e.target.checked })} /> {label}
                </label>
              ))}
              <div className="divider" />
              <div className="grid g3" style={{ gap: 6 }}>
                {([['sma', 'SMA', 2, 250], ['ema', 'EMA', 2, 250], ['bb', 'BB len', 5, 100], ['rsi', 'RSI', 2, 50], ['atr', 'ATR', 2, 50]] as Array<[keyof Params, string, number, number]>).map(([k, label, lo, hi]) => (
                  <div key={k} className="field">
                    <label>{label}</label>
                    <input className="input num" type="number" min={lo} max={hi} value={params[k]} onChange={(e) => setParam({ [k]: clampInt(Number(e.target.value), lo, hi, DEF_PARAMS[k]) })} />
                  </div>
                ))}
                <div className="field">
                  <label>BB σ</label>
                  <input className="input num" type="number" step={0.5} min={0.5} max={4} value={params.bbMult} onChange={(e) => setParam({ bbMult: Math.max(0.5, Math.min(4, Number(e.target.value) || 2)) })} />
                </div>
              </div>
            </div>
          )}
        </div>
        <InstrumentSelect value={compareId} onChange={(id) => updateSettings({ compareId: id })} filter={(i) => i.id !== inst.id} placeholder="Compare with…" className="compare" />
        {compareId && <button className="btn sm" onClick={() => updateSettings({ compareId: '' })}>Clear compare</button>}
        <button className="btn icon sm" onClick={() => chartRef.current?.timeScale().fitContent()} aria-label="Fit to screen" data-tip="Fit to screen">
          <Maximize />
        </button>
        <button
          className="btn sm"
          onClick={() => {
            useApp.getState().sendToAI({ question: `Explain what this chart shows for ${inst.symbol} on the ${tf} timeframe. Note what is supportive, what is opposing, and what is missing.`, extra: summary() });
            activateApp('ai-copilot');
            useApp.getState().toast({ title: 'Chart summary sent to AI Copilot context', tone: 'success' });
          }}
          data-tip="Copy chart summary to AI context"
        >
          <Bot /> To AI
        </button>
        </>)}
      </div>
      <div className="chart-host" style={{ minHeight: 120 }}>
        <div className="chart-legend">
          <span className="bold" style={{ color: 'var(--text-primary)' }}>{inst.symbol} · {tf}</span>
          {lc && (
            <>
              <span className="muted">O <span className="secondary">{fmtPrice(inst, lc.open)}</span></span>
              <span className="muted">H <span className="secondary">{fmtPrice(inst, lc.high)}</span></span>
              <span className="muted">L <span className="secondary">{fmtPrice(inst, lc.low)}</span></span>
              <span className="muted">C <span className="secondary">{fmtPrice(inst, lc.close)}</span></span>
              {lc.volume > 0 && <span className="muted">V <span className="secondary">{Intl.NumberFormat('en-US', { notation: 'compact' }).format(lc.volume)}</span></span>}
              <Change value={((lc.close - lc.open) / lc.open) * 100} />
            </>
          )}
          {cmpInst && <span style={{ color: colors.ema }}>vs {cmpInst.symbol} (left axis)</span>}
        </div>
        <div ref={mainRef} style={{ position: 'absolute', inset: 0 }} />
        <DrawingLayer chart={api?.chart ?? null} series={api?.series ?? null} candles={candles} drawings={drawings} onChange={setDrawings} tool={tool} setTool={setTool} color={drawColor} precision={inst.precision} />
        {tools && <DrawingToolbar tool={tool} setTool={setTool} color={drawColor} setColor={setDrawColor} count={drawings.length} onClear={() => setDrawings([])} />}
      </div>
      {subs.map((k) => (
        <div key={k} style={{ height: 92, position: 'relative', borderTop: '1px solid var(--border-subtle)' }}>
          <span className="chart-legend tiny muted" style={{ top: 4 }}>{k === 'rsi' ? `RSI(${params.rsi})` : k === 'macd' ? 'MACD(12,26,9)' : `ATR(${params.atr})`}</span>
          <div ref={(el) => (subRefs.current[k] = el)} style={{ position: 'absolute', inset: 0 }} />
        </div>
      ))}
      <div className="row between tiny muted" style={{ padding: '4px 10px', borderTop: '1px solid var(--border-subtle)' }}>
        <span>{inst.quoteCurrency} per {inst.unit} · time (UTC) · scroll to zoom, drag to pan</span>
      </div>
    </div>
  );
}
