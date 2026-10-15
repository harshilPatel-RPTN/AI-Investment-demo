import { useEffect, useRef } from 'react';
import type { VoiceStatus } from '../voice/transport';
import { getTransport } from '../finStore';

/**
 * FIN's orb. Size reacts to the REAL audio level (FIN's output while speaking, the mic while listening).
 * State styles: idle (slow breathe), listening, thinking (orbit), speaking, paused, disconnected.
 */
export function FinOrb({ status, size = 160 }: { status: VoiceStatus | 'greeting'; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      const t = getTransport();
      const lv = t?.levels();
      const raw = status === 'speaking' ? (lv?.out ?? 0) : status === 'listening' ? (lv?.in ?? 0) : 0;
      smooth = smooth * 0.75 + Math.min(1, raw * 4) * 0.25;
      ref.current?.style.setProperty('--lvl', smooth.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status]);
  return (
    <div ref={ref} className={`fin-orb fin-${status}`} style={{ width: size, height: size }} aria-hidden>
      <div className="fin-orb-halo" />
      <div className="fin-orb-core">
        <div className="fin-orb-sheen" />
      </div>
      <div className="fin-orb-ring" />
    </div>
  );
}

/** Tiny orb for the top bar / compact header. */
export function FinMiniOrb({ status, size = 18 }: { status: VoiceStatus | 'greeting'; size?: number }) {
  return <span className={`fin-mini-orb fin-${status}`} style={{ width: size, height: size }} aria-hidden />;
}
