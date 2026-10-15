import { useRef, useState } from 'react';
import { Bot, RotateCcw, Square } from 'lucide-react';
import type { ModuleProps } from '../types';
import { getInstrument } from '../../data/instruments';
import { computeMetrics } from '../../lib/calculations/metrics';
import { goldSilverRatio } from '../../lib/calculations/portfolio';
import { computeRisk } from '../../lib/risk';
import { callAI } from '../../lib/ai-client';
import { fmtNum, fmtPrice } from '../../lib/formatting';
import { Markdown } from '../../components/Markdown';

interface Topic {
  id: string;
  title: string;
  body: string;
  example: () => string;
}

const TOPICS: Topic[] = [
  { id: 'rsi', title: 'RSI (Relative Strength Index)', body: 'A 0–100 momentum oscillator comparing average gains to average losses over N bars (usually 14, Wilder smoothing). Above 70 is often called overbought, below 30 oversold — but strong trends can stay stretched for a long time.', example: () => { const i = getInstrument('XAUUSD')!; return `Example: XAU/USD RSI(14) on the daily chart = ${fmtNum(computeMetrics(i).rsi14, 1)}.`; } },
  { id: 'macd', title: 'MACD', body: 'MACD = EMA(12) − EMA(26) of price; the signal line is EMA(9) of MACD; the histogram is their difference. MACD above its signal suggests improving momentum; crossovers lag price.', example: () => { const m = computeMetrics(getInstrument('EURUSD')!); return `Example: EUR/USD MACD ${fmtNum(m.macd, 5)} vs signal ${fmtNum(m.macdSignal, 5)} → ${m.macd != null && m.macdSignal != null && m.macd > m.macdSignal ? 'above' : 'below'} signal.`; } },
  { id: 'ma', title: 'Moving averages (SMA / EMA)', body: 'An SMA is the plain average of the last N closes; an EMA weights recent closes more. Price above a rising moving average is a common trend filter. Longer averages (200) describe the bigger trend.', example: () => { const i = getInstrument('BRENTUSD')!; const m = computeMetrics(i); return `Example: Brent at ${fmtPrice(i, i.price)} vs SMA(50) ${fmtPrice(i, m.sma50 ?? NaN)} and SMA(200) ${fmtPrice(i, m.sma200 ?? NaN)}.`; } },
  { id: 'vol', title: 'Volatility', body: 'Realised volatility is the standard deviation of returns, usually annualised (× √periods per year). Higher volatility means wider expected swings, so position sizes are often reduced to keep risk constant.', example: () => `Example: 20-bar annualised volatility — XAU/USD ${fmtNum(computeMetrics(getInstrument('XAUUSD')!).vol20, 1)}%, WTI ${fmtNum(computeMetrics(getInstrument('WTIUSD')!).vol20, 1)}%, EUR/USD ${fmtNum(computeMetrics(getInstrument('EURUSD')!).vol20, 1)}%.` },
  { id: 'carry', title: 'Interest-rate differential (carry)', body: 'In forex, the currency with the higher interest rate tends to attract capital; holding it against a lower-yielding currency earns "carry". Carry trades can unwind sharply when risk sentiment turns.', example: () => { const i = getInstrument('USDJPY')!; return `Example: USD/JPY at ${fmtPrice(i, i.price)} — a classic carry pair; the trend is ${computeMetrics(i).trend}.`; } },
  { id: 'pip', title: 'Pip (forex)', body: 'A pip is the conventional smallest price step in FX: 0.0001 for most pairs, 0.01 for JPY pairs. Pip value in money depends on position size and account currency, so it is not universal.', example: () => { const i = getInstrument('USDJPY')!; return `Example: USD/JPY ${fmtPrice(i, i.price)} — pip size ${i.pipSize}; EUR/USD pip size ${getInstrument('EURUSD')!.pipSize}.`; } },
  { id: 'oz', title: 'Troy ounce', body: 'Precious metals are priced per troy ounce = 31.1035 g (heavier than the everyday 28.35 g ounce). INR gold is often quoted per 10 g; silver per kg.', example: () => { const g = getInstrument('XAUUSD')!; const s = getInstrument('XAGUSD')!; return `Example: gold ${fmtPrice(g, g.price)} USD/oz, silver ${fmtPrice(s, s.price)} USD/oz → gold/silver ratio ${fmtNum(goldSilverRatio(g.price, s.price), 1)}.`; } },
  { id: 'bbl', title: 'Barrel (oil)', body: 'Crude is priced in USD per barrel = 159 litres (42 US gallons). WTI and Brent are benchmark grades; their spread reflects quality and location.', example: () => { const b = getInstrument('BRENTUSD')!; const w = getInstrument('WTIUSD')!; return `Example: Brent ${fmtPrice(b, b.price)} vs WTI ${fmtPrice(w, w.price)} USD/bbl → spread ${fmtNum(b.price - w.price, 2)}.`; } },
  { id: 'dd', title: 'Drawdown', body: 'The fall from a running equity peak to a subsequent trough, in %. Max drawdown is the worst such fall over a period — a key measure of pain and risk.', example: () => 'Example: run the Backtest Lab to see the max drawdown of an equity curve.' },
  { id: 'rr', title: 'Risk / reward', body: 'Reward per unit (target − entry) divided by risk per unit (entry − stop). A 2:1 setup risks 1 to potentially make 2; it says nothing about the probability of each.', example: () => { const r = computeRisk({ capital: 100000, entry: 100, stop: 95, target: 110, riskMode: 'percent', riskPercent: 1, riskAmount: 0, lotSize: 1, feesPerUnit: 0 }); return `Example: entry 100, stop 95, target 110, 1% of 100,000 → qty ${r.quantity}, R:R ${fmtNum(r.riskReward, 2)}:1.`; } },
];

