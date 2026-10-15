import { create } from 'zustand';
import { useApp } from '../store/appStore';
import { apiFetch } from '../lib/apiFetch';
import { getInstrument } from '../data/instruments';
import { buildBriefingContext, instrumentNote } from './briefingContext';
import { localBriefing, type BriefingSection } from './localBriefing';
import type { VoiceStatus, VoiceTransport, TransportEvents } from './voice/transport';
import { FallbackTransport } from './voice/fallbackTransport';
import { finVoice } from './voices';
import { IS_MAIN_SCREEN } from '../workspace/screen';
import { parseCommands } from './control/parser';
import { executeAll } from './control/actions';
import { commandFromTool } from './control/tools';

export type FinMode = 'closed' | 'compact' | 'immersive';
export type BriefingState = 'none' | 'generating' | 'playing' | 'paused' | 'interrupted' | 'done';

export interface Caption {
  id: string;
  role: 'fin' | 'user' | 'system';
  text: string;
  final: boolean;
  turnId?: string;
  sectionId?: string;
  tone?: 'info' | 'warning' | 'error';
}

interface Briefing {
  state: BriefingState;
  length: 'short' | 'full';
  sections: BriefingSection[];
  index: number;
  sectionDone: boolean;
  source: 'ai' | 'local' | null;
  warnings: string[];
}

interface FinState {
  mode: FinMode;
  greeting: boolean;
  status: VoiceStatus;
  transportKind: 'live' | 'fallback' | null;
  transportLabel: string;
  realtime: boolean;
  muted: boolean;
  micOn: boolean;
  captions: Caption[];
  briefing: Briefing;
  error: { code: string; message: string } | null;
}

