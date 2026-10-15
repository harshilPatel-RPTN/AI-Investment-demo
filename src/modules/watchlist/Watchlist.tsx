import { Bot, CandlestickChart, Plus, Star, X } from 'lucide-react';
import type { ModuleProps } from '../types';
import { useApp } from '../../store/appStore';
import { getInstrument } from '../../data/instruments';
import { getSeries } from '../../data/priceSeries';
import { Change, Empty, InstrumentSelect, Sparkline } from '../../components/ui';
import { fmtPrice } from '../../lib/formatting';
import { activateApp } from '../../shell/Sidebar';
import { unitLabel, useInstruments } from '../shared';
import { useState } from 'react';

export default function Watchlist(_: ModuleProps) {
  useInstruments();
  const list = useApp((s) => s.watchlist);
  const selected = useApp((s) => s.selectedInstrumentId);
  const { toggleWatch, selectInstrument, sendToAI } = useApp.getState();
  const [adding, setAdding] = useState('');

  const items = list.map((id) => getInstrument(id)).filter((i): i is NonNullable<typeof i> => !!i);
  return (
    <div className="module">
      <div className="row">
        <InstrumentSelect value={adding} onChange={setAdding} filter={(i) => !list.includes(i.id)} placeholder="Add instrument to watchlist…" />
        <button className="btn sm" disabled={!adding} onClick={() => { toggleWatch(adding); setAdding(''); }} aria-label="Add to watchlist">
          <Plus /> Add
        </button>
      </div>
      {items.length === 0 && <Empty icon={<Star />} title="Watchlist is empty" hint="Add instruments above or with the ☆ in Asset Explorer." />}
      <div className="col gap-1">
        {items.map((i) => (
          <div
            key={i.id}
            className={`row neu-soft ${selected === i.id ? 'neu-pressed' : ''}`}
            style={{ padding: '8px 10px', cursor: 'pointer', borderRadius: 12 }}
            onClick={() => selectInstrument(i.id)}
          >
            <div className="col grow" style={{ gap: 0 }}>
              <span className="bold">{i.symbol}</span>
              <span className="tiny muted ellipsis">{unitLabel(i)}{i.assetClass === 'crypto' ? ' · 24/7' : ''}</span>
            </div>
            <Sparkline values={getSeries(i.id, '1D').slice(-30).map((c) => c.close)} width={60} height={22} />
            <div className="col" style={{ gap: 0, alignItems: 'flex-end', minWidth: 84 }}>
              <span className="num bold">{fmtPrice(i, i.price)}</span>
              <Change value={i.changePercent} />
            </div>
            <div className="row gap-1 no-drag">
              <button className="btn icon sm ghost" data-tip="Chart" aria-label={`Chart ${i.symbol}`} onClick={(e) => { e.stopPropagation(); selectInstrument(i.id); activateApp('chart-studio'); }}><CandlestickChart /></button>
              <button className="btn icon sm ghost" data-tip="Ask AI" aria-label={`Ask AI about ${i.symbol}`} onClick={(e) => { e.stopPropagation(); selectInstrument(i.id); sendToAI({ question: `Give me a balanced read on ${i.symbol} using the supplied evidence.` }); activateApp('ai-copilot'); }}><Bot /></button>
              <button className="btn icon sm ghost" data-tip="Remove" aria-label={`Remove ${i.symbol}`} onClick={(e) => { e.stopPropagation(); toggleWatch(i.id); }}><X /></button>
            </div>
          </div>
        ))}
      </div>
      <div className="row between tiny muted">
        <span>{items.length} instruments</span>
      </div>
    </div>
  );
}
