import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BellPlus, Bot, Plus, Save, Trash2, X } from 'lucide-react';
import type { ModuleProps } from '../types';
import { useApp } from '../../store/appStore';
import { ASSET_CLASS_LABEL, ASSET_CLASSES } from '../../data/instruments';
import {
  MA_RELATIONS, runScreen, SCREEN_FIELDS, screenSchema, type ScreenCondition, type ScreenDefinition, type ScreenField, type ScreenOp,
} from '../../lib/calculations/screener';
import { fmtCompact, fmtNum, fmtPrice, uid } from '../../lib/formatting';
import { Change, Empty } from '../../components/ui';
import { confirmAction, promptText } from '../../components/ui';
import { useAllMetrics, useInstruments } from '../shared';
import { activateApp } from '../../shell/Sidebar';

const PRESETS: Array<{ name: string; logic: 'AND' | 'OR'; conditions: Array<Omit<ScreenCondition, 'id'>> }> = [
  { name: 'Uptrend, RSI 50–65', logic: 'AND', conditions: [{ field: 'trend', op: 'is', value: 'uptrend' }, { field: 'rsi14', op: 'between', value: 50, value2: 65 }] },
  { name: 'Oversold (RSI < 35)', logic: 'AND', conditions: [{ field: 'rsi14', op: 'lt', value: 35 }] },
  { name: 'Above SMA50 & day up', logic: 'AND', conditions: [{ field: 'maRelation', op: 'is', value: 'above-sma50' }, { field: 'changePercent', op: 'gt', value: 0 }] },
  { name: 'High volatility (> 40% ann.)', logic: 'AND', conditions: [{ field: 'vol20', op: 'gt', value: 40 }] },
  { name: 'Big movers (|day| > 1.5%)', logic: 'OR', conditions: [{ field: 'changePercent', op: 'gt', value: 1.5 }, { field: 'changePercent', op: 'lt', value: -1.5 }] },
];

const opsFor = (f: ScreenField): ScreenOp[] => (SCREEN_FIELDS[f].kind === 'number' ? ['gt', 'lt', 'between'] : SCREEN_FIELDS[f].kind === 'text' ? ['contains'] : ['is']);
const OP_LABEL: Record<ScreenOp, string> = { gt: '>', lt: '<', between: 'between', is: 'is', contains: 'contains' };

function defaultValue(f: ScreenField): string | number {
  if (f === 'assetClass') return 'gold';
  if (f === 'trend') return 'uptrend';
  if (f === 'maRelation') return 'above-sma50';
  if (f === 'tag') return '';
  if (f === 'rsi14') return 50;
  return 0;
}

type SortKey = 'symbol' | 'price' | 'changePercent' | 'rsi14' | 'vol20' | 'volume' | 'change20d';

