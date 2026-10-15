import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { Check, LayoutDashboard, LogIn, LogOut, SlidersHorizontal, UserRound, X } from 'lucide-react';
import { useApp } from '../store/appStore';
import { useWorkspace } from '../workspace/WorkspaceStore';
import { APP_CATEGORIES, APPS } from '../workspace/registry';
import type { WidgetType } from '../types/widgets';
import { deskIdFor, signIn, signOut, signUp } from '../lib/auth';
import { usePopover } from '../components/hooks';

/** The default set for a new desk = the Starter Dashboard apps. */
export const STARTER_APPS: WidgetType[] = ['chart-studio', 'upcoming', 'market-news', 'community'];
const QUICK_SETS: Array<{ label: string; apps: WidgetType[] }> = [
  { label: 'Starter', apps: STARTER_APPS },
  { label: 'Chart trader', apps: ['dashboard', 'chart-studio', 'watchlist', 'risk-lab', 'alerts'] },
  { label: 'AI research', apps: ['dashboard', 'ai-copilot', 'evidence', 'report', 'news', 'chart-studio'] },
  { label: 'Community first', apps: ['community', 'dashboard', 'chart-studio', 'journal'] },
];

const useAccountUi = create<{ auth: null | 'signin' | 'signup'; customize: boolean }>(() => ({ auth: null, customize: false }));
export const openSignIn = (mode: 'signin' | 'signup' = 'signin') => useAccountUi.setState({ auth: mode });
export const openCustomize = () => (useApp.getState().currentUser ? useAccountUi.setState({ customize: true }) : useAccountUi.setState({ auth: 'signin' }));

/** After sign-in: go to the user's own desk, or let them build one. */
function enterDesk(email: string, isNew: boolean) {
  const ws = useWorkspace.getState();
  const id = deskIdFor(email);
  if (!isNew && ws.workspaces.some((w) => w.id === id)) ws.switchWorkspace(id);
  else useAccountUi.setState({ customize: true });
}

