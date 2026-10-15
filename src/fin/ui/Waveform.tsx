import { useEffect, useRef } from 'react';
import type { VoiceStatus } from '../voice/transport';
import { getTransport } from '../finStore';

/** Draws the real audio signal from the active analyser. Flat when there is no real audio source. */
export function Waveform({ status, width = 320, height = 56 }: { status: VoiceStatus; width?: number; height?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hasSource = getTransport()?.analyser('out') != null || getTransport()?.analyser('in') != null;

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = width * dpr;
    cv.height = height * dpr;
    const g = cv.getContext('2d')!;
    g.scale(dpr, dpr);
    const color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#63dda5';
    const muted = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#7f8a99';
    let raf = 0;
    const bars = 48;
    const buf = new Uint8Array(1024);
    const draw = () => {
      const t = getTransport();
      const an = status === 'listening' ? t?.analyser('in') : t?.analyser('out') ?? t?.analyser('in');
      g.clearRect(0, 0, width, height);
      const bw = width / bars;
      if (an) {
        an.getByteTimeDomainData(buf);
        const span = Math.floor(buf.length / bars);
        for (let b = 0; b < bars; b++) {
          let peak = 0;
          for (let k = 0; k < span; k++) peak = Math.max(peak, Math.abs(buf[b * span + k] - 128) / 128);
          const h = Math.max(2, Math.min(1, peak * 2.2) * (height - 4));
          g.fillStyle = color;
          g.globalAlpha = 0.35 + Math.min(0.65, peak * 2);
          g.beginPath();
          g.roundRect(b * bw + bw * 0.2, (height - h) / 2, bw * 0.6, h, 2);
          g.fill();
        }
      } else {
        g.globalAlpha = 0.5;
        g.fillStyle = muted;
        g.fillRect(0, height / 2 - 1, width, 2);
      }
      g.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [status, width, height]);

  return (
    <div className="col" style={{ alignItems: 'center', gap: 2 }}>
      <canvas ref={canvas} style={{ width, height }} role="img" aria-label={hasSource ? 'Live audio waveform' : 'No audio level data'} />
      {!hasSource && status === 'speaking' && <span className="tiny muted">Browser voice: no audio level data available</span>}
    </div>
  );
}
