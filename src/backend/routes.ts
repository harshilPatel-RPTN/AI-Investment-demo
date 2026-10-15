// Runs in the browser (no server). Same URLs and JSON shapes as the old Express routes in server/src/routes.
import { aiRequestSchema, analysisSchema, strategyOutputSchema } from './schemas';
import { complete, extractJson, llmConfig, splitThinking } from './llm';
import { briefingRequestSchema, finChat, finChatSchema, finConfig, generateBriefing, liveSession, liveToolsSchema } from './fin';
import newsSnapshot from '../data/live/newsSnapshot.json';
import calendarSnapshot from '../data/live/calendarSnapshot.json';

export interface Reply {
  status: number;
  body: unknown;
}
const ok = (body: object): Reply => ({ status: 200, body: { ok: true, ...body } });
const fail = (status: number, code: string, error: string, extra: object = {}): Reply => ({ status, body: { ok: false, code, error, ...extra } });

/** Minimum gap between calls plus an hourly cap (protects the free-tier quota from accidental loops). */
function limiter(minGapMs: number, perHour: number) {
  let hits: number[] = [];
  return () => {
    const now = Date.now();
    hits = hits.filter((t) => now - t < 3_600_000);
    if (hits.length && now - hits[hits.length - 1] < minGapMs) return 'Please wait a moment before trying again.';
    if (hits.length >= perHour) return 'Hourly limit reached. Try again later.';
    hits.push(now);
    return null;
  };
}
const tokenLimit = limiter(800, 60);
const briefingLimit = limiter(3000, 30);
const chatLimit = limiter(800, 200);

const NO_KEY = 'AI is not configured: set VITE_GEMINI_API_KEY in the .env file and restart npm run dev.';

/* ---------------------------------- AI copilot ---------------------------------- */

let aiInFlight = false;
let aiLastAt = 0;

async function analyze(input: unknown, signal?: AbortSignal): Promise<Reply> {
  const parsed = aiRequestSchema.safeParse(input);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return fail(400, 'invalid_request', `${i.path.join('.') || 'body'}: ${i.message}`, { mode: 'chat' });
  }
  const body = parsed.data;
  const m = { mode: body.mode };
  const cfg = llmConfig();
  if (!cfg.hasKey) return fail(503, 'no_key', NO_KEY, m);
  const now = Date.now();
  if (aiInFlight) return fail(429, 'busy', 'A request is already in progress. Please wait for it to finish.', m);
  if (now - aiLastAt < 1200) return fail(429, 'too_fast', 'Requests are being sent too quickly. Try again in a moment.', m);
  aiInFlight = true;
  aiLastAt = now;
  try {
    const { completion, model } = await complete(body, signal);
    const text = completion.choices[0]?.message?.content ?? '';
    const usage = completion.usage ?? undefined;
    if (!text.trim()) return fail(502, 'empty', 'The model returned an empty response. Please retry.', m);
    if (body.mode === 'analyze' || body.mode === 'strategy') {
      let raw: unknown;
      try {
        raw = extractJson(text);
      } catch {
        return fail(502, 'invalid_json', 'The model returned malformed JSON. Please retry.', m);
      }
      return body.mode === 'analyze'
        ? ok({ mode: body.mode, analysis: analysisSchema.parse(raw ?? {}), usage, model })
        : ok({ mode: body.mode, rules: strategyOutputSchema.parse(raw ?? {}), usage, model });
    }
    const { thinking, answer } = splitThinking(text);
    if (!answer) return fail(502, 'empty', 'The model only returned its reasoning. Please retry.', m);
    return ok({ mode: body.mode, text: answer.slice(0, 12000), thinking, usage, model });
  } catch (e) {
    const err = e as { status?: number; message?: string; name?: string };
    if (signal?.aborted) throw e;
    const status = err.status ?? 0;
    console.warn(`[ai] provider error status=${status} ${String(err.message ?? '').slice(0, 200)}`);
    if (status === 401 || status === 403) return fail(502, 'auth', 'Gemini rejected the API key. Check VITE_GEMINI_API_KEY.', m);
    if (status === 429) return fail(429, 'rate_limited', 'AI provider rate limit / free-tier quota reached. Wait a minute and retry.', m);
    if (status === 404) return fail(502, 'model', `Model "${cfg.model}" (and fallbacks) are not available for this key. Change VITE_GEMINI_MODEL.`, m);
    if (status === 503 || status === 500) return fail(503, 'overloaded', 'The free-tier AI models are overloaded right now. Please retry in a moment.', m);
    if (err.name === 'APIConnectionTimeoutError' || /timed? ?out/i.test(err.message ?? '')) return fail(504, 'timeout', 'The AI request timed out. Please retry.', m);
    if (err.name === 'APIConnectionError') return fail(502, 'network', 'Could not reach Gemini (network error).', m);
    return fail(502, 'provider', 'The AI provider returned an error. Please retry.', m);
  } finally {
    aiInFlight = false;
  }
}

/* ---------------------------------- FIN ---------------------------------- */

function providerError(e: unknown): Reply {
  const err = e as { status?: number; message?: string };
  const status = err.status ?? 0;
  console.warn(`[fin] provider error status=${status} ${String(err.message ?? '').slice(0, 160)}`);
  if (status === 401 || status === 403) return fail(502, 'auth', 'Gemini rejected the API key.');
  if (status === 429) return fail(429, 'rate_limited', 'Free-tier AI quota reached. Wait a minute and retry.');
  if (status === 503 || status === 500) return fail(503, 'overloaded', 'The AI models are overloaded right now. Please retry.');
  if (status === 404) return fail(502, 'model', 'The configured AI model is not available for this key.');
  return fail(502, 'provider', 'The AI provider returned an error. Please retry.');
}

