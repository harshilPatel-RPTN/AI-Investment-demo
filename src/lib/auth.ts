import { useApp } from '../store/appStore';
import { ME_PROFILE } from '../data/community/seed';

/**
 * Local demo accounts (no server): accounts live in this browser only.
 * Passwords are never stored — only a salted SHA-256 hash.
 */
const ACCOUNTS_KEY = 'aitos:v1:accounts';

interface StoredAccount {
  name: string;
  email: string;
  salt: string;
  hash: string;
  createdAt: string;
}
export interface User {
  name: string;
  email: string;
}
export type AuthResult = { ok: true; user: User; isNew: boolean } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function load(): Record<string, StoredAccount> {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function save(a: Record<string, StoredAccount>) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(a));
}

async function hashPassword(password: string, salt: string) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const norm = (email: string) => email.trim().toLowerCase();

export async function signUp(name: string, email: string, password: string): Promise<AuthResult> {
  const n = name.trim();
  const e = norm(email);
  if (n.length < 2 || n.length > 40) return { ok: false, error: 'Name must be 2–40 characters.' };
  if (!EMAIL_RE.test(e)) return { ok: false, error: 'Enter a valid email address.' };
  if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };
  const accounts = load();
  if (accounts[e]) return { ok: false, error: 'An account with this email already exists on this browser. Sign in instead.' };
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  accounts[e] = { name: n, email: e, salt, hash: await hashPassword(password, salt), createdAt: new Date().toISOString() };
  try {
    save(accounts);
  } catch {
    return { ok: false, error: 'Could not save the account (browser storage is blocked or full).' };
  }
  const user = { name: n, email: e };
  useApp.getState().set({ currentUser: user });
  return { ok: true, user, isNew: true };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const e = norm(email);
  const acc = load()[e];
  // Same message for unknown email and wrong password.
  if (!acc || (await hashPassword(password, acc.salt)) !== acc.hash) return { ok: false, error: 'Email or password is incorrect.' };
  const user = { name: acc.name, email: acc.email };
  useApp.getState().set({ currentUser: user });
  return { ok: true, user, isNew: false };
}

export function signOut() {
  useApp.getState().set({ currentUser: null });
}

/** Stable workspace id for a user's personal desk. */
export function deskIdFor(email: string) {
  let h = 2166136261;
  for (const ch of norm(email)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return `user:${(h >>> 0).toString(36)}`;
}

/** Community posts are authored by "me": show the signed-in name instead of "You". */
function applyIdentity(user: User | null) {
  ME_PROFILE.displayName = user?.name ?? 'You';
  ME_PROFILE.username = user ? user.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 20) || 'you' : 'you';
}
applyIdentity(useApp.getState().currentUser);
useApp.subscribe((s, p) => {
  if (s.currentUser !== p.currentUser) applyIdentity(s.currentUser);
});
