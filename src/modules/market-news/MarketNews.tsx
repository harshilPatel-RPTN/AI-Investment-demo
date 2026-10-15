import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Newspaper, RefreshCw } from 'lucide-react';
import type { ModuleProps } from '../types';
import { Empty } from '../../components/ui';
import { apiFetch } from '../../lib/apiFetch';

type Asset = 'gold' | 'silver' | 'oil' | 'forex';
interface Item {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  assets: Asset[];
  impact: 'high' | 'medium' | 'low' | null;
  direction: 'bullish' | 'bearish' | 'mixed' | 'neutral' | null;
  why: string | null;
}
interface Resp {
  ok: boolean;
  items: Item[];
  fetchedAt: string | null;
  ranked: boolean;
  refreshing: boolean;
  error: string | null;
  source: { name: string; url: string };
  /** Hardcoded headlines bundled with the site (no server to fetch fresh news). */
  snapshot?: boolean;
}

const FILTERS: Array<{ id: 'all' | Asset; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'gold', label: 'Gold' },
  { id: 'silver', label: 'Silver' },
  { id: 'oil', label: 'Oil' },
  { id: 'forex', label: 'Forex' },
];

export function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m || 1}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/** Live, market-moving headlines (Google News RSS, GDELT fallback; AI-ranked) for gold, silver, oil and forex. */
export default function MarketNews({ frame, updateSettings }: ModuleProps) {
  const filter = (frame.settings.filter as 'all' | Asset) ?? 'all';
  const [data, setData] = useState<Resp | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/live/news');
      setData((await r.json()) as Resp);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    // Poll quickly while the server is gathering headlines, otherwise every 5 minutes.
    const t = setInterval(load, data?.refreshing || !data?.items.length ? 15_000 : 300_000);
    return () => clearInterval(t);
  }, [load, data?.refreshing, data?.items.length]);

  const items = (data?.items ?? []).filter((i) => filter === 'all' || i.assets.includes(filter));

  return (
    <div className="mn">
      <div className="mn-head">
        <div className="mn-filters" role="tablist" aria-label="Market">
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} className={`mn-chip ${filter === f.id ? 'on' : ''}`} onClick={() => updateSettings({ filter: f.id })}>
              {f.label}
            </button>
          ))}
        </div>
        <button className="btn icon sm ghost" onClick={() => void load()} aria-label="Refresh news" data-tip="Refresh">
          <RefreshCw className={data?.refreshing ? 'spin' : ''} />
        </button>
      </div>

      <div className="mn-list">
        {!data && !failed && [0, 1, 2, 3].map((i) => <div key={i} className="mn-skel"><div className="skeleton" style={{ width: '85%' }} /><div className="skeleton" style={{ width: '45%' }} /></div>)}
        {failed && <Empty icon={<Newspaper />} title="News is unavailable" hint="Saved headlines could not be loaded." />}
        {data && !items.length && (
          <Empty icon={<Newspaper />} title={data.refreshing ? 'Gathering today’s market news…' : 'No headlines for this market right now'} hint={data.refreshing ? 'This takes about a minute the first time.' : data.error ?? undefined}>
            {data.refreshing && <span className="spinner" />}
          </Empty>
        )}
        {items.map((n) => (
          <a key={n.id} className="mn-item" href={n.url} target="_blank" rel="noopener noreferrer nofollow">
            <div className="mn-top">
              {n.impact && <span className={`mn-impact ${n.impact}`}>{n.impact}</span>}
              {n.assets.map((a) => <span key={a} className={`mn-asset ${a}`}>{a}</span>)}
              {n.direction && n.direction !== 'neutral' && <span className={`mn-dir ${n.direction}`}>{n.direction}</span>}
              <span className="mn-meta">{n.source} · {ago(n.publishedAt)}</span>
            </div>
            <div className="mn-title">{n.title}<ExternalLink size={12} className="mn-ext" /></div>
            {n.why && <div className="mn-why">{n.why}</div>}
          </a>
        ))}
      </div>

      <div className="mn-foot">
        {data?.snapshot ? 'Saved headlines · ' : <><span className="live-dot" /> Live · </>}<a href={data?.source.url ?? 'https://news.google.com/'} target="_blank" rel="noopener noreferrer">{data?.source.name ?? 'Google News'}</a>
        {data?.ranked ? ' · AI-ranked for market impact' : ' · keyword-filtered'}
        {data?.fetchedAt && <span className="muted"> · updated {ago(data.fetchedAt)}</span>}
      </div>
    </div>
  );
}
