import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage, STORAGE_KEYS } from '../../lib/persistence';
import { useApp } from '../../store/appStore';
import { parseCommands } from './parser';
import { executeAll } from './actions';
import type { CommandResult } from './types';

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export type VoiceLang = 'en-IN' | 'hi-IN' | 'en-US';
export type VoiceStatus = 'off' | 'starting' | 'listening' | 'paused' | 'error';

interface LogEntry {
  id: number;
  heard: string;
  results: CommandResult[];
  at: number;
}

interface VoiceControlState {
  status: VoiceStatus;
  interim: string;
  log: LogEntry[];
  helpOpen: boolean;
  error: string | null;
  lang: VoiceLang;
  speakFeedback: boolean;
}

interface VoiceControlActions {
  start: () => void;
  stop: () => void;
  toggle: () => void;
  setLang: (l: VoiceLang) => void;
  setSpeak: (on: boolean) => void;
  setHelp: (open: boolean) => void;
  /** Runs a typed or spoken utterance. Returns null when it contained no command. */
  handle: (text: string, source?: 'voice' | 'text') => CommandResult[] | null;
}

const recognitionCtor = (): (new () => Recognition) | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const voiceControlSupported = () => recognitionCtor() != null;

let rec: Recognition | null = null;
let wanted = false;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;
/** Ignore recognition while (and just after) we speak, so our own feedback is never taken as a command. */
let speakingUntil = 0;
let logSeq = 0;

function speak(text: string) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/\s*Say "undo".*$/, ''));
  u.rate = 1.08;
  u.lang = useVoiceControl.getState().lang === 'hi-IN' ? 'hi-IN' : 'en-IN';
  speakingUntil = Date.now() + 8000;
  u.onend = u.onerror = () => (speakingUntil = Date.now() + 700);
  synth.speak(u);
}

export const useVoiceControl = create<VoiceControlState & VoiceControlActions>()(
  persist(
    (set, get) => {
      const begin = () => {
        const Ctor = recognitionCtor();
        if (!Ctor) {
          wanted = false;
          set({ status: 'error', error: 'Voice control needs speech recognition, which this browser does not provide. Use Chrome or Edge.' });
          return;
        }
        const r = new Ctor();
        r.lang = get().lang;
        r.continuous = true;
        r.interimResults = true;
        r.maxAlternatives = 1;
        r.onresult = (e) => {
          if (Date.now() < speakingUntil) return;
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            const text = res[0]?.transcript ?? '';
            if (res.isFinal) {
              set({ interim: '' });
              if (text.trim()) get().handle(text.trim(), 'voice');
            } else interim += text;
          }
          if (interim) set({ interim });
          failures = 0;
        };
        r.onerror = (e) => {
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
            wanted = false;
            set({ status: 'error', error: 'Microphone permission was denied. Allow the microphone for this site and try again.' });
          } else if (e.error === 'audio-capture') {
            wanted = false;
            set({ status: 'error', error: 'No microphone was found.' });
          } else if (e.error === 'network') {
            failures++;
          }
          // 'no-speech' and 'aborted' are normal — onend restarts.
        };
        r.onend = () => {
          rec = null;
          if (!wanted) return;
          // Browsers end recognition after silence; keep listening until the user turns it off.
          if (failures > 4) {
            wanted = false;
            set({ status: 'error', error: 'Speech recognition keeps disconnecting (network). Voice control was turned off.' });
            return;
          }
          restartTimer = setTimeout(() => wanted && begin(), failures ? 800 * failures : 150);
        };
        rec = r;
        try {
          r.start();
          set({ status: 'listening', error: null });
        } catch {
          restartTimer = setTimeout(() => wanted && begin(), 500);
        }
      };

      return {
        status: 'off',
        interim: '',
        log: [],
        helpOpen: false,
        error: null,
        lang: 'en-IN',
        speakFeedback: true,

        start: () => {
          if (wanted) return;
          wanted = true;
          failures = 0;
          set({ status: 'starting', error: null });
          begin();
        },
        stop: () => {
          wanted = false;
          if (restartTimer) clearTimeout(restartTimer);
          rec?.abort();
          rec = null;
          set({ status: 'off', interim: '' });
        },
        toggle: () => (wanted ? get().stop() : get().start()),
        setLang: (lang) => {
          set({ lang });
          if (wanted) {
            rec?.abort(); // onend restarts with the new language
          }
        },
        setSpeak: (speakFeedback) => set({ speakFeedback }),
        setHelp: (helpOpen) => set({ helpOpen }),

        handle: (text, source = 'text') => {
          const cmds = parseCommands(text);
          if (!cmds.length) {
            if (source === 'voice') {
              set((s) => ({ log: [{ id: ++logSeq, heard: text, results: [], at: Date.now() }, ...s.log].slice(0, 20) }));
            }
            return null;
          }
          const results = executeAll(cmds);
          set((s) => ({ log: [{ id: ++logSeq, heard: text, results, at: Date.now() }, ...s.log].slice(0, 20) }));
          if (source === 'voice') {
            const msg = results.map((r) => r.message).join(' ');
            if (get().speakFeedback && cmds[0].kind !== 'ask-fin' && cmds[0].kind !== 'briefing') speak(msg);
            const bad = results.find((r) => !r.ok);
            useApp.getState().toast({ title: bad ? 'Voice command failed' : `“${text}”`, body: msg, tone: bad ? 'warning' : 'success' });
          }
          return results;
        },
      };
    },
    {
      name: STORAGE_KEYS.voice,
      version: 1,
      storage: createJSONStorage(() => safeStorage()),
      partialize: (s) => ({ lang: s.lang, speakFeedback: s.speakFeedback }),
    },
  ),
);

/** Pause the standalone listener while FIN's own real-time mic is live, so commands never run twice. */
export function setVoiceControlPaused(paused: boolean) {
  const s = useVoiceControl.getState();
  if (paused && wanted && rec) {
    wanted = false;
    rec.abort();
    useVoiceControl.setState({ status: 'paused' });
    resumeAfterPause = true;
  } else if (!paused && resumeAfterPause) {
    resumeAfterPause = false;
    s.start();
  }
}
let resumeAfterPause = false;
