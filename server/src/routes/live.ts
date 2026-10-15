import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { z } from 'zod';
import { completeMessages, extractJson, llmConfig } from '../services/llm';

/**
 * Live, free data sources (no API keys):
 *  - News: GDELT DOC 2.0 API (global news index). Limit: 1 request / 5 s → we refresh in the background and cache.
 *  - Calendar: financecalendar.com (free with attribution, no rate limit, data changes at most hourly).
 * Headlines are untrusted third-party text: the client renders them as plain text with external links only.
 */
export const liveRouter = Router();

const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(here, '../../.cache');
const NEWS_FILE = path.join(CACHE_DIR, 'news.json');

/* ------------------------------------------------------------------ */
/* News                                                               */
/* ------------------------------------------------------------------ */

type Asset = 'gold' | 'silver' | 'oil' | 'forex';
/** One combined query per refresh (GDELT allows one request every 5 s per IP); the AI sorts results into markets. */
const QUERY =
  '("gold price" OR "gold prices" OR "spot gold" OR bullion OR "silver price" OR "spot silver" OR "oil price" OR "oil prices" OR "crude oil" OR "brent crude" OR opec OR "federal reserve" OR "rate cut" OR "rate hike" OR "dollar index" OR forex OR "central bank" OR rupee OR yen) sourcelang:english';
/** Rough first guess at the market before AI ranking (also used by the keyword fallback). */
function guessAssets(title: string): Asset[] {
  const t = title.toLowerCase();
  const out: Asset[] = [];
  if (/gold|bullion/.test(t)) out.push('gold');
  if (/silver/.test(t)) out.push('silver');
  if (/oil|crude|opec|brent|wti/.test(t)) out.push('oil');
  if (/fed|federal reserve|rate|dollar|forex|currency|rupee|yen|euro|central bank|inflation/.test(t)) out.push('forex');
  return out.length ? out : ['forex'];
}
const NEWS_TTL = 15 * 60_000;
let failures = 0;
let newsProvider = 'Google News';
let retryAfter = 0;

export interface LiveNewsItem {
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

interface NewsCache {
  items: LiveNewsItem[];
  fetchedAt: number;
  ranked: boolean;
  model?: string;
}

let news: NewsCache | null = (() => {
  try {
    return JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8')) as NewsCache;
  } catch {
    return null;
  }
})();
let refreshing: Promise<void> | null = null;
let lastError: string | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isHttp = (u: string) => /^https?:\/\//i.test(u);
/** GDELT dates look like 20261015T100000Z. */
const gdeltDate = (s: string) => {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s ?? '');
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : new Date().toISOString();
};
const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

/* ---- Google News RSS search (primary: free, no key, fast) ---- */
const GN_QUERIES = ['gold price OR silver price OR bullion', 'crude oil price OR OPEC OR brent', 'federal reserve OR forex OR "dollar index" OR "central bank" OR rupee'];
const decode = (t: string) =>
  t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d))).trim();
const tag = (xml: string, name: string) => {
  // String.raw keeps the backslashes (a plain template literal would turn "\s" into "s").
  const m = new RegExp(String.raw`<${name}(?:\s[^>]*)?>([\s\S]*?)</${name}>`).exec(xml);
  return m ? decode(m[1]) : '';
};

