import { useRef, useState } from 'react';
import { Bot, RotateCcw, Save, Square } from 'lucide-react';
import type { ModuleProps } from '../types';
import { useApp } from '../../store/appStore';
import { computeScenarios, DEFAULT_ASSUMPTIONS, SCENARIO_NOTES, type ScenarioAssumptions } from '../../lib/calculations/scenarios';
import { buildAIContext } from '../../lib/evidence';
import { callAI } from '../../lib/ai-client';
import { fmtNum, fmtPct, fmtPrice } from '../../lib/formatting';
import { Markdown } from '../../components/Markdown';
import { LinkedPicker, useLinkedInstrument, useMetrics } from '../shared';

function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void; fmt: (n: number) => string }) {
  return (
    <div className="field">
      <label>{label} <span className="accent">{fmt(value)}</span></label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

const TONE = { bull: 'var(--positive)', base: 'var(--info)', bear: 'var(--negative)' };

export default function Scenarios({ frame, updateSettings }: ModuleProps) {
  const { inst } = useLinkedInstrument(frame);
  const m = useMetrics(inst);
  const a: ScenarioAssumptions = { ...DEFAULT_ASSUMPTIONS, ...((frame.settings.assumptions as Partial<ScenarioAssumptions>) ?? {}) };
  const set = (p: Partial<ScenarioAssumptions>) => updateSettings({ assumptions: { ...a, ...p } });
  const res = computeScenarios(inst, m.vol20, a);
  const notes = SCENARIO_NOTES[inst.assetClass];
  const [ai, setAi] = useState<{ loading: boolean; text?: string; error?: string }>({ loading: false });
  const abortRef = useRef<AbortController | null>(null);
  const { addNote, toast } = useApp.getState();

  const narrate = async () => {
    abortRef.current = new AbortController();
    setAi({ loading: true });
    const table = res.cases.map((c) => `${c.label}: weight ${c.probability.toFixed(0)}%, move ${c.movePct.toFixed(2)}%, level ${fmtPrice(inst, c.level)}`).join('\n');
    const r = await callAI(
      {
        mode: 'chat',
        style: useApp.getState().aiStyle,
        question: 'Write a short narrative for each scenario (bull/base/bear): plausible drivers, risks, and what would invalidate it. Use no certainty language and do not change the numbers.',
        context: buildAIContext(inst, useApp.getState().timeframe, { technical: true, fundamentals: true, news: true, events: true }, `Scenario table (user assumptions, ${a.horizonDays}-bar horizon):\n${table}`),
      },
      abortRef.current.signal,
    );
    setAi(r.ok ? { loading: false, text: r.text } : { loading: false, error: r.error });
  };

  return (
    <div className="module">
      <div className="module-head">
        <LinkedPicker frame={frame} update={updateSettings} />
        <div style={{ flex: 1 }} />
      </div>
      <div className="grid g2">
        <div className="neu-soft card col gap-2">
          <span className="section-title">Assumptions</span>
          <Slider label="Horizon" value={a.horizonDays} min={1} max={120} step={1} onChange={(n) => set({ horizonDays: n })} fmt={(n) => `${n} bars`} />
          <Slider label="Volatility multiplier" value={a.volMultiplier} min={0.25} max={3} step={0.05} onChange={(n) => set({ volMultiplier: n })} fmt={(n) => `${n.toFixed(2)}×`} />
          <div className="grid g2">
            <Slider label="Bull move" value={a.bullSigma} min={0} max={3} step={0.1} onChange={(n) => set({ bullSigma: n })} fmt={(n) => `+${n.toFixed(1)}σ`} />
            <Slider label="Bear move" value={a.bearSigma} min={0} max={3} step={0.1} onChange={(n) => set({ bearSigma: n })} fmt={(n) => `−${n.toFixed(1)}σ`} />
          </div>
          <Slider label="Base-case drift" value={a.baseDriftPct} min={-10} max={10} step={0.25} onChange={(n) => set({ baseDriftPct: n })} fmt={(n) => fmtPct(n)} />
          <div className="grid g3">
            <Slider label="Bull weight" value={a.bullProb} min={0} max={100} step={1} onChange={(n) => set({ bullProb: n })} fmt={(n) => `${n}`} />
            <Slider label="Base weight" value={a.baseProb} min={0} max={100} step={1} onChange={(n) => set({ baseProb: n })} fmt={(n) => `${n}`} />
            <Slider label="Bear weight" value={a.bearProb} min={0} max={100} step={1} onChange={(n) => set({ bearProb: n })} fmt={(n) => `${n}`} />
          </div>
          {!res.weightsValid && <span className="tiny neg">All weights are zero — using equal weights.</span>}
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => updateSettings({ assumptions: DEFAULT_ASSUMPTIONS })}><RotateCcw /> Reset assumptions</button>
        </div>
        <div className="neu-soft card col gap-2">
          <span className="section-title">Computed (deterministic)</span>
          <div className="kv small">
            <span>Current price</span><span>{fmtPrice(inst, inst.price)} {inst.quoteCurrency}</span>
            <span>Realised vol</span><span>{m.vol20 == null ? 'n/a → 20% default' : `${fmtNum(m.vol20, 1)}% ann.`}</span>
            <span>1σ over horizon</span><span>{fmtPct(res.sigmaPct, 2, false)}</span>
            <span>Weighted move</span><span>{fmtPct(res.weightedMovePct)}</span>
          </div>
          <p className="tiny muted">σ = annual vol × √(horizon ÷ periods per year) × multiplier. Weights are normalised to 100%.</p>
          {res.cases.map((c) => (
            <div key={c.id} className="col gap-1">
              <div className="row between small">
                <span className="bold" style={{ color: TONE[c.id] }}>{c.label}</span>
                <span className="num">{c.probability.toFixed(0)}% · {fmtPct(c.movePct)} → <b className="mono">{fmtPrice(inst, c.level)}</b></span>
              </div>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${c.probability}%`, background: TONE[c.id] }} /></div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid g3">
        {res.cases.map((c) => (
          <div key={c.id} className="scenario-col neu-soft" style={{ borderTop: `3px solid ${TONE[c.id]}` }}>
            <span className="bold">{c.label}</span>
            <span className="section-title">Drivers</span>
            <ul className="list-clean small">{notes[c.id].drivers.map((d) => <li key={d}>{d}</li>)}</ul>
            <span className="section-title">Risks</span>
            <ul className="list-clean small">{notes[c.id].risks.map((d) => <li key={d}>{d}</li>)}</ul>
            <span className="section-title">Invalidation</span>
            <ul className="list-clean small">{notes[c.id].invalidation.map((d) => <li key={d}>{d}</li>)}</ul>
          </div>
        ))}
      </div>
      <div className="neu-soft card col gap-2">
        <div className="row between">
          <span className="section-title">AI narrative (optional)</span>
          {ai.loading ? <button className="btn sm" onClick={() => abortRef.current?.abort()}><Square /> Stop</button> : <button className="btn sm primary" onClick={narrate}><Bot /> Narrate scenarios</button>}
        </div>
        {ai.loading && <div className="row small secondary"><span className="spinner" /> Writing narratives…</div>}
        {ai.error && <div className="alert-box error row between"><span>{ai.error}</span><button className="btn sm" onClick={narrate}><RotateCcw /> Retry</button></div>}
        {ai.text && (
          <>
            <Markdown text={ai.text} />
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => { addNote({ title: `Scenarios: ${inst.symbol}`, body: ai.text!, kind: 'ai-response', folder: 'Scenarios', tags: ['scenario', inst.symbol], instrumentId: inst.id }); toast({ title: 'Saved to notebook', tone: 'success' }); }}><Save /> Save</button>
          </>
        )}
      </div>
    </div>
  );
}
