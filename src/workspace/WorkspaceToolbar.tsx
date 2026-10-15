import { Check, LayoutDashboard, Plus, Redo2, Undo2 } from 'lucide-react';
import { useApp } from '../store/appStore';
import { useWorkspace, LAYOUT_MODES, type LayoutMode } from './WorkspaceStore';
import { useScreenWindows } from './useScreenWindows';
import { getInstrument } from '../data/instruments';
import { InstrumentSelect, Change } from '../components/ui';
import { fmtPrice } from '../lib/formatting';

import { TIMEFRAMES } from '../data/priceSeries';
import type { Timeframe } from '../types/market';
import { TASK_PRESET_IDS, WORKSPACE_PRESETS } from '../data/workspaces';
import { FIXTURE_NOW_ISO } from '../lib/seed';
import { fmtTime } from '../lib/formatting';

/** Short tab labels; the full preset name and description are in the tooltip. */
const TAB_LABEL: Record<string, string> = { 'market-overview': 'Overview', technical: 'Technical', 'metals-energy': 'Metals & Energy', risk: 'Risk', research: 'Research' };

export function WorkspaceToolbar() {
  const set = useApp((s) => s.set);
  const selected = useApp((s) => s.selectedInstrumentId);
  const tf = useApp((s) => s.timeframe);
  const { selectInstrument, setTimeframe } = useApp.getState();
  const canUndo = useWorkspace((s) => s.past.length > 0);
  const canRedo = useWorkspace((s) => s.future.length > 0);
  const count = useScreenWindows().length;
  const autoArrange = useWorkspace((s) => s.autoArrange);
  const { undo, redo, applyLayout, toggleAutoArrange } = useWorkspace.getState();
  const inst = getInstrument(selected);
  const activePreset = useWorkspace((s) => s.active().presetId);
  const lastSaved = useWorkspace((s) => s.active().updatedAt);
  const openPreset = useWorkspace((s) => s.openPreset);
  const tasks = TASK_PRESET_IDS.map((id) => WORKSPACE_PRESETS.find((p) => p.id === id)!).filter(Boolean);

  return (
    <div className="ws-toolbar">
      <nav className="tabs ws-tasks" aria-label="Task workspaces">
        {tasks.map((p) => (
          <button
            key={p.id}
            className={`tab ${activePreset === p.id ? 'active' : ''}`}
            aria-current={activePreset === p.id ? 'page' : undefined}
            onClick={() => {
              openPreset(p.id);
              if (p.selectInstrument && activePreset !== p.id) useApp.getState().selectInstrument(p.selectInstrument);
            }}
            data-tip={`${p.name} — ${p.description}`}
          >
            {TAB_LABEL[p.id] ?? p.name}
          </button>
        ))}
      </nav>
      <span className="sep" />
      <button className="btn sm" onClick={() => set({ launcherOpen: true })} data-tip="Add an app to this workspace (Alt+L)">
        <Plus /> <span className="hide-md">Add app</span>
      </button>
      <button className="btn icon sm" onClick={undo} disabled={!canUndo} aria-label="Undo" data-tip="Undo (Ctrl+Z)">
        <Undo2 />
      </button>
      <button className="btn icon sm" onClick={redo} disabled={!canRedo} aria-label="Redo" data-tip="Redo (Ctrl+Shift+Z)">
        <Redo2 />
      </button>
      <span className="sep" />
      <button
        className={`btn sm ${autoArrange ? 'active' : ''}`}
        onClick={toggleAutoArrange}
        aria-pressed={autoArrange}
        data-tip={autoArrange ? 'On: cards slide up to fill empty space. Cards never overlap either way.' : 'Off: cards stay where you drop them (others still move out of the way — never overlap).'}
      >
        <LayoutDashboard /> <span className="hide-md">Auto-arrange</span>
      </button>
      <select
        className="select"
        style={{ width: 'auto', maxWidth: 120, height: 26 }}
        value=""
        aria-label="Arrange windows"
        disabled={!count}
        onChange={(e) => {
          if (e.target.value) applyLayout(e.target.value as LayoutMode);
        }}
      >
        <option value="">Layout…</option>
        {LAYOUT_MODES.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <span className="ws-saved" data-tip="Layouts save automatically in this browser. Use Workspaces → Save as… for a named copy."><Check size={12} /> Saved {fmtTime(lastSaved)}</span>
      <div style={{ flex: 1 }} />
      <InstrumentSelect value={selected} onChange={selectInstrument} className="no-drag ws-context" />
      <select className="select" style={{ width: 70, height: 26 }} value={tf} onChange={(e) => setTimeframe(e.target.value as Timeframe)} aria-label="Global timeframe">
        {TIMEFRAMES.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
      {inst && (
        <span className="row gap-1" style={{ whiteSpace: 'nowrap' }}>
          <span className="mono bold">{fmtPrice(inst, inst.price)}</span>
          <span className="tiny muted ws-unit">{inst.quoteCurrency}/{inst.unit}</span>
          <Change value={inst.changePercent} />
          <span className="ws-asof" data-tip="Time of the quotes shown">as of {fmtTime(FIXTURE_NOW_ISO)}</span>
        </span>
      )}
    </div>
  );
}