interface FinActions {
  open: (mode?: 'compact' | 'immersive') => void;
  minimise: () => void;
  close: () => void;
  dismissGreeting: (forSession?: boolean) => void;
  startBriefing: (length?: 'short' | 'full') => Promise<void>;
  jumpTo: (i: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  repeat: () => void;
  continueBriefing: () => void;
  sendText: (text: string) => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleMute: () => void;
  /** Changes FIN's voice; the live session reconnects with it on the next turn. */
  setVoice: (id: string) => void;
  /** Speaks a short sample line in the current voice. */
  previewVoice: () => Promise<void>;
  newConversation: () => void;
  clearError: () => void;
}

const EMPTY_BRIEFING: Briefing = { state: 'none', length: 'full', sections: [], index: 0, sectionDone: false, source: null, warnings: [] };

/** The single transport instance (kept outside React state; never duplicated across modes). */
let transport: VoiceTransport | null = null;
let connecting: Promise<VoiceTransport> | null = null;
let nextTimer: ReturnType<typeof setTimeout> | null = null;
let originalInstrument: string | null = null;
let followAlongSelecting = false;
let seq = 0;
const cid = () => `c${++seq}`;

export const getTransport = () => transport;

export const GREETING_SESSION_KEY = 'aitos:fin:greeting-dismissed';

function greetingAllowed() {
  if (!IS_MAIN_SCREEN) return false; // greet once, on the main screen only
  try {
    if (sessionStorage.getItem(GREETING_SESSION_KEY)) return false;
  } catch {
    /* storage blocked */
  }
  return useApp.getState().finGreetOnStartup;
}

export const useFin = create<FinState & FinActions>((set, get) => {
  const sys = (text: string, tone: Caption['tone'] = 'info') => set((s) => ({ captions: [...s.captions, { id: cid(), role: 'system' as const, text, final: true, tone }].slice(-200) }));

  const events: TransportEvents = {
    onStatus: (status) => set({ status }),
    onCaption: ({ role, text, turnId, final }) =>
      set((s) => {
        const caps = [...s.captions];
        const idx = caps.findIndex((c) => c.turnId === turnId && c.role === role);
        const sectionId = role === 'fin' && s.briefing.state === 'playing' ? s.briefing.sections[s.briefing.index]?.id : undefined;
        if (idx >= 0) caps[idx] = { ...caps[idx], text: caps[idx].text + text, final: !!final || caps[idx].final };
        else if (text || final) caps.push({ id: cid(), role, text, final: !!final, turnId, sectionId });
        // Fallback transport: a finished user utterance becomes a question.
        if (role === 'user' && final && transport && !transport.realtime && text.trim()) setTimeout(() => void (runAppCommands(text.trim(), true) || askViaTransport(text.trim(), true)), 0);
        // Live transport: the user started talking over a playing briefing.
        const briefing = role === 'user' && (s.briefing.state === 'playing' || s.briefing.state === 'paused') ? { ...s.briefing, state: 'interrupted' as const } : s.briefing;
        return { captions: caps.slice(-200), briefing };
      }),
    onTurnDone: (kind) => {
      const b = get().briefing;
      if (kind === 'narration' && b.state === 'playing') {
        set({ briefing: { ...b, sectionDone: true } });
        if (nextTimer) clearTimeout(nextTimer);
        nextTimer = setTimeout(() => {
          if (get().briefing.state === 'playing') playSection(get().briefing.index + 1);
        }, 650);
      } else if (kind === 'narration') set({ briefing: { ...b, sectionDone: true } });
    },
    onInterrupted: () => {
      const b = get().briefing;
      if (b.state === 'playing' || b.state === 'paused') set({ briefing: { ...b, state: 'interrupted' } });
    },
    onError: (code, message) => {
      set({ error: { code, message } });
      sys(message, code === 'session_ending' ? 'warning' : 'error');
    },
    onToolCall: (name, args) => {
      const cmd = commandFromTool(name, args);
      if (!cmd) return 'That command is not available.';
      const [r] = executeAll([cmd]);
      sys(`${r.ok ? '✓' : '✗'} ${r.message}`, r.ok ? 'info' : 'warning');
      return r.message;
    },
    onClose: (reason) => {
      transport = null;
      set({ status: 'disconnected', micOn: false, transportKind: null });
      const b = get().briefing;
      if (b.state === 'playing' || b.state === 'paused') set({ briefing: { ...b, state: 'interrupted' } });
      sys(`Voice disconnected: ${reason} Speak or type to reconnect.`, 'warning');
    },
  };

  /** Conversation-so-far, so a reconnected session keeps context. */
  const transcriptSummary = () =>
    get()
      .captions.filter((c) => c.role !== 'system' && c.text.trim())
      .slice(-10)
      .map((c) => `${c.role === 'fin' ? 'FIN' : 'User'}: ${c.text.trim().slice(0, 400)}`)
      .join('\n');

  const history = () =>
    get()
      .captions.filter((c) => c.role !== 'system' && c.final && c.text.trim())
      .slice(-12)
      .map((c) => ({ role: c.role === 'fin' ? ('assistant' as const) : ('user' as const), content: c.text.trim().slice(0, 1500) }));

  const contextString = () => {
    const ctx = buildBriefingContext(useApp.getState().selectedInstrumentId);
    const convo = transcriptSummary();
    return JSON.stringify(ctx) + (convo ? `\nConversation so far (previous session):\n${convo}` : '');
  };

  /** Connects (once) — Live voice first, honest browser fallback otherwise. */
  const ensureTransport = (): Promise<VoiceTransport> => {
    if (transport) return Promise.resolve(transport);
    if (connecting) return connecting;
    connecting = (async () => {
      const ctx = contextString();
      const preferBrowser = useApp.getState().finVoiceMode === 'browser';
      if (!preferBrowser) {
        const { LiveTransport } = await import('./voice/liveTransport');
        const live = new LiveTransport(events);
        try {
          await live.connect(ctx);
          transport = live;
          set({ transportKind: 'live', transportLabel: live.label, realtime: true, error: null });
          live.setMuted(get().muted);
          return live;
        } catch (e) {
          live.close();
          const code = (e as { code?: string }).code ?? 'live_unavailable';
          const msg = (e as Error).message;
          sys(`Real-time voice unavailable (${msg}). Switching to browser voice — this fallback is turn-based, not real-time.`, 'warning');
          const fb = new FallbackTransport(events, code === 'no_key' || code === 'auth');
          await fb.connect(ctx);
          transport = fb;
          set({ transportKind: 'fallback', transportLabel: fb.label, realtime: false });
          fb.setMuted(get().muted);
          return fb;
        }
      }
      const fb = new FallbackTransport(events);
      await fb.connect(ctx);
      transport = fb;
      set({ transportKind: 'fallback', transportLabel: fb.label, realtime: false });
      fb.setMuted(get().muted);
      return fb;
    })().finally(() => (connecting = null));
    return connecting;
  };

  const askViaTransport = async (text: string, alreadyCaptioned = false) => {
    const t = await ensureTransport();
    if (!alreadyCaptioned) set((s) => ({ captions: [...s.captions, { id: cid(), role: 'user' as const, text, final: true }].slice(-200) }));
    t.ask(text, history());
  };

  /**
   * App-control shortcut for typed text and the browser-voice fallback: "open gold chart", "news band karo"…
   * Runs locally (no AI round trip) and returns true when the text was a command.
   */
  const runAppCommands = (text: string, alreadyCaptioned = false): boolean => {
    const cmds = parseCommands(text).filter((c) => c.kind !== 'ask-fin');
    if (!cmds.length) return false;
    if (!alreadyCaptioned) set((s) => ({ captions: [...s.captions, { id: cid(), role: 'user' as const, text, final: true }].slice(-200) }));
    const results = executeAll(cmds);
    const msg = results.map((r) => r.message).join(' ');
    for (const r of results) sys(`${r.ok ? '✓' : '✗'} ${r.message}`, r.ok ? 'info' : 'warning');
    if (transport?.realtime) transport.updateContext(`[CONTEXT] The user just ran app commands from the text box: ${msg}`);
    else if (transport && cmds[0].kind !== 'briefing') transport.narrate(msg.replace(/\s*Say "undo".*$/, ''));
    return true;
  };

  const followAlong = (section: BriefingSection | undefined) => {
    const app = useApp.getState();
    if (!app.finFollowAlong || !section?.instrumentIds.length) return;
    const id = section.instrumentIds.find((x) => getInstrument(x));
    if (!id || id === app.selectedInstrumentId) return;
    if (originalInstrument == null) originalInstrument = app.selectedInstrumentId;
    followAlongSelecting = true;
    app.selectInstrument(id);
    followAlongSelecting = false;
  };

  const playSection = (i: number) => {
    const b = get().briefing;
    if (i >= b.sections.length) {
      set({ briefing: { ...b, state: 'done', index: b.sections.length - 1 } });
      sys('Briefing complete. Ask me a follow-up — e.g. "What is the biggest risk?" or "Explain gold more simply."');
      return;
    }
    const section = b.sections[i];
    set({ briefing: { ...b, state: 'playing', index: i, sectionDone: false } });
    followAlong(section);
    transport?.narrate(section.script);
  };

  // Keep FIN aware of what the user is looking at.
  useApp.subscribe((s, prev) => {
    if (s.selectedInstrumentId !== prev.selectedInstrumentId && transport && !followAlongSelecting) transport.updateContext(instrumentNote(s.selectedInstrumentId));
  });

  return {
    mode: 'closed',
    greeting: typeof window !== 'undefined' ? greetingAllowed() : false,
    status: 'idle',
    transportKind: null,
    transportLabel: '',
    realtime: false,
    muted: false,
    micOn: false,
    captions: [],
    briefing: EMPTY_BRIEFING,
    error: null,

    open: (mode = 'compact') => {
      set({ mode, greeting: false });
      try {
        sessionStorage.setItem(GREETING_SESSION_KEY, '1');
      } catch {
        /* ignore */
      }
    },
    minimise: () => set({ mode: 'compact' }),
    close: () => {
      if (nextTimer) clearTimeout(nextTimer);
      transport?.close();
      transport = null;
      const b = get().briefing;
      set({ mode: 'closed', status: 'idle', micOn: false, transportKind: null, briefing: b.state === 'playing' || b.state === 'paused' || b.state === 'generating' ? { ...b, state: 'interrupted' } : b });
      if (originalInstrument) {
        useApp.getState().selectInstrument(originalInstrument);
        originalInstrument = null;
      }
    },
    dismissGreeting: (forSession = true) => {
      set({ greeting: false });
      if (forSession) {
        try {
          sessionStorage.setItem(GREETING_SESSION_KEY, '1');
        } catch {
          /* ignore */
        }
      }
    },

    startBriefing: async (length = 'full') => {
      if (get().briefing.state === 'generating') return;
      if (nextTimer) clearTimeout(nextTimer);
      transport?.stopSpeaking();
      set({ briefing: { ...EMPTY_BRIEFING, state: 'generating', length }, status: 'thinking', error: null });
      sys(length === 'short' ? 'Preparing a short briefing from the workspace data…' : 'Preparing your briefing from the workspace data…');
      const ctx = buildBriefingContext(useApp.getState().selectedInstrumentId);
      const fetchBriefing = async (): Promise<Pick<Briefing, 'sections' | 'source' | 'warnings'>> => {
        try {
          const res = await apiFetch('/api/fin/briefing', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ length, context: ctx }) });
          const data = (await res.json()) as { ok: boolean; sections?: BriefingSection[]; warnings?: string[]; error?: string };
          if (data.ok && data.sections?.length) return { sections: data.sections, source: 'ai', warnings: data.warnings ?? [] };
          sys(`AI briefing unavailable (${data.error ?? 'unknown error'}). Using a local rule-based briefing from the same evidence.`, 'warning');
        } catch {
          sys('AI briefing unavailable (server unreachable). Using a local rule-based briefing from the same evidence.', 'warning');
        }
        return { sections: localBriefing(ctx, length), source: 'local', warnings: [] };
      };
      const [plan] = await Promise.all([fetchBriefing(), ensureTransport().catch(() => null)]);
      if (get().briefing.state !== 'generating') return; // user exited meanwhile
      if (plan.warnings.length) sys(`Validation: ${plan.warnings.join(' ')}`, 'warning');
      set({ briefing: { ...get().briefing, ...plan, state: 'playing', index: 0 } });
      // Give the conversation the validated script so follow-ups ("why?", "repeat that") are grounded in it.
      const script = plan.sections.map((x, i) => `${i + 1}. ${x.title}: ${x.script}`).join('\n');
      transport?.updateContext(`[CONTEXT] Briefing script you are presenting (validated against the evidence):\n${script}`);
      playSection(0);
    },
    jumpTo: (i) => {
      if (!get().briefing.sections.length) return;
      if (nextTimer) clearTimeout(nextTimer);
      transport?.stopSpeaking();
      playSection(Math.max(0, Math.min(i, get().briefing.sections.length - 1)));
    },
    pause: () => {
      transport?.pause();
      const b = get().briefing;
      if (b.state === 'playing') set({ briefing: { ...b, state: 'paused' } });
    },
    resume: () => {
      const b = get().briefing;
      if (b.state === 'paused') set({ briefing: { ...b, state: 'playing' } });
      transport?.resume();
      // If the section finished while paused, move on.
      if (b.state === 'paused' && b.sectionDone) playSection(b.index + 1);
    },
    stop: () => {
      if (nextTimer) clearTimeout(nextTimer);
      transport?.stopSpeaking();
      const b = get().briefing;
      if (b.state === 'playing' || b.state === 'paused') set({ briefing: { ...b, state: 'interrupted' } });
    },
    repeat: () => {
      const b = get().briefing;
      if (b.sections.length && b.state !== 'none' && b.state !== 'generating') {
        if (nextTimer) clearTimeout(nextTimer);
        playSection(b.index);
        return;
      }
      const last = [...get().captions].reverse().find((c) => c.role === 'fin' && c.text.trim());
      if (!last) return;
      void ensureTransport().then((t) => t.narrate(last.text));
    },
    continueBriefing: () => {
      const b = get().briefing;
      if (!b.sections.length) return;
      playSection(b.sectionDone ? b.index + 1 : b.index);
    },
    sendText: async (raw) => {
      const text = raw.trim();
      if (!text) {
        set({ error: { code: 'empty', message: 'Type a question first.' } });
        return;
      }
      if (nextTimer) clearTimeout(nextTimer);
      const b = get().briefing;
      if (b.state === 'playing' || b.state === 'paused') set({ briefing: { ...b, state: 'interrupted' } });
      transport?.stopSpeaking();
      set({ error: null });
      if (runAppCommands(text)) return;
      await askViaTransport(text.slice(0, 1500));
    },
    toggleMic: async () => {
      if (get().micOn) {
        transport?.stopMic();
        set({ micOn: false });
        return;
      }
      try {
        const t = await ensureTransport();
        await t.startMic();
        set({ micOn: t.realtime, error: null });
        if (!t.realtime) sys('Listening (browser speech recognition, one question at a time)…');
      } catch (e) {
        const message = (e as Error).message || 'Could not start the microphone.';
        set({ micOn: false, error: { code: (e as { code?: string }).code ?? 'mic', message } });
        sys(`${message} You can keep using the text box.`, 'error');
      }
    },
    setVoice: (id) => {
      const v = finVoice(id);
      if (useApp.getState().finVoice === v.id) return;
      useApp.getState().set({ finVoice: v.id });
      if (transport) {
        // The voice is locked into the live session's token, so start a fresh session (context is carried over).
        if (nextTimer) clearTimeout(nextTimer);
        transport.close();
        transport = null;
        const b = get().briefing;
        set({ status: 'idle', micOn: false, transportKind: null, briefing: b.state === 'playing' || b.state === 'paused' ? { ...b, state: 'interrupted' } : b });
      }
      sys(`Voice set to ${v.label} (${v.gender}, ${v.style}).`);
    },
    previewVoice: async () => {
      const v = finVoice(useApp.getState().finVoice);
      const t = await ensureTransport();
      t.narrate(`Hi, I'm FIN, and this is my ${v.gender === 'female' ? 'female' : 'male'} voice, ${v.label}. Ready when you are.`);
    },
    toggleMute: () => {
      const muted = !get().muted;
      transport?.setMuted(muted);
      set({ muted });
    },
    newConversation: () => {
      if (nextTimer) clearTimeout(nextTimer);
      transport?.close();
      transport = null;
      set({ captions: [], briefing: EMPTY_BRIEFING, status: 'idle', micOn: false, transportKind: null, error: null });
    },
    clearError: () => set({ error: null }),
  };
});
