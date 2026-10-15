// Runs in the browser (no server). Ported from server/src — keep prompts in sync.
/**
 * Gemini settings come from Vite env vars (VITE_*), which are embedded in the website bundle.
 * NOTE: this makes the API key visible to anyone who opens the site — restrict the key
 * (HTTP-referrer restriction in Google AI Studio / Cloud console) before sharing the site.
 */
const env = import.meta.env as Record<string, string | undefined>;
const list = (v: string | undefined, d: string) => (v ?? d).split(',').map((m) => m.trim()).filter(Boolean);

export function readConfig() {
  const key = env.VITE_GEMINI_API_KEY?.trim() || '';
  return {
    key,
    hasKey: key.length > 10 && key !== 'your_key_here',
    model: env.VITE_GEMINI_MODEL?.trim() || 'gemini-flash-latest',
    fallbackModels: list(env.VITE_GEMINI_FALLBACK_MODELS, 'gemini-3.5-flash-lite,gemini-flash-lite-latest'),
    liveModels: list(env.VITE_GEMINI_LIVE_MODELS, 'gemini-3.8-live,gemini-3.1-flash-live-preview,gemini-2.5-flash-native-audio-latest'),
    voice: env.VITE_GEMINI_LIVE_VOICE?.trim() || 'Puck',
    reasoning: (env.VITE_GEMINI_REASONING?.trim() || 'medium') as 'low' | 'medium' | 'high',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    provider: 'Google Gemini',
  };
}
