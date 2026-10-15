import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Timeframe } from '../types/market';
import type { WidgetType } from '../types/widgets';
import type { AIAnalysis } from '../types/ai';
import {
  CUSTOM_THEME_ID, DEFAULT_APPEARANCE, DEFAULT_CHART_COLORS, THEMES,
  type ChartColors, type GlobalAppearance, type ThemeVars,
} from '../design-system/themes';
import { safeStorage, STORAGE_KEYS } from '../lib/persistence';
import { uid } from '../lib/formatting';
import { FIXTURE_NOW_ISO } from '../lib/seed';
import { DEFAULT_HOLDINGS, type Holding } from '../data/portfolios';
import { INSTRUMENT_SEEDS } from '../data/instruments';
import type { ScreenDefinition } from '../lib/calculations/screener';
import type { StrategyRule } from '../lib/calculations/strategy';
import { setDataEpoch } from '../data/priceSeries';

export type NotificationCategory = 'price' | 'screener' | 'ai' | 'workspace' | 'system' | 'event';
export interface AppNotification {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  severity: 'info' | 'warning' | 'critical' | 'success';
  read: boolean;
  createdAt: string;
}

export interface NotebookEntry {
  id: string;
  title: string;
  body: string;
  kind: 'note' | 'ai-response' | 'report' | 'chart' | 'instrument';
  folder: string;
  tags: string[];
  instrumentId?: string;
  createdAt: string;
  updatedAt: string;
  data?: unknown;
}

export interface JournalEntry {
  id: string;
  instrumentId: string;
  direction: 'long' | 'short';
  status: 'planned' | 'open' | 'closed';
  entry: number;
  exit?: number;
  stop?: number;
  target?: number;
  quantity: number;
  setup: string;
  thesis: string;
  notes: string;
  lessons: string;
  tags: string[];
  createdAt: string;
  closedAt?: string;
}

export type AlertKind = 'price-above' | 'price-below' | 'pct-move' | 'rsi-above' | 'rsi-below' | 'screener' | 'event';
export interface AlertRule {
  id: string;
  name: string;
  kind: AlertKind;
  instrumentId?: string;
  threshold?: number;
  screenId?: string;
  eventId?: string;
  severity: 'info' | 'warning' | 'critical';
  enabled: boolean;
  lastTriggeredAt?: string;
  createdAt: string;
}

