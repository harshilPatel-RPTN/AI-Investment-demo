// Dev probe: verifies the ephemeral-token → Live API path for each candidate model.
// Usage: node server/scripts/probe-live.mjs
import dotenv from 'dotenv';
import { GoogleGenAI, Modality } from '@google/genai';

dotenv.config({ path: new URL('../../.env', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });
const key = process.env.GEMINI_API_KEY;
const models = process.argv.slice(2).length ? process.argv.slice(2) : ['gemini-3.8-live', 'gemini-3.1-flash-live-preview', 'gemini-2.5-flash-native-audio-latest'];

const server = new GoogleGenAI({ apiKey: key, httpOptions: { apiVersion: 'v1alpha' } });

for (const model of models) {
  const t0 = Date.now();
  try {
    const token = await server.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 10 * 60_000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
        liveConnectConstraints: {
          model,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: 'You are FIN, a friendly market host. Keep answers to one short sentence.',
            outputAudioTranscription: {},
            inputAudioTranscription: {},
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.VOICE || 'Puck' } } },
          },
        },
        httpOptions: { apiVersion: 'v1alpha' },
      },
    });
    // Browser-side equivalent: only the token, never the key.
    const client = new GoogleGenAI({ apiKey: token.name, httpOptions: { apiVersion: 'v1alpha' } });
    let bytes = 0;
    let transcript = '';
    let done;
    const finished = new Promise((r) => (done = r));
    const session = await client.live.connect({
      model,
      callbacks: {
        onmessage: (m) => {
          for (const p of m.serverContent?.modelTurn?.parts ?? []) if (p.inlineData?.data) bytes += Buffer.from(p.inlineData.data, 'base64').length;
          if (m.serverContent?.outputTranscription?.text) transcript += m.serverContent.outputTranscription.text;
          if (m.serverContent?.turnComplete) done('turnComplete');
        },
        onerror: (e) => done(`error ${e.message ?? e.error ?? ''}`),
        onclose: (e) => done(`closed ${e.code} ${e.reason}`),
      },
    });
    const mode = process.env.MODE ?? 'realtime';
    if (mode === 'client') session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: 'Say hello in one sentence.' }] }], turnComplete: true });
    else session.sendRealtimeInput({ text: 'Say hello in one sentence.' });
    const res = await Promise.race([finished, new Promise((r) => setTimeout(() => r('timeout'), 25_000))]);
    session.close();
    console.log(`${model}: ${res} | audio ${bytes} bytes | transcript "${transcript.trim().slice(0, 100)}" | ${Date.now() - t0}ms`);
  } catch (e) {
    console.log(`${model}: FAILED ${e.status ?? ''} ${String(e.message).slice(0, 200)}`);
  }
}
