import { useEffect, useMemo, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, Logical, SeriesType } from 'lightweight-charts';
import { Eraser, Minus, MousePointer2, SeparatorVertical, Slash, Square, Trash2, Type } from 'lucide-react';
import type { Candle } from '../../types/market';
import { uid } from '../../lib/formatting';
import { confirmAction, promptText } from '../../components/ui';

export type DrawTool = 'cursor' | 'trend' | 'hline' | 'vline' | 'rect' | 'fib' | 'text' | 'erase';
export interface DrawPoint { t: number; p: number }
export interface Drawing {
  id: string;
  kind: Exclude<DrawTool, 'cursor' | 'erase'>;
  a: DrawPoint;
  b?: DrawPoint;
  text?: string;
  color: string;
}

const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
export const DRAW_COLORS = ['#f3c66b', '#83b8ff', '#63dda5', '#ff747f', '#b292ff', '#e6e9ef'];
const MAX_DRAWINGS = 120;

/** Maps between absolute time and the chart's logical (bar-index) axis, extrapolating beyond the data. */
function useTimeAxis(candles: Candle[]) {
  return useMemo(() => {
    const n = candles.length;
    const step = n > 1 ? candles[n - 1].time - candles[n - 2].time : 86400;
    const toLogical = (t: number): number => {
      if (!n) return 0;
      if (t <= candles[0].time) return (t - candles[0].time) / step;
      if (t >= candles[n - 1].time) return n - 1 + (t - candles[n - 1].time) / step;
      let lo = 0;
      let hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (candles[mid].time <= t) lo = mid;
        else hi = mid;
      }
      return lo + (t - candles[lo].time) / (candles[hi].time - candles[lo].time);
    };
    const toTime = (l: number): number => {
      if (!n) return 0;
      if (l <= 0) return candles[0].time + l * step;
      if (l >= n - 1) return candles[n - 1].time + (l - (n - 1)) * step;
      const i = Math.floor(l);
      return candles[i].time + (l - i) * (candles[i + 1].time - candles[i].time);
    };
    return { toLogical, toTime };
  }, [candles]);
}

