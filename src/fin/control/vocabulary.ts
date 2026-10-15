import type { WidgetType } from '../../types/widgets';
import type { Timeframe } from '../../types/market';
import type { CommunityId } from '../../types/community';
import type { LayoutMode } from '../../workspace/WorkspaceStore';
import type { CommunityTab } from './types';

/**
 * Spoken aliases (English, Hinglish, and a few Devanagari words mapped in DEVANAGARI below).
 * Matching is whole-word on normalised text; the longest alias wins, so "gold inr" beats "gold".
 */
export const APP_ALIASES: Record<WidgetType, string[]> = {
  dashboard: ['dashboard', 'home screen'],
  'market-summary': ['market summary', 'summary', 'ticker'],
  'market-news': ['market news', 'live news', 'latest news', 'market khabar'],
  upcoming: ['upcoming events', 'live calendar', 'upcoming', 'aane wale events'],
  'market-terminal': ['market terminal', 'terminal', 'market overview', 'markets'],
  'asset-explorer': ['asset explorer', 'explorer', 'assets'],
  watchlist: ['watchlist', 'watch list'],
  'macro-board': ['macro board', 'global macro', 'macro'],
  alerts: ['alert builder', 'alerts', 'alert'],
  'chart-studio': ['chart studio', 'charts', 'chart', 'graph', 'candles'],
  screener: ['smart screener', 'screener', 'scanner'],
  'ai-copilot': ['ai copilot', 'copilot', 'co pilot', 'ai chat'],
  evidence: ['four lane evidence', 'evidence'],
  report: ['research report', 'ai report', 'report'],
  scenarios: ['scenario simulator', 'scenarios', 'scenario', 'simulator'],
  strategy: ['strategy copilot', 'strategy'],
  'risk-lab': ['risk lab', 'position size', 'risk calculator', 'risk'],
  backtest: ['backtest lab', 'backtest', 'back test'],
  portfolio: ['portfolio tracker', 'portfolio', 'holdings'],
  journal: ['trade journal', 'journal'],
  news: ['news intelligence', 'news', 'headlines', 'khabar', 'khabren'],
  fundamentals: ['fundamentals', 'fundamental'],
  calendar: ['economic calendar', 'calendar', 'events'],
  notebook: ['research notebook', 'notebook', 'notes'],
  learning: ['learning lab', 'learning'],
  community: ['trading communities', 'communities', 'community'],
  settings: ['settings', 'setting', 'data health'],
};

export const INSTRUMENT_ALIASES: Record<string, string[]> = {
  XAUUSD: ['xau usd', 'xauusd', 'xau', 'gold usd', 'gold spot', 'gold dollar', 'gold', 'sona', 'sone'],
  GOLDINR: ['gold inr', 'gold rupee', 'gold rupees', 'mcx gold', 'gold india', 'sona rupee'],
  XAGUSD: ['xag usd', 'xagusd', 'xag', 'silver usd', 'silver spot', 'silver', 'chandi', 'chaandi'],
  SILVERINR: ['silver inr', 'silver rupee', 'silver rupees', 'mcx silver', 'chandi rupee'],
  WTIUSD: ['wti usd', 'wti', 'crude oil', 'crude', 'oil', 'us oil', 'tel', 'kachcha tel'],
  BRENTUSD: ['brent usd', 'brent crude', 'brent'],
  EURUSD: ['eur usd', 'eurusd', 'euro dollar', 'euro usd', 'fiber', 'euro'],
  GBPUSD: ['gbp usd', 'gbpusd', 'pound dollar', 'cable', 'pound'],
  USDJPY: ['usd jpy', 'usdjpy', 'dollar yen', 'yen'],
  AUDUSD: ['aud usd', 'audusd', 'aussie dollar', 'aussie', 'australian dollar'],
  USDINR: ['usd inr', 'usdinr', 'dollar rupee', 'dollar inr', 'rupee', 'rupaya'],
  USDCHF: ['usd chf', 'usdchf', 'swiss franc', 'franc'],
  USDCAD: ['usd cad', 'usdcad', 'canadian dollar', 'loonie'],
  NZDUSD: ['nzd usd', 'nzdusd', 'kiwi', 'new zealand dollar'],
  EURGBP: ['eur gbp', 'eurgbp', 'euro pound'],
  EURJPY: ['eur jpy', 'eurjpy', 'euro yen'],
  EURINR: ['eur inr', 'eurinr', 'euro rupee', 'euro inr'],
};

export const COMMUNITY_ALIASES: Record<CommunityId, string[]> = {
  forex: ['forex', 'fx', 'currency', 'currencies'],
  gold: ['gold', 'sona'],
  silver: ['silver', 'chandi'],
  oil: ['oil', 'crude', 'tel'],
};

export const COMMUNITY_TAB_ALIASES: Record<CommunityTab, string[]> = {
  discussions: ['discussions', 'discussion', 'feed', 'posts'],
  ideas: ['trading ideas', 'ideas', 'idea'],
  polls: ['polls', 'poll', 'voting'],
  sentiment: ['sentiment'],
  trending: ['trending'],
};