function AuthDialog() {
  const mode = useAccountUi((s) => s.auth);
  const toast = useApp((s) => s.toast);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setError('');
    setPassword('');
  }, [mode]);
  if (!mode) return null;
  const close = () => useAccountUi.setState({ auth: null });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = mode === 'signup' ? await signUp(name, email, password) : await signIn(email, password);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    close();
    toast({ title: res.isNew ? `Welcome, ${res.user.name}!` : `Welcome back, ${res.user.name}`, body: res.isNew ? 'Pick the apps you want on your screen.' : undefined, tone: 'success' });
    enterDesk(res.user.email, res.isNew);
  };
  return (
    <div className="overlay" style={{ zIndex: 24000 }} onMouseDown={close}>
      <form className="modal neu-raised" style={{ width: 'min(420px, 94vw)' }} onMouseDown={(e) => e.stopPropagation()} onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && close()} aria-label={mode === 'signup' ? 'Create account' : 'Sign in'}>
        <div className="modal-head">
          <UserRound size={18} className="accent" />
          <h3 className="grow">{mode === 'signup' ? 'Create your account' : 'Sign in'}</h3>
          <button type="button" className="btn icon sm ghost" onClick={close} aria-label="Close"><X /></button>
        </div>
        <div className="modal-body col gap-3">
          <div className="tabs">
            <button type="button" className={`tab ${mode === 'signin' ? 'active' : ''}`} onClick={() => useAccountUi.setState({ auth: 'signin' })}>Sign in</button>
            <button type="button" className={`tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => useAccountUi.setState({ auth: 'signup' })}>Create account</button>
          </div>
          {mode === 'signup' && (
            <div className="field"><label>Name</label><input className="input" autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>
          )}
          <div className="field"><label>Email</label><input className="input" type="email" autoFocus={mode === 'signin'} value={email} maxLength={120} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
          <div className="field"><label>Password</label><input className="input" type="password" value={password} maxLength={128} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></div>
          {error && <div className="alert-box error small" role="alert">{error}</div>}
          <span className="tiny muted">Local account: stored only in this browser (password kept as a salted hash). Each account gets its own screen layout.</span>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy || !email || !password || (mode === 'signup' && !name.trim())}>
            {busy ? <span className="spinner" /> : <LogIn />} {mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Lets a signed-in user choose exactly which apps appear on their screen. */
function CustomizeScreen() {
  const open = useAccountUi((s) => s.customize);
  const user = useApp((s) => s.currentUser);
  const toast = useApp((s) => s.toast);
  const desk = useWorkspace((s) => (user ? s.workspaces.find((w) => w.id === deskIdFor(user.email)) : undefined));
  const initial = useMemo(() => (desk ? Array.from(new Set(desk.windows.map((w) => w.type))) : STARTER_APPS), [desk, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picked, setPicked] = useState<WidgetType[]>(initial);
  useEffect(() => setPicked(initial), [initial]);
  if (!open || !user) return null;
  const close = () => useAccountUi.setState({ customize: false });
  const toggle = (t: WidgetType) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const build = () => {
    // Keep a sensible order: the user's picks in registry order.
    const order = APPS.map((a) => a.type).filter((t) => picked.includes(t));
    useWorkspace.getState().createDesk(deskIdFor(user.email), `${user.name}'s Desk`, order);
    close();
    toast({ title: 'Your screen is ready', body: `${order.length} apps, auto-arranged. Change it any time from your account menu.`, tone: 'success' });
  };
  return (
    <div className="overlay" style={{ zIndex: 24000 }} onMouseDown={close}>
      <div className="modal wide neu-raised" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && close()} role="dialog" aria-label="Customize your screen">
        <div className="modal-head">
          <SlidersHorizontal size={18} className="accent" />
          <div className="col grow" style={{ gap: 0 }}>
            <h3>Customize your screen</h3>
            <span className="tiny muted">Choose what {user.name} sees after signing in. Windows are auto-arranged; you can still move, resize and pop them out.</span>
          </div>
          <button className="btn icon sm ghost" onClick={close} aria-label="Close"><X /></button>
        </div>
        <div className="modal-body col gap-3">
          <div className="row wrap gap-1">
            <span className="tiny muted">Quick sets:</span>
            {QUICK_SETS.map((q) => <button key={q.label} className="chip clickable" onClick={() => setPicked(q.apps)}>{q.label}</button>)}
            <button className="chip clickable" onClick={() => setPicked(APPS.map((a) => a.type))}>Everything</button>
            <button className="chip clickable" onClick={() => setPicked([])}>None</button>
          </div>
          {APP_CATEGORIES.map((cat) => {
            const apps = APPS.filter((a) => a.category === cat);
            if (!apps.length) return null;
            return (
              <div key={cat} className="col gap-1">
                <span className="section-title">{cat}</span>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
                  {apps.map((a) => {
                    const on = picked.includes(a.type);
                    const Icon = a.icon;
                    return (
                      <button key={a.type} className={`neu-soft card row top pick-tile ${on ? 'on' : ''}`} onClick={() => toggle(a.type)} aria-pressed={on}>
                        <span className={`pick-check ${on ? 'on' : ''}`}>{on && <Check size={12} />}</span>
                        <Icon size={16} className="accent" style={{ flex: 'none', marginTop: 2 }} />
                        <span className="col" style={{ gap: 2, textAlign: 'left' }}>
                          <span className="bold small">{a.title}</span>
                          <span className="tiny muted">{a.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="modal-foot">
          <span className="small muted grow">{picked.length} app{picked.length === 1 ? '' : 's'} selected</span>
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn primary" disabled={!picked.length} onClick={build}><LayoutDashboard /> {desk ? 'Update my screen' : 'Build my screen'}</button>
        </div>
      </div>
    </div>
  );
}

/** Top-bar account control: Sign in for guests; name + menu when signed in. */
export function AccountButton() {
  const user = useApp((s) => s.currentUser);
  const pop = usePopover();
  if (!user)
    return (
      <button className="btn" onClick={() => openSignIn('signin')} data-tip="Sign in to save your own screen">
        <LogIn /> Sign in
      </button>
    );
  const initials = user.name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const deskId = deskIdFor(user.email);
  return (
    <div ref={pop.ref} style={{ position: 'relative' }}>
      <button className="btn" onClick={pop.toggle} aria-haspopup="menu" aria-label={`Account: ${user.name}`}>
        <span className="avatar">{initials}</span>
        <span className="ellipsis" style={{ maxWidth: 110 }}>{user.name}</span>
      </button>
      {pop.open && (
        <div className="menu neu-raised" role="menu">
          <div className="small" style={{ padding: '6px 10px' }}>
            <div className="bold">{user.name}</div>
            <div className="tiny muted">{user.email} · local account</div>
          </div>
          <div className="menu-sep" />
          <button className="menu-item" onClick={() => { pop.setOpen(false); if (useWorkspace.getState().workspaces.some((w) => w.id === deskId)) useWorkspace.getState().switchWorkspace(deskId); else openCustomize(); }}><LayoutDashboard /> My desk</button>
          <button className="menu-item" onClick={() => { pop.setOpen(false); openCustomize(); }}><SlidersHorizontal /> Customize my screen</button>
          <div className="menu-sep" />
          <button className="menu-item danger" onClick={() => {
            pop.setOpen(false);
            signOut();
            useWorkspace.getState().openPreset('market-overview');
            useApp.getState().toast({ title: 'Signed out', body: 'Showing the Market Overview.', tone: 'info' });
          }}><LogOut /> Sign out</button>
        </div>
      )}
    </div>
  );
}

export function AccountHost() {
  return (
    <>
      <AuthDialog />
      <CustomizeScreen />
    </>
  );
}