function finToken(body: { attempt?: unknown; tools?: unknown; voice?: unknown }): Reply {
  if (!finConfig().hasKey) return fail(503, 'no_key', NO_KEY);
  const limited = tokenLimit();
  if (limited) return fail(429, 'too_fast', limited);
  const attempt = Number.isInteger(body?.attempt) ? Math.max(0, Math.min(5, body.attempt as number)) : 0;
  const tools = body?.tools === undefined ? undefined : liveToolsSchema.safeParse(body.tools);
  if (tools && !tools.success) return fail(400, 'invalid_request', `Invalid tools: ${tools.error.issues[0].message}`);
  const voice = typeof body?.voice === 'string' ? body.voice.slice(0, 20) : undefined;
  return ok(liveSession(attempt, tools?.data, voice));
}

async function finBriefing(input: unknown, signal?: AbortSignal): Promise<Reply> {
  const parsed = briefingRequestSchema.safeParse(input);
  if (!parsed.success) return fail(400, 'invalid_request', parsed.error.issues[0].message);
  if (!finConfig().hasKey) return fail(503, 'no_key', NO_KEY);
  const limited = briefingLimit();
  if (limited) return fail(429, 'too_fast', limited);
  try {
    const out = await generateBriefing(parsed.data, signal);
    if (!out.sections.length) return fail(502, 'empty', 'The model produced no usable briefing sections.');
    return ok(out);
  } catch (e) {
    if (signal?.aborted) throw e;
    if ((e as Error).message?.includes('JSON')) return fail(502, 'invalid_json', 'The model returned malformed JSON.');
    return providerError(e);
  }
}

async function finChatRoute(input: unknown, signal?: AbortSignal): Promise<Reply> {
  const parsed = finChatSchema.safeParse(input);
  if (!parsed.success) return fail(400, 'invalid_request', parsed.error.issues[0].message);
  if (!finConfig().hasKey) return fail(503, 'no_key', NO_KEY);
  const limited = chatLimit();
  if (limited) return fail(429, 'too_fast', limited);
  try {
    return ok(await finChat(parsed.data, signal));
  } catch (e) {
    if (signal?.aborted) throw e;
    return providerError(e);
  }
}

/* ---------------------------------- Live data ---------------------------------- */

/**
 * News is a hardcoded snapshot (AI-ranked headlines saved at build time): news sites don't allow
 * direct browser requests, and there is no server any more. To refresh, replace src/data/live/newsSnapshot.json.
 */
function news(): Reply {
  const snap = newsSnapshot as { items: unknown[]; fetchedAt: number; ranked: boolean };
  return ok({
    items: snap.items,
    fetchedAt: new Date(snap.fetchedAt).toISOString(),
    ranked: snap.ranked,
    refreshing: false,
    snapshot: true,
    error: null,
    retryAt: null,
    source: { name: 'Google News', url: 'https://news.google.com/' },
  });
}

type Asset = 'gold' | 'silver' | 'oil' | 'forex';
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
const isHttp = (u: string) => /^https?:\/\//i.test(u);

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

const mapEvents = (list: FcEvent[]) =>
  list
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

const ATTR = { source: { name: 'financecalendar.com', url: 'https://www.financecalendar.com' } };
let cal: { key: string; at: number; events: unknown[] } | null = null;

/** Live from the browser (financecalendar.com allows it); falls back to the saved snapshot when offline. */
async function calendar(params: URLSearchParams): Promise<Reply> {
  const days = Math.max(1, Math.min(31, Number(params.get('days')) || 14));
  const from = new Date();
  const to = new Date(Date.now() + days * 86_400_000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const key = `${ymd(from)}:${days}`;
  if (cal && cal.key === key && Date.now() - cal.at < 30 * 60_000) return ok({ events: cal.events, cached: true, ...ATTR });
  try {
    const r = await fetch(`https://www.financecalendar.com/wp-json/fc/v1/calendar?from=${ymd(from)}&to=${ymd(to)}&limit=300`, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as { events?: FcEvent[] };
    cal = { key, at: Date.now(), events: mapEvents(j.events ?? []) };
    return ok({ events: cal.events, cached: false, ...ATTR });
  } catch {
    if (cal) return ok({ events: cal.events, cached: true, stale: true, ...ATTR });
    return ok({ events: mapEvents((calendarSnapshot as { events: FcEvent[] }).events), cached: true, stale: true, snapshot: true, ...ATTR });
  }
}

/* ---------------------------------- Router ---------------------------------- */

export async function handle(method: string, url: URL, body: unknown, signal?: AbortSignal): Promise<Reply> {
  const p = url.pathname;
  if (method === 'GET' && p === '/api/ai/health') {
    const cfg = llmConfig();
    return ok({ hasKey: cfg.hasKey, model: cfg.model, provider: cfg.provider });
  }
  if (method === 'POST' && p === '/api/ai/analyze') return analyze(body, signal);
  if (method === 'GET' && p === '/api/fin/status') {
    const cfg = finConfig();
    return ok({ hasKey: cfg.hasKey, liveModels: cfg.liveModels, voice: cfg.voice, textModel: cfg.model });
  }
  if (method === 'POST' && p === '/api/fin/token') return finToken((body ?? {}) as never);
  if (method === 'POST' && p === '/api/fin/briefing') return finBriefing(body, signal);
  if (method === 'POST' && p === '/api/fin/chat') return finChatRoute(body, signal);
  if (method === 'GET' && p === '/api/live/news') return news();
  if (method === 'GET' && p === '/api/live/calendar') return calendar(url.searchParams);
  if (p === '/api/health') return ok({});
  return fail(404, 'not_found', `No handler for ${method} ${p}`);
}
