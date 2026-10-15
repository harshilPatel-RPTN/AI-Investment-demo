/** Provider-agnostic voice transport so FIN's UI never depends on a specific voice API. */

export type VoiceStatus = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'disconnected';

export interface TransportEvents {
  /** Transport-level status changes (the engine maps these to UI states). */
  onStatus: (s: VoiceStatus) => void;
  /** Incremental caption text. `turnId` groups deltas belonging to one utterance. */
  onCaption: (c: { role: 'fin' | 'user'; text: string; turnId: string; final?: boolean }) => void;
  /** FIN finished a turn AND its audio finished playing. */
  onTurnDone: (kind: 'narration' | 'answer') => void;
  /** The user barged in (spoke over FIN). */
  onInterrupted: () => void;
  onError: (code: string, message: string) => void;
  onClose: (reason: string) => void;
  /** The model asked to run an app-control tool; resolves to a short result it can speak about. */
  onToolCall?: (name: string, args: Record<string, unknown>) => string;
}

export interface VoiceTransport {
  readonly kind: 'live' | 'fallback';
  /** True only for full-duplex real-time audio (supports barge-in). */
  readonly realtime: boolean;
  readonly label: string;
  connect(context: string): Promise<void>;
  /** FIN speaks a pre-validated script. */
  narrate(script: string): void;
  /** A user text turn. */
  ask(text: string, history?: Array<{ role: 'user' | 'assistant'; content: string }>): void;
  /** Adds silent reference context (e.g. the user switched instrument). */
  updateContext(text: string): void;
  startMic(): Promise<void>;
  stopMic(): void;
  /** Stop FIN's audio right now and discard the rest of the current turn. */
  stopSpeaking(): void;
  pause(): void;
  resume(): void;
  setMuted(m: boolean): void;
  /** Real audio levels (0..1), or null when the transport has no level data. */
  levels(): { out: number | null; in: number | null };
  /** Raw analyser for waveform drawing (null when unavailable). */
  analyser(which: 'out' | 'in'): AnalyserNode | null;
  close(): void;
}
