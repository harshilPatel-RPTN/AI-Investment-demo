import { useMemo, useState } from 'react';
import type { ModuleProps } from '../types';
import { useApp } from '../../store/appStore';
import { getInstrument } from '../../data/instruments';
import { getCloses, getSeries } from '../../data/priceSeries';
import { correlation } from '../../lib/indicators';
import { goldSilverRatio } from '../../lib/calculations/portfolio';
import { fmtNum, fmtPrice } from '../../lib/formatting';
import { Change, Sparkline } from '../../components/ui';
import { unitLabel, useInstruments } from '../shared';

const BOARD = ['XAUUSD', 'XAGUSD', 'GOLDINR', 'WTIUSD', 'BRENTUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'USDINR'];
const CORR = ['XAUUSD', 'XAGUSD', 'WTIUSD', 'BRENTUSD', 'EURUSD', 'USDJPY', 'USDCAD', 'USDINR'];

function corrColor(c: number | null) {
  if (c == null) return 'var(--surface-inset)';
  const base = c >= 0 ? 'var(--heat-pos)' : 'var(--heat-neg)';
  return `color-mix(in srgb, ${base} ${Math.round(Math.abs(c) * 75)}%, var(--surface-inset))`;
}

export default function MacroBoard(_: ModuleProps) {
  useInstruments();
  const epoch = useApp((s) => s.dataEpoch);
  const select = useApp((s) => s.selectInstrument);
  const [win, setWin] = useState(60);
  const board = BOARD.map((id) => getInstrument(id)).filter((i): i is NonNullable<typeof i> => !!i);

  const matrix = useMemo(() => {
    const closes = Object.fromEntries(CORR.map((id) => [id, getCloses(id, '1D')]));
    return CORR.map((a) => CORR.map((b) => (a === b ? 1 : correlation(closes[a], closes[b], win))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win, epoch]);

  const gold = getInstrument('XAUUSD');
  const silver = getInstrument('XAGUSD');
  const ratio = gold && silver ? goldSilverRatio(gold.price, silver.price) : null;
  const brent = getInstrument('BRENTUSD');
  const wti = getInstrument('WTIUSD');

  return (
    <div className="module">
      <div className="module-head">
        <span className="title">Cross-market snapshot</span>
        <div style={{ flex: 1 }} />
      </div>
      <div className="grid gauto">
        {board.map((i) => (
          <div key={i.id} className="neu-soft quote-card" onClick={() => select(i.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && select(i.id)}>
            <div className="row between">
              <span className="sym">{i.symbol}</span>
              {i.assetClass === 'crypto' && <span className="chip info tiny">24/7</span>}
            </div>
            <span className="px">{fmtPrice(i, i.price)}</span>
            <span className="tiny muted">{unitLabel(i)}</span>
            <div className="row between">
              <Change value={i.changePercent} />
              <Sparkline values={getSeries(i.id, '1D').slice(-40).map((c) => c.close)} width={64} height={20} />
            </div>
          </div>
        ))}
      </div>
      <div className="grid g3">
        <div className="neu-soft card col gap-1" title="Gold ÷ silver, both USD per troy ounce.">
          <span className="label">Gold / silver ratio</span>
          <span className="bold num" style={{ fontSize: '1.3em' }}>{fmtNum(ratio, 2)}</span>
          <span className="tiny muted">oz of silver per oz of gold</span>
        </div>
        <div className="neu-soft card col gap-1">
          <span className="label">Brent − WTI spread</span>
          <span className="bold num" style={{ fontSize: '1.3em' }}>{brent && wti ? `$${fmtNum(brent.price - wti.price, 2)}` : '—'}</span>
          <span className="tiny muted">USD per barrel</span>
        </div>
        <div className="neu-soft card col gap-1">
          <span className="label">Implied EUR/INR cross</span>
          <span className="bold num" style={{ fontSize: '1.3em' }}>{fmtNum((getInstrument('EURUSD')?.price ?? NaN) * (getInstrument('USDINR')?.price ?? NaN), 4)}</span>
          <span className="tiny muted">EUR/USD × USD/INR vs EUR/INR {fmtNum(getInstrument('EURINR')?.price, 4)}</span>
        </div>
      </div>
      <div className="neu-soft card col gap-2">
        <div className="row between">
          <span className="section-title">Correlation of daily returns</span>
          <select className="select" value={win} onChange={(e) => setWin(Number(e.target.value))} aria-label="Correlation win">
            <option value={30}>30 bars</option>
            <option value={60}>60 bars</option>
            <option value={120}>120 bars</option>
            <option value={250}>250 bars</option>
          </select>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ borderSpacing: 3, borderCollapse: 'separate' }}>
            <thead>
              <tr>
                <th />
                {CORR.map((id) => <th key={id} className="center">{getInstrument(id)?.symbol}</th>)}
              </tr>
            </thead>
            <tbody>
              {CORR.map((a, i) => (
                <tr key={a}>
                  <td className="bold small">{getInstrument(a)?.symbol}</td>
                  {CORR.map((b, j) => (
                    <td key={b} className="center num small" style={{ background: corrColor(matrix[i][j]), borderRadius: 6, borderBottom: 0, color: 'var(--text-primary)' }} title={`${a} vs ${b}: ${matrix[i][j] == null ? 'insufficient data' : matrix[i][j]!.toFixed(3)}`}>
                      {matrix[i][j] == null ? '—' : matrix[i][j]!.toFixed(2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
