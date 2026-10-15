import { useEffect, useState, type ReactNode } from 'react';
import { Monitor } from 'lucide-react';

import { IS_MAIN_SCREEN, IS_POPOUT } from '../workspace/screen';

/** Secondary screens may be narrow portrait monitors, so they get a lower limit. */
export const MIN_DESKTOP_WIDTH = IS_MAIN_SCREEN ? 1100 : IS_POPOUT ? 0 : 640;

/** Narrow screens get a clear notice instead of a compressed terminal. Re-evaluates on resize/orientation. */
export function DesktopOnlyGate({ children }: { children: ReactNode }) {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener('resize', h);
    window.addEventListener('orientationchange', h);
    return () => {
      window.removeEventListener('resize', h);
      window.removeEventListener('orientationchange', h);
    };
  }, []);
  if (w >= MIN_DESKTOP_WIDTH) return <>{children}</>;
  return (
    <div className="desktop-gate">
      <div className="neu-raised">
        <div className="brand-logo neu-inset" style={{ width: 56, height: 56 }}>
          <Monitor size={26} />
        </div>
        <h2>Desktop experience</h2>
        <p className="secondary">
          AI Trading Assistance OS is a multi-window workspace designed for laptop and desktop screens at least {MIN_DESKTOP_WIDTH}px wide.
        </p>
        <p className="small muted">
          Current width: {w}px. Widen the browser window, rotate to landscape, or open on a larger screen. Your saved workspaces will be waiting.
        </p>
      </div>
    </div>
  );
}
