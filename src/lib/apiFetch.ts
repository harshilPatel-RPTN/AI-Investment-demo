/**
 * Drop-in replacement for fetch('/api/...'): there is no backend server, so the request is answered
 * in the browser by src/backend (loaded lazily so the AI code stays out of the first page load).
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(path, window.location.origin);
  const method = (init.method ?? 'GET').toUpperCase();
  let body: unknown;
  if (typeof init.body === 'string' && init.body) {
    try {
      body = JSON.parse(init.body);
    } catch {
      return new Response(JSON.stringify({ ok: false, code: 'invalid_request', error: 'Body must be JSON' }), { status: 400 });
    }
  }
  const { handle } = await import('../backend/routes');
  const r = await handle(method, url, body, init.signal ?? undefined);
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
}
