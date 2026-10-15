import { useEffect, useRef, useState } from 'react';
import { Expand } from 'lucide-react';
import { useApp } from '../store/appStore';
import { IS_MAIN_SCREEN, IS_POPOUT } from '../workspace/screen';

/** Should the "open in full screen?" question be shown on this page load? */
function shouldAsk(): boolean {
  if (typeof document === 'undefined' || IS_POPOUT || !IS_MAIN_SCREEN || !document.fullscreenEnabled) return false;
  if (document.fullscreenElement) return false;
  // Already launched in a full-screen app window (installed app / kiosk launcher).
  if (window.matchMedia?.('(display-mode: fullscreen)').matches) return false;
  return useApp.getState().autoFullscreen;
}

/**
 * Asks once per visit whether to go full screen, over a blurred backdrop.
 * The button click is the user gesture browsers require, so the request is allowed.
 */
export function FullscreenPrompt() {
  const [open, setOpen] = useState(shouldAsk);
  const [dontAsk, setDontAsk] = useState(false);
  const enterRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    if (dontAsk) {
      useApp.getState().set({ autoFullscreen: false });
      useApp.getState().toast({ title: 'Won’t ask again', body: 'Turn it back on in Settings → Workspace.', tone: 'info' });
    }
    setOpen(false);
  };

  const enter = () => {
    close();
    document.documentElement.requestFullscreen().catch(() => {
      useApp.getState().toast({ title: 'Full screen was blocked', body: 'Use the full-screen button in the top bar, or press F11.', tone: 'warning' });
    });
  };

  useEffect(() => {
    if (!open) return;
    enterRef.current?.focus();
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dontAsk]);

  if (!open) return null;
  return (
    <div className="fs-prompt-backdrop" role="presentation">
      <div className="fs-prompt neu-raised" role="dialog" aria-modal aria-labelledby="fs-prompt-title" aria-describedby="fs-prompt-body">
        <div className="fs-prompt-icon"><Expand size={26} /></div>
        <h2 id="fs-prompt-title">Open in full screen?</h2>
        <p id="fs-prompt-body" className="secondary">
          The trading workspace works best with the whole screen. You can leave full screen any time with <kbd>Esc</kbd> or the button in the top bar.
        </p>
        <div className="fs-prompt-actions">
          <button className="btn" onClick={close}>Not now</button>
          <button ref={enterRef} className="btn primary" onClick={enter}><Expand /> Enter full screen</button>
        </div>
        <label className="row small muted fs-prompt-check">
          <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} /> Don’t ask me again
        </label>
      </div>
    </div>
  );
}