export interface Toast {
  id: string;
  title: string;
  body?: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

export interface AIInboxItem {
  id: string;
  question: string;
  extra?: string;
  autoSend?: boolean;
}

export interface SavedReport {
  id: string;
  question: string;
  instrumentId: string;
  timeframe: Timeframe;
  createdAt: string;
  analysis: AIAnalysis;
  source: 'ai' | 'local';
  model?: string;
}

interface AppState {
  themeId: string;
  customVars: ThemeVars;
  appearance: GlobalAppearance;
  chartColors: ChartColors;
  selectedInstrumentId: string;
  timeframe: Timeframe;
  watchlist: string[];
  pinnedApps: WidgetType[];
  recentApps: WidgetType[];
  recentCommands: string[];
  recentInstruments: string[];
  sidebarExpanded: boolean;
  sidebarAutohide: boolean;
  notifications: AppNotification[];
  notebook: NotebookEntry[];
  journal: JournalEntry[];
  alerts: AlertRule[];
  holdings: Holding[];
  screens: ScreenDefinition[];
  strategyRules: StrategyRule[];
  strategyLogic: 'AND' | 'OR';
  reports: SavedReport[];
  activeReportId: string | null;
  dataEpoch: number;
  aiStyle: 'simple' | 'balanced' | 'advanced';
  finGreetOnStartup: boolean;
  finFollowAlong: boolean;
  finVoiceMode: 'auto' | 'browser';
  /** FIN's voice (Gemini Live prebuilt voice id; see fin/voices.ts). */
  finVoice: string;
  screenDisplays: Record<string, string>;
  /** Enter full screen automatically on the first click/key press of each visit. */
  autoFullscreen: boolean;
  /** Signed-in local demo account (null = guest). */
  currentUser: { name: string; email: string } | null;
  // session-only
  toasts: Toast[];
  aiInbox: AIInboxItem[];
  aiStatus: 'unknown' | 'checking' | 'online' | 'no-key' | 'offline';
  aiModel?: string;
  aiUsage: { requests: number; errors: number; totalTokens: number; lastError?: string };
  launcherOpen: boolean;
  paletteOpen: boolean;
  appearanceOpen: boolean;
  appearanceTarget: string | null;
}

interface AppActions {
  set: (p: Partial<AppState>) => void;
  setTheme: (id: string) => void;
  setCustomVar: (key: string, value: string) => void;
  setAppearance: (p: Partial<GlobalAppearance>) => void;
  setChartColors: (p: Partial<ChartColors>) => void;
  resetTheme: () => void;
  selectInstrument: (id: string) => void;
  setTimeframe: (tf: Timeframe) => void;
  toggleWatch: (id: string) => void;
  togglePin: (t: WidgetType) => void;
  reorderPinned: (from: number, to: number) => void;
  noteRecentApp: (t: WidgetType) => void;
  noteRecentCommand: (id: string) => void;
  notify: (n: Omit<AppNotification, 'id' | 'read' | 'createdAt'>) => void;
  markRead: (id?: string) => void;
  dismissNotification: (id: string) => void;
  clearNotifications: () => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  addNote: (n: Omit<NotebookEntry, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateNote: (id: string, p: Partial<NotebookEntry>) => void;
  deleteNote: (id: string) => void;
  upsertJournal: (j: JournalEntry) => void;
  deleteJournal: (id: string) => void;
  upsertAlert: (a: AlertRule) => void;
  deleteAlert: (id: string) => void;
  upsertHolding: (h: Holding) => void;
  deleteHolding: (id: string) => void;
  upsertScreen: (s: ScreenDefinition) => void;
  deleteScreen: (id: string) => void;
  sendToAI: (item: Omit<AIInboxItem, 'id'>) => void;
  consumeInbox: (id: string) => void;
  saveReport: (r: SavedReport) => void;
  regenerateData: () => void;
  resetDemoData: () => void;
  recordAIUsage: (ok: boolean, tokens?: number, error?: string) => void;
}

export const DEFAULT_PINNED: WidgetType[] = [
  'market-terminal', 'asset-explorer', 'chart-studio', 'screener', 'news', 'ai-copilot', 'evidence', 'risk-lab', 'portfolio', 'notebook', 'community',
];

const persistedDefaults = {
  themeId: 'midnight',
  customVars: { ...THEMES[0].vars },
  appearance: DEFAULT_APPEARANCE,
  chartColors: DEFAULT_CHART_COLORS,
  selectedInstrumentId: 'XAUUSD',
  timeframe: '1D' as Timeframe,
  watchlist: ['XAUUSD', 'XAGUSD', 'GOLDINR', 'WTIUSD', 'BRENTUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDINR'],
  pinnedApps: DEFAULT_PINNED,
  recentApps: [] as WidgetType[],
  recentCommands: [] as string[],
  recentInstruments: [] as string[],
  sidebarExpanded: false,
  sidebarAutohide: false,
  notifications: [
    { id: 'n_welcome', title: 'Welcome to AI-TOS', body: 'Your research workspace is ready.', category: 'system', severity: 'info', read: false, createdAt: FIXTURE_NOW_ISO },
  ] as AppNotification[],
  notebook: [] as NotebookEntry[],
  journal: [] as JournalEntry[],
  alerts: [] as AlertRule[],
  holdings: DEFAULT_HOLDINGS,
  screens: [] as ScreenDefinition[],
  strategyRules: [] as StrategyRule[],
  strategyLogic: 'AND' as const,
  reports: [] as SavedReport[],
  activeReportId: null as string | null,
  dataEpoch: 0,
  aiStyle: 'balanced' as const,
  finGreetOnStartup: true,
  finFollowAlong: true,
  finVoiceMode: 'auto' as 'auto' | 'browser',
  finVoice: 'Puck',
  /** Multi-monitor: which physical display each screen window opens on (display key). */
  screenDisplays: {} as Record<string, string>,
  autoFullscreen: true,
  currentUser: null as { name: string; email: string } | null,
};

type PersistedKeys = keyof typeof persistedDefaults;
/** Keys shared across screens (browser windows) and persisted locally. */
export const PERSISTED_APP_KEYS = Object.keys(persistedDefaults) as PersistedKeys[];

export const useApp = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      ...persistedDefaults,
      toasts: [],
      aiInbox: [],
      aiStatus: 'unknown',
      aiUsage: { requests: 0, errors: 0, totalTokens: 0 },
      launcherOpen: false,
      paletteOpen: false,
      appearanceOpen: false,
      appearanceTarget: null,

