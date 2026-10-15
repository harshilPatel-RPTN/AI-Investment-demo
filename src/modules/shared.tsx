import { useMemo } from 'react';
import { Link2, Link2Off } from 'lucide-react';
import { useApp } from '../store/appStore';
import { getInstrument, getInstruments } from '../data/instruments';
import { allMetrics, computeMetrics } from '../lib/calculations/metrics';
import type { Instrument } from '../types/market';
import type { WidgetFrame } from '../types/widgets';
import { InstrumentSelect } from '../components/ui';

/** Returns the instrument a window shows: the global selection when linked, its own pick otherwise. */
export function useLinkedInstrument(frame: WidgetFrame): { inst: Instrument; linked: boolean } {
  const selected = useApp((s) => s.selectedInstrumentId);
  useApp((s) => s.dataEpoch); // re-render on data regeneration
  const linked = frame.settings.linked !== false;
  const id = linked ? selected : String(frame.settings.instrumentId ?? selected);
  const inst = getInstrument(id) ?? getInstruments()[0];
  return { inst, linked };
}

export function LinkedPicker({ frame, update }: { frame: WidgetFrame; update: (s: Record<string, unknown>) => void }) {
  const { inst, linked } = useLinkedInstrument(frame);
  const select = useApp((s) => s.selectInstrument);
  return (
    <div className="row no-drag" style={{ minWidth: 0 }}>
      <button
        className={`btn icon sm ${linked ? 'active' : ''}`}
        onClick={() => update(linked ? { linked: false, instrumentId: inst.id } : { linked: true })}
        aria-pressed={linked}
        aria-label={linked ? 'Linked to global selection' : 'Independent instrument'}
        data-tip={linked ? 'Linked to global instrument — click to unlink' : 'Independent — click to link to global instrument'}
      >
        {linked ? <Link2 /> : <Link2Off />}
      </button>
      <InstrumentSelect value={inst.id} onChange={(id) => (linked ? select(id) : update({ instrumentId: id }))} />
    </div>
  );
}

export function useAllMetrics() {
  const epoch = useApp((s) => s.dataEpoch);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => allMetrics(), [epoch]);
}

export function useMetrics(inst: Instrument) {
  const epoch = useApp((s) => s.dataEpoch);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => computeMetrics(inst), [inst.id, epoch]);
}

export function useInstruments() {
  const epoch = useApp((s) => s.dataEpoch);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getInstruments(), [epoch]);
}

export function heatColor(pct: number, maxAbs = 3) {
  const t = Math.max(-1, Math.min(1, pct / maxAbs));
  const base = t >= 0 ? 'var(--heat-pos)' : 'var(--heat-neg)';
  const strength = Math.round(18 + Math.abs(t) * 62);
  return `color-mix(in srgb, ${base} ${strength}%, var(--surface-inset))`;
}

export function unitLabel(i: Instrument) {
  if (i.assetClass === 'forex') return `${i.quoteCurrency} per ${i.baseCurrency}`;
  if (i.assetClass === 'index') return 'points';
  return `${i.quoteCurrency} / ${i.unit}`;
}
