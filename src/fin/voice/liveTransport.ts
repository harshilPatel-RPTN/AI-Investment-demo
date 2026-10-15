import { useApp } from '../../store/appStore';
import type { Session } from '@google/genai';
import { analyserLevel, MicCapture, PcmPlayer } from './audio';
import type { TransportEvents, VoiceTransport } from './transport';
import { CONTROL_TOOLS } from '../control/tools';

interface TokenResponse {
  ok: boolean;
  token?: string;
  model?: string;
  hasMore?: boolean;
  code?: string;
  error?: string;
}

/** Mic chunks louder than this while FIN is speaking count as a barge-in attempt. */
const BARGE_RMS = 0.045;
const SETUP_TIMEOUT_MS = 12_000;

/**
 * Real-time, full-duplex voice via the Gemini Live API.
 * The browser only ever receives a short-lived single-use token from our server.
 */
export class LiveTransport implements VoiceTransport {
  readonly kind = 'live' as const;
  readonly realtime = true;
  label = 'Live voice';
  private session: Session | null = null;
  private player: PcmPlayer | null = null;
  private mic: MicCapture | null = null;
  private turnSeq = 0;
  private finTurn = '';
  private userTurn = '';
  private turnKind: 'narration' | 'answer' = 'answer';
  private suppress = false;
  private turnComplete = true;
  private closedByUs = false;
  private loudFrames = 0;
  private paused = false;
  private lastChunkStart = 0;

  constructor(private ev: TransportEvents) {}

