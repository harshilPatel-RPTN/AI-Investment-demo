import { Router, type Request, type Response } from 'express';
import { aiRequestSchema, analysisSchema, strategyOutputSchema } from '../schemas/ai';
import { complete, extractJson, llmConfig, splitThinking } from '../services/llm';

export const aiRouter = Router();

// Debounce accidental repeat submissions: one in-flight request per client IP, plus a short cooldown.
const inFlight = new Set<string>();
const lastAt = new Map<string, number>();
const COOLDOWN_MS = 1200;

function fail(res: Response, status: number, code: string, error: string, mode = 'chat') {
  res.status(status).json({ ok: false, mode, code, error });
}

aiRouter.get('/health', (_req, res) => {
  const cfg = llmConfig();
  res.json({ ok: true, hasKey: cfg.hasKey, model: cfg.model, provider: cfg.provider });
});

aiRouter.post('/analyze', async (req: Request, res: Response) => {
  const parsed = aiRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return fail(res, 400, 'invalid_request', `${i.path.join('.') || 'body'}: ${i.message}`);
  }
  const body = parsed.data;
  const cfg = llmConfig();
  if (!cfg.hasKey) return fail(res, 503, 'no_key', 'AI is not configured: set GEMINI_API_KEY in the server .env file and restart.', body.mode);

  const ip = req.ip ?? 'local';
  const now = Date.now();
  if (inFlight.has(ip)) return fail(res, 429, 'busy', 'A request is already in progress. Please wait for it to finish.', body.mode);
  if (now - (lastAt.get(ip) ?? 0) < COOLDOWN_MS) return fail(res, 429, 'too_fast', 'Requests are being sent too quickly. Try again in a moment.', body.mode);
  inFlight.add(ip);
  lastAt.set(ip, now);

  const ac = new AbortController();
  res.on('close', () => !res.writableFinished && ac.abort());
  try {
    const { completion, model } = await complete(body, ac.signal);
    const text = completion.choices[0]?.message?.content ?? '';
    const usage = completion.usage ?? undefined;
    if (!text.trim()) return fail(res, 502, 'empty', 'The model returned an empty response. Please retry.', body.mode);

    if (body.mode === 'analyze') {
      let raw: unknown;
      try {
        raw = extractJson(text);
      } catch {
        return fail(res, 502, 'invalid_json', 'The model returned malformed JSON. Please retry.', body.mode);
      }
      const analysis = analysisSchema.parse(raw ?? {});
      return res.json({ ok: true, mode: body.mode, analysis, usage, model });
    }
    if (body.mode === 'strategy') {
      let raw: unknown;
      try {
        raw = extractJson(text);
      } catch {
        return fail(res, 502, 'invalid_json', 'The model returned malformed JSON. Please retry.', body.mode);
      }
      const rules = strategyOutputSchema.parse(raw ?? {});
      return res.json({ ok: true, mode: body.mode, rules, usage, model });
    }
    const { thinking, answer } = splitThinking(text);
    if (!answer) return fail(res, 502, 'empty', 'The model only returned its reasoning. Please retry.', body.mode);
    return res.json({ ok: true, mode: body.mode, text: answer.slice(0, 12000), thinking, usage, model });
  } catch (e) {
    const err = e as { status?: number; message?: string; name?: string };
    if (ac.signal.aborted) return; // client went away
    const status = err.status ?? 0;
    // Log status/message only — never the key.
    console.error(`[ai] provider error status=${status} ${String(err.message ?? '').slice(0, 200)}`);
    if (status === 401 || status === 403) return fail(res, 502, 'auth', 'The AI provider rejected the API key. Check GEMINI_API_KEY.', body.mode);
    if (status === 429) return fail(res, 429, 'rate_limited', 'AI provider rate limit / free-tier quota reached. Wait a minute and retry.', body.mode);
    if (status === 404) return fail(res, 502, 'model', `Model "${cfg.model}" (and fallbacks) are not available for this key. Change GEMINI_MODEL.`, body.mode);
    if (status === 503 || status === 500) return fail(res, 503, 'overloaded', 'The free-tier AI models are overloaded right now. Please retry in a moment.', body.mode);
    if (err.name === 'APIConnectionTimeoutError' || /timed? ?out/i.test(err.message ?? '')) return fail(res, 504, 'timeout', 'The AI request timed out. Please retry.', body.mode);
    if (err.name === 'APIConnectionError') return fail(res, 502, 'network', 'Could not reach the AI provider (network error).', body.mode);
    return fail(res, 502, 'provider', 'The AI provider returned an error. Please retry.', body.mode);
  } finally {
    inFlight.delete(ip);
  }
});
