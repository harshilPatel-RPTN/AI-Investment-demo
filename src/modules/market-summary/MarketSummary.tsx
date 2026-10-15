import { useMemo } from 'react';
import type { ModuleProps } from '../types';
import { useApp } from '../../store/appStore';
import { getInstrument } from '../../data/instruments';
import { getCloses } from '../../data/priceSeries';
import { fmtPrice } from '../../lib/formatting';
import { FIXTURE_NOW_ISO } from '../../lib/seed';
import { Change, Sparkline } from '../../components/ui';

/** The four markets this OS covers. Each tile can cycle between that market's instruments. */
const MARKETS = [
  { key: 'forex', label: 'Forex', ids: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDINR'] },
  { key: 'gold', label: 'Gold', ids: ['XAUUSD', 'GOLDINR'] },
  { key: 'silver', label: 'Silver', ids: ['XAGUSD', 'SILVERINR'] },
  { key: 'oil', label: 'Oil', ids: ['WTIUSD', 'BRENTUSD'] },
] as const;

function Tile({ market, id, selected, onSelect, onCycle }: { market: (typeof MARKETS)[number]; id: string; selected: boolean; onSelect: () => void; onCycle: () => void }) {
  const epoch = useApp((s) => s.dataEpoch);
  const inst = getInstrument(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const closes = useMemo(() => getCloses(id, '1D').slice(-40), [id, epoch]);
  if (!inst) return null;
  return (
    <div className={`ms-tile ${selected ? 'selected' : ''}`}>
      <button className="ms-main" onClick={onSelect} aria-pressed={selected} aria-label={`Show ${inst.symbol} across the workspace`}>
        <span className="ms-head">
          <span className="ms-market">{market.label}</span>
          <span className="ms-symbol">{inst.symbol}</span>
        </span>
        <span className="ms-price mono">{fmtPrice(inst, inst.price)}</span>
        <span className="ms-foot">
          <Change value={inst.changePercent} />
          <span className="ms-unit">{inst.quoteCurrency}/{inst.unit}</span>
        </span>
      </button>
      <span className="ms-spark" aria-hidden><Sparkline values={closes} width={96} height={34} /></span>
      {market.ids.length > 1 && (
        <button className="ms-cycle" onClick={onCycle} aria-label={`Next ${market.label} instrument`} data-tip={`Next ${market.label} instrument`}>
          {market.ids.indexOf(id as never) + 1}/{market.ids.length}
        </button>
      )}
    </div>
  );
}

/** Compact four-market strip for the top of a workspace. Clicking a tile sets the workspace instrument. */
export default function MarketSummary({ frame, updateSettings }: ModuleProps) {
  const selected = useApp((s) => s.selectedInstrumentId);
  const select = useApp((s) => s.selectInstrument);
  const picks = (frame.settings.picks as Record<string, string> | undefined) ?? {};
  return (
    <div className="ms-root">
      <div className="ms-grid">
        {MARKETS.map((m) => {
          const id = picks[m.key] && (m.ids as readonly string[]).includes(picks[m.key]) ? picks[m.key] : m.ids[0];
          return (
            <Tile
              key={m.key}
              market={m}
              id={id}
              selected={selected === id}
              onSelect={() => select(id)}
              onCycle={() => {
                const next = m.ids[(m.ids.indexOf(id as never) + 1) % m.ids.length];
                updateSettings({ picks: { ...picks, [m.key]: next } });
                if (selected === id) select(next);
              }}
            />
          );
        })}
      </div>
      <span className="ms-asof">Quotes as of {new Date(FIXTURE_NOW_ISO).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
    </div>
  );
}
