import { useMemo, useRef, useState } from 'react';
import { Bot, Newspaper, RotateCcw, Save, Square } from 'lucide-react';
import type { ModuleProps } from '../types';
import type { AssetClass, NewsItem, Sentiment } from '../../types/market';
import { useApp } from '../../store/appStore';
import { getNews } from '../../data/news';
import { ASSET_CLASS_LABEL, ASSET_CLASSES, getInstrument } from '../../data/instruments';
import { FIXTURE_NOW } from '../../lib/seed';
import { fmtTime } from '../../lib/formatting';
import { callAI } from '../../lib/ai-client';
import { Empty } from '../../components/ui';
import { Markdown } from '../../components/Markdown';

const SENT_CLASS: Record<Sentiment, string> = { bullish: 'positive', bearish: 'negative', mixed: 'neutral', neutral: 'unknown' };
const CATEGORIES: NewsItem['category'][] = ['earnings', 'macro', 'policy', 'supply', 'regulation', 'corporate', 'market', 'technology'];

export default function News({ frame, updateSettings }: ModuleProps) {
  const selectedId = useApp((s) => s.selectedInstrumentId);
  const { selectInstrument, addNote, toast } = useApp.getState();
  const scope = (frame.settings.scope as 'all' | 'selected') ?? 'all';
  const assetClass = (frame.settings.assetClass as AssetClass | 'macro' | '') ?? '';
  const [category, setCategory] = useState('');
  const [sentiment, setSentiment] = useState('');
  const [hours, setHours] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [ai, setAi] = useState<{ loading: boolean; text?: string; error?: string }>({ loading: false });
  const abortRef = useRef<AbortController | null>(null);

  const list = useMemo(
    () =>
      getNews().filter(
        (n) =>
          (scope === 'all' || n.instrumentIds.includes(selectedId)) &&
          (!assetClass || n.assetClass === assetClass) &&
          (!category || n.category === category) &&
          (!sentiment || n.sentiment === sentiment) &&
          (!hours || FIXTURE_NOW - new Date(n.publishedAt).getTime() <= hours * 3_600_000),
      ),
    [scope, selectedId, assetClass, category, sentiment, hours],
  );
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 10 ? p : [...p, id]));

  const summarise = async () => {
    const items = getNews().filter((n) => picked.includes(n.id));
    if (!items.length || ai.loading) return;
    abortRef.current = new AbortController();
    setAi({ loading: true });
    const res = await callAI(
      {
        mode: 'chat',
        style: useApp.getState().aiStyle,
        question: 'Summarise ONLY these supplied headlines: key themes, which instruments they relate to, the overall sentiment balance, and what information is missing. Keep it short.',
        context: { news: items.map((n) => ({ headline: n.headline, summary: n.summary, sentiment: n.sentiment, category: n.category, instruments: n.instrumentIds, publishedAt: n.publishedAt, source: n.source })) },
      },
      abortRef.current.signal,
    );
    setAi(res.ok ? { loading: false, text: res.text } : { loading: false, error: res.error });
  };

  return (
    <div className="module">
      <div className="module-head">
        <div className="tabs">
          <button className={`tab ${scope === 'all' ? 'active' : ''}`} onClick={() => updateSettings({ scope: 'all' })}>All</button>
          <button className={`tab ${scope === 'selected' ? 'active' : ''}`} onClick={() => updateSettings({ scope: 'selected' })}>
            {getInstrument(selectedId)?.symbol ?? 'Selected'}
          </button>
        </div>
        <select className="select" value={assetClass} onChange={(e) => updateSettings({ assetClass: e.target.value })} aria-label="Asset class">
          <option value="">All classes</option>
          {ASSET_CLASSES.map((a) => <option key={a} value={a}>{ASSET_CLASS_LABEL[a]}</option>)}
          <option value="macro">Macro</option>
        </select>
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="select" value={sentiment} onChange={(e) => setSentiment(e.target.value)} aria-label="Sentiment">
          <option value="">Any sentiment</option>
          {['bullish', 'bearish', 'mixed', 'neutral'].map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="select" value={hours} onChange={(e) => setHours(Number(e.target.value))} aria-label="Time window">
          <option value={0}>Any time</option>
          <option value={6}>Last 6h</option>
          <option value={12}>Last 12h</option>
          <option value={24}>Last 24h</option>
        </select>
        <div style={{ flex: 1 }} />
      </div>

      <div className="neu-soft card col gap-2">
        <div className="row between">
          <span className="small secondary">{picked.length ? `${picked.length} headline(s) selected (max 10)` : 'Tick headlines to summarise them with AI.'}</span>
          <div className="row gap-1">
            {picked.length > 0 && <button className="btn sm ghost" onClick={() => setPicked([])}>Clear</button>}
            {ai.loading ? (
              <button className="btn sm" onClick={() => abortRef.current?.abort()}><Square /> Stop</button>
            ) : (
              <button className="btn sm primary" disabled={!picked.length} onClick={summarise}><Bot /> AI summary</button>
            )}
          </div>
        </div>
        {ai.loading && <div className="row small secondary"><span className="spinner" /> Summarising supplied headlines…</div>}
        {ai.error && (
          <div className="alert-box error row between">
            <span>{ai.error}</span>
            <button className="btn sm" onClick={summarise}><RotateCcw /> Retry</button>
          </div>
        )}
        {ai.text && (
          <>
            <Markdown text={ai.text} />
            <div className="row between">
              <span className="tiny muted">AI summary of selected headlines</span>
              <button className="btn sm" onClick={() => {
                addNote({ title: `News summary (${picked.length} headlines)`, body: ai.text!, kind: 'ai-response', folder: 'News', tags: ['news', 'ai'] });
                toast({ title: 'Saved to Research Notebook', tone: 'success' });
              }}><Save /> Save</button>
            </div>
          </>
        )}
      </div>

      {list.length === 0 && <Empty icon={<Newspaper />} title="No headlines match these filters" />}
      <div className="col gap-2">
        {list.map((n) => (
          <article key={n.id} className="neu-soft card col gap-1" style={{ outline: picked.includes(n.id) ? '1px solid var(--accent)' : undefined }}>
            <div className="row top">
              <input type="checkbox" checked={picked.includes(n.id)} onChange={() => toggle(n.id)} aria-label="Select headline for AI summary" style={{ marginTop: 3 }} />
              <div className="grow col gap-1">
                <div className="row between top">
                  <span className="bold">{n.headline}</span>
                  <span className={`dir ${SENT_CLASS[n.sentiment]}`} style={{ whiteSpace: 'nowrap' }}>{n.sentiment}</span>
                </div>
                <p className="small secondary">{n.summary}</p>
                <div className="row wrap gap-1">
                  {n.instrumentIds.map((id) => (
                    <button key={id} className="chip clickable" onClick={() => selectInstrument(id)}>{getInstrument(id)?.symbol ?? id}</button>
                  ))}
                  <span className="chip">{n.category}</span>
                  <span className="tiny muted" style={{ marginLeft: 'auto' }}>{n.source} · {fmtTime(n.publishedAt)}</span>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
