import type { WidgetType } from '../../types/widgets';
import type { CommunityId } from '../../types/community';
import type { LayoutMode } from '../../workspace/WorkspaceStore';
import type { CommunityTab, UiAction, VoiceCommand, WindowAction } from './types';
import {
  APP_ALIASES, COMMUNITY_ALIASES, COMMUNITY_TAB_ALIASES, DEVANAGARI, INSTRUMENT_ALIASES, LAYOUT_ALIASES, PRESET_ALIASES, THEME_ALIASES, TIMEFRAME_PATTERNS,
} from './vocabulary';

/** Lower-cases, maps Devanagari keywords, turns "EUR/USD" into "eur usd" and strips punctuation. */
export function normalise(raw: string): string {
  let s = ` ${raw.toLowerCase()} `;
  for (const [dev, rom] of DEVANAGARI) s = s.split(dev).join(` ${rom} `);
  return s
    .replace(/([a-z])\/([a-z])/g, '$1 $2')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = new Map<string, RegExp>();
const re = (alias: string) => {
  let r = wordRe.get(alias);
  if (!r) wordRe.set(alias, (r = new RegExp(`(?:^| )${esc(alias)}(?: |$)`)));
  return r;
};
const has = (text: string, ...words: string[]) => words.some((w) => re(w).test(text));

/** Longest alias found in the text, with the key it belongs to and where it sits. */
function findAlias<K extends string>(text: string, table: Record<K, string[]>, exclude: K[] = []): { key: K; alias: string; index: number } | null {
  let best: { key: K; alias: string; index: number } | null = null;
  for (const key of Object.keys(table) as K[]) {
    if (exclude.includes(key)) continue;
    for (const alias of table[key]) {
      const m = re(alias).exec(text);
      if (m && (!best || alias.length > best.alias.length)) best = { key, alias, index: m.index };
    }
  }
  return best;
}

/** All distinct apps mentioned, in spoken order (for "swap chart with news"). */
function findApps(text: string): WidgetType[] {
  const hits: Array<{ key: WidgetType; index: number; len: number }> = [];
  for (const key of Object.keys(APP_ALIASES) as WidgetType[]) {
    for (const alias of APP_ALIASES[key]) {
      const m = re(alias).exec(text);
      if (m) hits.push({ key, index: m.index, len: alias.length });
    }
  }
  hits.sort((a, b) => a.index - b.index || b.len - a.len);
  const out: WidgetType[] = [];
  let end = -1;
  for (const h of hits) {
    if (h.index < end || out.includes(h.key)) continue;
    out.push(h.key);
    end = h.index + h.len;
  }
  return out;
}

const OPEN = ['open', 'show', 'launch', 'start', 'bring up', 'display', 'go to', 'switch to', 'kholo', 'khol', 'khol do', 'kholna', 'dikhao', 'dikha', 'dikha do', 'chalu', 'lao', 'le aao', 'pe jao', 'par jao', 'chalo'];
const CLOSE = ['close', 'band', 'hatao', 'hata do', 'hata', 'remove', 'exit', 'quit', 'bandh'];
const MINIMIZE = ['minimise', 'minimize', 'minimised', 'minimized', 'hide', 'chhota', 'chota', 'chhupao', 'chupao'];
const MAXIMIZE = ['maximise', 'maximize', 'maximum', 'bada', 'bara', 'full size', 'enlarge', 'expand'];
const RESTORE = ['restore', 'unminimise', 'unminimize', 'normal size', 'wapas lao', 'wapis lao'];
const FOCUS = ['focus', 'select window', 'aage lao', 'upar lao'];
const ALL = ['all', 'every', 'sab', 'saare', 'sare', 'sabhi', 'everything'];
const WINDOW_WORDS = ['window', 'windows', 'app', 'apps', 'this', 'ye', 'yeh', 'isko', 'ise', 'current'];

const QUESTION = ['what', 'why', 'how', 'when', 'which', 'who', 'should', 'will', 'is it', 'are', 'does', 'explain', 'tell me', 'kya', 'kyu', 'kyun', 'kyon', 'kaise', 'kitna', 'kitni', 'kitne', 'kab', 'batao', 'bataiye', 'bata', 'samjhao', 'samjha'];

function parseSwap(t: string): VoiceCommand | null {
  if (!has(t, 'swap', 'exchange', 'jagah badlo', 'jagah badal', 'jagah badlo', 'adla badli', 'interchange', 'badal do')) return null;
  const apps = findApps(t);
  return apps.length >= 2 ? { kind: 'swap', a: apps[0], b: apps[1] } : null;
}

const UI_PHRASES: Array<[string[], UiAction]> = [
  [['help', 'commands', 'madad', 'what can i say', 'kya bol sakta', 'kya bol sakti', 'voice commands'], 'help'],
  [['undo', 'wapas karo', 'wapis karo', 'pichla wapas', 'go back'], 'undo'],
  [['redo', 'dobara karo', 'phir se karo'], 'redo'],
  [['exit full screen', 'exit fullscreen', 'full screen band', 'fullscreen band', 'leave full screen'], 'exit-fullscreen'],
  [['full screen', 'fullscreen'], 'fullscreen'],
  [['command palette', 'palette', 'search bar', 'search karo', 'search'], 'palette'],
  [['app launcher', 'launcher', 'all apps', 'saare apps', 'sare apps', 'sab apps'], 'launcher'],
  [['appearance editor', 'appearance', 'customise look', 'customize look'], 'appearance'],
  [['auto arrange off', 'turn off auto arrange', 'disable auto arrange', 'auto arrange band'], 'auto-arrange-off'],
  [['auto arrange on', 'turn on auto arrange', 'enable auto arrange', 'auto arrange', 'auto arrange chalu'], 'auto-arrange-on'],
  [['snap off', 'snap to grid off', 'disable snap', 'snap band'], 'snap-off'],
  [['snap on', 'snap to grid', 'enable snap', 'snap chalu'], 'snap-on'],
  [['scroll to top', 'go to top', 'sabse upar'], 'scroll-top'],
  [['scroll down', 'neeche scroll', 'niche scroll', 'neeche jao', 'niche jao', 'scroll neeche'], 'scroll-down'],
  [['scroll up', 'upar scroll', 'upar jao', 'scroll upar'], 'scroll-up'],
  [['stop listening', 'voice off', 'voice control off', 'mic off', 'mic band', 'sunna band', 'listening band', 'voice band'], 'voice-off'],
  [['close fin', 'fin band', 'fin close', 'close assistant'], 'fin-close'],
  [['open fin', 'fin kholo', 'fin open', 'open assistant'], 'fin-open'],
  [['pause', 'ruk jao', 'thoda ruko'], 'fin-pause'],
  [['resume', 'continue', 'jari rakho', 'aage bolo'], 'fin-resume'],
  [['stop', 'ruko', 'chup', 'bas', 'stop talking', 'quiet'], 'fin-stop'],
];

function parseClause(t: string): VoiceCommand | null {
  if (!t) return null;
  const words = t.split(' ');

  // Watchlist before generic open/close ("add gold to watchlist", "gold watchlist se hatao").
  if (has(t, 'watchlist', 'watch list')) {
    const add = has(t, 'add', 'daalo', 'dalo', 'jodo', 'save', 'star');
    const remove = has(t, 'remove', 'hatao', 'nikalo', 'delete', 'unstar');
    if (add || remove) {
      return { kind: 'watchlist', action: remove ? 'remove' : 'add', instrument: findAlias(t, INSTRUMENT_ALIASES)?.key };
    }
  }

  // Briefing.
  if (has(t, 'briefing', 'brief', 'market update', 'morning update')) {
    if (CLOSE.some((w) => has(t, w)) || has(t, 'stop')) return { kind: 'ui', action: 'fin-stop' };
    return { kind: 'briefing', length: has(t, 'short', 'quick', 'chhota', 'chota', 'jaldi', 'chhoti') ? 'short' : 'full' };
  }

  // Theme: needs an explicit theme word.
  if (has(t, 'theme', 'mode', 'colour', 'color', 'colours', 'colors')) {
    const th = findAlias(t, THEME_ALIASES);
    if (th) return { kind: 'theme', id: th.key };
  }

  // Community: needs the word community/communities.
  if (has(t, 'community', 'communities')) {
    const c = findAlias(t, COMMUNITY_ALIASES);
    const tab = findAlias(t, COMMUNITY_TAB_ALIASES);
    if (c) return { kind: 'community', id: c.key as CommunityId, tab: tab?.key as CommunityTab | undefined };
  }

  // Workspace presets: needs desk/preset/workspace/layout.
  if (has(t, 'desk', 'preset', 'workspace', 'layout')) {
    const lay = findAlias(t, LAYOUT_ALIASES);
    if (lay && has(t, 'layout', 'arrange')) return { kind: 'layout', mode: lay.key as LayoutMode };
    const p = findAlias(t, PRESET_ALIASES);
    if (p) return { kind: 'preset', id: p.key };
  }

  // Layout modes ("arrange in grid", "tile windows", "side by side").
  if (has(t, 'arrange', 'tile', 'grid', 'side by side', 'quadrants', 'cascade', 'layout', 'set karo', 'jamao', 'sajao')) {
    const lay = findAlias(t, LAYOUT_ALIASES);
    if (lay) return { kind: 'layout', mode: lay.key as LayoutMode };
    if (has(t, 'arrange', 'jamao', 'sajao', 'set karo') && !has(t, 'auto')) return { kind: 'layout', mode: 'grid' };
  }

  // Fixed UI phrases (help, undo, fullscreen, palette, …).
  for (const [phrases, action] of UI_PHRASES) if (has(t, ...phrases)) {
    // "stop" etc. are only Fin commands when nothing else is mentioned.
    if ((action === 'fin-stop' || action === 'fin-pause' || action === 'fin-resume') && (findApps(t).length || words.length > 3)) continue;
    if (action === 'palette' && has(t, 'search') && words.length > 3) continue;
    return { kind: 'ui', action };
  }

  const swap = parseSwap(t);
  if (swap) return swap;

  // Questions ("what is gold doing?", "kya silver girega?") are for FIN, not app commands.
  const verb = [...OPEN, ...CLOSE, ...MINIMIZE, ...MAXIMIZE, ...RESTORE].some((w) => has(t, w));
  if (!verb && has(t, ...QUESTION)) return null;

  const apps = findApps(t);
  const app = apps[0];
  const isAll = ALL.some((w) => has(t, w)) && (has(t, 'window', 'windows', 'apps', 'kuch') || !app);

  // Window actions.
  const action: WindowAction | null =
    MINIMIZE.some((w) => has(t, w)) ? 'minimize'
      : MAXIMIZE.some((w) => has(t, w)) ? 'maximize'
        : RESTORE.some((w) => has(t, w)) ? 'restore'
          : CLOSE.some((w) => has(t, w)) ? 'close'
            : FOCUS.some((w) => has(t, w)) ? 'focus'
              : null;
  if (action && isAll && action !== 'focus' && action !== 'maximize') return { kind: 'all-windows', action };

  // Chart timeframe.
  const tf = TIMEFRAME_PATTERNS.find(([r]) => r.test(t))?.[1];
  if (tf && (has(t, 'timeframe', 'time frame', 'tf', 'candle', 'candles', 'interval') || app === 'chart-studio' || words.length <= 3) && !action) {
    return { kind: 'timeframe', tf };
  }

  const inst = findAlias(t, INSTRUMENT_ALIASES);

  if (action && app) return { kind: 'window', action, app };
  if (action && !inst && (WINDOW_WORDS.some((w) => has(t, w)) || words.length <= 2)) return { kind: 'window', action };

  const opening = OPEN.some((w) => has(t, w));
  if (app && (opening || !inst || words.length <= 4)) return { kind: 'open-app', app, instrument: inst?.key };
  if (inst) return app ? { kind: 'open-app', app, instrument: inst.key } : { kind: 'instrument', id: inst.key };
  return null;
}

const SPLIT = / (?:and then|and|aur phir|aur|phir|then|uske baad|after that|also) /;

/**
 * Turns an utterance into app commands. Several commands can be chained:
 * "gold ka chart kholo aur news band karo" → [open chart (gold), close news].
 * Returns [] when nothing in the text is a command.
 */
export function parseCommands(raw: string): VoiceCommand[] {
  const t = normalise(raw);
  if (!t) return [];
  const fin = /^(?:hey |hi |ok |okay |hello )?fin (.+)$/.exec(t);
  const body = fin ? fin[1] : t;
  // "chart aur news ki jagah badlo" is one swap, not two commands.
  const whole = parseSwap(body);
  if (whole) return [whole];
  const parts = body.split(SPLIT).map((s) => s.trim()).filter(Boolean);
  const out: VoiceCommand[] = [];
  for (const p of parts) {
    const c = parseClause(p);
    if (c) out.push(c);
    else if (parts.length === 1) break;
  }
  // "Fin, <anything that isn't a command>" is a question for the assistant.
  if (!out.length && fin) return [{ kind: 'ask-fin', text: raw.replace(/^\s*(?:hey|hi|ok|okay|hello)?\s*fin[\s,:-]*/i, '') }];
  return out;
}
