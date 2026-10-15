import type { StateStorage } from 'zustand/middleware';

export const STORAGE_PREFIX = 'aitos:v1:';
export const STORAGE_KEYS = {
  app: `${STORAGE_PREFIX}app`,
  workspace: `${STORAGE_PREFIX}workspace`,
  community: `${STORAGE_PREFIX}community`,
  voice: `${STORAGE_PREFIX}voice`,
} as const;

/** Keys whose stored JSON failed to parse and were reset to defaults this session. */
export const recoveredKeys = new Set<string>();

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, string>();

function flush(name: string) {
  const v = pending.get(name);
  if (v == null) return;
  pending.delete(name);
  try {
    localStorage.setItem(name, v);
  } catch {
    // Storage full or blocked — the app keeps working in memory.
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    for (const k of Array.from(pending.keys())) flush(k);
  });
}

/** localStorage wrapper: validates JSON on read, debounces writes (autosave), never throws. */
export function safeStorage(debounceMs = 400): StateStorage {
  return {
    getItem(name) {
      try {
        const raw = localStorage.getItem(name);
        if (raw == null) return null;
        JSON.parse(raw);
        return raw;
      } catch {
        recoveredKeys.add(name);
        try {
          localStorage.removeItem(name);
        } catch {
          /* ignore */
        }
        return null;
      }
    },
    setItem(name, value) {
      pending.set(name, value);
      const t = timers.get(name);
      if (t) clearTimeout(t);
      timers.set(name, setTimeout(() => flush(name), debounceMs));
    },
    removeItem(name) {
      pending.delete(name);
      try {
        localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };
}

export function flushAll() {
  for (const k of Array.from(pending.keys())) flush(k);
}

export function clearAllLocalData() {
  pending.clear();
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('aitos:'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export function downloadFile(filename: string, content: string, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}
