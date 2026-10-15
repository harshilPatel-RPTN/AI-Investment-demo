import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, History, Play, Plus, RotateCcw, Square, Wand2, X } from 'lucide-react';
import type { ModuleProps } from '../types';
import { useApp } from '../../store/appStore';
import { useWorkspace } from '../../workspace/WorkspaceStore';
import { getSeries } from '../../data/priceSeries';
import { ASSET_CLASS_LABEL, ASSET_CLASSES } from '../../data/instruments';
import { callAI } from '../../lib/ai-client';
import { defaultParams, evaluateRules, RULE_DEFS, RULE_TYPES, ruleSchema, validateRule, describeRule, type RuleType, type StrategyRule } from '../../lib/calculations/strategy';
import { fmtPrice, uid } from '../../lib/formatting';
import { Change, Empty } from '../../components/ui';
import { useInstruments } from '../shared';

interface Draft {
  explanation?: string;
  unsupported: string[];
  rejected: string[];
}

const EXAMPLES = [
  'Find uptrending assets where price is above the 50-day average and RSI is between 50 and 65',
  'Oversold pullbacks: RSI below 35 but price still above the 200-day SMA',
  'Momentum: 20-day SMA above 50-day SMA and MACD above signal, buy with 3x leverage when earnings beat',
];

