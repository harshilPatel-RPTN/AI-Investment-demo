import { useEffect, useRef, useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { useApp } from '../store/appStore';
import { useWorkspace } from '../workspace/WorkspaceStore';
import { useScreenWindows } from '../workspace/useScreenWindows';
import { ColorControl, Tabs } from '../components/ui';
import { CUSTOM_THEME_ID, DEFAULT_APPEARANCE, DEFAULT_CHART_COLORS, FONT_OPTIONS, THEME_VAR_KEYS, THEME_VAR_LABELS, THEMES, type ChartColors } from './themes';
import { resolveThemeVars } from './ThemeProvider';
import type { WidgetAppearance } from '../types/widgets';

type Tab = 'theme' | 'colors' | 'type' | 'shape' | 'charts' | 'widget';

function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void; fmt?: (n: number) => string }) {
  return (
    <div className="field">
      <label>
        {label} <span className="accent">{fmt ? fmt(value) : value}</span>
      </label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

const CHART_LABELS: Record<keyof ChartColors, string> = {
  up: 'Up candle', down: 'Down candle', wickUp: 'Up wick', wickDown: 'Down wick', grid: 'Grid', crosshair: 'Crosshair',
  volume: 'Volume', sma: 'SMA line', ema: 'EMA line', bbands: 'Bollinger', vwap: 'VWAP', rsi: 'RSI', macd: 'MACD', signal: 'MACD signal',
};

function WidgetAppearancePanel({ targetId, setTargetId }: { targetId: string | null; setTargetId: (id: string) => void }) {
  const windows = useScreenWindows();
  const target = windows.find((w) => w.id === targetId) ?? null;
  const original = useRef<WidgetAppearance | null>(null);
  const [draft, setDraft] = useState<WidgetAppearance>({});
  const { setWindowAppearance } = useWorkspace.getState();
  const toast = useApp((s) => s.toast);

  useEffect(() => {
    original.current = target ? { ...target.appearance } : null;
    setDraft(target ? { ...target.appearance } : {});
    // Revert un-applied preview when switching target or closing.
    return () => {
      if (target && original.current) setWindowAppearance(target.id, original.current, { replace: true, history: false });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  const preview = (p: Partial<WidgetAppearance>) => {
    if (!target) return;
    const next = { ...draft, ...p };
    for (const k of Object.keys(next) as Array<keyof WidgetAppearance>) if (next[k] === undefined || next[k] === '') delete next[k];
    setDraft(next);
    setWindowAppearance(target.id, next, { replace: true, history: false });
  };

  if (!windows.length) return <div className="empty">Open a window first to customise it.</div>;

  return (
    <div className="col gap-3">
      <div className="field">
        <label>Window</label>
        <select className="select" value={targetId ?? ''} onChange={(e) => setTargetId(e.target.value)}>
          <option value="" disabled>
            Choose a window…
          </option>
          {windows.map((w) => (
            <option key={w.id} value={w.id}>
              {w.title}
            </option>
          ))}
        </select>
      </div>
      {target && (
        <>
          <div className="alert-box info small">Changes preview live on “{target.title}”. Apply to keep them (undoable), or Revert.</div>
          <div className="grid g2">
            <ColorControl label="Background" value={draft.background} onChange={(v) => preview({ background: v })} onReset={() => preview({ background: undefined })} />
            <ColorControl label="Text colour" value={draft.textColor} onChange={(v) => preview({ textColor: v })} onReset={() => preview({ textColor: undefined })} />
            <ColorControl label="Accent" value={draft.accent} onChange={(v) => preview({ accent: v })} onReset={() => preview({ accent: undefined })} />
            <ColorControl label="Border colour" value={draft.borderColor} onChange={(v) => preview({ borderColor: v })} onReset={() => preview({ borderColor: undefined })} />
          </div>
          <div className="grid g3">
            <div className="field">
              <label>Surface style</label>
              <select className="select" value={draft.surface ?? 'raised'} onChange={(e) => preview({ surface: e.target.value as WidgetAppearance['surface'] })}>
                <option value="raised">Raised</option>
                <option value="inset">Inset</option>
                <option value="flat">Flat</option>
              </select>
            </div>
            <div className="field">
              <label>Font family</label>
              <select className="select" value={draft.fontFamily ?? ''} onChange={(e) => preview({ fontFamily: e.target.value || undefined })}>
                <option value="">Theme default</option>
                {FONT_OPTIONS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </div>
            <label className="row" style={{ marginTop: 18 }}>
              <input type="checkbox" checked={!!draft.gradient} onChange={(e) => preview({ gradient: e.target.checked || undefined })} />
              Accent gradient
            </label>
          </div>
          <div className="grid g3">
            <Slider label="Corner radius" value={draft.radius ?? 20} min={0} max={40} step={1} onChange={(n) => preview({ radius: n })} fmt={(n) => `${n}px`} />
            <Slider label="Opacity" value={draft.opacity ?? 1} min={0.4} max={1} step={0.05} onChange={(n) => preview({ opacity: n })} fmt={(n) => `${Math.round(n * 100)}%`} />
            <Slider label="Shadow intensity" value={draft.shadowIntensity ?? 1} min={0} max={2} step={0.1} onChange={(n) => preview({ shadowIntensity: n })} fmt={(n) => `${n.toFixed(1)}×`} />
            <Slider label="Font size" value={draft.fontSize ?? 13} min={10} max={18} step={0.5} onChange={(n) => preview({ fontSize: n })} fmt={(n) => `${n}px`} />
            <Slider label="Padding" value={draft.padding ?? 12} min={0} max={28} step={1} onChange={(n) => preview({ padding: n })} fmt={(n) => `${n}px`} />
          </div>
          <div className="row end">
            <button className="btn" onClick={() => {
              setDraft({});
              setWindowAppearance(target.id, {}, { replace: true, history: false });
            }}>
              <RotateCcw /> Reset to theme
            </button>
            <button className="btn" onClick={() => {
              if (original.current) setWindowAppearance(target.id, original.current, { replace: true, history: false });
              setDraft({ ...(original.current ?? {}) });
            }}>
              Revert
            </button>
            <button className="btn primary" onClick={() => {
              const keep = { ...draft };
              // Restore the pre-preview state silently, then commit once so a single undo reverts it.
              setWindowAppearance(target.id, original.current ?? {}, { replace: true, history: false });
              setWindowAppearance(target.id, keep, { replace: true, history: true });
              original.current = keep;
              toast({ title: 'Window appearance applied', tone: 'success' });
            }}>
              <Check /> Apply to window
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function AppearanceEditor() {
  const open = useApp((s) => s.appearanceOpen);
  const target = useApp((s) => s.appearanceTarget);
  const s = useApp();
  const [tab, setTab] = useState<Tab>('theme');
  const snapshot = useRef<Pick<typeof s, 'themeId' | 'customVars' | 'appearance' | 'chartColors'> | null>(null);

  useEffect(() => {
    if (open) {
      snapshot.current = { themeId: s.themeId, customVars: s.customVars, appearance: s.appearance, chartColors: s.chartColors };
      setTab(target ? 'widget' : 'theme');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const close = () => s.set({ appearanceOpen: false, appearanceTarget: null });
  const revert = () => {
    if (snapshot.current) s.set(snapshot.current);
    close();
  };
  const vars = resolveThemeVars(s.themeId, s.customVars);
  const a = s.appearance;

  return (
    <div className="overlay" style={{ background: 'rgba(8,10,14,.25)', justifyContent: 'flex-end', alignItems: 'stretch', padding: 0 }} onMouseDown={revert}>
      <aside
        className="neu-raised col"
        style={{ width: 'min(520px, 96vw)', margin: 12, borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
        role="dialog"
        aria-modal
        aria-label="Appearance editor"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && revert()}
      >
        <div className="modal-head">
          <h3 className="grow">Appearance</h3>
          <button className="btn icon" onClick={revert} aria-label="Close and revert" data-tip="Close (reverts unapplied)">
            <X />
          </button>
        </div>
        <div style={{ padding: '10px 16px 0' }}>
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { id: 'theme', label: 'Themes' },
              { id: 'colors', label: 'Colours' },
              { id: 'type', label: 'Type' },
              { id: 'shape', label: 'Shape' },
              { id: 'charts', label: 'Charts' },
              { id: 'widget', label: 'Window' },
            ]}
          />
        </div>
        <div className="modal-body grow col gap-3">
          {tab !== 'widget' && <div className="alert-box info small">Global changes preview instantly. “Apply” keeps them; closing or “Cancel” reverts.</div>}
          {tab === 'theme' && (
            <div className="grid g2">
              {[...THEMES, { id: CUSTOM_THEME_ID, name: 'Custom Theme', vars: s.customVars }].map((t) => (
                <button key={t.id} className={`neu-soft card col ${s.themeId === t.id ? 'neu-pressed' : ''}`} style={{ cursor: 'pointer', textAlign: 'left', border: s.themeId === t.id ? '1px solid var(--accent)' : undefined }} onClick={() => s.setTheme(t.id)}>
                  <div className="row between">
                    <span className="bold">{t.name}</span>
                    {s.themeId === t.id && <Check size={14} className="accent" />}
                  </div>
                  <div className="row gap-1">
                    {['--os-bg', '--surface', '--accent', '--positive', '--negative', '--text-primary'].map((k) => (
                      <span key={k} style={{ width: 18, height: 18, borderRadius: 6, background: t.vars[k], border: '1px solid rgba(128,128,128,.3)' }} />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
          {tab === 'colors' && (
            <>
              <div className="small secondary">Editing any colour switches to the Custom Theme (starting from the current theme).</div>
              <div className="grid g2">
                {THEME_VAR_KEYS.map((k) => (
                  <ColorControl
                    key={k}
                    label={THEME_VAR_LABELS[k]}
                    value={vars[k]}
                    onChange={(v) => {
                      if (s.themeId !== CUSTOM_THEME_ID) s.set({ customVars: { ...vars } });
                      s.setCustomVar(k, v);
                    }}
                  />
                ))}
              </div>
              <div className="field">
                <label>Heatmap & alert severity</label>
              </div>
              <div className="grid g2">
                <ColorControl label="Heatmap positive" value={a.heatPositive} onChange={(v) => s.setAppearance({ heatPositive: v })} onReset={() => s.setAppearance({ heatPositive: DEFAULT_APPEARANCE.heatPositive })} />
                <ColorControl label="Heatmap negative" value={a.heatNegative} onChange={(v) => s.setAppearance({ heatNegative: v })} onReset={() => s.setAppearance({ heatNegative: DEFAULT_APPEARANCE.heatNegative })} />
                <ColorControl label="Severity: info" value={a.severityInfo} onChange={(v) => s.setAppearance({ severityInfo: v })} />
                <ColorControl label="Severity: warning" value={a.severityWarning} onChange={(v) => s.setAppearance({ severityWarning: v })} />
                <ColorControl label="Severity: critical" value={a.severityCritical} onChange={(v) => s.setAppearance({ severityCritical: v })} />
              </div>
            </>
          )}
          {tab === 'type' && (
            <div className="col gap-3">
              <div className="field">
                <label>Font family</label>
                <select className="select" value={a.fontFamily} onChange={(e) => s.setAppearance({ fontFamily: e.target.value })}>
                  {FONT_OPTIONS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </div>
              <Slider label="Base font size" value={a.fontSize} min={11} max={17} step={0.5} onChange={(n) => s.setAppearance({ fontSize: n })} fmt={(n) => `${n}px`} />
              <Slider label="Font weight" value={a.fontWeight} min={300} max={600} step={100} onChange={(n) => s.setAppearance({ fontWeight: n })} />
              <Slider label="Line height" value={a.lineHeight} min={1.2} max={1.8} step={0.05} onChange={(n) => s.setAppearance({ lineHeight: n })} fmt={(n) => n.toFixed(2)} />
              <Slider label="Letter spacing" value={a.letterSpacing} min={-0.5} max={1.5} step={0.1} onChange={(n) => s.setAppearance({ letterSpacing: n })} fmt={(n) => `${n.toFixed(1)}px`} />
            </div>
          )}
          {tab === 'shape' && (
            <div className="col gap-3">
              <Slider label="Corner radius scale" value={a.radiusScale} min={0} max={1.6} step={0.05} onChange={(n) => s.setAppearance({ radiusScale: n })} fmt={(n) => `${n.toFixed(2)}×`} />
              <Slider label="Shadow intensity (depth & spread)" value={a.shadowIntensity} min={0} max={2} step={0.05} onChange={(n) => s.setAppearance({ shadowIntensity: n })} fmt={(n) => `${n.toFixed(2)}×`} />
              <Slider label="Icon size" value={a.iconSize} min={12} max={22} step={1} onChange={(n) => s.setAppearance({ iconSize: n })} fmt={(n) => `${n}px`} />
              <div className="grid g2">
                <div className="field">
                  <label>Density</label>
                  <Tabs value={a.density} onChange={(v) => s.setAppearance({ density: v })} options={[{ id: 'compact', label: 'Compact' }, { id: 'comfortable', label: 'Comfortable' }]} />
                </div>
                <div className="field">
                  <label>Button shape</label>
                  <Tabs value={a.buttonShape} onChange={(v) => s.setAppearance({ buttonShape: v })} options={[{ id: 'square', label: 'Square' }, { id: 'rounded', label: 'Rounded' }, { id: 'pill', label: 'Pill' }]} />
                </div>
              </div>
              <div className="row wrap">
                <button className="btn">Preview button</button>
                <button className="btn primary">Primary</button>
                <button className="btn active">Pressed</button>
                <button className="btn" disabled>Disabled</button>
              </div>
            </div>
          )}
          {tab === 'charts' && (
            <>
              <div className="grid g2">
                {(Object.keys(CHART_LABELS) as Array<keyof ChartColors>).map((k) => (
                  <ColorControl key={k} label={CHART_LABELS[k]} value={s.chartColors[k]} onChange={(v) => s.setChartColors({ [k]: v })} onReset={() => s.setChartColors({ [k]: DEFAULT_CHART_COLORS[k] })} />
                ))}
              </div>
            </>
          )}
          {tab === 'widget' && <WidgetAppearancePanel targetId={target} setTargetId={(id) => s.set({ appearanceTarget: id })} />}
        </div>
        {tab !== 'widget' && (
          <div className="modal-foot">
            <button className="btn danger" onClick={s.resetTheme}>
              <RotateCcw /> Reset all to default
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn" onClick={revert}>
              Cancel
            </button>
            <button
              className="btn primary"
              onClick={() => {
                snapshot.current = null;
                close();
                s.toast({ title: 'Appearance applied', tone: 'success' });
              }}
            >
              <Check /> Apply
            </button>
          </div>
        )}
        {tab === 'widget' && (
          <div className="modal-foot">
            <button className="btn" onClick={close}>
              Done
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
