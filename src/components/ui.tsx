import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { AlertTriangle, Inbox, Star } from 'lucide-react';
import type { Instrument } from '../types/market';
import { ASSET_CLASS_LABEL, ASSET_CLASSES, getInstruments } from '../data/instruments';
import { fmtPct, fmtPrice, tone } from '../lib/formatting';
import { useApp } from '../store/appStore';
import { isValidColor, SWATCHES, toHex6 } from '../design-system/themes';

/** Kept for compatibility; intentionally renders nothing. */
export function SimBadge(_props: { label?: string }) {
  return null;
}

export function Empty({ icon, title, hint, children }: { icon?: ReactNode; title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Inbox />}
      <div className="bold secondary">{title}</div>
      {hint && <div className="small">{hint}</div>}
      {children}
    </div>
  );
}

export function Change({ value, pct = true, digits = 2 }: { value: number | null | undefined; pct?: boolean; digits?: number }) {
  const t = tone(value);
  return <span className={`num ${t === 'pos' ? 'pos' : t === 'neg' ? 'neg' : 'muted'}`}>{pct ? fmtPct(value, digits) : value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(digits)}`}</span>;
}

export function Price({ inst, value }: { inst: Instrument; value?: number }) {
  return <span className="num">{fmtPrice(inst, value ?? inst.price)}</span>;
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ id: T; label: ReactNode }> }) {
  return (
    <div className="tabs no-drag" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={`tab ${value === o.id ? 'active' : ''}`} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, className = '' }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={`stat neu-soft card ${className}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub != null && <div className="small muted">{sub}</div>}
    </div>
  );
}