export default function Strategy({ frame, updateSettings }: ModuleProps) {
  const instruments = useInstruments();
  const rules = useApp((s) => s.strategyRules);
  const logic = useApp((s) => s.strategyLogic);
  const { set, toast } = useApp.getState();
  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState<Draft>({ unsupported: [], rejected: [] });
  const [state, setState] = useState<{ loading: boolean; error?: string }>({ loading: false });
  const [ran, setRan] = useState(false);
  const classFilter = (frame.settings.classFilter as string) ?? '';
  const abortRef = useRef<AbortController | null>(null);
  const setRules = (r: StrategyRule[]) => {
    set({ strategyRules: r });
    setRan(false);
  };

  const errors = rules.flatMap((r) => validateRule(r).map((e) => ({ id: r.id, e })));
  const valid = rules.length > 0 && errors.length === 0;

  const results = useMemo(() => {
    if (!ran || !valid) return [];
    return instruments
      .filter((i) => !classFilter || i.assetClass === classFilter)
      .map((inst) => ({ inst, ...evaluateRules(getSeries(inst.id, '1D'), rules, logic) }))
      .sort((a, b) => Number(b.matched) - Number(a.matched) || b.details.filter((d) => d.result).length - a.details.filter((d) => d.result).length);
  }, [ran, valid, instruments, rules, logic, classFilter]);

  const draftWithAI = async () => {
    const q = prompt.trim();
    if (!q || state.loading) return;
    abortRef.current = new AbortController();
    setState({ loading: true });
    const res = await callAI({ mode: 'strategy', question: q, style: 'balanced', context: { extra: 'Only structured screening rules are allowed. These rules will be evaluated on daily bars; they are never orders.' } }, abortRef.current.signal);
    if (!res.ok || !res.rules) return setState({ loading: false, error: res.error ?? 'No rules returned.' });
    const out = res.rules as { supported: boolean; explanation: string; logic: 'AND' | 'OR'; rules: Array<{ type: string; params: Record<string, number> }>; unsupportedParts: string[] };
    const accepted: StrategyRule[] = [];
    const rejected: string[] = [];
    for (const r of out.rules) {
      const parsed = ruleSchema.safeParse({ id: uid('r'), type: r.type, params: { ...(RULE_TYPES.includes(r.type as RuleType) ? defaultParams(r.type as RuleType) : {}), ...r.params } });
      if (!parsed.success) rejected.push(`Unsupported rule type "${r.type}" — ignored.`);
      else {
        const errs = validateRule(parsed.data);
        if (errs.length) rejected.push(...errs);
        accepted.push(parsed.data);
      }
    }
    setRules(accepted);
    set({ strategyLogic: out.logic });
    setDraft({ explanation: out.explanation, unsupported: out.unsupportedParts, rejected });
    setState({ loading: false });
  };

  return (
    <div className="module">
      <div className="neu-soft card col gap-2">
        <div className="row between">
          <span className="section-title">Describe a strategy idea in plain language</span>
        </div>
        <textarea className="input" rows={2} maxLength={1000} value={prompt} placeholder="e.g. price above SMA 50 and RSI between 50 and 65" onChange={(e) => setPrompt(e.target.value)} />
        <div className="row wrap gap-1">
          {EXAMPLES.map((e) => <button key={e} className="chip clickable" style={{ height: 'auto', padding: '3px 8px', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => setPrompt(e)}>{e}</button>)}
        </div>
        <div className="row">
          {state.loading ? (
            <button className="btn" onClick={() => abortRef.current?.abort()}><Square /> Stop</button>
          ) : (
            <button className="btn primary" disabled={!prompt.trim()} onClick={draftWithAI}><Wand2 /> Draft rules with AI</button>
          )}
          <span className="tiny muted">The AI may only use the supported rule types below. Everything is validated before it can run.</span>
        </div>
        {state.loading && <div className="row small secondary"><span className="spinner" /> Translating into structured rules…</div>}
        {state.error && <div className="alert-box error row between"><span>{state.error}</span><button className="btn sm" onClick={draftWithAI}><RotateCcw /> Retry</button></div>}
        {draft.explanation && <p className="small secondary">{draft.explanation}</p>}
        {draft.unsupported.length > 0 && (
          <div className="alert-box warning small col gap-1">
            <span className="row gap-1 bold"><AlertTriangle size={14} /> Not supported (explained, not invented):</span>
            <ul className="list-clean">{draft.unsupported.map((u) => <li key={u}>{u}</li>)}</ul>
          </div>
        )}
        {draft.rejected.length > 0 && <div className="alert-box error small">{draft.rejected.join(' ')}</div>}
      </div>

      <div className="neu-soft card col gap-2">
        <div className="row between">
          <span className="section-title">Editable rules</span>
          <div className="tabs">
            {(['AND', 'OR'] as const).map((l) => <button key={l} className={`tab ${logic === l ? 'active' : ''}`} onClick={() => { set({ strategyLogic: l }); setRan(false); }}>{l === 'AND' ? 'All must match' : 'Any may match'}</button>)}
          </div>
        </div>
        {rules.length === 0 && <span className="small muted">No rules yet — draft with AI or add manually.</span>}
        {rules.map((r) => {
          const pdefs = RULE_DEFS[r.type].params as Record<string, { min: number; max: number }>;
          const errs = validateRule(r);
          return (
            <div key={r.id} className="col gap-1">
              <div className="rule-row">
                <select className="select" value={r.type} onChange={(e) => setRules(rules.map((x) => (x.id === r.id ? { ...x, type: e.target.value as RuleType, params: defaultParams(e.target.value as RuleType) } : x)))} aria-label="Rule type">
                  {RULE_TYPES.map((t) => <option key={t} value={t}>{RULE_DEFS[t].label}</option>)}
                </select>
                <div className="row gap-1">
                  {Object.entries(pdefs).map(([k, lim]) => (
                    <label key={k} className="row gap-1 small" style={{ flex: 1 }}>
                      <span className="muted">{k}</span>
                      <input className={`input num ${errs.length ? 'invalid' : ''}`} type="number" min={lim.min} max={lim.max} value={r.params[k] ?? ''} onChange={(e) => setRules(rules.map((x) => (x.id === r.id ? { ...x, params: { ...x.params, [k]: Number(e.target.value) } } : x)))} />
                    </label>
                  ))}
                  {Object.keys(pdefs).length === 0 && <span className="small muted">no parameters</span>}
                </div>
                <span className="chip mono tiny">{r.type}</span>
                <button className="btn icon sm ghost" onClick={() => setRules(rules.filter((x) => x.id !== r.id))} aria-label="Remove rule"><X /></button>
              </div>
              {errs.length > 0 && <span className="tiny neg">{errs.join(' ')}</span>}
            </div>
          );
        })}
        <div className="row wrap">
          <button className="btn sm" disabled={rules.length >= 10} onClick={() => setRules([...rules, { id: uid('r'), type: 'priceAboveSMA', params: defaultParams('priceAboveSMA') }])}><Plus /> Add rule</button>
          <select className="select" value={classFilter} onChange={(e) => { updateSettings({ classFilter: e.target.value }); setRan(false); }} aria-label="Universe">
            <option value="">All asset classes</option>
            {ASSET_CLASSES.map((a) => <option key={a} value={a}>{ASSET_CLASS_LABEL[a]}</option>)}
          </select>
          <button className="btn sm primary" disabled={!valid} onClick={() => setRan(true)}><Play /> Run on local data</button>
          <button className="btn sm" disabled={!valid} onClick={() => { useWorkspace.getState().openApp('backtest'); toast({ title: 'Rules sent to Backtest Lab', tone: 'success' }); }}><History /> Backtest</button>
          {!valid && rules.length > 0 && <span className="tiny neg">Fix validation errors before running.</span>}
        </div>
      </div>

      {ran && valid && (
        results.length === 0 ? <Empty title="No instruments in this universe" /> : (
          <div className="scroll">
            <div className="small secondary" style={{ marginBottom: 6 }}>{results.filter((r) => r.matched).length} of {results.length} instruments match ({logic}) on the latest daily bar.</div>
            <table className="table">
              <thead><tr><th>Instrument</th><th className="right">Price</th><th className="right">Day</th><th>Result</th><th>Conditions</th></tr></thead>
              <tbody>
                {results.map(({ inst, matched, details }) => (
                  <tr key={inst.id} className="clickable" onClick={() => useApp.getState().selectInstrument(inst.id)}>
                    <td className="bold">{inst.symbol}</td>
                    <td className="right mono">{fmtPrice(inst, inst.price)}</td>
                    <td className="right"><Change value={inst.changePercent} /></td>
                    <td><span className={`chip ${matched ? 'pos' : ''}`}>{matched ? 'match' : 'no match'}</span></td>
                    <td className="small" style={{ whiteSpace: 'normal' }}>
                      {details.map((d) => (
                        <span key={d.rule.id} className={d.result === true ? 'pos' : d.result === false ? 'neg' : 'muted'} style={{ marginRight: 8 }} title={d.result == null ? 'Insufficient data' : undefined}>
                          {d.result === true ? '✓' : d.result === false ? '✗' : '?'} {describeRule(d.rule)}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
