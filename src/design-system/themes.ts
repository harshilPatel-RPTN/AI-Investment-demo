export type ThemeVars = Record<string, string>;

export interface ThemePreset {
  id: string;
  name: string;
  light?: boolean;
  vars: ThemeVars;
}

export const THEME_VAR_KEYS = [
  '--os-bg', '--surface', '--surface-raised', '--surface-inset', '--text-primary', '--text-secondary',
  '--text-muted', '--accent', '--accent-strong', '--positive', '--negative', '--warning', '--info',
  '--border-subtle', '--shadow-light', '--shadow-dark',
] as const;

export const THEME_VAR_LABELS: Record<string, string> = {
  '--os-bg': 'OS canvas',
  '--surface': 'Surface',
  '--surface-raised': 'Raised surface',
  '--surface-inset': 'Inset surface',
  '--text-primary': 'Text primary',
  '--text-secondary': 'Text secondary',
  '--text-muted': 'Text muted',
  '--accent': 'Accent',
  '--accent-strong': 'Accent strong',
  '--positive': 'Positive',
  '--negative': 'Negative',
  '--warning': 'Warning',
  '--info': 'Info',
  '--border-subtle': 'Border',
  '--shadow-light': 'Highlight shadow',
  '--shadow-dark': 'Dark shadow',
};

const midnight: ThemeVars = {
  '--os-bg': '#20242b',
  '--surface': '#252a32',
  '--surface-raised': '#282e37',
  '--surface-inset': '#20252c',
  '--text-primary': '#edf1f7',
  '--text-secondary': '#aab4c2',
  '--text-muted': '#7f8a99',
  '--accent': '#63dda5',
  '--accent-strong': '#35bd83',
  '--positive': '#63dda5',
  '--negative': '#ff747f',
  '--warning': '#f3c66b',
  '--info': '#83b8ff',
  '--border-subtle': 'rgba(255,255,255,.045)',
  '--shadow-light': 'rgba(255,255,255,.055)',
  '--shadow-dark': 'rgba(0,0,0,.42)',
};

export const THEMES: ThemePreset[] = [
  { id: 'midnight', name: 'Neumorphic Midnight', vars: midnight },
  {
    id: 'oled', name: 'OLED Black', vars: {
      ...midnight,
      '--os-bg': '#050506', '--surface': '#0e0f11', '--surface-raised': '#131417', '--surface-inset': '#08090a',
      '--text-secondary': '#a3a9b3', '--shadow-light': 'rgba(255,255,255,.035)', '--shadow-dark': 'rgba(0,0,0,.8)',
      '--accent': '#7ee2b8', '--accent-strong': '#4fc996',
    },
  },
  {
    id: 'silver', name: 'Silver Terminal', vars: {
      ...midnight,
      '--os-bg': '#2a2f36', '--surface': '#30363e', '--surface-raised': '#343b44', '--surface-inset': '#282d34',
      '--accent': '#9ec5ff', '--accent-strong': '#6fa6f5', '--info': '#c7d3e3', '--text-secondary': '#b5bfcc',
    },
  },
  {
    id: 'gold', name: 'Gold Reserve', vars: {
      ...midnight,
      '--os-bg': '#221e19', '--surface': '#29241e', '--surface-raised': '#2d2721', '--surface-inset': '#1f1b16',
      '--accent': '#e3b65f', '--accent-strong': '#c99a3c', '--text-primary': '#f4ede2', '--text-secondary': '#c3b6a2', '--text-muted': '#8f826f',
    },
  },
  {
    id: 'emerald', name: 'Emerald Desk', vars: {
      ...midnight,
      '--os-bg': '#18221e', '--surface': '#1d2924', '--surface-raised': '#212e28', '--surface-inset': '#16201b',
      '--accent': '#3ee09a', '--accent-strong': '#22b878', '--text-secondary': '#a7bcb2', '--text-muted': '#76887f',
    },
  },
  {
    id: 'crimson', name: 'Crimson Pulse', vars: {
      ...midnight,
      '--os-bg': '#231d20', '--surface': '#2a2226', '--surface-raised': '#2e252a', '--surface-inset': '#1f191c',
      '--accent': '#ff6b81', '--accent-strong': '#e2445e', '--text-secondary': '#c2adb4', '--text-muted': '#8d7880',
    },
  },
  {
    id: 'arctic', name: 'Arctic Light', light: true, vars: {
      '--os-bg': '#dfe4ea', '--surface': '#e4e9ef', '--surface-raised': '#e8edf3', '--surface-inset': '#d8dee6',
      '--text-primary': '#1d2430', '--text-secondary': '#46505f', '--text-muted': '#6b7585',
      '--accent': '#1f8f63', '--accent-strong': '#14724e', '--positive': '#16865a', '--negative': '#cc3344',
      '--warning': '#a8740d', '--info': '#2b63c4',
      '--border-subtle': 'rgba(255,255,255,.6)', '--shadow-light': 'rgba(255,255,255,.9)', '--shadow-dark': 'rgba(120,135,155,.45)',
    },
  },
  {
    id: 'contrast', name: 'High Contrast', vars: {
      ...midnight,
      '--os-bg': '#000000', '--surface': '#0b0b0b', '--surface-raised': '#111111', '--surface-inset': '#000000',
      '--text-primary': '#ffffff', '--text-secondary': '#e6e6e6', '--text-muted': '#c4c4c4',
      '--accent': '#5cffb5', '--accent-strong': '#22ff99', '--positive': '#5cffb5', '--negative': '#ff6b6b',
      '--warning': '#ffd84d', '--info': '#7fc1ff', '--border-subtle': 'rgba(255,255,255,.35)',
      '--shadow-light': 'rgba(255,255,255,0)', '--shadow-dark': 'rgba(0,0,0,0)',
    },
  },
];

