import { useState } from 'react';
import { Check, Database, Palette, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import type { ModuleProps } from '../types';
import { useApp } from '../../store/appStore';
import { useWorkspace } from '../../workspace/WorkspaceStore';
import { THEMES } from '../../design-system/themes';
import { callAI, checkAIHealth } from '../../lib/ai-client';
import { clearAllLocalData } from '../../lib/persistence';
import { getInstruments } from '../../data/instruments';
import { getNews } from '../../data/news';
import { getEvents } from '../../data/events';
import { FIXTURE_NOW_ISO } from '../../lib/seed';
import { fmtTime } from '../../lib/formatting';
import { confirmAction, Tabs } from '../../components/ui';
import { Markdown } from '../../components/Markdown';
import { FinVoicePicker } from '../../fin/ui/parts';

type Tab = 'theme' | 'workspace' | 'shortcuts' | 'data' | 'ai' | 'about';

const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl / ⌘ + K', 'Command palette (search instruments, apps, commands)'],
  ['Alt + L', 'App launcher'],
  ['Alt + V', 'Voice control on / off (say “help” for commands)'],
  ['Ctrl / ⌘ + Z', 'Undo layout / appearance change'],
  ['Ctrl / ⌘ + Shift + Z  or  Ctrl + Y', 'Redo'],
  ['Alt + M', 'Maximise / restore focused window'],
  ['Alt + W', 'Close focused window'],
  ['Double-click title bar', 'Maximise / restore'],
  ['Esc', 'Close any overlay, menu or dialog'],
  ['↑ ↓ Enter', 'Navigate palette / launcher'],
];

