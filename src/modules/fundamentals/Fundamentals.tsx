import type { ModuleProps } from '../types';
import { useApp } from '../../store/appStore';
import { FORMULAS, getFundamentals, peersOf, type AssetFundamentals, type EquityFundamentals } from '../../data/fundamentals';
import { getInstrument } from '../../data/instruments';
import { goldSilverRatio } from '../../lib/calculations/portfolio';
import { fmtNum, fmtPct, fmtPrice } from '../../lib/formatting';
import { Change } from '../../components/ui';
import { LinkedPicker, useInstruments, useLinkedInstrument } from '../shared';
import type { Instrument } from '../../types/market';

function Metric({ label, value, formulaKey }: { label: string; value: string; formulaKey?: string }) {
  const f = formulaKey ? FORMULAS[formulaKey] : undefined;
  return (
    <div className="neu-soft card col" style={{ gap: 2, padding: 10 }} title={f ? `${label}: ${f}` : undefined}>
      <span className="label" style={{ cursor: f ? 'help' : undefined, textDecoration: f ? 'underline dotted' : undefined }}>{label}</span>
      <span className="bold num">{value}</span>
    </div>
  );
}

function QuarterBars({ f }: { f: EquityFundamentals }) {
  const max = Math.max(...f.quarters.map((q) => q.revenue));
  return (
    <div className="neu-soft card col gap-2">
      <span className="section-title">Quarterly revenue & EPS trend</span>
      <div className="row" style={{ alignItems: 'flex-end', height: 120, gap: 6 }}>
        {f.quarters.map((q, i) => {
          const prev = f.quarters[i - 1];
          const up = !prev || q.revenue >= prev.revenue;
          return (
            <div key={q.q} className="col grow" style={{ alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' }} title={`${q.q}: revenue ${fmtNum(q.revenue, 0)} ${f.unitLabel}, EPS ${fmtNum(q.eps, 2)}`}>
              <span className="tiny muted num">{fmtNum(q.eps, 1)}</span>
              <div style={{ width: '100%', height: `${(q.revenue / max) * 80}%`, background: up ? 'var(--positive)' : 'var(--negative)', opacity: 0.75, borderRadius: 6 }} />
              <span className="tiny muted" style={{ whiteSpace: 'nowrap' }}>{q.q}</span>
            </div>
          );
        })}
      </div>
      <span className="tiny muted">Bars: revenue ({f.unitLabel}); labels: EPS. Green = q/q growth.</span>
    </div>
  );
}

function EquityView({ inst, f, all }: { inst: Instrument; f: EquityFundamentals; all: Instrument[] }) {
  const select = useApp((s) => s.selectInstrument);
  const peers = peersOf(inst, all);
  return (
    <>
      <p className="small secondary">{f.overview}</p>
      <div className="grid gauto">
        <Metric label={`Revenue (${f.unitLabel})`} value={fmtNum(f.revenue, 0)} />
        <Metric label={`Net income (${f.unitLabel})`} value={fmtNum(f.netIncome, 0)} />
        <Metric label="Operating margin" value={fmtPct(f.operatingMargin * 100, 1, false)} formulaKey="Operating margin" />
        <Metric label="Net margin" value={fmtPct(f.netMargin * 100, 1, false)} formulaKey="Net margin" />
        <Metric label={`EPS (${f.currency})`} value={fmtNum(f.eps, 2)} formulaKey="EPS" />
        <Metric label="P/E" value={fmtNum(f.pe, 1)} formulaKey="P/E" />
        <Metric label="P/B" value={fmtNum(f.pb, 1)} formulaKey="P/B" />
        <Metric label="ROE" value={fmtPct(f.roe * 100, 1, false)} formulaKey="ROE" />
        <Metric label="Debt/Equity" value={fmtNum(f.debtToEquity, 2)} formulaKey="Debt/Equity" />
        <Metric label={`Free cash flow (${f.unitLabel})`} value={fmtNum(f.freeCashFlow, 0)} formulaKey="Free cash flow" />
        <Metric label="Dividend yield" value={fmtPct(f.dividendYield * 100, 2, false)} formulaKey="Dividend yield" />
      </div>
      <QuarterBars f={f} />
      <div className="neu-soft card col gap-1">
        <span className="section-title">Peer comparison</span>
        {peers.length === 0 ? (
          <span className="small muted">No peers in the catalogue.</span>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Symbol</th><th className="right">Price</th><th className="right">Chg</th><th className="right">P/E</th><th className="right">Net margin</th><th className="right">ROE</th></tr>
            </thead>
            <tbody>
              {[inst, ...peers].map((p) => {
                const pf = getFundamentals(p) as EquityFundamentals;
                return (
                  <tr key={p.id} className={`clickable ${p.id === inst.id ? 'selected' : ''}`} onClick={() => select(p.id)}>
                    <td className="bold">{p.symbol}</td>
                    <td className="right mono">{fmtPrice(p, p.price)} <span className="tiny muted">{p.quoteCurrency}</span></td>
                    <td className="right"><Change value={p.changePercent} /></td>
                    <td className="right">{fmtNum(pf.pe, 1)}</td>
                    <td className="right">{fmtPct(pf.netMargin * 100, 1, false)}</td>
                    <td className="right">{fmtPct(pf.roe * 100, 1, false)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function AssetView({ f }: { inst: Instrument; f: AssetFundamentals }) {
  const gold = getInstrument('XAUUSD');
  const silver = getInstrument('XAGUSD');
  const ratio = gold && silver ? goldSilverRatio(gold.price, silver.price) : null;
  const brent = getInstrument('BRENTUSD');
  const wti = getInstrument('WTIUSD');
  return (
    <>
      <p className="small secondary">{f.overview}</p>
      <div className="grid gauto">
        {f.stats.map((s) => (
          <div key={s.label} className="neu-soft card col" style={{ gap: 2, padding: 10 }} title={s.hint}>
            <span className="label" style={{ cursor: s.hint ? 'help' : undefined, textDecoration: s.hint ? 'underline dotted' : undefined }}>{s.label}</span>
            <span className="bold num">{s.value}</span>
          </div>
        ))}
        {f.kind === 'metal' && ratio != null && (
          <div className="neu-soft card col" style={{ gap: 2, padding: 10 }} title="Gold price ÷ silver price (both USD per troy ounce).">
            <span className="label">Gold/silver ratio</span>
            <span className="bold num">{fmtNum(ratio, 2)}</span>
          </div>
        )}
        {f.kind === 'oil' && brent && wti && (
          <div className="neu-soft card col" style={{ gap: 2, padding: 10 }}>
            <span className="label">Brent − WTI</span>
            <span className="bold num">${fmtNum(brent.price - wti.price, 2)} / bbl</span>
          </div>
        )}
      </div>
      <span className="section-title">Drivers (educational context — not asserted current facts)</span>
      <div className="grid g2">
        {f.drivers.map((d) => (
          <div key={d.title} className="neu-soft card col gap-1">
            <span className="bold">{d.title}</span>
            <span className="small secondary">{d.note}</span>
            <span className="dir unknown">direction: not assessed</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default function Fundamentals({ frame, updateSettings }: ModuleProps) {
  const { inst } = useLinkedInstrument(frame);
  const all = useInstruments();
  const f = getFundamentals(inst);
  return (
    <div className="module">
      <div className="module-head">
        <LinkedPicker frame={frame} update={updateSettings} />
        <div style={{ flex: 1 }} />
        <span className="chip">{f.kind === 'equity' ? 'Company research' : 'Asset drivers'}</span>
      </div>
      <div className="row between">
        <div className="col" style={{ gap: 0 }}>
          <h3>{inst.displayName}</h3>
          <span className="tiny muted">{inst.symbol} · {inst.quoteCurrency} per {inst.unit}</span>
        </div>
        <div className="col" style={{ gap: 0, alignItems: 'flex-end' }}>
          <span className="mono bold">{fmtPrice(inst, inst.price)}</span>
          <Change value={inst.changePercent} />
        </div>
      </div>
      {f.kind === 'equity' ? <EquityView inst={inst} f={f} all={all} /> : <AssetView inst={inst} f={f} />}
    </div>
  );
}