  async connect(context: string) {
    this.ev.onStatus('connecting');
    this.player = new PcmPlayer();
    void this.player.resume();
    this.player.onIdle = () => this.maybeTurnDone();
    const { GoogleGenAI } = await import('@google/genai');
    let attempt = 0;
    let lastErr = 'Voice connection failed.';
    for (;;) {
      const res = await fetch('/api/fin/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ attempt, tools: CONTROL_TOOLS, voice: useApp.getState().finVoice }) });
      const tok = (await res.json().catch(() => ({ ok: false, error: `Token request failed (HTTP ${res.status}).` }))) as TokenResponse;
      if (!tok.ok || !tok.token) throw Object.assign(new Error(tok.error ?? 'Could not get a voice token.'), { code: tok.code ?? 'token' });
      try {
        await this.open(new GoogleGenAI({ apiKey: tok.token, httpOptions: { apiVersion: 'v1alpha' } }), tok.model!);
        this.label = `Live voice · ${tok.model}`;
        break;
      } catch (e) {
        lastErr = (e as Error).message;
        if (!tok.hasMore) throw Object.assign(new Error(lastErr), { code: 'live_unavailable' });
        attempt++;
      }
    }
    // Reference data for the whole session; turnComplete:false means "don't reply".
    this.session!.sendClientContent({ turns: [{ role: 'user', parts: [{ text: `[CONTEXT]\n${context}` }] }], turnComplete: false });
    this.ev.onStatus('idle');
  }

  private open(ai: InstanceType<typeof import('@google/genai').GoogleGenAI>, model: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Ready only when BOTH the server's setupComplete arrived AND connect() returned the session
      // (setupComplete can arrive before the connect promise resolves).
      let ready = false;
      let setupDone = false;
      let session: Session | null = null;
      const timer = setTimeout(() => !ready && reject(new Error('Voice setup timed out.')), SETUP_TIMEOUT_MS);
      const tryReady = () => {
        if (ready || !setupDone || !session) return;
        ready = true;
        clearTimeout(timer);
        this.session = session;
        resolve();
      };
      ai.live
        .connect({
          model,
          callbacks: {
            onmessage: (m) => {
              if (m.setupComplete) {
                setupDone = true;
                tryReady();
              }
              this.onMessage(m);
            },
            onerror: (e) => {
              if (!ready) {
                clearTimeout(timer);
                reject(new Error(e.message || 'Voice connection error.'));
              } else this.ev.onError('connection', 'Voice connection error.');
            },
            onclose: (e) => {
              if (!ready) {
                clearTimeout(timer);
                reject(new Error(e.reason || `Voice connection closed (${e.code}).`));
                return;
              }
              this.cleanupAudio();
              if (!this.closedByUs) this.ev.onClose(e.code === 1000 ? 'Session ended.' : e.reason || 'Connection lost.');
            },
          },
        })
        .then((s) => {
          session = s;
          tryReady();
        })
        .catch((e) => {
          clearTimeout(timer);
          reject(e);
        });
    });
  }

  private onMessage(m: import('@google/genai').LiveServerMessage) {
    if (m.toolCall?.functionCalls?.length) this.runTools(m.toolCall.functionCalls);
    const sc = m.serverContent;
    if (m.goAway) this.ev.onError('session_ending', 'The voice session is about to end; FIN will reconnect when you speak again.');
    if (!sc) return;
    if (sc.interrupted) {
      // Server VAD detected the user talking over FIN.
      this.player?.flush();
      this.suppress = false;
      this.ev.onInterrupted();
    }
    if (sc.inputTranscription?.text) {
      if (!this.userTurn) this.userTurn = `u${++this.turnSeq}`;
      this.ev.onCaption({ role: 'user', text: sc.inputTranscription.text, turnId: this.userTurn });
      this.ev.onStatus('thinking');
    }
    for (const p of sc.modelTurn?.parts ?? []) {
      const data = p.inlineData?.data;
      if (!data || this.suppress || !this.player) continue;
      if (!this.finTurn) this.finTurn = `f${++this.turnSeq}`;
      this.turnComplete = false;
      const rate = Number(/rate=(\d+)/.exec(p.inlineData?.mimeType ?? '')?.[1] ?? 24000);
      this.lastChunkStart = this.player.enqueue(data, rate);
      if (!this.paused) this.ev.onStatus('speaking');
    }
    if (sc.outputTranscription?.text && !this.suppress) {
      if (!this.finTurn) this.finTurn = `f${++this.turnSeq}`;
      const turnId = this.finTurn;
      const text = sc.outputTranscription.text;
      // Release caption text roughly when the matching audio is heard.
      const delay = this.player ? Math.min(this.player.delayUntil(this.lastChunkStart) * 1000, 4000) : 0;
      setTimeout(() => this.ev.onCaption({ role: 'fin', text, turnId }), Math.max(0, delay));
    }
    if (sc.turnComplete) {
      this.turnComplete = true;
      this.suppress = false;
      this.userTurn = '';
      this.maybeTurnDone();
    }
  }

  /** Runs app-control tool calls locally and reports the outcome back so FIN can confirm it aloud. */
  private runTools(calls: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>) {
    const functionResponses = calls.map((c) => {
      let output: string;
      try {
        output = this.ev.onToolCall?.(c.name ?? '', c.args ?? {}) ?? 'App control is not available.';
      } catch (e) {
        output = `Failed: ${(e as Error).message}`;
      }
      return { id: c.id, name: c.name, response: { output } };
    });
    try {
      this.session?.sendToolResponse({ functionResponses });
    } catch {
      /* session closed */
    }
  }

  private maybeTurnDone() {
    if (!this.turnComplete || this.player?.playing || this.paused) return;
    if (this.finTurn) {
      const id = this.finTurn;
      this.finTurn = '';
      this.ev.onCaption({ role: 'fin', text: '', turnId: id, final: true });
      this.ev.onTurnDone(this.turnKind);
    }
    this.ev.onStatus(this.mic ? 'listening' : 'idle');
  }

  narrate(script: string) {
    this.beginTurn('narration');
    this.session?.sendClientContent({ turns: [{ role: 'user', parts: [{ text: `[NARRATE] ${script}` }] }], turnComplete: true });
  }

  ask(text: string) {
    this.beginTurn('answer');
    this.session?.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true });
  }

  private beginTurn(kind: 'narration' | 'answer') {
    this.player?.flush();
    this.suppress = false;
    this.turnKind = kind;
    this.finTurn = '';
    this.turnComplete = false;
    this.ev.onStatus('thinking');
  }

  updateContext(text: string) {
    this.session?.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: false });
  }

  async startMic() {
    if (this.mic) return;
    const mic = new MicCapture();
    await mic.start((b64, rms) => {
      if (!this.session) return;
      // While FIN is talking, only forward clearly louder speech (reduces echo self-interruption).
      if (this.player?.playing) {
        this.loudFrames = rms > BARGE_RMS ? this.loudFrames + 1 : 0;
        if (this.loudFrames < 2) return;
      }
      this.session.sendRealtimeInput({ audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } });
    });
    this.mic = mic;
    this.turnKind = 'answer';
    if (!this.player?.playing) this.ev.onStatus('listening');
  }

  stopMic() {
    if (!this.mic) return;
    this.mic.stop();
    this.mic = null;
    try {
      this.session?.sendRealtimeInput({ audioStreamEnd: true });
    } catch {
      /* session closed */
    }
    if (!this.player?.playing) this.ev.onStatus('idle');
  }

  stopSpeaking() {
    this.player?.flush();
    if (!this.turnComplete) this.suppress = true;
    if (this.finTurn) {
      this.ev.onCaption({ role: 'fin', text: '', turnId: this.finTurn, final: true });
      this.finTurn = '';
    }
    this.ev.onStatus(this.mic ? 'listening' : 'idle');
  }

  pause() {
    this.paused = true;
    void this.player?.pause();
    this.ev.onStatus('paused');
  }

  resume() {
    this.paused = false;
    void this.player?.resume();
    this.ev.onStatus(this.player?.playing ? 'speaking' : this.mic ? 'listening' : 'idle');
    this.maybeTurnDone();
  }

  setMuted(m: boolean) {
    this.player?.setMuted(m);
  }

  levels() {
    return { out: this.player ? analyserLevel(this.player.analyser) : null, in: this.mic?.analyser ? analyserLevel(this.mic.analyser) : null };
  }

  analyser(which: 'out' | 'in') {
    return which === 'out' ? (this.player?.analyser ?? null) : (this.mic?.analyser ?? null);
  }

  private cleanupAudio() {
    this.mic?.stop();
    this.mic = null;
    this.player?.close();
    this.player = null;
    this.session = null;
  }

  close() {
    this.closedByUs = true;
    try {
      this.session?.close();
    } catch {
      /* already closed */
    }
    this.cleanupAudio();
  }
}
