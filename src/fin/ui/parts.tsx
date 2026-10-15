import { FIN_VOICES } from '../voices';
import { useApp } from '../../store/appStore';
import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Pause, Play, Repeat2, Send, Square, StepForward, Volume2, VolumeX } from 'lucide-react';
import { useFin, type Caption } from '../finStore';
import type { VoiceStatus } from '../voice/transport';

export const STATUS_LABEL: Record<VoiceStatus, string> = {
  idle: 'Ready', connecting: 'Connecting…', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking', paused: 'Paused', disconnected: 'Disconnected',
};

export function greetingText(d = new Date()) {
  const h = d.getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return `${part}! FIN here. Want your quick market briefing? I'll walk you through the mood in gold, silver, oil and forex, the interesting setups, and the risks worth watching. Shall we dive in?`;
}

export function CaptionList({ captions, compact = false }: { captions: Caption[]; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = captions[captions.length - 1];
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [captions.length, last?.text]);
  return (
    <div ref={ref} className={`fin-captions ${compact ? 'compact' : ''}`} aria-live="polite" aria-label="FIN captions">
      {captions.length === 0 && <div className="small muted">Captions appear here as FIN speaks — even when audio is muted.</div>}
      {captions.map((c) =>
        c.role === 'system' ? (
          <div key={c.id} className={`fin-cap-system ${c.tone ?? 'info'}`}>{c.text}</div>
        ) : (
          <div key={c.id} className={`fin-cap ${c.role} ${c.final ? '' : 'live'}`}>
            <span className="fin-cap-who">{c.role === 'fin' ? 'FIN' : 'You'}</span>
            <span className="fin-cap-text">{c.text || '…'}</span>
          </div>
        ),
      )}
    </div>
  );
}

export function TextComposer({ autoFocus = false }: { autoFocus?: boolean }) {
  const [text, setText] = useState('');
  const sendText = useFin((s) => s.sendText);
  const status = useFin((s) => s.status);
  return (
    <form
      className="fin-composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        void sendText(text);
        setText('');
      }}
    >
      <input className="input" value={text} maxLength={1500} autoFocus={autoFocus} placeholder='Ask FIN… e.g. "What about gold?" or "Explain it more simply"' onChange={(e) => setText(e.target.value)} aria-label="Message FIN" disabled={status === 'connecting'} />
      <button type="submit" className="btn primary icon" disabled={!text.trim()} aria-label="Send" data-tip="Send">
        <Send />
      </button>
    </form>
  );
}

/** Pause/Resume, Stop, Repeat, Continue, Mute, Mic — shared by compact and immersive modes. */
export function FinControls({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const s = useFin();
  const b = s.briefing;
  const speaking = s.status === 'speaking' || s.status === 'thinking';
  const cls = `btn ${size === 'sm' ? 'sm' : ''}`;
  return (
    <div className="fin-controls" role="toolbar" aria-label="FIN controls">
      {s.status === 'paused' ? (
        <button className={cls} onClick={s.resume} aria-label="Resume"><Play /> Resume</button>
      ) : (
        <button className={cls} onClick={s.pause} disabled={!speaking} aria-label="Pause"><Pause /> Pause</button>
      )}
      <button className={`${cls} danger`} onClick={s.stop} disabled={!speaking && s.status !== 'paused'} aria-label="Stop speaking" data-tip="Interrupt FIN now"><Square /> Stop</button>
      <button className={cls} onClick={s.repeat} disabled={!s.captions.some((c) => c.role === 'fin')} aria-label="Repeat"><Repeat2 /> Repeat</button>
      {b.state === 'interrupted' && (
        <button className={`${cls} primary`} onClick={s.continueBriefing} aria-label="Continue briefing"><StepForward /> Continue briefing</button>
      )}
      <button className={`${cls} ${s.muted ? 'active' : ''}`} onClick={s.toggleMute} aria-pressed={s.muted} aria-label={s.muted ? 'Unmute' : 'Mute'} data-tip={s.muted ? 'Unmute (captions continue)' : 'Mute audio (captions continue)'}>
        {s.muted ? <VolumeX /> : <Volume2 />} {s.muted ? 'Muted' : 'Mute'}
      </button>
      <button className={`${cls} ${s.micOn ? 'active' : ''}`} onClick={() => void s.toggleMic()} aria-pressed={s.micOn} aria-label={s.micOn ? 'Turn microphone off' : 'Turn microphone on'} data-tip={s.realtime || !s.transportKind ? 'Talk to FIN (you can interrupt it)' : 'Ask one question by voice'}>
        {s.micOn ? <Mic /> : <MicOff />} {s.micOn ? 'Mic on' : 'Mic'}
      </button>
    </div>
  );
}

/** Female / male voice chooser with a preview button. */
export function FinVoicePicker({ compact = false }: { compact?: boolean }) {
  const voice = useApp((s) => s.finVoice);
  const { setVoice, previewVoice } = useFin.getState();
  const busy = useFin((s) => s.status === 'connecting' || s.status === 'speaking' || s.status === 'thinking');
  return (
    <div className="row gap-1 no-drag" style={{ minWidth: 0 }}>
      {!compact && <span className="tiny muted">Voice</span>}
      <select className="select" style={{ height: 26, maxWidth: compact ? 150 : 230 }} value={voice} onChange={(e) => setVoice(e.target.value)} aria-label="FIN voice">
        {(['female', 'male'] as const).map((g) => (
          <optgroup key={g} label={g === 'female' ? 'Female voices' : 'Male voices'}>
            {FIN_VOICES.filter((v) => v.gender === g).map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} · {g === 'female' ? '♀' : '♂'} {compact ? '' : `· ${v.style}`}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <button className="btn icon sm" disabled={busy} onClick={() => void previewVoice()} aria-label="Preview voice" data-tip="Hear this voice">
        <Play />
      </button>
    </div>
  );
}
