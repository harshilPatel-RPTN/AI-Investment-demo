import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, CandlestickChart, Clock, FileText, LayoutTemplate, Maximize, Palette, Redo2, Save, Sparkles, Terminal, Undo2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useApp } from '../store/appStore';
import { useWorkspace, LAYOUT_MODES } from '../workspace/WorkspaceStore';
import { APPS } from '../workspace/registry';
import { WORKSPACE_PRESETS } from '../data/workspaces';
import { ASSET_CLASS_LABEL, getInstruments } from '../data/instruments';
import { THEMES } from '../design-system/themes';
import { fmtPct, fmtPrice } from '../lib/formatting';
import { activateApp } from './Sidebar';
import { saveWorkspaceAs } from './TopBar';
import { useFin } from '../fin/finStore';

interface Cmd {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  keywords?: string;
  run: () => void;
}

function buildCommands(): Cmd[] {
  const app = useApp.getState();
  const ws = useWorkspace.getState();
  const cmds: Cmd[] = [];
  for (const i of getInstruments()) {
    cmds.push({
      id: `inst:${i.id}`,
      group: 'Instruments',
      label: `${i.symbol} — ${i.displayName}`,
      hint: `${fmtPrice(i, i.price)} ${i.quoteCurrency} · ${fmtPct(i.changePercent)} · SIM`,
      icon: CandlestickChart,
      keywords: `${i.id} ${i.assetClass} ${ASSET_CLASS_LABEL[i.assetClass]} ${i.tags.join(' ')}`,
      run: () => {
        app.selectInstrument(i.id);
        activateApp('chart-studio');
      },
    });
  }
  for (const a of APPS) {
    cmds.push({ id: `app:${a.type}`, group: 'Apps', label: `Open ${a.title}`, hint: a.category, icon: a.icon, keywords: `${a.description} ${(a.keywords ?? []).join(' ')}`, run: () => activateApp(a.type) });
  }
  cmds.push(
    { id: 'cmd:report', group: 'Commands', label: 'Create research report for selected instrument', icon: FileText, keywords: 'ai analysis generate', run: () => ws.openApp('report', { settings: { autoGenerate: Date.now() } }) },
    { id: 'cmd:fin', group: 'Commands', label: 'Open FIN (AI market companion)', hint: 'Alt F', icon: Sparkles, keywords: 'voice assistant talk briefing', run: () => useFin.getState().open('compact') },
    { id: 'cmd:fin-brief', group: 'Commands', label: 'FIN: start my market briefing', icon: Sparkles, keywords: 'voice briefing daily morning', run: () => { useFin.getState().open('immersive'); void useFin.getState().startBriefing('full'); } },
    { id: 'cmd:new-chart', group: 'Commands', label: 'Open new chart window', icon: CandlestickChart, run: () => ws.openApp('chart-studio', { forceNew: true }) },
    { id: 'cmd:save-ws', group: 'Commands', label: 'Save workspace as…', icon: Save, run: () => void saveWorkspaceAs() },
    { id: 'cmd:undo', group: 'Commands', label: 'Undo layout change', hint: 'Ctrl Z', icon: Undo2, run: () => ws.undo() },
    { id: 'cmd:redo', group: 'Commands', label: 'Redo layout change', hint: 'Ctrl Shift Z', icon: Redo2, run: () => ws.redo() },
    { id: 'cmd:appearance', group: 'Commands', label: 'Open appearance editor', icon: Palette, run: () => app.set({ appearanceOpen: true, appearanceTarget: null }) },
    { id: 'cmd:fullscreen', group: 'Commands', label: 'Toggle full screen', icon: Maximize, run: () => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => app.toast({ title: 'Full screen refused by browser', tone: 'warning' })) },
  );
  for (const m of LAYOUT_MODES) cmds.push({ id: `layout:${m.id}`, group: 'Layouts', label: `Arrange: ${m.label}`, icon: LayoutTemplate, run: () => ws.applyLayout(m.id) });
  for (const t of THEMES) cmds.push({ id: `theme:${t.id}`, group: 'Themes', label: `Theme: ${t.name}`, icon: Palette, run: () => app.setTheme(t.id) });
  for (const p of WORKSPACE_PRESETS)
    cmds.push({
      id: `preset:${p.id}`, group: 'Workspaces', label: `Switch to preset: ${p.name}`, hint: p.description, icon: LayoutTemplate,
      run: () => {
        ws.openPreset(p.id);
        if (p.selectInstrument) app.selectInstrument(p.selectInstrument);
      },
    });
  for (const w of ws.workspaces.filter((x) => !x.presetId)) cmds.push({ id: `ws:${w.id}`, group: 'Workspaces', label: `Switch to: ${w.name}`, icon: LayoutTemplate, run: () => ws.switchWorkspace(w.id) });
  for (const n of app.notebook.slice(0, 50))
    cmds.push({ id: `note:${n.id}`, group: 'Research notes', label: n.title, hint: n.folder, icon: BookOpen, keywords: `${n.tags.join(' ')} ${n.body.slice(0, 200)}`, run: () => ws.openApp('notebook', { settings: { selectedId: n.id } }) });
  return cmds;
}