      set: (p) => set(p),
      setTheme: (id) => set({ themeId: id }),
      setCustomVar: (key, value) => set((s) => ({ themeId: CUSTOM_THEME_ID, customVars: { ...s.customVars, [key]: value } })),
      setAppearance: (p) => set((s) => ({ appearance: { ...s.appearance, ...p } })),
      setChartColors: (p) => set((s) => ({ chartColors: { ...s.chartColors, ...p } })),
      resetTheme: () => set({ themeId: 'midnight', customVars: { ...THEMES[0].vars }, appearance: DEFAULT_APPEARANCE, chartColors: DEFAULT_CHART_COLORS }),
      selectInstrument: (id) =>
        set((s) => ({ selectedInstrumentId: id, recentInstruments: [id, ...s.recentInstruments.filter((x) => x !== id)].slice(0, 8) })),
      setTimeframe: (tf) => set({ timeframe: tf }),
      toggleWatch: (id) => set((s) => ({ watchlist: s.watchlist.includes(id) ? s.watchlist.filter((x) => x !== id) : [...s.watchlist, id] })),
      togglePin: (t) => set((s) => ({ pinnedApps: s.pinnedApps.includes(t) ? s.pinnedApps.filter((x) => x !== t) : [...s.pinnedApps, t] })),
      reorderPinned: (from, to) =>
        set((s) => {
          const arr = [...s.pinnedApps];
          const [m] = arr.splice(from, 1);
          arr.splice(to, 0, m);
          return { pinnedApps: arr };
        }),
      noteRecentApp: (t) => set((s) => ({ recentApps: [t, ...s.recentApps.filter((x) => x !== t)].slice(0, 6) })),
      noteRecentCommand: (id) => set((s) => ({ recentCommands: [id, ...s.recentCommands.filter((x) => x !== id)].slice(0, 6) })),
      notify: (n) =>
        set((s) => ({
          notifications: [{ ...n, id: uid('n'), read: false, createdAt: new Date().toISOString() }, ...s.notifications].slice(0, 100),
        })),
      markRead: (id) => set((s) => ({ notifications: s.notifications.map((n) => (!id || n.id === id ? { ...n, read: true } : n)) })),
      dismissNotification: (id) => set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
      clearNotifications: () => set({ notifications: [] }),
      toast: (t) => {
        const id = uid('t');
        set((s) => ({ toasts: [...s.toasts, { ...t, id }].slice(-4) }));
        setTimeout(() => get().dismissToast(id), 3800);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      addNote: (n) => {
        const id = uid('note');
        const now = new Date().toISOString();
        set((s) => ({ notebook: [{ ...n, id, createdAt: now, updatedAt: now }, ...s.notebook] }));
        return id;
      },
      updateNote: (id, p) => set((s) => ({ notebook: s.notebook.map((n) => (n.id === id ? { ...n, ...p, updatedAt: new Date().toISOString() } : n)) })),
      deleteNote: (id) => set((s) => ({ notebook: s.notebook.filter((n) => n.id !== id) })),
      upsertJournal: (j) => set((s) => ({ journal: s.journal.some((x) => x.id === j.id) ? s.journal.map((x) => (x.id === j.id ? j : x)) : [j, ...s.journal] })),
      deleteJournal: (id) => set((s) => ({ journal: s.journal.filter((x) => x.id !== id) })),
      upsertAlert: (a) => set((s) => ({ alerts: s.alerts.some((x) => x.id === a.id) ? s.alerts.map((x) => (x.id === a.id ? a : x)) : [a, ...s.alerts] })),
      deleteAlert: (id) => set((s) => ({ alerts: s.alerts.filter((x) => x.id !== id) })),
      upsertHolding: (h) => set((s) => ({ holdings: s.holdings.some((x) => x.id === h.id) ? s.holdings.map((x) => (x.id === h.id ? h : x)) : [...s.holdings, h] })),
      deleteHolding: (id) => set((s) => ({ holdings: s.holdings.filter((x) => x.id !== id) })),
      upsertScreen: (sc) => set((s) => ({ screens: s.screens.some((x) => x.id === sc.id) ? s.screens.map((x) => (x.id === sc.id ? sc : x)) : [...s.screens, sc] })),
      deleteScreen: (id) => set((s) => ({ screens: s.screens.filter((x) => x.id !== id) })),
      sendToAI: (item) => set((s) => ({ aiInbox: [...s.aiInbox, { ...item, id: uid('ai') }] })),
      consumeInbox: (id) => set((s) => ({ aiInbox: s.aiInbox.filter((x) => x.id !== id) })),
      saveReport: (r) => set((s) => ({ reports: [r, ...s.reports.filter((x) => x.id !== r.id)].slice(0, 30), activeReportId: r.id })),
      regenerateData: () => {
        const next = get().dataEpoch + 1;
        setDataEpoch(next);
        set({ dataEpoch: next });
      },
      resetDemoData: () => {
        setDataEpoch(0);
        set({ ...persistedDefaults, themeId: get().themeId, customVars: get().customVars, appearance: get().appearance, chartColors: get().chartColors });
      },
      recordAIUsage: (ok, tokens, error) =>
        set((s) => ({
          aiUsage: {
            requests: s.aiUsage.requests + 1,
            errors: s.aiUsage.errors + (ok ? 0 : 1),
            totalTokens: s.aiUsage.totalTokens + (tokens ?? 0),
            lastError: ok ? s.aiUsage.lastError : error,
          },
        })),
    }),
    {
      name: STORAGE_KEYS.app,
      version: 1,
      storage: createJSONStorage(() => safeStorage()),
      partialize: (s) => {
        const out: Partial<Record<PersistedKeys, unknown>> = {};
        (Object.keys(persistedDefaults) as PersistedKeys[]).forEach((k) => (out[k] = s[k]));
        return out as Partial<AppState>;
      },
      // Shallow-validate persisted values so a corrupt/foreign value never crashes the app.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        const out = { ...current } as Record<string, unknown>;
        for (const k of Object.keys(persistedDefaults) as PersistedKeys[]) {
          const def = persistedDefaults[k];
          const v = p[k];
          if (v === undefined) continue;
          if (Array.isArray(def) ? Array.isArray(v) : typeof v === typeof def || (def === null && (v === null || typeof v === 'string'))) out[k] = v;
        }
        out.appearance = { ...DEFAULT_APPEARANCE, ...((out.appearance as object) ?? {}) };
        out.chartColors = { ...DEFAULT_CHART_COLORS, ...((out.chartColors as object) ?? {}) };
        if (typeof out.dataEpoch === 'number') setDataEpoch(out.dataEpoch as number);
        // Drop references to instruments that are no longer in the catalogue (e.g. removed equity/crypto markets).
        const known = new Set(INSTRUMENT_SEEDS.map((i) => i.id));
        if (!known.has(out.selectedInstrumentId as string)) out.selectedInstrumentId = persistedDefaults.selectedInstrumentId;
        const wl = (out.watchlist as string[]).filter((id) => known.has(id));
        out.watchlist = wl.length ? wl : persistedDefaults.watchlist;
        const hold = (out.holdings as Holding[]).filter((h) => known.has(h.instrumentId));
        out.holdings = hold.length ? hold : persistedDefaults.holdings;
        out.recentInstruments = (out.recentInstruments as string[]).filter((id) => known.has(id));
        out.alerts = (out.alerts as AlertRule[]).filter((a) => !a.instrumentId || known.has(a.instrumentId));
        out.journal = (out.journal as JournalEntry[]).filter((j) => known.has(j.instrumentId));
        out.reports = (out.reports as SavedReport[]).filter((r) => known.has(r.instrumentId));
        // Refresh the stored welcome notification so older saved copies pick up the current wording.
        const welcome = persistedDefaults.notifications[0];
        out.notifications = (out.notifications as AppNotification[]).map((n) => (n.id === welcome.id ? { ...n, title: welcome.title, body: welcome.body } : n));
        return out as unknown as AppState & AppActions;
      },
    },
  ),
);
