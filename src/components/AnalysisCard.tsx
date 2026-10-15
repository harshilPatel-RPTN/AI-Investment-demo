import type { AIAnalysis } from '../types/ai';

const BIAS_LABEL: Record<AIAnalysis['bias'], string> = {
  bullish: 'Bullish bias', bearish: 'Bearish bias', neutral: 'Neutral', conflicting: 'Conflicting / wait', insufficient_data: 'Insufficient data',
};

export function BiasBadge({ bias }: { bias: AIAnalysis['bias'] }) {
  return <span className={`badge-bias ${bias}`}>{BIAS_LABEL[bias]}</span>;
}

function Section({ title, items, tone }: { title: string; items: string[]; tone?: 'pos' | 'neg' | 'warn' }) {
  if (!items.length) return null;
  return (
    <div className="col gap-1">
      <span className={`section-title ${tone ?? ''}`}>{title}</span>
      <ul className="list-clean small">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

/** Renders a validated AI analysis as plain text nodes (never HTML). */
export function AnalysisCard({ a, compact = false }: { a: AIAnalysis; compact?: boolean }) {
  return (
    <div className="col gap-2">
      <div className="row between top">
        <p className="small" style={{ flex: 1 }}>{a.summary}</p>
        <BiasBadge bias={a.bias} />
      </div>
      <div className={`grid ${compact ? '' : 'g2'}`} style={{ gap: 10 }}>
        <Section title="Supporting" items={a.supportingFactors} tone="pos" />
        <Section title="Opposing" items={a.opposingFactors} tone="neg" />
        {!compact && <Section title="Technical" items={a.technicalObservations} />}
        {!compact && <Section title="Asset drivers" items={a.assetDrivers} />}
        {!compact && <Section title="News & events" items={a.newsAndEvents} />}
        {!compact && <Section title="Macro" items={a.macroContext} />}
        {!compact && <Section title="Community view (opinions)" items={a.communityView ?? []} />}
        {!compact && <Section title="How this was reached" items={a.reasoning ?? []} />}
        <Section title="Risks" items={a.risks} tone="warn" />
        <Section title="Invalidation" items={a.invalidationConditions} />
        <Section title="Missing data" items={a.missingData} />
        {!compact && <Section title="Assumptions" items={a.assumptions} />}
      </div>
    </div>
  );
}

export function analysisToMarkdown(a: AIAnalysis): string {
  const sec = (t: string, items: string[]) => (items.length ? `\n### ${t}\n${items.map((i) => `- ${i}`).join('\n')}\n` : '');
  return [
    `**Bias:** ${BIAS_LABEL[a.bias]}\n\n${a.summary}\n`,
    sec('Supporting factors', a.supportingFactors),
    sec('Opposing factors', a.opposingFactors),
    sec('Technical observations', a.technicalObservations),
    sec('Asset drivers', a.assetDrivers),
    sec('News and events', a.newsAndEvents),
    sec('Macro context', a.macroContext),
    sec('Community view (member opinions)', a.communityView ?? []),
    sec('Reasoning', a.reasoning ?? []),
    sec('Risks', a.risks),
    sec('Invalidation conditions', a.invalidationConditions),
    sec('Missing data', a.missingData),
    sec('Assumptions', a.assumptions),
  ].join('');
}
