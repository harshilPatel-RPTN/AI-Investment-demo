import { useEffect } from 'react';
import { useApp } from '../store/appStore';
import { CUSTOM_THEME_ID, THEMES, type ThemeVars } from './themes';

export function resolveThemeVars(themeId: string, customVars: ThemeVars): ThemeVars {
  if (themeId === CUSTOM_THEME_ID) return customVars;
  return (THEMES.find((t) => t.id === themeId) ?? THEMES[0]).vars;
}

const FONT_STACK: Record<string, string> = {
  Inter: "'Inter', system-ui, sans-serif",
  'JetBrains Mono': "'JetBrains Mono', ui-monospace, monospace",
  'system-ui': 'system-ui, -apple-system, sans-serif',
  'Segoe UI': "'Segoe UI', system-ui, sans-serif",
  Georgia: 'Georgia, serif',
  Verdana: 'Verdana, sans-serif',
};
export const fontStack = (f?: string) => (f ? FONT_STACK[f] ?? f : undefined);

/** Single source of truth for theme: writes CSS variables onto :root. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themeId = useApp((s) => s.themeId);
  const customVars = useApp((s) => s.customVars);
  const a = useApp((s) => s.appearance);

  useEffect(() => {
    const root = document.documentElement.style;
    const vars = resolveThemeVars(themeId, customVars);
    for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);
    const light = THEMES.find((t) => t.id === themeId)?.light;
    document.documentElement.style.colorScheme = light ? 'light' : 'dark';
  }, [themeId, customVars]);

  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--font-ui', fontStack(a.fontFamily) ?? FONT_STACK.Inter);
    root.setProperty('--fs', `${a.fontSize}px`);
    root.setProperty('--fw', String(a.fontWeight));
    root.setProperty('--lh', String(a.lineHeight));
    root.setProperty('--ls', `${a.letterSpacing}px`);
    root.setProperty('--rs', String(a.radiusScale));
    root.setProperty('--sh', String(a.shadowIntensity));
    root.setProperty('--pad', a.density === 'compact' ? '8px' : '12px');
    root.setProperty('--radius-btn', a.buttonShape === 'pill' ? '999px' : a.buttonShape === 'square' ? '4px' : 'var(--radius-sm)');
    root.setProperty('--icon', `${a.iconSize}px`);
    root.setProperty('--heat-pos', a.heatPositive);
    root.setProperty('--heat-neg', a.heatNegative);
    root.setProperty('--sev-info', a.severityInfo);
    root.setProperty('--sev-warn', a.severityWarning);
    root.setProperty('--sev-crit', a.severityCritical);
  }, [a]);

  return <>{children}</>;
}