export default function Learning({ frame, updateSettings }: ModuleProps) {
  const topicId = (frame.settings.topic as string) ?? 'rsi';
  const topic = TOPICS.find((t) => t.id === topicId) ?? TOPICS[0];
  const [level, setLevel] = useState<'simple' | 'advanced'>('simple');
  const [ai, setAi] = useState<{ loading: boolean; text?: string; error?: string; for?: string }>({ loading: false });
  const abortRef = useRef<AbortController | null>(null);

  const ask = async () => {
    abortRef.current = new AbortController();
    setAi({ loading: true });
    const res = await callAI({ mode: 'explain', style: level, question: `Explain "${topic.title}" for a trader. Use the example provided and say what it does NOT tell you.`, context: { extra: `${topic.body}\n${topic.example()}\n` } }, abortRef.current.signal);
    setAi(res.ok ? { loading: false, text: res.text, for: topic.id } : { loading: false, error: res.error });
  };

  return (
    <div className="row top fill" style={{ gap: 12, alignItems: 'stretch' }}>
      <nav className="col gap-1" style={{ width: 200, flex: 'none' }} aria-label="Topics">
        {TOPICS.map((t) => (
          <button key={t.id} className={`btn ${t.id === topic.id ? 'active' : 'ghost'}`} style={{ justifyContent: 'flex-start' }} onClick={() => updateSettings({ topic: t.id })}>{t.title}</button>
        ))}
      </nav>
      <div className="grow col gap-3 scroll">
        <h3>{topic.title}</h3>
        <p className="secondary">{topic.body}</p>
        <div className="neu-soft card row between">
          <span className="small">{topic.example()}</span>
        </div>
        <div className="neu-soft card col gap-2">
          <div className="row between">
            <span className="section-title">Ask the AI tutor</span>
            <div className="row gap-1">
              <div className="tabs">
                <button className={`tab ${level === 'simple' ? 'active' : ''}`} onClick={() => setLevel('simple')}>Simple</button>
                <button className={`tab ${level === 'advanced' ? 'active' : ''}`} onClick={() => setLevel('advanced')}>Advanced</button>
              </div>
              {ai.loading ? <button className="btn sm" onClick={() => abortRef.current?.abort()}><Square /> Stop</button> : <button className="btn sm primary" onClick={ask}><Bot /> Explain</button>}
            </div>
          </div>
          {ai.loading && <div className="row small secondary"><span className="spinner" /> Explaining…</div>}
          {ai.error && <div className="alert-box error row between"><span>{ai.error}</span><button className="btn sm" onClick={ask}><RotateCcw /> Retry</button></div>}
          {ai.text && ai.for === topic.id && <Markdown text={ai.text} />}
          {!ai.text && !ai.loading && !ai.error && <span className="small muted">Get a {level} explanation that uses the example above.</span>}
        </div>
      </div>
    </div>
  );
}