export default function Settings({ frame, updateSettings }: ModuleProps) {
  const tab = (frame.settings.tab as Tab) ?? 'theme';
  const app = useApp();
  const ws = useWorkspace();
  const [test, setTest] = useState<{ loading: boolean; text?: string; error?: string; ms?: number }>({ loading: false });

  const runTest = async () => {
    setTest({ loading: true });
    const t = performance.now();
    const res = await callAI({ mode: 'chat', style: 'simple', question: 'Reply with one short sentence confirming you can read this request.', context: {} });
    setTest(res.ok ? { loading: false, text: res.text, ms: Math.round(performance.now() - t) } : { loading: false, error: res.error });
  };

  return (
    <div className="module">
      <Tabs<Tab> value={tab} onChange={(t) => updateSettings({ tab: t })} options={[{ id: 'theme', label: 'Theme' }, { id: 'workspace', label: 'Workspace' }, { id: 'shortcuts', label: 'Shortcuts' }, { id: 'data', label: 'Data health' }, { id: 'ai', label: 'AI connection' }, { id: 'about', label: 'About' }]} />

      {tab === 'theme' && (
        <div className="col gap-3">
          <div className="grid g4">
            {THEMES.map((t) => (
              <button key={t.id} className={`neu-soft card col gap-1 ${app.themeId === t.id ? 'neu-pressed' : ''}`} style={{ cursor: 'pointer', textAlign: 'left' }} onClick={() => app.setTheme(t.id)}>
                <span className="row between bold small">{t.name}{app.themeId === t.id && <Check size={13} className="accent" />}</span>
                <span className="row gap-1">{['--os-bg', '--surface', '--accent', '--negative'].map((k) => <span key={k} style={{ width: 14, height: 14, borderRadius: 4, background: t.vars[k], border: '1px solid rgba(128,128,128,.3)' }} />)}</span>
              </button>
            ))}
          </div>
          <div className="row">
            <button className="btn primary" onClick={() => app.set({ appearanceOpen: true, appearanceTarget: null })}><Palette /> Open full appearance editor</button>
            <button className="btn" onClick={app.resetTheme}><RotateCcw /> Reset theme to default</button>
          </div>
          <span className="small muted">The High Contrast theme is an accessible fallback with maximum text contrast and no soft shadows.</span>
        </div>
      )}

      {tab === 'workspace' && (
        <div className="col gap-3">
          <div className="grid g2">
            <label className="neu-soft card row"><input type="checkbox" checked={ws.snapToGrid} onChange={ws.toggleSnap} /> Snap windows to a 20px grid</label>
            <label className="neu-soft card row"><input type="checkbox" checked={ws.showGuides} onChange={ws.toggleGuides} /> Edge snapping & alignment guides</label>
            <label className="neu-soft card row"><input type="checkbox" checked={app.autoFullscreen} onChange={(e) => app.set({ autoFullscreen: e.target.checked })} /> Ask to open in full screen when the OS starts</label>
            <label className="neu-soft card row"><input type="checkbox" checked={app.sidebarAutohide} onChange={(e) => app.set({ sidebarAutohide: e.target.checked })} /> Auto-hide dock</label>
            <label className="neu-soft card row"><input type="checkbox" checked={app.sidebarExpanded} onChange={(e) => app.set({ sidebarExpanded: e.target.checked })} /> Expanded dock with labels</label>
          </div>
          <table className="table">
            <thead><tr><th>Workspace</th><th>Windows</th><th>Updated</th><th /></tr></thead>
            <tbody>
              {ws.workspaces.map((w) => (
                <tr key={w.id} className={w.id === ws.activeId ? 'selected' : ''}>
                  <td className="bold">{w.name} {w.presetId && <span className="chip tiny">preset</span>}</td>
                  <td>{w.windows.length}</td>
                  <td className="small muted">{fmtTime(w.updatedAt)}</td>
                  <td className="right">
                    <button className="btn sm" disabled={w.id === ws.activeId} onClick={() => ws.switchWorkspace(w.id)}>Open</button>{' '}
                    <button className="btn sm danger" disabled={ws.workspaces.length <= 1} onClick={async () => { if (await confirmAction({ title: `Delete “${w.name}”?`, body: 'This layout will be removed from this browser.', confirmLabel: 'Delete' })) ws.deleteWorkspace(w.id); }}><Trash2 /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'shortcuts' && (
        <table className="table">
          <tbody>{SHORTCUTS.map(([k, d]) => <tr key={k}><td style={{ width: 260 }}><kbd>{k}</kbd></td><td>{d}</td></tr>)}</tbody>
        </table>
      )}

      {tab === 'data' && (
        <div className="col gap-3">
          <div className="grid g3">
            <div className="neu-soft card col gap-1"><span className="label">Instruments</span><span className="bold">{getInstruments().length} (gold, silver, oil, forex)</span><span className="tiny muted">Source: price generator</span></div>
            <div className="neu-soft card col gap-1"><span className="label">Headlines / events</span><span className="bold">{getNews().length} / {getEvents().length}</span><span className="tiny muted">Source: local data</span></div>
            <div className="neu-soft card col gap-1"><span className="label">Snapshot time</span><span className="bold">{fmtTime(FIXTURE_NOW_ISO)}</span><span className="tiny muted">Data snapshot clock</span></div>
          </div>
          <div className="neu-soft card col gap-2">
            <span className="section-title">Data controls</span>
            <span className="small secondary">Data generation epoch: <b>{app.dataEpoch}</b>. Regenerating produces a new, still deterministic, set of price histories.</span>
            <div className="row wrap">
              <button className="btn" onClick={() => { app.regenerateData(); app.toast({ title: 'Price data regenerated', body: `Epoch ${app.dataEpoch + 1}`, tone: 'success' }); }}><RefreshCw /> Regenerate price data</button>
              <button className="btn" onClick={async () => { if (await confirmAction({ title: 'Reset data?', body: 'Restores original data, watchlist, holdings and clears notebook, journal, alerts, screens and reports. Theme and workspaces are kept.', confirmLabel: 'Reset' })) { app.resetDemoData(); app.toast({ title: 'Data reset', tone: 'success' }); } }}><Database /> Reset data</button>
              <button className="btn danger" onClick={async () => { if (await confirmAction({ title: 'Clear ALL local data?', body: 'Everything stored by AI-TOS in this browser is deleted and the page reloads.', confirmLabel: 'Clear & reload' })) { clearAllLocalData(); window.location.reload(); } }}><Trash2 /> Clear all local data</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'ai' && (
        <div className="col gap-3">
          <div className="grid g3">
            <div className="neu-soft card col gap-1"><span className="label">Status</span><span className={`bold ${app.aiStatus === 'online' ? 'pos' : app.aiStatus === 'offline' ? 'neg' : 'warn'}`}>{app.aiStatus}</span><button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => void checkAIHealth()}><RefreshCw /> Re-check</button></div>
            <div className="neu-soft card col gap-1"><span className="label">Provider / model</span><span className="bold">Google Gemini</span><span className="small secondary">{app.aiModel ?? '—'} (+ fallbacks on overload)</span></div>
            <div className="neu-soft card col gap-1"><span className="label">This session</span><span className="bold">{app.aiUsage.requests} requests · {app.aiUsage.errors} errors</span><span className="small secondary">{app.aiUsage.totalTokens} tokens reported by the API</span></div>
          </div>
          {app.aiUsage.lastError && <div className="alert-box error small">Last error: {app.aiUsage.lastError}</div>}
          <div className="neu-soft card col gap-2">
            <span className="section-title">FIN voice companion</span>
            <label className="row"><input type="checkbox" checked={app.finGreetOnStartup} onChange={(e) => app.set({ finGreetOnStartup: e.target.checked })} /> Greet me with FIN when the OS opens</label>
            <label className="row"><input type="checkbox" checked={app.finFollowAlong} onChange={(e) => app.set({ finFollowAlong: e.target.checked })} /> During briefings, select the instrument FIN is discussing (restored on exit)</label>
            <div className="row">
              <span className="small">Voice engine</span>
              <select className="select" value={app.finVoiceMode} onChange={(e) => app.set({ finVoiceMode: e.target.value as 'auto' | 'browser' })}>
                <option value="auto">Real-time Gemini Live (falls back automatically)</option>
                <option value="browser">Browser speech only (turn-based)</option>
              </select>
            </div>
            <FinVoicePicker />
            <span className="tiny muted">Live voice uses short-lived single-use tokens issued by the local server; the API key never reaches the browser. The microphone only starts when you press the mic button.</span>
          </div>
          <div className="alert-box info small">The API key lives only in the server-side <code>.env</code> (GEMINI_API_KEY) and never reaches the browser. Usage is governed by your Google account's free-tier limits; exact billing is not shown here.</div>
          <div className="neu-soft card col gap-2">
            <div className="row between"><span className="section-title">Test prompt</span><button className="btn sm primary" disabled={test.loading} onClick={runTest}>{test.loading ? <span className="spinner" /> : null} Send test</button></div>
            {test.error && <div className="alert-box error small">{test.error}</div>}
            {test.text && <><Markdown text={test.text} /><span className="tiny muted">Round trip {test.ms} ms</span></>}
          </div>
        </div>
      )}

      {tab === 'about' && (
        <div className="col gap-2 secondary">
          <h3 style={{ color: 'var(--text-primary)' }}>AI Trading Assistance OS — v1.0</h3>
          <p>A Neumorphic, desktop-first research workspace covering gold, silver, oil and forex with charts, screening, risk tools, reports and a contextual AI assistant.</p>
          <p className="small">Built with React, TypeScript, Vite, Zustand, Zod, react-rnd, TradingView Lightweight Charts (Apache-2.0) and Lucide icons. AI via a local Express proxy to Google Gemini.</p>
        </div>
      )}
    </div>
  );
}
