import { useEffect, useState } from 'react';
import { Check, HelpCircle, Mic, MicOff, Settings2, Volume2, VolumeX, X } from 'lucide-react';
import { useFin } from '../finStore';
import { setVoiceControlPaused, useVoiceControl, voiceControlSupported, type VoiceLang } from './voiceControl';
import './voice.css';

/** Top-bar toggle for hands-free voice control (Alt + V). */
export function VoiceControlButton() {
  const status = useVoiceControl((s) => s.status);
  const toggle = useVoiceControl((s) => s.toggle);
  const on = status === 'listening' || status === 'starting' || status === 'paused';
  return (
    <button
      className={`btn icon ${on ? 'active vc-live' : ''}`}
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? 'Turn voice control off' : 'Turn voice control on'}
      data-tip={on ? 'Voice control on — click to stop (Alt+V)' : 'Voice control (Alt+V)'}
    >
      {on ? <Mic /> : <MicOff />}
    </button>
  );
}

const LANGS: Array<{ id: VoiceLang; label: string }> = [
  { id: 'en-IN', label: 'English / Hinglish (India)' },
  { id: 'hi-IN', label: 'हिन्दी (Hindi)' },
  { id: 'en-US', label: 'English (US)' },
];

const HELP: Array<{ title: string; items: string[] }> = [
  { title: 'Apps & windows', items: ['open chart · chart kholo', 'gold ka chart kholo', 'news band karo · close news', 'chart bada karo · maximise chart', 'minimise news · news chhota karo', 'restore news · focus watchlist', 'close this window', 'sab band karo · minimise all · restore all', 'swap chart with news · chart aur news ki jagah badlo'] },
  { title: 'Markets & charts', items: ['silver dikhao · switch to EUR/USD', 'timeframe 4 hour · chart 15 minute · daily', 'add gold to watchlist · silver watchlist se hatao'] },
  { title: 'Workspace', items: ['forex desk kholo · metals and energy preset', 'arrange in grid · side by side layout · quadrants layout', 'auto arrange on / off · snap on / off', 'undo · wapas karo · redo', 'scroll down · upar jao', 'full screen · exit full screen'] },
  { title: 'Communities', items: ['open gold community', 'oil community ke trading ideas', 'forex community polls'] },
  { title: 'Look & tools', items: ['dark theme · light mode · gold theme', 'command palette · app launcher · appearance'] },
  { title: 'FIN assistant', items: ['briefing do · short briefing', 'stop · pause · resume', 'Fin, what is the biggest risk? (anything after “Fin” is a question)', 'open fin · close fin'] },
  { title: 'Voice control', items: ['help · madad', 'stop listening · voice off', 'Chain commands with “and / aur / phir”: “gold chart kholo aur news band karo”'] },
];

function HelpPanel({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal neu-raised wide" role="dialog" aria-modal aria-label="Voice commands" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Mic size={18} className="accent" />
          <h3 className="grow">Voice commands</h3>
          <button className="btn icon sm ghost" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="modal-body col gap-3">
          <p className="small secondary">Turn on the mic in the top bar (or press Alt + V) and speak naturally in English, Hinglish or Hindi. When FIN’s live voice is on, just ask FIN — it can run all of these too.</p>
          <div className="vc-help-grid">
            {HELP.map((g) => (
              <section key={g.title} className="neu-soft card col gap-1">
                <span className="section-title">{g.title}</span>
                <ul className="list-clean small">{g.items.map((i) => <li key={i}>{i}</li>)}</ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Floating status pill + help; also keeps the standalone mic out of FIN's way. */
export function VoiceControlHost() {
  const s = useVoiceControl();
  const finLive = useFin((f) => f.micOn && f.realtime);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => setVoiceControlPaused(finLive), [finLive]);
  useEffect(() => {
    if (!s.log.length) return;
    setNow(Date.now());
    const t = setTimeout(() => setNow(Date.now()), 6000);
    return () => clearTimeout(t);
  }, [s.log]);

  // Alt + V toggles voice control.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        useVoiceControl.getState().toggle();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const last = s.log[0];
  const recent = last && now - last.at < 6000;
  const visible = s.status !== 'off' || s.error || open;

  return (
    <>
      {visible && (
        <div className={`vc-hud neu-raised ${s.status}`} role="status" aria-live="polite">
          <button className="vc-hud-main" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <span className={`vc-dot ${s.status}`} aria-hidden />
            <span className="vc-text">
              {s.status === 'error' ? <span className="neg">{s.error}</span>
                : s.status === 'paused' ? 'Paused — FIN live voice is listening'
                  : s.interim ? <i>{s.interim}</i>
                    : recent ? (
                      last.results.length
                        ? <span className={last.results.every((r) => r.ok) ? 'pos' : 'warn'}>{last.results.map((r) => r.message).join(' ')}</span>
                        : <span className="muted">Not a command: “{last.heard}”. Say “help”.</span>
                    ) : s.status === 'starting' ? 'Starting microphone…' : 'Listening… say “help” for commands'}
            </span>
          </button>
          <button className="btn icon sm ghost" onClick={() => s.setHelp(true)} aria-label="Voice command help" data-tip="Commands"><HelpCircle /></button>
          <button className="btn icon sm ghost" onClick={() => setOpen((o) => !o)} aria-label="Voice settings" data-tip="Settings"><Settings2 /></button>
          <button className="btn icon sm ghost" onClick={() => { s.stop(); useVoiceControl.setState({ error: null }); setOpen(false); }} aria-label="Turn voice control off" data-tip="Turn off"><X /></button>
          {open && (
            <div className="vc-panel neu-raised col gap-2">
              {!voiceControlSupported() && <div className="alert-box warning small">This browser has no speech recognition. Use Chrome or Edge.</div>}
              <div className="field">
                <label htmlFor="vc-lang">Recognition language</label>
                <select id="vc-lang" className="select" value={s.lang} onChange={(e) => s.setLang(e.target.value as VoiceLang)}>
                  {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </div>
              <button className={`btn sm ${s.speakFeedback ? 'active' : ''}`} aria-pressed={s.speakFeedback} onClick={() => s.setSpeak(!s.speakFeedback)}>
                {s.speakFeedback ? <Volume2 /> : <VolumeX />} Spoken confirmations {s.speakFeedback ? 'on' : 'off'}
              </button>
              <span className="section-title">Recent</span>
              {s.log.length === 0 && <span className="small muted">Nothing heard yet.</span>}
              <ul className="vc-log">
                {s.log.slice(0, 8).map((l) => (
                  <li key={l.id}>
                    <span className="small">“{l.heard}”</span>
                    {l.results.length ? l.results.map((r, i) => <span key={i} className={`tiny ${r.ok ? 'pos' : 'warn'}`}>{r.ok ? <Check size={11} /> : '✗'} {r.message}</span>) : <span className="tiny muted">not a command</span>}
                  </li>
                ))}
              </ul>
              {s.status === 'off' && <button className="btn sm primary" onClick={s.start}><Mic /> Start listening</button>}
            </div>
          )}
        </div>
      )}
      {s.helpOpen && <HelpPanel onClose={() => s.setHelp(false)} />}
    </>
  );
}