export function InstrumentSelect({ value, onChange, filter, className = '', placeholder }: { value: string; onChange: (id: string) => void; filter?: (i: Instrument) => boolean; className?: string; placeholder?: string }) {
  const list = getInstruments().filter((i) => (filter ? filter(i) : true));
  return (
    <select className={`select ${className}`} value={value} onChange={(e) => onChange(e.target.value)} aria-label={placeholder ?? 'Instrument'}>
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {ASSET_CLASSES.map((ac) => {
        const items = list.filter((i) => i.assetClass === ac);
        if (!items.length) return null;
        return (
          <optgroup key={ac} label={ASSET_CLASS_LABEL[ac]}>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.symbol} — {i.displayName}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

export function WatchStar({ id }: { id: string }) {
  const on = useApp((s) => s.watchlist.includes(id));
  const toggle = useApp((s) => s.toggleWatch);
  return (
    <button className="btn icon sm ghost" data-tip={on ? 'Remove from watchlist' : 'Add to watchlist'} aria-label={on ? 'Remove from watchlist' : 'Add to watchlist'} onClick={(e) => { e.stopPropagation(); toggle(id); }}>
      <Star style={{ fill: on ? 'var(--warning)' : 'none', color: on ? 'var(--warning)' : undefined }} />
    </button>
  );
}

export function Sparkline({ values, width = 120, height = 32, color }: { values: number[]; width?: number; height?: number; color?: string }) {
  const path = useMemo(() => {
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return values.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (values.length - 1)) * width).toFixed(1)},${(height - ((v - min) / span) * (height - 4) - 2).toFixed(1)}`).join(' ');
  }, [values, width, height]);
  const up = values.length > 1 && values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={path} fill="none" stroke={color ?? (up ? 'var(--positive)' : 'var(--negative)')} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

/** Colour control: swatches, native picker, validated hex/rgb input and reset. */
export function ColorControl({ label, value, onChange, onReset }: { label: string; value: string | undefined; onChange: (v: string) => void; onReset?: () => void }) {
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  const valid = text === '' || isValidColor(text);
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row">
        <input type="color" value={toHex6(value ?? '') ?? '#000000'} onChange={(e) => onChange(e.target.value)} aria-label={`${label} picker`} />
        <input
          className={`input mono ${valid ? '' : 'invalid'}`}
          value={text}
          placeholder="#rrggbb or rgb()"
          onChange={(e) => {
            setText(e.target.value);
            if (isValidColor(e.target.value)) onChange(e.target.value.trim());
          }}
          aria-invalid={!valid}
        />
        {onReset && (
          <button className="btn sm" onClick={onReset} data-tip="Reset to theme">
            Reset
          </button>
        )}
      </div>
      {!valid && <span className="tiny neg">Enter a valid hex (#1a2b3c) or rgb()/rgba() colour.</span>}
      <div className="row wrap gap-1">
        {SWATCHES.map((s) => (
          <button key={s} onClick={() => onChange(s)} aria-label={`Use ${s}`} style={{ width: 16, height: 16, borderRadius: 5, border: '1px solid var(--border-subtle)', background: s, cursor: 'pointer', padding: 0 }} />
        ))}
      </div>
    </div>
  );
}

export function NumberField({ label, value, onChange, step = 1, min, max, suffix, invalid }: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; suffix?: string; invalid?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(Number.isFinite(value) ? String(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="field">
      <label>
        {label}
        {suffix ? <span className="muted"> ({suffix})</span> : null}
      </label>
      <input
        className={`input num ${invalid ? 'invalid' : ''}`}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value === '' ? NaN : Number(e.target.value));
        }}
      />
    </div>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <div className="empty">
          <AlertTriangle className="neg" />
          <div className="bold">{this.props.label ?? 'This module'} hit an error</div>
          <div className="small mono">{this.state.error.message}</div>
          <button className="btn sm" onClick={() => this.setState({ error: null })}>
            Retry
          </button>
        </div>
      );
    return this.props.children;
  }
}

/* ---------- Confirm dialog ---------- */
interface ConfirmState {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger: boolean;
  resolve?: (ok: boolean) => void;
}
const useConfirmStore = create<ConfirmState>(() => ({ open: false, title: '', body: '', confirmLabel: 'Confirm', danger: true }));

export function confirmAction(opts: { title: string; body: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.setState({ open: true, title: opts.title, body: opts.body, confirmLabel: opts.confirmLabel ?? 'Confirm', danger: opts.danger ?? true, resolve }));
}

export function ConfirmHost() {
  const s = useConfirmStore();
  const close = (ok: boolean) => {
    s.resolve?.(ok);
    useConfirmStore.setState({ open: false, resolve: undefined });
  };
  useEffect(() => {
    if (!s.open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  if (!s.open) return null;
  return (
    <div className="overlay" style={{ zIndex: 25000 }} onMouseDown={() => close(false)}>
      <div className="modal neu-raised" style={{ width: 'min(440px, 92vw)' }} role="alertdialog" aria-modal onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <AlertTriangle className={s.danger ? 'neg' : 'warn'} size={18} />
          <h3>{s.title}</h3>
        </div>
        <div className="modal-body secondary">{s.body}</div>
        <div className="modal-foot">
          <button className="btn" onClick={() => close(false)} autoFocus>
            Cancel
          </button>
          <button className={`btn ${s.danger ? 'danger' : 'primary'}`} onClick={() => close(true)}>
            {s.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Small prompt dialog for names (workspace save-as, rename). */
interface PromptState {
  open: boolean;
  title: string;
  label: string;
  value: string;
  resolve?: (v: string | null) => void;
}
const usePromptStore = create<PromptState>(() => ({ open: false, title: '', label: '', value: '' }));
export function promptText(opts: { title: string; label: string; value?: string }): Promise<string | null> {
  return new Promise((resolve) => usePromptStore.setState({ open: true, title: opts.title, label: opts.label, value: opts.value ?? '', resolve }));
}
export function PromptHost() {
  const s = usePromptStore();
  const [v, setV] = useState('');
  useEffect(() => setV(s.value), [s.value, s.open]);
  if (!s.open) return null;
  const close = (val: string | null) => {
    s.resolve?.(val);
    usePromptStore.setState({ open: false, resolve: undefined });
  };
  return (
    <div className="overlay" style={{ zIndex: 25000 }} onMouseDown={() => close(null)}>
      <form
        className="modal neu-raised"
        style={{ width: 'min(440px, 92vw)' }}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (v.trim()) close(v.trim());
        }}
        onKeyDown={(e) => e.key === 'Escape' && close(null)}
      >
        <div className="modal-head">
          <h3>{s.title}</h3>
        </div>
        <div className="modal-body field">
          <label>{s.label}</label>
          <input className="input" autoFocus value={v} maxLength={80} onChange={(e) => setV(e.target.value)} />
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={() => close(null)}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!v.trim()}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