export default function Screener({ frame, updateSettings }: ModuleProps) {
  const instruments = useInstruments();
  const metrics = useAllMetrics();
  const screens = useApp((s) => s.screens);
  const selectedId = useApp((s) => s.selectedInstrumentId);
  const { upsertScreen, deleteScreen, selectInstrument, sendToAI, upsertAlert, toast } = useApp.getState();
  const draft = (frame.settings.draft as ScreenDefinition | undefined) ?? { id: 'draft', name: 'Untitled screen', logic: 'AND' as const, conditions: [] };
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'changePercent', dir: -1 });
  const [picked, setPicked] = useState<string[]>([]);
  const setDraft = (d: Partial<ScreenDefinition>) => updateSettings({ draft: { ...draft, ...d } });
  const setCond = (id: string, p: Partial<ScreenCondition>) => setDraft({ conditions: draft.conditions.map((c) => (c.id === id ? { ...c, ...p } : c)) });

  const valid = screenSchema.safeParse(draft).success;
  const results = useMemo(() => {
    const r = runScreen(draft, instruments, metrics);
    const val = (x: (typeof r)[number]) => (sort.key === 'symbol' ? x.inst.symbol : (x.m[sort.key as keyof typeof x.m] as number | null) ?? -Infinity);
    return r.sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir);
  }, [draft, instruments, metrics, sort]);

  const th = (key: SortKey, label: string, right = true) => (
    <th className={`sortable ${right ? 'right' : ''}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : -1 }))}>
      {label} {sort.key === key && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
    </th>
  );

  const save = async () => {
    const name = await promptText({ title: 'Save screen', label: 'Screen name', value: draft.id === 'draft' ? 'My screen' : draft.name });
    if (!name) return;
    const id = draft.id === 'draft' ? uid('scr') : draft.id;
    const def = { ...draft, id, name };
    const res = screenSchema.safeParse(def);
    if (!res.success) return toast({ title: 'Screen is invalid', body: res.error.issues[0].message, tone: 'error' });
    upsertScreen(res.data);
    setDraft({ id, name });
    toast({ title: `Saved screen “${name}”`, tone: 'success' });
  };

  const sendPicked = () => {
    const rows = results.filter((r) => picked.includes(r.inst.id));
    const extra = rows
      .map((r) => `${r.inst.symbol} (${r.inst.assetClass}): price ${fmtPrice(r.inst, r.inst.price)} ${r.inst.quoteCurrency}, day ${r.inst.changePercent.toFixed(2)}%, RSI14 ${fmtNum(r.m.rsi14, 1)}, trend ${r.m.trend}, vol20 ${fmtNum(r.m.vol20, 1)}%, matched: ${r.matched.join('; ') || 'no conditions'}`)
      .join('\n');
    sendToAI({ question: `Explain why these screener results matched "${draft.name}" (${draft.logic} logic) and what each one's main risks are. Use only the supplied data.`, extra: `Screener results:\n${extra}`, autoSend: true });
    activateApp('ai-copilot');
  };

  return (
    <div className="module">
      <div className="module-head">
        <select
          className="select"
          value=""
          aria-label="Load screen"
          onChange={(e) => {
            const v = e.target.value;
            const saved = screens.find((s) => s.id === v);
            if (saved) setDraft(saved);
            const p = PRESETS.find((x) => `preset:${x.name}` === v);
            if (p) setDraft({ id: 'draft', name: p.name, logic: p.logic, conditions: p.conditions.map((c) => ({ ...c, id: uid('c') })) });
          }}
        >
          <option value="">Load screen…</option>
          <optgroup label="Presets">{PRESETS.map((p) => <option key={p.name} value={`preset:${p.name}`}>{p.name}</option>)}</optgroup>
          {screens.length > 0 && <optgroup label="Saved">{screens.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>}
        </select>
        <span className="bold ellipsis">{draft.name}</span>
        <div className="tabs" role="group" aria-label="Logic">
          {(['AND', 'OR'] as const).map((l) => (
            <button key={l} className={`tab ${draft.logic === l ? 'active' : ''}`} onClick={() => setDraft({ logic: l })}>Match {l === 'AND' ? 'all' : 'any'} ({l})</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
      </div>

      <div className="neu-soft card col gap-2">
        {draft.conditions.length === 0 && <span className="small muted">No conditions — all {instruments.length} instruments are shown. Add a filter or load a preset.</span>}
        {draft.conditions.map((c) => {
          const kind = SCREEN_FIELDS[c.field].kind;
          return (
            <div key={c.id} className="cond-row">
              <select className="select" value={c.field} onChange={(e) => {
                const f = e.target.value as ScreenField;
                setCond(c.id, { field: f, op: opsFor(f)[0], value: defaultValue(f), value2: undefined });
              }} aria-label="Field">
                {(Object.keys(SCREEN_FIELDS) as ScreenField[]).map((f) => <option key={f} value={f}>{SCREEN_FIELDS[f].label}</option>)}
              </select>
              <select className="select" value={c.op} onChange={(e) => setCond(c.id, { op: e.target.value as ScreenOp, value2: e.target.value === 'between' ? Number(c.value) + 10 : undefined })} aria-label="Operator">
                {opsFor(c.field).map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
              </select>
              {kind === 'number' ? (
                <input className="input num" type="number" value={String(c.value)} onChange={(e) => setCond(c.id, { value: e.target.value === '' ? 0 : Number(e.target.value) })} aria-label="Value" />
              ) : kind === 'text' ? (
                <input className="input" value={String(c.value)} placeholder="e.g. banking" onChange={(e) => setCond(c.id, { value: e.target.value })} aria-label="Tag" />
              ) : (
                <select className="select" value={String(c.value)} onChange={(e) => setCond(c.id, { value: e.target.value })} aria-label="Value">
                  {c.field === 'assetClass' && ASSET_CLASSES.map((a) => <option key={a} value={a}>{ASSET_CLASS_LABEL[a]}</option>)}
                  {c.field === 'trend' && ['uptrend', 'downtrend', 'sideways'].map((t) => <option key={t}>{t}</option>)}
                  {c.field === 'maRelation' && MA_RELATIONS.map((t) => <option key={t}>{t}</option>)}
                </select>
              )}
              {c.op === 'between' ? (
                <input className="input num" type="number" value={c.value2 ?? ''} onChange={(e) => setCond(c.id, { value2: Number(e.target.value) })} aria-label="Upper value" />
              ) : (
                <span />
              )}
              <button className="btn icon sm ghost" onClick={() => setDraft({ conditions: draft.conditions.filter((x) => x.id !== c.id) })} aria-label="Remove condition"><X /></button>
            </div>
          );
        })}
        <div className="row wrap">
          <button className="btn sm" disabled={draft.conditions.length >= 20} onClick={() => setDraft({ conditions: [...draft.conditions, { id: uid('c'), field: 'rsi14', op: 'gt', value: 50 }] })}><Plus /> Add filter</button>
          <button className="btn sm" onClick={save} disabled={!valid}><Save /> Save screen</button>
          {draft.id !== 'draft' && (
            <button className="btn sm danger" onClick={async () => {
              if (await confirmAction({ title: `Delete screen “${draft.name}”?`, body: 'The saved definition will be removed.', confirmLabel: 'Delete' })) {
                deleteScreen(draft.id);
                setDraft({ id: 'draft' });
              }
            }}><Trash2 /> Delete</button>
          )}
          {draft.id !== 'draft' && (
            <button className="btn sm" onClick={() => {
              upsertAlert({ id: uid('al'), name: `Screen: ${draft.name}`, kind: 'screener', screenId: draft.id, severity: 'info', enabled: true, createdAt: new Date().toISOString() });
              toast({ title: 'Screener alert created', body: 'See Alert Builder.', tone: 'success' });
            }}><BellPlus /> Alert on match</button>
          )}
          <button className="btn sm ghost" onClick={() => setDraft({ id: 'draft', name: 'Untitled screen', conditions: [] })}>Clear</button>
        </div>
      </div>

      <div className="row between">
        <span className="small secondary">{results.length} of {instruments.length} instruments match</span>
        <button className="btn sm primary" disabled={!picked.length} onClick={sendPicked}><Bot /> Send {picked.length || ''} to AI</button>
      </div>
      {results.length === 0 ? (
        <Empty title="No instruments match" hint="Loosen a filter or switch to OR logic." />
      ) : (
        <div className="scroll grow">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 28 }}><input type="checkbox" aria-label="Select all" checked={picked.length > 0 && picked.length === results.length} onChange={(e) => setPicked(e.target.checked ? results.slice(0, 12).map((r) => r.inst.id) : [])} /></th>
                {th('symbol', 'Symbol', false)}
                {th('price', 'Price')}
                {th('changePercent', 'Day %')}
                {th('change20d', '20-bar %')}
                {th('rsi14', 'RSI')}
                {th('vol20', 'Vol %')}
                {th('volume', 'Volume')}
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {results.map(({ inst, m, matched }) => (
                <tr key={inst.id} className={`clickable ${selectedId === inst.id ? 'selected' : ''}`} onClick={() => selectInstrument(inst.id)} title={matched.length ? `Matched: ${matched.join('; ')}` : undefined}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={picked.includes(inst.id)} onChange={() => setPicked((p) => (p.includes(inst.id) ? p.filter((x) => x !== inst.id) : p.length >= 12 ? p : [...p, inst.id]))} aria-label={`Select ${inst.symbol}`} />
                  </td>
                  <td>
                    <span className="bold">{inst.symbol}</span> <span className="tiny muted">{ASSET_CLASS_LABEL[inst.assetClass]}</span>
                  </td>
                  <td className="right mono">{fmtPrice(inst, inst.price)}</td>
                  <td className="right"><Change value={inst.changePercent} /></td>
                  <td className="right"><Change value={m.change20d} /></td>
                  <td className="right">{fmtNum(m.rsi14, 1)}</td>
                  <td className="right">{fmtNum(m.vol20, 1)}</td>
                  <td className="right small">{m.volume != null ? fmtCompact(m.volume) : <span className="muted">n/a</span>}</td>
                  <td><span className={`chip ${m.trend === 'uptrend' ? 'pos' : m.trend === 'downtrend' ? 'neg' : ''}`}>{m.trend}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
