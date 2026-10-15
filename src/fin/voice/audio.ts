/** Browser audio primitives for FIN: PCM playback (24 kHz) and microphone capture (16 kHz PCM). */

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(bin);
}

/** Root-mean-square level (0..1) of an analyser's current time-domain data. */
export function analyserLevel(an: AnalyserNode | null, buf?: Uint8Array): number {
  if (!an) return 0;
  const data = buf ?? new Uint8Array(an.fftSize);
  an.getByteTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / data.length);
}

/**
 * Gapless scheduler for 16-bit little-endian mono PCM chunks.
 * source → analyser → gain → speakers, so the waveform reflects real audio even when muted.
 */
export class PcmPlayer {
  readonly ctx: AudioContext;
  readonly analyser: AnalyserNode;
  private gain: GainNode;
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  onIdle: (() => void) | null = null;

  constructor() {
    this.ctx = new AudioContext();
    this.gain = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.connect(this.gain);
    this.gain.connect(this.ctx.destination);
  }

  /** Queues a base64 PCM chunk; returns the context time at which it will start playing. */
  enqueue(b64: string, sampleRate = 24000): number {
    const bytes = base64ToBytes(b64);
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    if (!samples.length) return this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, samples.length, sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < samples.length; i++) ch[i] = samples[i] / 32768;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.analyser);
    const start = Math.max(this.ctx.currentTime + 0.03, this.nextTime);
    src.start(start);
    this.nextTime = start + buf.duration;
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      if (!this.sources.size) this.onIdle?.();
    };
    return start;
  }

  /** Stops everything immediately (interrupt / stop / exit). */
  flush() {
    for (const s of this.sources) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
    this.nextTime = 0;
  }

  get playing() {
    return this.sources.size > 0;
  }

  /** Seconds until the given context time (used to sync captions with audio). */
  delayUntil(t: number) {
    return Math.max(0, t - this.ctx.currentTime);
  }

  setMuted(m: boolean) {
    this.gain.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  pause() {
    return this.ctx.suspend();
  }

  resume() {
    return this.ctx.resume();
  }

  close() {
    this.flush();
    void this.ctx.close();
  }
}

const WORKLET = `
class FinMicProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('fin-mic', FinMicProcessor);
`;

export type MicError = 'denied' | 'no-device' | 'unsupported' | 'failed';

/** Captures the microphone, resamples to 16 kHz and emits ~100 ms base64 PCM16 chunks. */
export class MicCapture {
  analyser: AnalyserNode | null = null;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private pending: number[] = [];
  private readonly target = 16000;

  async start(onChunk: (b64: string, rms: number) => void): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') throw Object.assign(new Error('Microphone capture is not supported in this browser.'), { code: 'unsupported' as MicError });
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      const name = (e as DOMException).name;
      const code: MicError = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'no-device' : 'failed';
      throw Object.assign(new Error(code === 'denied' ? 'Microphone permission was denied.' : code === 'no-device' ? 'No microphone was found.' : 'Could not start the microphone.'), { code });
    }
    this.ctx = new AudioContext();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.node = new AudioWorkletNode(this.ctx, 'fin-mic');
    src.connect(this.analyser);
    src.connect(this.node);
    const ratio = this.ctx.sampleRate / this.target;
    const chunk = this.target / 10; // 100 ms
    this.node.port.onmessage = (ev: MessageEvent<Float32Array>) => {
      const input = ev.data;
      // Linear-interpolation resample to 16 kHz.
      for (let t = 0; t < input.length / ratio; t++) {
        const pos = t * ratio;
        const i = Math.floor(pos);
        const f = pos - i;
        this.pending.push(input[i] * (1 - f) + (input[i + 1] ?? input[i]) * f);
      }
      while (this.pending.length >= chunk) {
        const frame = this.pending.splice(0, chunk);
        const pcm = new Int16Array(frame.length);
        let sum = 0;
        for (let k = 0; k < frame.length; k++) {
          const v = Math.max(-1, Math.min(1, frame[k]));
          sum += v * v;
          pcm[k] = v < 0 ? v * 0x8000 : v * 0x7fff;
        }
        onChunk(bytesToBase64(new Uint8Array(pcm.buffer)), Math.sqrt(sum / frame.length));
      }
    };
  }

  stop() {
    this.node?.port.close();
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.node = null;
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.pending = [];
  }
}
