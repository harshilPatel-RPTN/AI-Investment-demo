import { Router, type Request, type Response } from 'express';
import { briefingRequestSchema, createLiveToken, liveToolsSchema, finChat, finChatSchema, finConfig, generateBriefing } from '../services/fin';

export const finRouter = Router();

/** Simple per-IP limiter: minimum gap between calls plus an hourly cap. */
function limiter(minGapMs: number, perHour: number) {
  const hits = new Map<string, number[]>();
  return (req: Request) => {
    const ip = req.ip ?? 'local';
    const now = Date.now();
    const list = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
    if (list.length && now - list[list.length - 1] < minGapMs) return 'Please wait a moment before trying again.';
    if (list.length >= perHour) return 'Hourly limit reached. Try again later.';
    list.push(now);
    hits.set(ip, list);
    return null;
  };
}
const tokenLimit = limiter(800, 60);
const briefingLimit = limiter(3000, 30);
const chatLimit = limiter(800, 200);

function providerError(res: Response, e: unknown) {
  const err = e as { status?: number; message?: string; name?: string };
  const status = err.status ?? 0;
  console.error(`[fin] provider error status=${status} ${String(err.message ?? '').slice(0, 160)}`);
  if (status === 401 || status === 403) return res.status(502).json({ ok: false, code: 'auth', error: 'The AI provider rejected the API key.' });
  if (status === 429) return res.status(429).json({ ok: false, code: 'rate_limited', error: 'Free-tier AI quota reached. Wait a minute and retry.' });
  if (status === 503 || status === 500) return res.status(503).json({ ok: false, code: 'overloaded', error: 'The AI models are overloaded right now. Please retry.' });
  if (status === 404) return res.status(502).json({ ok: false, code: 'model', error: 'The configured AI model is not available for this key.' });
  return res.status(502).json({ ok: false, code: 'provider', error: 'The AI provider returned an error. Please retry.' });
}

finRouter.get('/status', (_req, res) => {
  const cfg = finConfig();
  res.json({ ok: true, hasKey: cfg.hasKey, liveModels: cfg.liveModels, voice: cfg.voice, textModel: cfg.model });
});

/** Issues a short-lived, single-use Live API token. `attempt` walks the model fallback chain. */
finRouter.post('/token', async (req, res) => {
  const cfg = finConfig();
  if (!cfg.hasKey) return res.status(503).json({ ok: false, code: 'no_key', error: 'Voice is not configured: set GEMINI_API_KEY in .env.' });
  const limited = tokenLimit(req);
  if (limited) return res.status(429).json({ ok: false, code: 'too_fast', error: limited });
  const attempt = Number.isInteger(req.body?.attempt) ? Math.max(0, Math.min(5, req.body.attempt)) : 0;
  const tools = req.body?.tools === undefined ? undefined : liveToolsSchema.safeParse(req.body.tools);
  if (tools && !tools.success) return res.status(400).json({ ok: false, code: 'invalid_request', error: `Invalid tools: ${tools.error.issues[0].message}` });
  try {
    const voice = typeof req.body?.voice === 'string' ? req.body.voice.slice(0, 20) : undefined;
    res.json({ ok: true, ...(await createLiveToken(attempt, tools?.data, voice)) });
  } catch (e) {
    providerError(res, e);
  }
});

finRouter.post('/briefing', async (req, res) => {
  const parsed = briefingRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, code: 'invalid_request', error: parsed.error.issues[0].message });
  if (!finConfig().hasKey) return res.status(503).json({ ok: false, code: 'no_key', error: 'AI is not configured.' });
  const limited = briefingLimit(req);
  if (limited) return res.status(429).json({ ok: false, code: 'too_fast', error: limited });
  const ac = new AbortController();
  res.on('close', () => !res.writableFinished && ac.abort());
  try {
    const out = await generateBriefing(parsed.data, ac.signal);
    if (!out.sections.length) return res.status(502).json({ ok: false, code: 'empty', error: 'The model produced no usable briefing sections.' });
    res.json({ ok: true, ...out });
  } catch (e) {
    if (ac.signal.aborted) return;
    if ((e as Error).message?.includes('JSON')) return res.status(502).json({ ok: false, code: 'invalid_json', error: 'The model returned malformed JSON.' });
    providerError(res, e);
  }
});

finRouter.post('/chat', async (req, res) => {
  const parsed = finChatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, code: 'invalid_request', error: parsed.error.issues[0].message });
  if (!finConfig().hasKey) return res.status(503).json({ ok: false, code: 'no_key', error: 'AI is not configured.' });
  const limited = chatLimit(req);
  if (limited) return res.status(429).json({ ok: false, code: 'too_fast', error: limited });
  const ac = new AbortController();
  res.on('close', () => !res.writableFinished && ac.abort());
  try {
    res.json({ ok: true, ...(await finChat(parsed.data, ac.signal)) });
  } catch (e) {
    if (ac.signal.aborted) return;
    providerError(res, e);
  }
});
