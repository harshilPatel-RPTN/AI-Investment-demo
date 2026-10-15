import { useMemo, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { ModuleProps } from '../types';
import { useApp } from '../../store/appStore';
import { ASSET_CLASS_LABEL, getInstrument } from '../../data/instruments';
import { DEMO_FX_TO_INR, type Holding } from '../../data/portfolios';
import { computePortfolio } from '../../lib/calculations/portfolio';
import { fmtMoney, fmtNum, fmtPct, fmtPrice, uid } from '../../lib/formatting';
import { Change, confirmAction, Empty, InstrumentSelect, Stat } from '../../components/ui';
import { useInstruments } from '../shared';

const CLASS_COLORS = ['var(--accent)', 'var(--info)', 'var(--warning)', '#b292ff', 'var(--negative)', '#ff9f5a', 'var(--text-secondary)'];

function HoldingForm({ initial, onSave, onCancel }: { initial: Holding; onSave: (h: Holding) => void; onCancel: () => void }) {
  const [h, setH] = useState(initial);
  const inst = getInstrument(h.instrumentId);
  const valid = Number.isFinite(h.quantity) && h.quantity > 0 && Number.isFinite(h.avgCost) && h.avgCost > 0 && !!inst;
  return (
    <tr>
      <td colSpan={2}><InstrumentSelect value={h.instrumentId} onChange={(id) => setH({ ...h, instrumentId: id, avgCost: getInstrument(id)?.price ?? h.avgCost })} /></td>
      <td><input className={`input num ${h.quantity > 0 ? '' : 'invalid'}`} type="number" step="any" value={Number.isFinite(h.quantity) ? h.quantity : ''} onChange={(e) => setH({ ...h, quantity: Number(e.target.value) })} aria-label="Quantity" /></td>
      <td><input className={`input num ${h.avgCost > 0 ? '' : 'invalid'}`} type="number" step="any" value={Number.isFinite(h.avgCost) ? h.avgCost : ''} onChange={(e) => setH({ ...h, avgCost: Number(e.target.value) })} aria-label="Average cost" /></td>
      <td colSpan={4} className="right">
        <div className="row end gap-1">
          <button className="btn sm primary" disabled={!valid} onClick={() => onSave(h)}><Check /> Save</button>
          <button className="btn sm" onClick={onCancel}><X /> Cancel</button>
        </div>
      </td>
    </tr>
  );
}

export default function Portfolio(_: ModuleProps) {
  const instruments = useInstruments();
  const holdings = useApp((s) => s.holdings);
  const { upsertHolding, deleteHolding, selectInstrument } = useApp.getState();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const map = useMemo(() => new Map(instruments.map((i) => [i.id, i])), [instruments]);
  const p = useMemo(() => computePortfolio(holdings, map, DEMO_FX_TO_INR), [holdings, map]);

  return (
    <div className="module">
      <div className="module-head">
        <span className="title">Portfolio</span>
        <span className="tiny muted">Reporting currency INR (fixed FX)</span>
        <div style={{ flex: 1 }} />
      </div>
      <div className="grid g4">
        <Stat label="Market value" value={fmtMoney(p.totalValue, 'INR', 0)} />
        <Stat label="Cost basis" value={fmtMoney(p.totalCost, 'INR', 0)} />
        <Stat label="Unrealised P&L" value={<span className={p.totalPnl >= 0 ? 'pos' : 'neg'}>{fmtMoney(p.totalPnl, 'INR', 0)}</span>} sub={fmtPct(p.totalPnlPct)} />
        <Stat label="Positions" value={p.rows.length} sub={`${p.byClass.length} asset classes`} />
      </div>
      {p.byClass.length > 0 && (
        <div className="neu-soft card col gap-2">
          <span className="section-title">Asset-class exposure</span>
          <div className="row" style={{ height: 12, borderRadius: 6, overflow: 'hidden', gap: 0 }}>
            {p.byClass.map((c, i) => <div key={c.assetClass} style={{ width: `${c.weight}%`, background: CLASS_COLORS[i % CLASS_COLORS.length], height: '100%' }} title={`${ASSET_CLASS_LABEL[c.assetClass]} ${c.weight.toFixed(1)}%`} />)}
          </div>
          <div className="row wrap gap-3 small">
            {p.byClass.map((c, i) => (
              <span key={c.assetClass} className="row gap-1"><span style={{ width: 10, height: 10, borderRadius: 3, background: CLASS_COLORS[i % CLASS_COLORS.length] }} />{ASSET_CLASS_LABEL[c.assetClass]} {fmtNum(c.weight, 1)}%</span>
            ))}
          </div>
        </div>
      )}
      {p.rows.length === 0 && !adding ? (
        <Empty title="No holdings" hint="Add a position below." />
      ) : (
        <div className="scroll">
          <table className="table">
            <thead>
              <tr><th>Instrument</th><th>Class</th><th className="right">Qty</th><th className="right">Avg cost</th><th className="right">Price</th><th className="right">Unrealised P&L</th><th className="right">Weight</th><th /></tr>
            </thead>
            <tbody>
              {p.rows.map((r) =>
                editing === r.holding.id ? (
                  <HoldingForm key={r.holding.id} initial={r.holding} onCancel={() => setEditing(null)} onSave={(h) => { upsertHolding(h); setEditing(null); }} />
                ) : (
                  <tr key={r.holding.id} className="clickable" onClick={() => selectInstrument(r.inst.id)}>
                    <td><span className="bold">{r.inst.symbol}</span> <span className="tiny muted">{r.inst.quoteCurrency}/{r.inst.unit}</span></td>
                    <td><span className="chip">{ASSET_CLASS_LABEL[r.inst.assetClass]}</span></td>
                    <td className="right num">{fmtNum(r.holding.quantity, r.holding.quantity % 1 ? 3 : 0)}</td>
                    <td className="right mono">{fmtPrice(r.inst, r.holding.avgCost)}</td>
                    <td className="right mono">{fmtPrice(r.inst, r.inst.price)} <Change value={r.inst.changePercent} /></td>
                    <td className={`right ${r.pnl >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(r.pnl, r.inst.quoteCurrency, r.inst.precision > 2 ? 2 : r.inst.precision)} <span className="tiny">({fmtPct(r.pnlPct)})</span></td>
                    <td className="right">{fmtNum(r.weight, 1)}%</td>
                    <td className="right" onClick={(e) => e.stopPropagation()}>
                      <button className="btn icon sm ghost" aria-label="Edit holding" data-tip="Edit" onClick={() => setEditing(r.holding.id)}><Pencil /></button>
                      <button className="btn icon sm ghost danger" aria-label="Remove holding" data-tip="Remove" onClick={async () => {
                        if (await confirmAction({ title: `Remove ${r.inst.symbol}?`, body: 'This holding will be deleted.', confirmLabel: 'Remove' })) deleteHolding(r.holding.id);
                      }}><Trash2 /></button>
                    </td>
                  </tr>
                ),
              )}
              {adding && <HoldingForm initial={{ id: uid('h'), instrumentId: 'XAUUSD', quantity: 1, avgCost: getInstrument('XAUUSD')?.price ?? 100 }} onCancel={() => setAdding(false)} onSave={(h) => { upsertHolding(h); setAdding(false); }} />}
            </tbody>
          </table>
        </div>
      )}
      <div className="row between">
        <button className="btn sm" onClick={() => setAdding(true)} disabled={adding}><Plus /> Add holding</button>
        <span className="tiny muted">FX to INR: {Object.entries(DEMO_FX_TO_INR).filter(([k]) => k !== 'INR').map(([k, v]) => `${k} ${v}`).join(' · ')}</span>
      </div>
    </div>
  );
}
