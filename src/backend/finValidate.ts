// Runs in the browser (no server). Ported from server/src — keep prompts in sync.
/** Pure, deterministic checks that keep FIN's script grounded in the supplied evidence. */

/** Collects every number in the context so the script can be checked against supplied evidence. */
export function contextNumbers(ctx: unknown): number[] {
  const out: number[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
    else if (typeof v === 'string') for (const m of v.match(/-?\d[\d,]*\.?\d*/g) ?? []) out.push(Number(m.replace(/,/g, '')));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(ctx);
  return out.filter((n) => Number.isFinite(n));
}

/** True when a number in the script plausibly comes from the context (allowing for rounding and sign). */
function supported(n: number, allowed: number[]) {
  const a = Math.abs(n);
  if (a <= 12 && Number.isInteger(n)) return true; // small counts: "three things", "14-period"
  return allowed.some((b) => {
    const bb = Math.abs(b);
    return Math.abs(a - bb) <= Math.max(bb * 0.006, a < 10 ? 0.051 : 0.5);
  });
}

/**
 * Deterministic guard: drops any sentence quoting a number that is not in the supplied evidence.
 * Returns the cleaned script and a list of removed sentences.
 */
export function validateScript(script: string, allowed: number[]) {
  const sentences = script.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z"“(])/);
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const s of sentences) {
    const nums = (s.match(/-?\d[\d,]*\.?\d*/g) ?? []).map((m) => Number(m.replace(/,/g, '').replace(/\.$/, ''))).filter((n) => Number.isFinite(n));
    if (nums.every((n) => supported(n, allowed))) kept.push(s);
    else dropped.push(s);
  }
  return { script: kept.join(' '), dropped };
}

