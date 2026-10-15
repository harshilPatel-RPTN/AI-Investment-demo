import { useApp } from '../../store/appStore';
import { apiFetch } from '../../lib/apiFetch';
import { finVoice } from '../voices';
import type { TransportEvents, VoiceTransport } from './transport';

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

// Common system voice names, used to honour the user's female/male choice in the browser fallback.
const FEMALE_NAMES = /female|zira|heera|neerja|aria|jenny|sonia|libby|susan|hazel|samantha|karen|moira|tessa|veena|swara|ava|emma|michelle|natasha/i;
const MALE_NAMES = /\bmale|david|ravi|prabhat|guy|ryan|george|mark|daniel|alex|fred|rishi|thomas|christopher|eric|andrew|brian|william/i;

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const gender = finVoice(useApp.getState().finVoice).gender;
  const wanted = gender === 'female' ? FEMALE_NAMES : MALE_NAMES;
  const other = gender === 'female' ? MALE_NAMES : FEMALE_NAMES;
  const score = (v: SpeechSynthesisVoice) =>
    (wanted.test(v.name) ? 8 : other.test(v.name) ? -8 : 0) + (/natural|neural|online/i.test(v.name) ? 4 : 0) + (/en-IN/i.test(v.lang) ? 2 : /en-(GB|US)/i.test(v.lang) ? 1 : 0) + (/google|microsoft/i.test(v.name) ? 1 : 0);
  return voices.filter((v) => v.lang.startsWith('en')).sort((a, b) => score(b) - score(a))[0] ?? null;
}

/**
 * Turn-based fallback: browser speech recognition → FIN text answer from our server → browser speech synthesis.
 * Clearly NOT full-duplex: no barge-in while speaking, and no real audio levels are reported.
 */
export class FallbackTransport implements VoiceTransport {
  readonly kind = 'fallback' as const;
  readonly realtime = false;
  readonly label = 'Browser voice (turn-based fallback)';
  private context = '';
  private muted = false;
  private seq = 0;
  private rec: Recognition | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private abort: AbortController | null = null;
  private speaking = false;

  constructor(private ev: TransportEvents, private readonly offline = false) {}

  async connect(context: string) {
    this.context = context;
    this.ev.onStatus('idle');
  }

  /** Speaks text (or, when muted / unsupported, reveals it at reading pace) and reports completion. */
  private say(text: string, kind: 'narration' | 'answer') {
    this.cancelSpeech();
    const turnId = `f${++this.seq}`;
    const done = () => {
      this.speaking = false;
      this.ev.onCaption({ role: 'fin', text: '', turnId, final: true });
      this.ev.onStatus('idle');
      this.ev.onTurnDone(kind);
    };
    this.speaking = true;
    this.ev.onStatus('speaking');
    const synth = window.speechSynthesis;
    if (this.muted || !synth) {
      const words = text.split(/\s+/);
      let i = 0;
      const step = () => {
        if (i >= words.length) return done();
        this.ev.onCaption({ role: 'fin', text: (i ? ' ' : '') + words[i++], turnId });
        this.timer = setTimeout(step, 380);
      };
      step();
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.03;
    let shown = 0;
    u.onboundary = (e) => {
      if (e.name !== 'word') return;
      const end = text.indexOf(' ', e.charIndex);
      const upto = end < 0 ? text.length : end;
      if (upto > shown) {
        this.ev.onCaption({ role: 'fin', text: text.slice(shown, upto), turnId });
        shown = upto;
      }
    };
    u.onend = () => {
      if (shown < text.length) this.ev.onCaption({ role: 'fin', text: text.slice(shown), turnId });
      done();
    };
    u.onerror = (e) => {
      if (e.error === 'canceled' || e.error === 'interrupted') return;
      if (shown < text.length) this.ev.onCaption({ role: 'fin', text: text.slice(shown), turnId });
      done();
    };
    synth.speak(u);
  }

  narrate(script: string) {
    this.say(script, 'narration');
  }

  async ask(text: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = []) {
    this.cancelSpeech();
    if (this.offline) {
      this.ev.onError('offline', 'AI is unavailable right now, so FIN can only read the local briefing. Check the server and API key.');
      this.ev.onStatus('idle');
      return;
    }
    this.ev.onStatus('thinking');
    this.abort = new AbortController();
    try {
      const res = await apiFetch('/api/fin/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: text, history: history.slice(-12), context: { briefingContext: this.context.slice(0, 26000) } }),
        signal: this.abort.signal,
      });
      const data = (await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))) as { ok: boolean; text?: string; error?: string; code?: string };
      if (!data.ok || !data.text) {
        this.ev.onError(data.code ?? 'chat', data.error ?? 'FIN could not answer.');
        this.ev.onStatus('idle');
        return;
      }
      this.say(data.text, 'answer');
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      this.ev.onError('offline', 'Could not reach the FIN server.');
      this.ev.onStatus('disconnected');
    }
  }

  updateContext(text: string) {
    this.context = `${this.context}\n${text}`.slice(-28000);
  }

  async startMic() {
    const Ctor = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
    if (!Ctor) throw Object.assign(new Error('Speech recognition is not available in this browser. Use the text box instead.'), { code: 'unsupported' });
    if (this.speaking) this.stopSpeaking();
    const rec = new Ctor();
    rec.lang = 'en-IN';
    rec.interimResults = true;
    rec.continuous = false;
    const turnId = `u${++this.seq}`;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim) this.ev.onStatus('listening');
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') this.ev.onError('mic_denied', 'Microphone permission was denied.');
      else if (e.error === 'no-speech') this.ev.onError('empty', "I didn't catch anything. Try again or type your question.");
      else if (e.error !== 'aborted') this.ev.onError('stt', `Speech recognition error: ${e.error}.`);
    };
    rec.onend = () => {
      this.rec = null;
      this.ev.onStatus('idle');
      if (finalText.trim()) this.ev.onCaption({ role: 'user', text: finalText.trim(), turnId, final: true });
    };
    this.rec = rec;
    rec.start();
    this.ev.onStatus('listening');
  }

  stopMic() {
    this.rec?.stop();
    this.rec = null;
  }

  private cancelSpeech() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    window.speechSynthesis?.cancel();
  }

  stopSpeaking() {
    this.abort?.abort();
    this.cancelSpeech();
    this.speaking = false;
    this.ev.onStatus('idle');
  }

  pause() {
    window.speechSynthesis?.pause();
    if (this.timer) clearTimeout(this.timer);
    this.ev.onStatus('paused');
  }

  resume() {
    window.speechSynthesis?.resume();
    this.ev.onStatus(this.speaking ? 'speaking' : 'idle');
  }

  setMuted(m: boolean) {
    this.muted = m;
  }

  levels() {
    return { out: null, in: null };
  }

  analyser() {
    return null;
  }

  close() {
    this.stopSpeaking();
    this.rec?.abort();
    this.rec = null;
  }
}