export function DrawingLayer({
  chart, series, candles, drawings, onChange, tool, setTool, color, precision,
}: {
  chart: IChartApi | null;
  series: ISeriesApi<SeriesType> | null;
  candles: Candle[];
  drawings: Drawing[];
  onChange: (d: Drawing[]) => void;
  tool: DrawTool;
  setTool: (t: DrawTool) => void;
  color: string;
  precision: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [, setVersion] = useState(0);
  const [pending, setPending] = useState<{ a: DrawPoint; b: DrawPoint; down: { x: number; y: number } } | null>(null);
  const axis = useTimeAxis(candles);
  const redraw = () => setVersion((v) => v + 1);

  // Re-render whenever the chart scrolls, zooms, rescales or resizes.
  useEffect(() => {
    if (!chart) return;
    const ts = chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange(redraw);
    const el = svgRef.current?.parentElement;
    const ro = el ? new ResizeObserver(redraw) : null;
    if (el && ro) ro.observe(el);
    const iv = setInterval(redraw, 700); // catches manual price-axis drags
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(redraw);
      ro?.disconnect();
      clearInterval(iv);
    };
  }, [chart]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPending(null);
        if (tool !== 'cursor') setTool('cursor');
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [tool, setTool]);

  if (!chart || !series) return null;
  const ts = chart.timeScale();
  const paneW = ts.width();
  const paneH = Math.max(0, (svgRef.current?.parentElement?.clientHeight ?? 0) - ts.height());
  const X = (t: number) => ts.logicalToCoordinate(axis.toLogical(t) as Logical);
  const Y = (p: number) => series.priceToCoordinate(p);
  const toPoint = (x: number, y: number): DrawPoint | null => {
    const l = ts.coordinateToLogical(x);
    const p = series.coordinateToPrice(y);
    return l == null || p == null ? null : { t: axis.toTime(l), p };
  };
  const local = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const add = (d: Omit<Drawing, 'id' | 'color'>) => onChange([...drawings, { ...d, id: uid('d'), color }].slice(-MAX_DRAWINGS));
  const fmt = (p: number) => p.toFixed(precision);

  const onDown = async (e: React.PointerEvent) => {
    if (tool === 'cursor' || tool === 'erase') return;
    e.preventDefault();
    const { x, y } = local(e);
    const pt = toPoint(x, y);
    if (!pt) return;
    if (tool === 'hline' || tool === 'vline') {
      add({ kind: tool, a: pt });
      setTool('cursor');
      return;
    }
    if (tool === 'text') {
      setTool('cursor');
      const text = await promptText({ title: 'Chart note', label: 'Text to place on the chart' });
      if (text) add({ kind: 'text', a: pt, text: text.slice(0, 80) });
      return;
    }
    if (pending) {
      add({ kind: tool as Drawing['kind'], a: pending.a, b: pt });
      setPending(null);
      setTool('cursor');
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setPending({ a: pt, b: pt, down: { x, y } });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pending) return;
    const { x, y } = local(e);
    const pt = toPoint(x, y);
    if (pt) setPending({ ...pending, b: pt });
  };
  const onUp = (e: React.PointerEvent) => {
    if (!pending) return;
    const { x, y } = local(e);
    // Drag-to-draw: finish on release; a simple click keeps waiting for the second click.
    if (Math.hypot(x - pending.down.x, y - pending.down.y) > 6) {
      add({ kind: tool as Drawing['kind'], a: pending.a, b: pending.b });
      setPending(null);
      setTool('cursor');
    }
  };

  const shape = (d: Drawing | (Omit<Drawing, 'id'> & { id: string }), preview = false) => {
    const erase = tool === 'erase' && !preview;
    const common = {
      stroke: d.color,
      strokeWidth: erase ? 3 : 1.6,
      style: { pointerEvents: erase ? ('stroke' as const) : ('none' as const), cursor: erase ? 'not-allowed' : undefined },
      onClick: erase ? () => onChange(drawings.filter((x) => x.id !== d.id)) : undefined,
      opacity: preview ? 0.75 : 1,
    };
    const x1 = X(d.a.t);
    const y1 = Y(d.a.p);
    if (d.kind === 'hline') {
      if (y1 == null) return null;
      return (
        <g key={d.id}>
          <line {...common} x1={0} x2={paneW} y1={y1} y2={y1} strokeDasharray="6 4" />
          <text x={paneW - 4} y={y1 - 4} textAnchor="end" fill={d.color} fontSize={11} style={{ pointerEvents: 'none' }}>{fmt(d.a.p)}</text>
        </g>
      );
    }
    if (d.kind === 'vline') return x1 == null ? null : <line key={d.id} {...common} x1={x1} x2={x1} y1={0} y2={paneH} strokeDasharray="6 4" />;
    if (d.kind === 'text') {
      if (x1 == null || y1 == null) return null;
      return (
        <text key={d.id} {...common} x={x1} y={y1} fill={d.color} stroke="none" fontSize={12} fontWeight={600} style={{ pointerEvents: erase ? 'all' : 'none', cursor: erase ? 'not-allowed' : undefined }}>
          {d.text}
        </text>
      );
    }
    if (!d.b) return null;
    const x2 = X(d.b.t);
    const y2 = Y(d.b.p);
    if (x1 == null || y1 == null || x2 == null || y2 == null) return null;
    if (d.kind === 'trend') return <line key={d.id} {...common} x1={x1} y1={y1} x2={x2} y2={y2} />;
    if (d.kind === 'rect')
      return <rect key={d.id} {...common} x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} fill={d.color} fillOpacity={0.1} style={{ pointerEvents: erase ? 'all' : 'none', cursor: erase ? 'not-allowed' : undefined }} />;
    // Fibonacci retracement from a (0%) to b (100%).
    const left = Math.min(x1, x2);
    return (
      <g key={d.id}>
        {FIB.map((f) => {
          const price = d.a.p + (d.b!.p - d.a.p) * f;
          const y = Y(price);
          if (y == null) return null;
          return (
            <g key={f}>
              <line {...common} x1={left} x2={paneW} y1={y} y2={y} strokeWidth={f === 0 || f === 1 ? 1.6 : 1} opacity={0.85} />
              <text x={left + 4} y={y - 3} fill={d.color} fontSize={10} style={{ pointerEvents: 'none' }}>{(f * 100).toFixed(1)}% · {fmt(price)}</text>
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <svg
      ref={svgRef}
      className="draw-layer"
      style={{ pointerEvents: tool === 'cursor' || tool === 'erase' ? 'none' : 'all', cursor: tool === 'cursor' ? undefined : tool === 'erase' ? 'default' : 'crosshair' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      aria-label="Chart drawings"
    >
      <defs>
        <clipPath id="draw-clip">
          <rect x={0} y={0} width={paneW} height={paneH} />
        </clipPath>
      </defs>
      <g clipPath="url(#draw-clip)">
        {drawings.map((d) => shape(d))}
        {pending && shape({ id: 'preview', kind: tool as Drawing['kind'], a: pending.a, b: pending.b, color }, true)}
      </g>
    </svg>
  );
}

/** Vertical drawing toolbar shown on the chart's left edge. */
export function DrawingToolbar({ tool, setTool, color, setColor, count, onClear }: { tool: DrawTool; setTool: (t: DrawTool) => void; color: string; setColor: (c: string) => void; count: number; onClear: () => void }) {
  const items: Array<[DrawTool, React.ReactNode, string]> = [
    ['cursor', <MousePointer2 key="c" />, 'Cursor (pan & zoom)'],
    ['trend', <Slash key="t" />, 'Trend line — click two points or drag'],
    ['hline', <Minus key="h" />, 'Horizontal line (price level)'],
    ['vline', <SeparatorVertical key="v" />, 'Vertical line (date)'],
    ['rect', <Square key="r" />, 'Rectangle / zone'],
    ['fib', <span key="f" className="tiny bold">Fib</span>, 'Fibonacci retracement'],
    ['text', <Type key="x" />, 'Text note'],
    ['erase', <Eraser key="e" />, 'Eraser — click a drawing to delete it'],
  ];
  return (
    <div className="draw-toolbar neu-soft no-drag" role="toolbar" aria-label="Drawing tools">
      {items.map(([id, icon, tip]) => (
        <button key={id} className={`btn icon sm ${tool === id ? 'active' : 'ghost'}`} onClick={() => setTool(tool === id && id !== 'cursor' ? 'cursor' : id)} aria-pressed={tool === id} aria-label={tip} data-tip={tip} data-tip-pos="right">
          {icon}
        </button>
      ))}
      <div className="draw-colors">
        {DRAW_COLORS.map((c) => (
          <button key={c} className={`draw-swatch ${c === color ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Drawing colour ${c}`} />
        ))}
      </div>
      <button
        className="btn icon sm ghost danger"
        disabled={!count}
        aria-label="Clear all drawings"
        data-tip="Clear all drawings"
        data-tip-pos="right"
        onClick={async () => {
          if (await confirmAction({ title: 'Clear all drawings?', body: `Removes ${count} drawing(s) from this instrument.`, confirmLabel: 'Clear' })) onClear();
        }}
      >
        <Trash2 />
      </button>
    </div>
  );
}
