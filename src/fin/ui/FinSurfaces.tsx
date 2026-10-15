import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Keyboard, Maximize2, Mic, Minimize2, RotateCcw, Sparkles, X } from 'lucide-react';
import { useFin } from '../finStore';
import { useApp } from '../../store/appStore';
import { getInstrument } from '../../data/instruments';
import { getSeries } from '../../data/priceSeries';
import { fmtPrice } from '../../lib/formatting';
import { Change, Sparkline, confirmAction } from '../../components/ui';
import { FinMiniOrb, FinOrb } from './FinOrb';
import { Waveform } from './Waveform';
import { CaptionList, FinControls, STATUS_LABEL, TextComposer, greetingText, FinVoicePicker } from './parts';
import './fin.css';

/* ---------------- Startup greeting ---------------- */
export function FinGreeting() {
  const greeting = useFin((s) => s.greeting);
  const greetOnStartup = useApp((s) => s.finGreetOnStartup);
  const mode = useFin((s) => s.mode);
  const { open, startBriefing, dismissGreeting, toggleMic } = useFin.getState();
  if (!greeting || mode !== 'closed') return null;
  return (
    <aside className="fin-greeting neu-raised" role="dialog" aria-label="FIN greeting">
      <button className="btn icon sm ghost fin-greeting-x" onClick={() => dismissGreeting()} aria-label="Dismiss FIN greeting" data-tip="Dismiss (reopen from the FIN button)">
        <X />
      </button>
      <div className="row top gap-3">
        <FinOrb status="greeting" size={64} />
        <div className="col gap-2 grow">
          <div className="row gap-2">
            <span className="bold">FIN</span>
            <span className="chip accent tiny">AI market companion</span>
          </div>
          <p className="small">{greetingText()}</p>
        </div>
      </div>
      <div className="row wrap gap-2 mt-3">
        <button className="btn primary" onClick={() => { open('immersive'); void startBriefing('full'); }}>
          <Sparkles /> Yes, brief me
        </button>
        <button className="btn" onClick={() => dismissGreeting()}>Not now</button>
        <button className="btn icon" onClick={() => { open('immersive'); void toggleMic(); }} aria-label="Talk to FIN with your microphone" data-tip="Talk (asks for mic permission)">
          <Mic />
        </button>
        <button className="btn icon" onClick={() => open('compact')} aria-label="Type to FIN instead" data-tip="Type instead">
          <Keyboard />
        </button>
      </div>
      <label className="row tiny muted mt-2" style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={!greetOnStartup} onChange={(e) => { useApp.getState().set({ finGreetOnStartup: !e.target.checked }); }} />
        Don't greet me on startup
      </label>
    </aside>
  );
}

