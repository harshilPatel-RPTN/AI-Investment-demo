import { useEffect, useRef } from 'react';
import { PanelTopClose, TrendingUp } from 'lucide-react';
import { WorkspaceCanvas } from '../workspace/WorkspaceCanvas';
import { useScreenWindows } from '../workspace/useScreenWindows';
import { useWorkspace } from '../workspace/WorkspaceStore';
import { CURRENT_SCREEN } from '../workspace/screen';
import { dockBack } from '../workspace/tearOff';
import { useApp } from '../store/appStore';
import { getInstrument } from '../data/instruments';
import { fmtPrice } from '../lib/formatting';
import { Change } from '../components/ui';

/**
 * Lean window for a torn-off card: slim header + the card filling the window.
 * Closing this browser window returns its card(s) to the main screen, so nothing is ever lost.
 */
export function PopoutShell() {
  const cards = useScreenWindows();
  const wsName = useWorkspace((s) => s.active().name);
  const selected = useApp((s) => s.selectedInstrumentId);
  const inst = getInstrument(selected);
  const hadCards = useRef(false);

  // Return cards to the main screen when this window is closed with the browser's X.
  useEffect(() => {
    const h = () => {
      if (useWorkspace.getState().active().windows.some((w) => w.screenId === CURRENT_SCREEN)) useWorkspace.getState().removeScreen(CURRENT_SCREEN);
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  // Close automatically once the last card leaves (docked back, moved or closed).
  useEffect(() => {
    if (cards.length) hadCards.current = true;
    else if (hadCards.current) {
      useWorkspace.getState().removeScreen(CURRENT_SCREEN);
      window.close();
    }
  }, [cards.length]);

  const title = cards.length === 1 ? cards[0].title : `${cards.length} cards`;
  useEffect(() => {
    document.title = `${title} — AI-TOS`;
  }, [title]);

  return (
    <div className="popout-root">
      <header className="popout-head">
        <TrendingUp size={15} className="accent" />
        <span className="bold ellipsis">{title}</span>
        <span className="tiny muted ellipsis">{wsName}</span>
        <div style={{ flex: 1 }} />
        {inst && (
          <span className="row gap-1 small" style={{ whiteSpace: 'nowrap' }}>
            <span className="bold">{inst.symbol}</span>
            <span className="mono">{fmtPrice(inst, inst.price)}</span>
            <Change value={inst.changePercent} />
          </span>
        )}
        <button className="btn sm" onClick={dockBack} data-tip="Send back to the main window">
          <PanelTopClose /> Dock back
        </button>
      </header>
      <WorkspaceCanvas />
    </div>
  );
}
