import { useMemo, useState } from 'react';
import { Play, Wand2 } from 'lucide-react';
import type { ModuleProps } from '../types';
import { useApp } from '../../store/appStore';
import { getSeries } from '../../data/priceSeries';
import { runBacktest, type BacktestResult } from '../../lib/calculations/backtest';
import { describeRule, validateRule } from '../../lib/calculations/strategy';
import { fmtDate, fmtMoney, fmtNum, fmtPct } from '../../lib/formatting';
import { Empty, NumberField, Stat } from '../../components/ui';
import { LinkedPicker, useLinkedInstrument } from '../shared';
import { activateApp } from '../../shell/Sidebar';

function EquityCurve({ r, initial }: { r: BacktestResult; initial: number }) {
  const w = 600;
  const h = 160;
  const vals = r.equity.map((e) => e.value);
  if (vals.length < 2) return null;
  const min = Math.min(...vals, initial);
  const max = Math.max(...vals, initial);
  const span = max - min || 1;
  const x = (i: number) => (i / (vals.length - 1)) * w;
  const y = (v: number) => h - ((v - min) / span) * (h - 10) - 5;
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const up = vals[vals.length - 1] >= initial;
  return (
    <svg className="equity-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Equity curve">
      <line x1={0} x2={w} y1={y(initial)} y2={y(initial)} stroke="var(--text-muted)" strokeDasharray="4 4" strokeWidth={1} />
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={up ? 'var(--positive)' : 'var(--negative)'} opacity={0.12} />
      <path d={d} fill="none" stroke={up ? 'var(--positive)' : 'var(--negative)'} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function Backtest({ frame, updateSettings }: ModuleProps) {
  const { inst } = useLinkedInstrument(frame);
  const rules = useApp((s) => s.strategyRules);
  const logic = useApp((s) => s.strategyLogic);
  const epoch = useApp((s) => s.dataEpoch);
  const candles = useMemo(() => getSeries(inst.id, '1D'), [inst.id, epoch]);
  const cfg = { initialCapital: 100000, feeBps: 5, slippageBps: 5, lookback: 250, ...((frame.settings.cfg as object) ?? {}) } as { initialCapital: number; feeBps: number; slippageBps: number; lookback: number };
  const setCfg = (p: Partial<typeof cfg>) => updateSettings({ cfg: { ...cfg, ...p } });
  const [result, setResult] = useState<{ r: BacktestResult; key: string } | null>(null);
  const valid = rules.length > 0 && rules.every((r) => validateRule(r).length === 0);
  const inputsOk = cfg.initialCapital > 0 && cfg.feeBps >= 0 && cfg.slippageBps >= 0 && cfg.lookback >= 30;
  const key = JSON.stringify([inst.id, rules, logic, cfg, epoch]);

  const run = () => {
    const lb = Math.min(Math.max(30, Math.round(cfg.lookback)), candles.length - 1);
    const r = runBacktest(candles, rules, { initialCapital: cfg.initialCapital, feeBps: cfg.feeBps, slippageBps: cfg.slippageBps, startIndex: candles.length - lb, endIndex: candles.length - 1, logic });
    setResult({ r, key });
  };
  const r = result?.r;
  const stale = result && result.key !== key;
  const start = candles[Math.max(0, candles.length - Math.max(30, Math.round(cfg.lookback)))];
  const end = candles[candles.length - 1];

  return (
    <div className="module">
      <div className="module-head">
        <LinkedPicker frame={frame} update={updateSettings} />
        <div style={{ flex: 1 }} />
      </div>
      <div className="neu-soft card col gap-2">
        <div className="row between">
          <span className="section-title">Rules from Strategy Copilot ({logic})</span>
          <button className="btn sm" onClick={() => activateApp('strategy')}><Wand2 /> Edit rules</button>
        </div>
        {rules.length === 0 ? (
          <span className="small muted">No rules yet. Draft or add them in Strategy Copilot.</span>
        ) : (
          <div className="row wrap gap-1">{rules.map((x) => <span key={x.id} className={`chip ${validateRule(x).length ? 'neg' : 'accent'}`}>{describeRule(x)}</span>)}</div>
        )}
        <div className="grid g4">
          <NumberField label="Initial capital" value={cfg.initialCapital} onChange={(n) => setCfg({ initialCapital: n })} invalid={!(cfg.initialCapital > 0)} />
          <NumberField label="Fee" suffix="bps/side" value={cfg.feeBps} step={0.5} onChange={(n) => setCfg({ feeBps: n })} invalid={!(cfg.feeBps >= 0)} />
          <NumberField label="Slippage" suffix="bps/side" value={cfg.slippageBps} step={0.5} onChange={(n) => setCfg({ slippageBps: n })} invalid={!(cfg.slippageBps >= 0)} />
          <NumberField label="Date range" suffix="last N daily bars" value={cfg.lookback} min={30} max={candles.length - 1} onChange={(n) => setCfg({ lookback: n })} invalid={!(cfg.lookback >= 30)} />
        </div>
        <div className="row between">
          <span className="tiny muted">{start && end ? `${fmtDate(start.time * 1000)} → ${fmtDate(end.time * 1000)}` : ''}</span>
          <button className="btn primary sm" disabled={!valid || !inputsOk} onClick={run}><Play /> Run backtest</button>
        </div>
      </div>
      {!r ? (
        <Empty title="No backtest run yet" hint={valid ? 'Set assumptions and press Run.' : 'Add valid rules first.'} />
      ) : (
        <>
          {stale && <div className="alert-box info small">Inputs changed since this run — press Run to refresh.</div>}
          <div className="grid g4">
            <Stat label="Net P&L" value={<span className={r.netPnl >= 0 ? 'pos' : 'neg'}>{fmtMoney(r.netPnl, inst.quoteCurrency, 0)}</span>} sub={fmtPct(r.netReturnPct)} />
            <Stat label="Trades" value={r.trades.length} sub={`Win rate ${r.winRate == null ? '—' : `${fmtNum(r.winRate, 0)}%`}`} />
            <Stat label="Max drawdown" value={<span className="neg">{fmtPct(-r.maxDrawdownPct)}</span>} sub={`Exposure ${fmtNum(r.exposurePct, 0)}%`} />
            <Stat label="Avg trade return" value={fmtPct(r.avgReturnPct)} sub={`Buy & hold ${fmtPct(r.buyHoldReturnPct)}`} />
          </div>
          <div className="neu-soft card col gap-1">
            <span className="section-title">Equity curve</span>
            <EquityCurve r={r} initial={cfg.initialCapital} />
          </div>
          {r.trades.length > 0 && (
            <div className="scroll" style={{ maxHeight: 220 }}>
              <table className="table small">
                <thead><tr><th>#</th><th>Entry</th><th>Exit</th><th className="right">Entry px</th><th className="right">Exit px</th><th className="right">Return</th></tr></thead>
                <tbody>
                  {r.trades.map((t, i) => (
                    <tr key={i}><td>{i + 1}</td><td>{fmtDate(t.entryTime * 1000)}</td><td>{fmtDate(t.exitTime * 1000)}</td><td className="right mono">{fmtNum(t.entryPrice, inst.precision)}</td><td className="right mono">{fmtNum(t.exitPrice, inst.precision)}</td><td className={`right ${t.returnPct >= 0 ? 'pos' : 'neg'}`}>{fmtPct(t.returnPct)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <details className="neu-soft card small secondary">
        <summary style={{ cursor: 'pointer' }} className="bold">Assumptions & limitations</summary>
        <ul className="list-clean tiny">
          <li>Long-only. Signal evaluated on a bar's close; entry/exit at the next bar's open. Fully invested while in a position.</li>
          <li>Fees and slippage applied per side in basis points. No taxes, financing, gaps beyond the bar, or liquidity limits.</li>
          <li>Any open position is closed at the final close for reporting.</li>
        </ul>
      </details>
    </div>
  );
}