export const CUSTOM_THEME_ID = 'custom';

export interface ChartColors {
  up: string;
  down: string;
  wickUp: string;
  wickDown: string;
  grid: string;
  crosshair: string;
  volume: string;
  sma: string;
  ema: string;
  bbands: string;
  vwap: string;
  rsi: string;
  macd: string;
  signal: string;
}

export const DEFAULT_CHART_COLORS: ChartColors = {
  up: '#63dda5', down: '#ff747f', wickUp: '#63dda5', wickDown: '#ff747f',
  grid: 'rgba(255,255,255,0.05)', crosshair: '#83b8ff', volume: '#5b6676',
  sma: '#f3c66b', ema: '#83b8ff', bbands: '#b292ff', vwap: '#ff9f5a', rsi: '#83b8ff', macd: '#63dda5', signal: '#ff747f',
};

export interface GlobalAppearance {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  density: 'compact' | 'comfortable';
  radiusScale: number;
  shadowIntensity: number;
  buttonShape: 'rounded' | 'pill' | 'square';
  iconSize: number;
  heatPositive: string;
  heatNegative: string;
  severityInfo: string;
  severityWarning: string;
  severityCritical: string;
}

export const DEFAULT_APPEARANCE: GlobalAppearance = {
  fontFamily: 'Inter',
  fontSize: 13,
  fontWeight: 400,
  lineHeight: 1.45,
  letterSpacing: 0,
  density: 'comfortable',
  radiusScale: 1,
  shadowIntensity: 1,
  buttonShape: 'rounded',
  iconSize: 16,
  heatPositive: '#63dda5',
  heatNegative: '#ff747f',
  severityInfo: '#83b8ff',
  severityWarning: '#f3c66b',
  severityCritical: '#ff747f',
};

export const FONT_OPTIONS = ['Inter', 'JetBrains Mono', 'system-ui', 'Segoe UI', 'Georgia', 'Verdana'];

export const SWATCHES = [
  '#63dda5', '#35bd83', '#83b8ff', '#9ec5ff', '#f3c66b', '#e3b65f', '#ff747f', '#ff6b81', '#b292ff',
  '#ff9f5a', '#edf1f7', '#aab4c2', '#20242b', '#252a32', '#0e0f11', '#e4e9ef', '#1d2430', '#2a2f36',
];

export function isValidColor(v: string): boolean {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return true;
  const m = s.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(0|1|0?\.\d+|1\.0+))?\s*\)$/i);
  if (m) return [m[1], m[2], m[3]].every((x) => Number(x) <= 255);
  return false;
}

/** Converts #rgb / #rrggbb / rgb()/rgba() to #rrggbb for <input type=color>. Returns null if not convertible. */
export function toHex6(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) return '#' + m[1].split('').map((c) => c + c).join('').toLowerCase();
  m = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (m) return '#' + m[1].toLowerCase();
  m = s.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (m) return '#' + [m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('');
  return null;
}
