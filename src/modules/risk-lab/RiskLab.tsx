import { useEffect, useMemo } from 'react';
import { AlertTriangle, NotebookPen, Wand2 } from 'lucide-react';
import type { ModuleProps } from '../types';
import { useApp } from '../../store/appStore';
import { computeRisk, fxPositionSize, priceToPips, type RiskInput } from '../../lib/risk';
import { fmtMoney, fmtNum, fmtPrice, uid } from '../../lib/formatting';
import { NumberField, Tabs } from '../../components/ui';
import { LinkedPicker, useLinkedInstrument, useMetrics } from '../shared';
import { activateApp } from '../../shell/Sidebar';

const DEFAULT: RiskInput = { capital: 500000, entry: 100, stop: 95, target: 112, riskMode: 'percent', riskPercent: 1, riskAmount: 5000, lotSize: 1, feesPerUnit: 0 };

export default function RiskLab({ frame, updateSettings }: ModuleProps) {
  const { inst } = useLinkedInstrument(frame);
  const m = useMetrics(inst);
  const input: RiskInput = { ...DEFAULT, ...((frame.settings.input as Partial<RiskInput>) ?? {}) };
  const tab = (frame.settings.tab as 'position' | 'fx') ?? (inst.assetClass === 'forex' ? 'fx' : 'position');
  const fx = { accountRisk: 100, stopPips: 25, pipValuePerLot: 10, ...((frame.settings.fx as object) ?? {}) } as { accountRisk: number; stopPips: number; pipValuePerLot: number };
  const set = (p: Partial<RiskInput>) => updateSettings({ input: { ...input, ...p } });
  const res = useMemo(() => computeRisk(input), [JSON.stringify(input)]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = inst.quoteCurrency;
  const { upsertJournal, toast } = useApp.getState();

  const prefill = () => {
    const atr = m.atr14 ?? inst.price * 0.01;
    const round = (n: number) => Number(n.toFixed(inst.precision));
    set({ entry: round(inst.price), stop: round(inst.price - 1.5 * atr), target: round(inst.price + 3 * atr), lotSize: inst.assetClass === 'equity' ? 1 : inst.assetClass === 'crypto' ? 0.001 : 1 });
  };

  // Other modules can request a prefill (e.g. Asset Explorer → "Risk tool").
  const req = frame.settings.prefillAt as number | undefined;
  useEffect(() => {
    if (req) {
      prefill();
      updateSettings({ prefillAt: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  const fxLots = fxPositionSize(fx);
  const stopPips = inst.pipSize ? priceToPips(input.entry - input.stop, inst.pipSize) : null;

  return (
    <div className="module">
      <div className="module-head">
        <LinkedPicker frame={frame} update={updateSettings} />
        <button className="btn sm" onClick={prefill} data-tip="Entry = current price, stop = 1.5×ATR, target = 3×ATR"><Wand2 /> Prefill from {inst.symbol}</button>
        <div style={{ flex: 1 }} />
      </div>
      <Tabs value={tab} onChange={(t) => updateSettings({ tab: t })} options={[{ id: 'position', label: 'Position size & R:R' }, { id: 'fx', label: 'FX lot sizing (pips)' }]} />

      {tab === 'position' ? (
        <div className="grid g2">
          <div className="neu-soft card col gap-2">
            <div className="grid g2">
              <NumberField label="Capital" suffix={cur} value={input.capital} onChange={(n) => set({ capital: n })} />
              <NumberField label="Entry price" suffix={cur} value={input.entry} step={10 ** -inst.precision} onChange={(n) => set({ entry: n })} />
              <NumberField label="Stop-loss" suffix={cur} value={input.stop} step={10 ** -inst.precision} onChange={(n) => set({ stop: n })} />
              <NumberField label="Target" suffix={cur} value={input.target} step={10 ** -inst.precision} onChange={(n) => set({ target: n })} />
            </div>
            <div className="field">
              <label>Risk budget</label>
              <Tabs value={input.riskMode} onChange={(v) => set({ riskMode: v })} options={[{ id: 'percent', label: '% of capital' }, { id: 'fixed', label: 'Fixed amount' }]} />
            </div>
            <div className="grid g3">
              {input.riskMode === 'percent' ? (
                <NumberField label="Risk %" value={input.riskPercent} step={0.1} onChange={(n) => set({ riskPercent: n })} />
              ) : (
                <NumberField label="Risk amount" suffix={cur} value={input.riskAmount} onChange={(n) => set({ riskAmount: n })} />
              )}
              <NumberField label="Qty step / lot" value={input.lotSize} step={0.001} onChange={(n) => set({ lotSize: n })} />
              <NumberField label="Fees+slippage /unit" suffix={cur} value={input.feesPerUnit} step={0.01} onChange={(n) => set({ feesPerUnit: n })} />
            </div>
            <span className="tiny muted">Fees/slippage are round-trip assumptions per unit.</span>
          </div>
          <div className="neu-soft card col gap-2" aria-live="polite">
            {res.errors.length > 0 ? (
              <div className="alert-box error col gap-1">
                <span className="bold row gap-1"><AlertTriangle size={14} /> Check inputs</span>
                <ul className="list-clean small">{res.errors.map((e) => <li key={e}>{e}</li>)}</ul>
              </div>
            ) : (
              <>
                <div className="row between">
                  <span className="section-title">Result</span>
                  <span className={`chip ${res.direction === 'long' ? 'pos' : 'neg'}`}>{res.direction}</span>
                </div>
                <div className="kv">
                  <span>Amount at risk</span><span className="bold">{fmtMoney(res.riskBudget, cur)}</span>
                  <span>Risk per unit</span><span>{fmtMoney(res.riskPerUnit, cur, inst.precision)}</span>
                  <span>Suggested quantity</span><span className="bold accent">{fmtNum(res.quantity, input.lotSize < 1 ? 3 : 0)} {inst.unit}{res.quantity === 1 ? '' : 's'}</span>
                  <span>Position value</span><span>{fmtMoney(res.positionValue, cur)} ({fmtNum(res.capitalUsedPct, 1)}% of capital)</span>
                  <span>Potential loss</span><span className="neg">−{fmtMoney(res.potentialLoss, cur)}</span>
                  <span>Potential gain</span><span className="pos">+{fmtMoney(res.potentialGain, cur)}</span>
                  <span>Reward : risk</span><span className="bold">{res.riskReward == null ? '—' : `${fmtNum(res.riskReward, 2)} : 1`}</span>
                  {stopPips != null && (<><span>Stop distance</span><span>{fmtNum(stopPips, 1)} pips</span></>)}
                </div>
                {res.warnings.map((w) => <div key={w} className="alert-box warning small">{w}</div>)}
                <button className="btn sm" style={{ alignSelf: 'flex-start' }} disabled={res.quantity <= 0} onClick={() => {
                  upsertJournal({ id: uid('j'), instrumentId: inst.id, direction: res.direction ?? 'long', status: 'planned', entry: input.entry, stop: input.stop, target: input.target, quantity: res.quantity, setup: 'From Risk Lab', thesis: '', notes: `Risk ${fmtMoney(res.riskBudget, cur)}, R:R ${fmtNum(res.riskReward, 2)}`, lessons: '', tags: ['risk-lab'], createdAt: new Date().toISOString() });
                  toast({ title: 'Planned paper trade added to Journal', tone: 'success' });
                  activateApp('journal');
                }}><NotebookPen /> Log as planned paper trade</button>
              </>
            )}
            <details className="small secondary">
              <summary style={{ cursor: 'pointer' }}>Formulas</summary>
              <ul className="list-clean tiny">
                <li>Risk budget = capital × risk% (or the fixed amount)</li>
                <li>Risk per unit = |entry − stop| + fees/slippage</li>
                <li>Quantity = floor(risk budget ÷ risk per unit ÷ lot) × lot</li>
                <li>Reward per unit = |target − entry| − fees/slippage</li>
                <li>Reward : risk = reward per unit ÷ risk per unit</li>
              </ul>
            </details>
            <span className="tiny muted">Calculated in code, not by AI. Not a recommendation. No order is placed.</span>
          </div>
        </div>
      ) : (
        <div className="grid g2">
          <div className="neu-soft card col gap-2">
            <NumberField label="Amount to risk" suffix="account ccy" value={fx.accountRisk} onChange={(n) => updateSettings({ fx: { ...fx, accountRisk: n } })} />
            <NumberField label="Stop distance" suffix="pips" value={fx.stopPips} step={0.1} onChange={(n) => updateSettings({ fx: { ...fx, stopPips: n } })} />
            <NumberField label="Pip value per standard lot" suffix="account ccy" value={fx.pipValuePerLot} step={0.01} onChange={(n) => updateSettings({ fx: { ...fx, pipValuePerLot: n } })} />
            <div className="alert-box info small">
              Pip value depends on the pair, lot size and your account currency, so it is configurable here and never hard-coded. {inst.assetClass === 'forex' ? `${inst.symbol} pip size: ${inst.pipSize} (${inst.quoteCurrency} per pip per unit of ${inst.baseCurrency}).` : 'Select a forex pair for pip-size context.'}
            </div>
          </div>
          <div className="neu-soft card col gap-2">
            <span className="section-title">FX sizing</span>
            {fxLots == null ? (
              <div className="alert-box error small">All values must be positive numbers.</div>
            ) : (
              <div className="kv">
                <span>Standard lots</span><span className="bold accent">{fmtNum(fxLots, 2)}</span>
                <span>Mini lots (0.1)</span><span>{fmtNum(fxLots * 10, 1)}</span>
                <span>Micro lots (0.01)</span><span>{fmtNum(fxLots * 100, 0)}</span>
                <span>Units (×100k)</span><span>{fmtNum(fxLots * 100000, 0)}</span>
                {inst.assetClass === 'forex' && (<><span>Current price</span><span>{fmtPrice(inst, inst.price)} {inst.quoteCurrency}</span></>)}
              </div>
            )}
            <span className="tiny muted">Lots = risk ÷ (stop pips × pip value per lot).</span>
          </div>
        </div>
      )}
    </div>
  );
}
