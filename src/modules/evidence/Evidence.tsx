import { useMemo, useRef, useState } from 'react';
import { Bot, FileText, RotateCcw, Square } from 'lucide-react';
import type { ModuleProps } from '../types';
import type { AIAnalysis } from '../../types/ai';
import { useApp } from '../../store/appStore';
import { useWorkspace } from '../../workspace/WorkspaceStore';
import { buildAIContext, buildEvidence, type Direction } from '../../lib/evidence';
import { callAI } from '../../lib/ai-client';
import { fmtTime } from '../../lib/formatting';
import { AnalysisCard, BiasBadge } from '../../components/AnalysisCard';
import { LinkedPicker, useLinkedInstrument } from '../shared';

const DIR_LABEL: Record<Direction, string> = { positive: '▲ positive', negative: '▼ negative', neutral: '● neutral', unknown: '? unknown' };
const LANE_BIAS_CLASS = { positive: 'pos', negative: 'neg', neutral: 'secondary', mixed: 'warn', 'no-evidence': 'muted' } as const;

export default function Evidence({ frame, updateSettings }: ModuleProps) {
  const { inst } = useLinkedInstrument(frame);
  const tf = useApp((s) => s.timeframe);
  const epoch = useApp((s) => s.dataEpoch);
  const ev = useMemo(() => buildEvidence(inst, tf), [inst, tf, epoch]);
  const [ai, setAi] = useState<{ loading: boolean; analysis?: AIAnalysis; error?: string; model?: string; forId?: string }>({ loading: false });
  const abortRef = useRef<AbortController | null>(null);

  const interpret = async () => {
    abortRef.current = new AbortController();
    setAi({ loading: true });
    const res = await callAI(
      {
        mode: 'analyze',
        style: useApp.getState().aiStyle,
        question: `Interpret the four evidence lanes for ${inst.symbol}. Weigh supporting vs opposing evidence, highlight conflicts between lanes, and list missing data. Do not add facts beyond CONTEXT.`,
        context: buildAIContext(inst, tf, { technical: true, fundamentals: true, news: true, events: true }, `Lane tallies: ${ev.lanes.map((l) => `${l.title}=${l.bias}`).join(', ')}. Rule-based combined: ${ev.combined.label}.`),
      },
      abortRef.current.signal,
    );
    setAi(res.ok && res.analysis ? { loading: false, analysis: res.analysis, model: res.model, forId: inst.id } : { loading: false, error: res.error });
  };

  return (
    <div className="module">
      <div className="module-head">
        <LinkedPicker frame={frame} update={updateSettings} />
        <span className="chip">{tf}</span>
        <div style={{ flex: 1 }} />
      </div>
      <div className="neu-soft card row between wrap gap-3">
        <div className="col gap-1" style={{ flex: '1 1 260px' }}>
          <div className="row gap-2">
            <span className="section-title">Combined (rule-based)</span>
            <BiasBadge bias={ev.combined.bias} />
          </div>
          <span className="small secondary">{ev.combined.explanation}</span>
          <span className="tiny muted">
            Coverage rubric: {ev.coverage.lanesWithEvidence}/4 lanes with directional evidence · {ev.coverage.directional} directional of {ev.coverage.total} items. These lanes are structured evidence categories, not independent AI models.
          </span>
        </div>
        <div className="row gap-1">
          {ai.loading ? (
            <button className="btn sm" onClick={() => abortRef.current?.abort()}><Square /> Stop</button>
          ) : (
            <button className="btn sm primary" onClick={interpret}><Bot /> AI interpretation</button>
          )}
          <button className="btn sm" onClick={() => useWorkspace.getState().openApp('report', { settings: { autoGenerate: Date.now() } })}><FileText /> Generate report</button>
        </div>
      </div>
      {(ai.loading || ai.error || ai.analysis) && (
        <div className="neu-soft card col gap-2">
          {ai.loading && <div className="row small secondary"><span className="spinner" /> Interpreting lanes…</div>}
          {ai.error && (
            <div className="alert-box error row between">
              <span>{ai.error}</span>
              <button className="btn sm" onClick={interpret}><RotateCcw /> Retry</button>
            </div>
          )}
          {ai.analysis && ai.forId === inst.id && (
            <>
              <AnalysisCard a={ai.analysis} compact />
              <span className="tiny muted">{ai.model} · AI interpretation of evidence</span>
            </>
          )}
          {ai.analysis && ai.forId !== inst.id && <span className="small muted">Instrument changed — run the interpretation again.</span>}
        </div>
      )}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {ev.lanes.map((lane, idx) => (
          <section key={lane.id} className="lane neu-soft" aria-label={lane.title}>
            <div className="row between">
              <span className="bold">{idx + 1}. {lane.title}</span>
              <span className={`small bold ${LANE_BIAS_CLASS[lane.bias]}`}>{lane.bias}</span>
            </div>
            {lane.items.length === 0 && <span className="small muted">No evidence items.</span>}
            {lane.items.map((it) => (
              <div key={it.id} className="lane-item">
                <span className={`dir ${it.direction}`}>{DIR_LABEL[it.direction]}</span>
                <span className="small">{it.text}</span>
                <span className="tiny muted">{it.source} · {fmtTime(it.timestamp)}</span>
              </div>
            ))}
            {lane.missing.length > 0 && (
              <div className="col gap-1">
                <span className="section-title">Missing data</span>
                <ul className="list-clean tiny muted">
                  {lane.missing.map((m) => <li key={m}>{m}</li>)}
                </ul>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
