import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Cpu, Download, FileJson, FileText, Printer, RotateCcw, Save, Square } from 'lucide-react';
import type { ModuleProps } from '../types';
import type { AIAnalysis } from '../../types/ai';
import { useApp, type SavedReport } from '../../store/appStore';
import { getInstrument } from '../../data/instruments';
import { buildAIContext, buildEvidence, localAnalysis } from '../../lib/evidence';
import { computeMetrics } from '../../lib/calculations/metrics';
import { computeScenarios, DEFAULT_ASSUMPTIONS } from '../../lib/calculations/scenarios';
import { callAI } from '../../lib/ai-client';
import { downloadFile } from '../../lib/persistence';
import { fmtPct, fmtPrice, fmtTime, uid } from '../../lib/formatting';
import { BiasBadge, analysisToMarkdown } from '../../components/AnalysisCard';
import { Empty } from '../../components/ui';
import { useLinkedInstrument } from '../shared';

function List({ items }: { items: string[] }) {
  if (!items.length) return <p className="small muted">None supplied.</p>;
  return (
    <ul className="list-clean small">
      {items.map((t, i) => <li key={i}>{t}</li>)}
    </ul>
  );
}

function ReportBody({ r }: { r: SavedReport }) {
  const inst = getInstrument(r.instrumentId);
  if (!inst) return <Empty title="Instrument no longer exists" />;
  const a: AIAnalysis = r.analysis;
  const m = computeMetrics(inst, r.timeframe);
  const sc = computeScenarios(inst, m.vol20, DEFAULT_ASSUMPTIONS);
  const ev = buildEvidence(inst, r.timeframe);
  return (
    <article className="report col gap-2">
      <div className="row between top">
        <div className="col" style={{ gap: 2 }}>
          <h2>Research report: {inst.symbol}</h2>
          <span className="small secondary">{inst.displayName} · {r.timeframe} · created {fmtTime(r.createdAt)}</span>
        </div>
        <div className="col" style={{ alignItems: 'flex-end', gap: 4 }}>
          <span className="chip">{r.source === 'ai' ? `AI (${r.model ?? 'Gemini'})` : 'Local rule-based (AI not used)'}</span>
        </div>
      </div>
      <section>
        <span className="section-title">Question</span>
        <p>{r.question}</p>
      </section>
      <section>
        <div className="row gap-2"><span className="section-title">Summary</span><BiasBadge bias={a.bias} /></div>
        <p>{a.summary}</p>
      </section>
      <section>
        <span className="section-title">Current snapshot</span>
        <div className="kv small">
          <span>Price</span><span>{fmtPrice(inst, inst.price)} {inst.quoteCurrency} per {inst.unit}</span>
          <span>Day change</span><span>{fmtPct(inst.changePercent)}</span>
          <span>Day range</span><span>{fmtPrice(inst, inst.dayLow)} – {fmtPrice(inst, inst.dayHigh)}</span>
          <span>RSI(14) / trend</span><span>{m.rsi14?.toFixed(1) ?? '—'} / {m.trend}</span>
          <span>Snapshot time</span><span>{fmtTime(inst.lastUpdatedAt)}</span>
        </div>
      </section>
      <section><span className="section-title">Technical observations</span><List items={a.technicalObservations} /></section>
      <section><span className="section-title">{inst.assetClass === 'equity' ? 'Fundamental' : 'Asset'} drivers</span><List items={a.assetDrivers} /></section>
      <section><span className="section-title">News and events</span><List items={a.newsAndEvents} /></section>
      <section><span className="section-title">Macro context</span><List items={a.macroContext} /></section>
      {!!a.communityView?.length && <section><span className="section-title">Community view (member opinions)</span><List items={a.communityView} /></section>}
      <div className="grid g2">
        <section><span className="section-title pos">Supporting evidence</span><List items={a.supportingFactors} /></section>
        <section><span className="section-title neg">Opposing evidence</span><List items={a.opposingFactors} /></section>
      </div>
      <div className="grid g2">
        <section><span className="section-title warn">Risks</span><List items={a.risks} /></section>
        <section><span className="section-title">Invalidation conditions</span><List items={a.invalidationConditions} /></section>
      </div>
      <section>
        <span className="section-title">Bull / base / bear scenarios ({DEFAULT_ASSUMPTIONS.horizonDays}-bar horizon)</span>
        <table className="table small">
          <thead><tr><th>Case</th><th className="right">Weight</th><th className="right">Move</th><th className="right">Level</th></tr></thead>
          <tbody>
            {sc.cases.map((c) => (
              <tr key={c.id}><td>{c.label}</td><td className="right">{c.probability.toFixed(0)}%</td><td className="right">{fmtPct(c.movePct)}</td><td className="right mono">{fmtPrice(inst, c.level)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="tiny muted">Levels = price × (1 ± kσ), σ from realised volatility.</p>
      </section>
      <div className="grid g2">
        <section><span className="section-title">Missing data</span><List items={a.missingData} /></section>
        <section><span className="section-title">Assumptions</span><List items={a.assumptions} /></section>
      </div>
      <section>
        <span className="section-title">Source / evidence list</span>
        <ul className="list-clean tiny secondary">
          {ev.lanes.flatMap((l) => l.items.map((i) => <li key={`${l.id}-${i.id}`}>[{l.title}] {i.text} — {i.source}, {fmtTime(i.timestamp)}</li>))}
        </ul>
      </section>
    </article>
  );
}

export function reportMarkdown(r: SavedReport) {
  const inst = getInstrument(r.instrumentId);
  return `# Research report: ${inst?.symbol ?? r.instrumentId}\n\n- Instrument: ${inst?.displayName} (${inst?.quoteCurrency} per ${inst?.unit})\n- Timeframe: ${r.timeframe}\n- Created: ${r.createdAt}\n- Source: ${r.source === 'ai' ? `AI (${r.model})` : 'Local rule-based'}\n- Snapshot price: ${inst ? fmtPrice(inst, inst.price) : '—'}\n\n## Question\n${r.question}\n\n${analysisToMarkdown(r.analysis)}`;
}

export default function Report({ frame, updateSettings }: ModuleProps) {
  const { inst } = useLinkedInstrument(frame);
  const tf = useApp((s) => s.timeframe);
  const reports = useApp((s) => s.reports);
  const activeId = useApp((s) => s.activeReportId);
  const { saveReport, set, addNote, toast, notify } = useApp.getState();
  const [question, setQuestion] = useState('');
  const [state, setState] = useState<{ loading: boolean; error?: string }>({ loading: false });
  const [printing, setPrinting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const report = reports.find((r) => r.id === activeId) ?? reports[0];

  const generate = async (useAI = true) => {
    const q = question.trim() || `What does the supplied evidence say about ${inst.symbol} on the ${tf} timeframe?`;
    if (!useAI) {
      saveReport({ id: uid('rep'), question: q, instrumentId: inst.id, timeframe: tf, createdAt: new Date().toISOString(), analysis: localAnalysis(inst, tf), source: 'local' });
      setState({ loading: false });
      return;
    }
    abortRef.current = new AbortController();
    setState({ loading: true });
    const res = await callAI({ mode: 'analyze', question: q, style: useApp.getState().aiStyle, context: buildAIContext(inst, tf, { technical: true, fundamentals: true, news: true, events: true }) }, abortRef.current.signal);
    if (res.ok && res.analysis) {
      saveReport({ id: uid('rep'), question: q, instrumentId: inst.id, timeframe: tf, createdAt: new Date().toISOString(), analysis: res.analysis, source: 'ai', model: res.model });
      notify({ title: 'AI report ready', body: `${inst.symbol} research report generated.`, category: 'ai', severity: 'success' });
      setState({ loading: false });
    } else setState({ loading: false, error: res.error });
  };

  // Commands elsewhere (palette, evidence) can request a fresh report.
  const auto = frame.settings.autoGenerate as number | undefined;
  useEffect(() => {
    if (auto && !state.loading) {
      updateSettings({ autoGenerate: undefined });
      void generate(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    const t = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  return (
    <div className="module">
      <div className="neu-soft card col gap-2 no-print">
        <div className="row">
          <input className="input" placeholder={`Question for ${inst.symbol} (optional)`} value={question} maxLength={500} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void generate(true)} />
          {state.loading ? (
            <button className="btn" onClick={() => abortRef.current?.abort()}><Square /> Stop</button>
          ) : (
            <button className="btn primary" onClick={() => void generate(true)}><Bot /> Generate</button>
          )}
          <button className="btn" onClick={() => void generate(false)} data-tip="Deterministic, no AI call"><Cpu /> Local</button>
        </div>
        <div className="row wrap gap-1">
          <span className="tiny muted">For {inst.symbol} · {tf}. History:</span>
          <select className="select" style={{ height: 26 }} value={report?.id ?? ''} onChange={(e) => set({ activeReportId: e.target.value })} disabled={!reports.length} aria-label="Report history">
            {!reports.length && <option value="">No reports yet</option>}
            {reports.map((r) => <option key={r.id} value={r.id}>{getInstrument(r.instrumentId)?.symbol} · {fmtTime(r.createdAt)} · {r.source}</option>)}
          </select>
        </div>
        {state.loading && <div className="row small secondary"><span className="spinner" /> Generating structured report from supplied evidence…</div>}
        {state.error && (
          <div className="alert-box error col gap-2">
            <span>{state.error}</span>
            <div className="row gap-1">
              <button className="btn sm" onClick={() => void generate(true)}><RotateCcw /> Retry</button>
              <button className="btn sm" onClick={() => void generate(false)}><Cpu /> Use local rule-based report instead</button>
            </div>
          </div>
        )}
      </div>
      {!report ? (
        <Empty icon={<FileText />} title="No report yet" hint="Generate one with AI, or a deterministic local version." />
      ) : (
        <>
          <div className="row wrap gap-1 no-print">
            <button className="btn sm" onClick={() => setPrinting(true)}><Printer /> Print / PDF</button>
            <button className="btn sm" onClick={() => downloadFile(`report-${report.instrumentId}-${report.createdAt.slice(0, 10)}.md`, reportMarkdown(report), 'text/markdown')}><Download /> Markdown</button>
            <button className="btn sm" onClick={() => downloadFile(`report-${report.instrumentId}-${report.createdAt.slice(0, 10)}.json`, JSON.stringify(report, null, 2))}><FileJson /> JSON</button>
            <button className="btn sm" onClick={() => {
              addNote({ title: `Report: ${getInstrument(report.instrumentId)?.symbol} (${report.timeframe})`, body: reportMarkdown(report), kind: 'report', folder: 'Reports', tags: ['report', report.instrumentId], instrumentId: report.instrumentId, data: report });
              toast({ title: 'Report saved to Research Notebook', tone: 'success' });
            }}><Save /> Save to notebook</button>
          </div>
          <ReportBody r={report} />
          {printing && createPortal(<div className="print-root"><ReportBody r={report} /></div>, document.body)}
        </>
      )}
    </div>
  );
}