export function CommandPalette() {
  const open = useApp((s) => s.paletteOpen);
  const recent = useApp((s) => s.recentCommands);
  const { set, noteRecentCommand } = useApp.getState();
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => (open ? buildCommands() : []), [open]);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) {
      const rec = recent.map((id) => all.find((c) => c.id === id)).filter(Boolean).map((c) => ({ ...(c as Cmd), group: 'Recent' }));
      const sel = useApp.getState().selectedInstrumentId;
      const suggested = all.filter((c) => ['cmd:report', 'cmd:save-ws', `inst:${sel}`, 'app:ai-copilot', 'app:chart-studio'].includes(c.id));
      return [...rec, ...suggested.filter((c) => !recent.includes(c.id)).map((c) => ({ ...c, group: 'Suggested' }))];
    }
    const terms = s.split(/\s+/);
    return all
      .map((c) => {
        const hay = `${c.label} ${c.keywords ?? ''} ${c.group}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return null;
        const score = (c.label.toLowerCase().startsWith(s) ? 0 : 1) + (c.label.toLowerCase().includes(s) ? 0 : 1);
        return { c, score };
      })
      .filter((x): x is { c: Cmd; score: number } => !!x)
      .sort((a, b) => a.score - b.score)
      .slice(0, 60)
      .map((x) => x.c);
  }, [q, all, recent]);

  useEffect(() => setCursor(0), [q]);
  useEffect(() => {
    if (open) setQ('');
  }, [open]);
  useEffect(() => {
    listRef.current?.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;
  const close = () => set({ paletteOpen: false });
  const exec = (c: Cmd) => {
    noteRecentCommand(c.id);
    close();
    c.run();
  };

  let lastGroup = '';
  return (
    <div className="overlay" onMouseDown={close}>
      <div className="palette neu-raised" role="dialog" aria-modal aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()} style={{ overflow: 'hidden' }}>
        <input
          className="input palette-input"
          autoFocus
          placeholder="Type a symbol, app, command, layout or note…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Command search"
          role="combobox"
          aria-expanded
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
            else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(results.length - 1, c + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === 'Enter' && results[cursor]) {
              e.preventDefault();
              exec(results[cursor]);
            }
          }}
        />
        <div className="palette-list" ref={listRef} role="listbox">
          {results.length === 0 && <div className="empty">No matches for “{q}”.</div>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            const Icon = c.group === 'Recent' ? Clock : c.icon;
            return (
              <div key={`${c.group}:${c.id}`}>
                {header && <div className="palette-group">{header}</div>}
                <div role="option" aria-selected={i === cursor} className={`palette-item ${i === cursor ? 'active' : ''}`} onMouseEnter={() => setCursor(i)} onClick={() => exec(c)}>
                  <Icon />
                  <span className="ellipsis">{c.label}</span>
                  {c.hint && <span className="hint ellipsis" style={{ maxWidth: 240 }}>{c.hint}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="row between tiny muted" style={{ padding: '8px 14px', borderTop: '1px solid var(--border-subtle)' }}>
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate · <kbd>Enter</kbd> run · <kbd>Esc</kbd> close
          </span>
          <span className="row gap-1"><Terminal size={12} /> {all.length} items</span>
        </div>
      </div>
    </div>
  );
}