/* ---------------- Section cards (what FIN is discussing) ---------------- */
function SectionCards({ ids }: { ids: string[] }) {
  const insts = ids.map((id) => getInstrument(id)).filter((i): i is NonNullable<typeof i> => !!i).slice(0, 3);
  if (!insts.length) return null;
  return (
    <div className="fin-section-cards">
      {insts.map((i) => (
        <div key={i.id} className="neu-soft fin-card fin-highlight">
          <div className="row between"><span className="bold small">{i.symbol}</span><span className="tiny muted">{i.quoteCurrency}/{i.unit}</span></div>
          <span className="mono bold">{fmtPrice(i, i.price)}</span>
          <div className="row between"><Change value={i.changePercent} /><Sparkline values={getSeries(i.id, '1D').slice(-40).map((c) => c.close)} width={70} height={20} /></div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Immersive briefing overlay ---------------- */
export function FinImmersive() {
  const s = useFin();
  const panelRef = useRef<HTMLDivElement>(null);
  const b = s.briefing;
  const section = b.sections[b.index];
  const busy = s.status === 'speaking' || s.status === 'thinking';

  const exit = async () => {
    if (busy && !(await confirmAction({ title: 'Exit FIN briefing?', body: 'FIN is speaking. Exiting stops audio and ends the voice session. Your workspace stays exactly as it is.', confirmLabel: 'Exit', danger: false }))) return;
    s.close();
  };

  // Block background interaction and keyboard focus while immersive.
  useEffect(() => {
    const root = document.querySelector('.os-root') as HTMLElement | null;
    root?.setAttribute('inert', '');
    panelRef.current?.focus();
    return () => root?.removeAttribute('inert');
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        void exit();
      }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  });

  return createPortal(
    <div className="fin-immersive" role="dialog" aria-modal aria-label="FIN immersive briefing">
      <div className="fin-immersive-panel" ref={panelRef} tabIndex={-1}>
        <header className="fin-immersive-head">
          <div className="row gap-2">
            <FinMiniOrb status={s.status} size={20} />
            <span className="bold">FIN</span>
            <span className="tiny muted">{s.transportLabel || 'Voice connects when you start'}</span>
            {s.transportKind === 'fallback' && <span className="chip warn tiny">turn-based fallback</span>}
            <FinVoicePicker />
          </div>
          <div className="row gap-1">
            <button className="btn icon sm" onClick={s.minimise} aria-label="Minimise to compact FIN" data-tip="Minimise (keeps the session)"><Minimize2 /></button>
            <button className="btn icon sm" onClick={() => void exit()} aria-label="Exit FIN" data-tip="Exit (Esc)"><X /></button>
          </div>
        </header>

        <div className="fin-stage">
          <FinOrb status={s.status} size={190} />
          <Waveform status={s.status} width={300} height={44} />
          <div className="fin-status" aria-live="polite">{STATUS_LABEL[s.status]}{b.state === 'generating' ? ' — preparing briefing' : ''}</div>
        </div>

        {b.sections.length > 0 && (
          <div className="fin-section">
            <div className="row between wrap gap-2">
              <span className="bold">{section?.title ?? 'Briefing'} <span className="tiny muted">({b.index + 1}/{b.sections.length}{b.source === 'local' ? ' · local rule-based' : ' · AI, evidence-validated'})</span></span>
              <div className="fin-dots" role="tablist" aria-label="Briefing sections">
                {b.sections.map((sec, i) => (
                  <button key={sec.id} className={`fin-dot ${i === b.index ? 'on' : i < b.index ? 'done' : ''}`} onClick={() => s.jumpTo(i)} aria-label={`Go to ${sec.title}`} title={sec.title} />
                ))}
              </div>
            </div>
            {section && <SectionCards ids={section.instrumentIds} />}
          </div>
        )}

        <CaptionList captions={s.captions} />

        <div className="fin-bottom">
          <FinControls />
          {(b.state === 'none' || b.state === 'done') && (
            <div className="row gap-1">
              <button className="btn primary" onClick={() => void s.startBriefing('full')}><Sparkles /> {b.state === 'done' ? 'Brief me again' : 'Start briefing'}</button>
              <button className="btn" onClick={() => void s.startBriefing('short')}>Short version</button>
            </div>
          )}
          <TextComposer />
          <div className="tiny muted center">FIN explains the evidence and never places trades.</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- Compact chat panel ---------------- */
export function FinCompact() {
  const s = useFin();
  return (
    <aside className="fin-compact neu-raised" role="dialog" aria-label="FIN chat">
      <header className="row between" style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="row gap-2">
          <FinMiniOrb status={s.status} size={18} />
          <span className="bold">FIN</span>
          <span className="tiny muted">{STATUS_LABEL[s.status]}</span>
        </div>
        <div className="row gap-1">
          <button className="btn icon sm" onClick={() => s.open('immersive')} aria-label="Open immersive voice mode" data-tip="Immersive voice mode"><Maximize2 /></button>
          <button className="btn icon sm" onClick={s.newConversation} aria-label="New conversation" data-tip="New conversation"><RotateCcw /></button>
          <button className="btn icon sm" onClick={s.close} aria-label="Close FIN" data-tip="Close (ends voice session)"><X /></button>
        </div>
      </header>
      <div className="row between" style={{ padding: '6px 12px' }}>
        <FinVoicePicker compact />
      </div>
      <CaptionList captions={s.captions} compact />
      <div className="col gap-2" style={{ padding: 10, borderTop: '1px solid var(--border-subtle)' }}>
        {s.briefing.state === 'none' && <button className="btn sm primary" onClick={() => { s.open('immersive'); void s.startBriefing('full'); }}><Sparkles /> Market briefing</button>}
        <FinControls size="sm" />
        <TextComposer autoFocus />
      </div>
    </aside>
  );
}

/** Mounts whichever FIN surface is active (single assistant instance). */
export function FinHost() {
  const mode = useFin((s) => s.mode);
  return (
    <>
      <FinGreeting />
      {mode === 'compact' && <FinCompact />}
      {mode === 'immersive' && <FinImmersive />}
    </>
  );
}

/** Top-bar entry point. */
export function FinTopButton() {
  const mode = useFin((s) => s.mode);
  const status = useFin((s) => s.status);
  const { open, minimise } = useFin.getState();
  return (
    <button
      className={`btn fin-top-btn ${mode !== 'closed' ? 'active' : ''}`}
      onClick={() => (mode === 'closed' ? open('compact') : mode === 'compact' ? open('immersive') : minimise())}
      aria-label={`FIN — AI market companion (${STATUS_LABEL[status]})`}
      data-tip="FIN — AI market companion (Alt+F)"
    >
      <FinMiniOrb status={mode === 'closed' ? 'idle' : status} size={16} />
      FIN
    </button>
  );
}