/** Only matched together with a word like "desk", "preset", "workspace" or "layout". */
export const PRESET_ALIASES: Record<string, string[]> = {
  starter: ['starter', 'everything', 'everything desk'],
  'market-overview': ['market overview', 'overview', 'default', 'home'],
  research: ['research', 'fundamentals and news'],
  technical: ['technical analysis', 'technical', 'ta'],
  'ai-research': ['ai research', 'ai desk'],
  precious: ['gold and silver', 'gold silver', 'precious metals', 'precious'],
  'metals-energy': ['metals and energy', 'metals energy', 'energy', 'metals'],
  forex: ['forex', 'fx', 'currency'],
  'news-events': ['news and events', 'news events', 'news'],
  risk: ['risk lab', 'risk management', 'risk'],
  portfolio: ['portfolio review', 'portfolio'],
  'multi-monitor': ['multi monitor', 'multi screen', 'two screen'],
  blank: ['blank canvas', 'blank', 'empty', 'khaali', 'khali'],
};

/** Only matched together with "theme", "mode" or "colour". */
export const THEME_ALIASES: Record<string, string[]> = {
  midnight: ['midnight', 'dark', 'default', 'neumorphic'],
  oled: ['oled', 'black', 'pure black'],
  silver: ['silver', 'grey', 'gray'],
  gold: ['gold', 'golden'],
  emerald: ['emerald', 'green'],
  crimson: ['crimson', 'red'],
  arctic: ['arctic', 'light', 'white', 'day'],
  contrast: ['high contrast', 'contrast'],
};

export const LAYOUT_ALIASES: Record<LayoutMode, string[]> = {
  freeform: ['freeform', 'free form', 'cascade'],
  grid: ['grid', 'tile', 'tiled', 'tiles'],
  'two-column': ['two column', '2 column', 'two columns', 'side by side'],
  quad: ['four quadrants', 'quadrants', 'quad', 'four box', '4 box'],
  chart: ['chart focused', 'chart focus'],
  ai: ['ai focused', 'ai focus'],
  news: ['news focused', 'news and events layout'],
  risk: ['risk focused', 'risk layout', 'portfolio layout'],
};

export const TIMEFRAME_PATTERNS: Array<[RegExp, Timeframe]> = [
  [/\b(1|one|ek) ?(m|min|mins|minute|minutes|minat)\b/, '1m'],
  [/\b(5|five|paanch|panch) ?(m|min|mins|minute|minutes|minat)\b/, '5m'],
  [/\b(15|fifteen|pandrah) ?(m|min|mins|minute|minutes|minat)\b/, '15m'],
  [/\b(4|four|char|chaar) ?(h|hr|hrs|hour|hours|ghanta|ghante)\b/, '4h'],
  [/\b(1|one|an|ek) ?(h|hr|hour|ghanta|ghante)\b|\bhourly\b/, '1h'],
  [/\b(1 ?d|daily|day|one day|din|roz)\b/, '1D'],
  [/\b(1 ?w|weekly|week|hafta|hafte)\b/, '1W'],
  [/\b(monthly|month|mahina|mahine)\b/, '1M'],
];

/** Devanagari → romanised keywords, applied before matching (hi-IN recognition output). */
export const DEVANAGARI: Array<[string, string]> = [
  ['खोलो', 'kholo'], ['खोल', 'khol'], ['दिखाओ', 'dikhao'], ['दिखा', 'dikha'], ['चालू', 'chalu'],
  ['बंद', 'band'], ['हटाओ', 'hatao'], ['छोटा', 'chhota'], ['बड़ा', 'bada'], ['बडा', 'bada'],
  ['वापस', 'wapas'], ['सब', 'sab'], ['सारे', 'saare'], ['करो', 'karo'], ['कर', 'kar'], ['दो', 'do'],
  ['चार्ट', 'chart'], ['न्यूज़', 'news'], ['न्यूज', 'news'], ['ख़बर', 'khabar'], ['खबर', 'khabar'], ['खबरें', 'khabren'],
  ['सोना', 'sona'], ['सोने', 'sone'], ['चांदी', 'chandi'], ['चाँदी', 'chandi'], ['कच्चा तेल', 'kachcha tel'], ['तेल', 'tel'],
  ['डॉलर', 'dollar'], ['यूरो', 'euro'], ['रुपया', 'rupaya'], ['रुपये', 'rupee'], ['पाउंड', 'pound'], ['येन', 'yen'],
  ['थीम', 'theme'], ['ब्रीफिंग', 'briefing'], ['कम्युनिटी', 'community'], ['पोर्टफोलियो', 'portfolio'], ['सेटिंग', 'settings'],
  ['ऊपर', 'upar'], ['नीचे', 'neeche'], ['मदद', 'madad'], ['रुको', 'ruko'], ['घंटे', 'ghante'], ['घंटा', 'ghanta'], ['मिनट', 'minat'],
  ['की', 'ki'], ['का', 'ka'], ['के', 'ke'], ['में', 'me'], ['पर', 'par'], ['और', 'aur'], ['फिर', 'phir'],
];
