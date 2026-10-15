import type { AIRequest, AIResponse } from '../types/ai';
import { useApp } from '../store/appStore';
import { apiFetch } from './apiFetch';

const TIMEOUT_MS = 90_000; // server may try several fallback models

/** Calls the local proxy. The API key never reaches the browser. Never throws. */
export async function callAI(req: AIRequest, external?: AbortSignal): Promise<AIResponse> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort('timeout'), TIMEOUT_MS);
  const onAbort = () => ac.abort('cancelled');
  external?.addEventListener('abort', onAbort);
  const store = useApp.getState();
  try {
    const res = await apiFetch('/api/ai/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: ac.signal,
    });
    let data: AIResponse;
    try {
      data = (await res.json()) as AIResponse;
    } catch {
      data = { ok: false, mode: req.mode, code: 'bad_response', error: `AI proxy returned HTTP ${res.status} without JSON. Is the server running (npm run dev)?` };
    }
    store.recordAIUsage(!!data.ok, data.usage?.total_tokens, data.error);
    if (data.code === 'no_key') store.set({ aiStatus: 'no-key' });
    else if (data.ok) store.set({ aiStatus: 'online', aiModel: data.model });
    return data;
  } catch {
    const reason = ac.signal.reason;
    const out: AIResponse =
      reason === 'cancelled'
        ? { ok: false, mode: req.mode, code: 'cancelled', error: 'Request stopped.' }
        : reason === 'timeout'
          ? { ok: false, mode: req.mode, code: 'timeout', error: 'The AI request timed out. Please retry.' }
          : { ok: false, mode: req.mode, code: 'offline', error: 'Could not reach the AI proxy. Check that the server is running and you are online.' };
    if (out.code !== 'cancelled') {
      store.recordAIUsage(false, 0, out.error);
      if (out.code === 'offline') store.set({ aiStatus: 'offline' });
    }
    return out;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onAbort);
  }
}

export async function checkAIHealth(): Promise<void> {
  const store = useApp.getState();
  store.set({ aiStatus: 'checking' });
  try {
    const res = await apiFetch('/api/ai/health');
    const data = (await res.json()) as { ok: boolean; hasKey: boolean; model: string };
    store.set({ aiStatus: data.hasKey ? 'online' : 'no-key', aiModel: data.model });
  } catch {
    store.set({ aiStatus: 'offline' });
  }
}