export async function fetchGoogleNews(q: string) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:1d`)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'ai-trading-os/1.0 (+local demo)' } });
  if (!res.ok) throw new Error(`Google News HTTP ${res.status}`);
  const xml = await res.text();
  return Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g)).map((m) => {
    const it = m[1];
    const source = tag(it, 'source');
    let title = tag(it, 'title');
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const d = new Date(tag(it, 'pubDate'));
    return { title, url: tag(it, 'link'), source: source || 'Google News', publishedAt: Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString() };
  });
}

async function fetchGdelt(q: string) {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=ArtList&format=json&maxrecords=150&timespan=36h&sort=DateDesc`;
  const res = await fetch(url, { signal: AbortSignal.timeout(25_000), headers: { 'user-agent': 'ai-trading-os/1.0 (+local demo)' } });
  const text = await res.text();
  if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`);
  try {
    return (JSON.parse(text) as { articles?: Array<{ url: string; title: string; seendate: string; domain: string; language: string }> }).articles ?? [];
  } catch {
    throw new Error('GDELT returned non-JSON (rate limited?)');
  }
}

/** One ranked headline. Each is validated on its own so a single malformed entry can't discard the rest. */
const rankItem = z.object({
  i: z.coerce.number().int(),
  relevant: z.boolean().catch(false),
  assets: z.array(z.string()).catch([]),
  impact: z.enum(['high', 'medium', 'low']).catch('low'),
  direction: z.enum(['bullish', 'bearish', 'mixed', 'neutral']).catch('neutral'),
  why: z.string().catch(''),
});
const ASSETS = new Set(['gold', 'silver', 'oil', 'forex']);

/** Gemini keeps only market-moving headlines and explains why each matters (no facts beyond the headline). */
const RANK_PROMPT = `You triage news headlines for traders of gold, silver, crude oil and forex.
Return ONLY the headlines that plausibly move gold, silver, oil or major currencies (skip sports, crime, lifestyle, single-company stock stories, local politics).
For each: assets affected, impact (high = central-bank decisions, inflation/jobs data, OPEC+ supply moves, war/sanctions on producers, sharp price moves; medium = notable but secondary; low = minor),
direction for that asset (bullish/bearish/mixed/neutral) and "why": max 16 words explaining the MARKET MECHANISM (e.g. "Hotter inflation delays Fed cuts, lifting yields and the dollar — a headwind for gold"). Do NOT restate the headline. Use only what the headline implies — no invented numbers or facts.
Return ONLY JSON: {"items":[{"i":number,"assets":["gold"|"silver"|"oil"|"forex"],"impact":"high"|"medium"|"low","direction":"bullish"|"bearish"|"mixed"|"neutral","why":string}]}`;

/** Ranks one batch; small batches keep each Gemini call well under the request timeout. */
async function rankBatch(items: LiveNewsItem[], offset: number) {
  const list = items.map((it, k) => ({ i: offset + k, title: it.title, source: it.source }));
  const { completion, model } = await completeMessages(
    [
      { role: 'system', content: RANK_PROMPT },
      { role: 'user', content: JSON.stringify(list) },
    ],
    { json: true, maxTokens: 3000, temperature: 0.2 },
  );
  // Models sometimes return a bare array instead of {"items": [...]}; accept both.
  const text = (completion.choices[0]?.message?.content ?? '').trim();
  const raw = text.startsWith('[') ? { items: JSON.parse(text) as unknown[] } : (extractJson(text || '{}') as { items?: unknown[] });
  return { model, items: (Array.isArray(raw?.items) ? raw.items : []).flatMap((x) => { const r = rankItem.safeParse({ relevant: true, ...(x as object) }); return r.success ? [r.data] : []; }) };
}

/** Gemini keeps only market-moving headlines and explains why each matters (no facts beyond the headline). */
async function rank(items: LiveNewsItem[]): Promise<{ items: LiveNewsItem[]; model?: string } | null> {
  if (!llmConfig().hasKey || !items.length) return null;
  const BATCH = 20;
  const batches: Promise<Awaited<ReturnType<typeof rankBatch>> | null>[] = [];
  for (let k = 0; k < items.length; k += BATCH) batches.push(rankBatch(items.slice(k, k + BATCH), k).catch((e) => { console.warn(`[live] rank batch failed: ${(e as Error).message}`); return null; }));
  const results = (await Promise.all(batches)).filter((r): r is NonNullable<typeof r> => !!r);
  if (!results.length) throw new Error('AI ranking unavailable');
  const order = { high: 0, medium: 1, low: 2 } as const;
  const out: LiveNewsItem[] = [];
  for (const r of results.flatMap((x) => x.items)) {
    const it = items[r.i];
    const assets = r.assets.map((a) => a.toLowerCase()).filter((a): a is Asset => ASSETS.has(a));
    if (!it || !r.relevant || !assets.length) continue;
    const why = r.why.trim();
    out.push({ ...it, assets, impact: r.impact, direction: r.direction, why: why ? (why.length > 160 ? `${why.slice(0, 157)}…` : why) : null });
  }
  out.sort((a, b) => order[a.impact!] - order[b.impact!] || b.publishedAt.localeCompare(a.publishedAt));
  return { items: out, model: results[0]?.model };
}

/** Keyword fallback when AI ranking isn't available. */
function keywordFilter(items: LiveNewsItem[]) {
  const re = /gold|silver|bullion|oil|crude|opec|brent|wti|fed|federal reserve|rate|inflation|cpi|dollar|forex|currency|rupee|yen|euro|central bank|treasury|yield/i;
  return items.filter((i) => re.test(i.title)).map((i) => ({ ...i, assets: guessAssets(i.title) }));
}

async function refreshNews() {
  const seen = new Set<string>();
  const raw: LiveNewsItem[] = [];
  const push = (title: string, url: string, source: string, publishedAt: string) => {
    const key = normTitle(title ?? '');
    if (!title || key.length < 12 || seen.has(key) || !isHttp(url)) return;
    seen.add(key);
    raw.push({ id: `n${raw.length}`, title: title.replace(/\s+([,.:;!?])/g, '$1').trim().slice(0, 240), url, source, publishedAt, assets: guessAssets(title), impact: null, direction: null, why: null });
  };
  let provider = 'Google News';
  for (const q of GN_QUERIES) {
    try {
      for (const a of (await fetchGoogleNews(q)).slice(0, 40)) push(a.title, a.url, a.source, a.publishedAt);
    } catch (e) {
      lastError = (e as Error).message;
    }
    await sleep(700);
  }
  if (raw.length < 10) {
    provider = 'GDELT';
    try {
      for (const a of await fetchGdelt(QUERY)) push(a.title, a.url, a.domain, gdeltDate(a.seendate));
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  newsProvider = provider;
  if (!raw.length) throw new Error(lastError ?? 'No news returned');
  raw.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const capped = raw.slice(0, 60);
  let next: NewsCache;
  try {
    const ranked = await rank(capped);
    next = ranked && ranked.items.length ? { items: ranked.items.slice(0, 40), fetchedAt: Date.now(), ranked: true, model: ranked.model } : { items: keywordFilter(capped).slice(0, 40), fetchedAt: Date.now(), ranked: false };
  } catch (e) {
    console.warn(`[live] AI ranking failed: ${(e as Error).message}`);
    next = { items: keywordFilter(capped).slice(0, 40), fetchedAt: Date.now(), ranked: false };
  }
  news = next;
  lastError = null;
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(NEWS_FILE, JSON.stringify(news));
  } catch {
    /* cache is optional */
  }
}

function ensureFresh() {
  // Un-ranked (AI unavailable) results are retried after 2 minutes; ranked ones are kept for 15.
  const ttl = news?.ranked ? NEWS_TTL : 2 * 60_000;
  if (refreshing || Date.now() < retryAfter || (news && Date.now() - news.fetchedAt < ttl)) return;
  refreshing = refreshNews()
    .then(() => {
      failures = 0;
    })
    .catch((e) => {
      lastError = (e as Error).message;
      // Back off after failures (3, 6, 12, then 15 min) so we never hammer the free API.
      failures++;
      retryAfter = Date.now() + Math.min(15, 3 * 2 ** (failures - 1)) * 60_000;
      console.warn(`[live] news refresh failed (${lastError}); next try in ${Math.round((retryAfter - Date.now()) / 60000)} min`);
    })
    .finally(() => {
      refreshing = null;
    });
}

liveRouter.get('/news', (_req, res) => {
  ensureFresh();
  res.json({
    ok: true,
    items: news?.items ?? [],
    fetchedAt: news ? new Date(news.fetchedAt).toISOString() : null,
    ranked: news?.ranked ?? false,
    refreshing: !!refreshing,
    error: news ? null : lastError,
    retryAt: !news && retryAfter > Date.now() ? new Date(retryAfter).toISOString() : null,
    source: newsProvider === 'GDELT' ? { name: 'GDELT Project', url: 'https://www.gdeltproject.org/' } : { name: 'Google News', url: 'https://news.google.com/' },
  });
});

/* ------------------------------------------------------------------ */
/* Economic calendar                                                   */
/* ------------------------------------------------------------------ */

interface FcEvent {
  date: string;
  time_utc: string;
  all_day: boolean;
  name: string;
  title: string;
  impact: 'high' | 'medium' | 'low';
  category: string;
  consensus: string | null;
  prior: string | null;
  actual: string | null;
  url: string;
}

/** Which region a release belongs to and which of our markets it typically moves. */
function classify(name: string): { region: string; affects: Asset[] } {
  const n = name.toLowerCase();
  if (/fomc|fed\b|federal|pce|nonfarm|nfp|jobless|ism|jolts|ppi|retail sales|us |u\.s\.|cpi$|^cpi|consumer price/.test(n) && !/uk|canada|australia|china|euro|japan/.test(n)) return { region: 'US', affects: ['forex', 'gold', 'silver', 'oil'] };
  if (/ecb|euro/.test(n)) return { region: 'EU', affects: ['forex', 'gold'] };
  if (/uk|boe|bank of england/.test(n)) return { region: 'UK', affects: ['forex'] };
  if (/boj|japan/.test(n)) return { region: 'JP', affects: ['forex'] };
  if (/canada|boc/.test(n)) return { region: 'CA', affects: ['forex', 'oil'] };
  if (/australia|rba/.test(n)) return { region: 'AU', affects: ['forex', 'gold'] };
  if (/new zealand|rbnz/.test(n)) return { region: 'NZ', affects: ['forex'] };
  if (/snb|swiss/.test(n)) return { region: 'CH', affects: ['forex', 'gold'] };
  if (/china/.test(n)) return { region: 'CN', affects: ['oil', 'silver', 'forex'] };
  if (/india|rbi/.test(n)) return { region: 'IN', affects: ['forex', 'gold'] };
  return { region: 'US', affects: ['forex', 'gold'] };
}

let cal: { key: string; at: number; events: unknown[] } | null = null;

liveRouter.get('/calendar', async (req, res) => {
  const days = Math.max(1, Math.min(31, Number(req.query.days) || 14));
  const from = new Date();
  const to = new Date(Date.now() + days * 86_400_000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const key = `${ymd(from)}:${days}`;
  if (cal && cal.key === key && Date.now() - cal.at < 30 * 60_000) return res.json({ ok: true, events: cal.events, cached: true, ...ATTR });
  try {
    const r = await fetch(`https://www.financecalendar.com/wp-json/fc/v1/calendar?from=${ymd(from)}&to=${ymd(to)}&limit=300`, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as { events?: FcEvent[] };
    const events = (j.events ?? [])
      .filter((e) => e && e.name && e.time_utc)
      .map((e) => ({
        id: e.url || `${e.name}-${e.time_utc}`,
        name: String(e.name).slice(0, 120),
        title: String(e.title ?? e.name).slice(0, 160),
        timeUtc: e.time_utc,
        allDay: !!e.all_day,
        impact: e.impact,
        category: e.category === 'central-banks-monetary-policy' ? 'central-bank' : 'data',
        consensus: e.consensus,
        prior: e.prior,
        actual: e.actual,
        url: isHttp(e.url) ? e.url : 'https://www.financecalendar.com',
        ...classify(e.name),
      }));
    cal = { key, at: Date.now(), events };
    res.json({ ok: true, events, cached: false, ...ATTR });
  } catch (e) {
    if (cal) return res.json({ ok: true, events: cal.events, cached: true, stale: true, ...ATTR });
    res.status(502).json({ ok: false, error: `Economic calendar unavailable (${(e as Error).message}).` });
  }
});

const ATTR = { source: { name: 'financecalendar.com', url: 'https://www.financecalendar.com' } };

// Warm the news cache shortly after start so the first visitor sees headlines quickly.
setTimeout(ensureFresh, 2_000);
