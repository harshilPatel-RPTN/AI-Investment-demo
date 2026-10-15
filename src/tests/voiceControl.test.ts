import { describe, expect, it } from 'vitest';
import { parseCommands, normalise } from '../fin/control/parser';
import { commandFromTool, CONTROL_TOOLS } from '../fin/control/tools';
import { liveToolsSchema } from '../../server/src/services/fin';

const one = (t: string) => {
  const c = parseCommands(t);
  expect(c, t).toHaveLength(1);
  return c[0];
};

describe('voice command parser', () => {
  it('opens apps in English, Hinglish and Hindi', () => {
    expect(one('open chart')).toEqual({ kind: 'open-app', app: 'chart-studio' });
    expect(one('gold ka chart kholo')).toEqual({ kind: 'open-app', app: 'chart-studio', instrument: 'XAUUSD' });
    expect(one('सोने का चार्ट खोलो')).toEqual({ kind: 'open-app', app: 'chart-studio', instrument: 'XAUUSD' });
    expect(one('settings kholo')).toEqual({ kind: 'open-app', app: 'settings' });
  });

  it('handles window actions', () => {
    expect(one('news band karo')).toEqual({ kind: 'window', action: 'close', app: 'news' });
    expect(one('न्यूज़ बंद करो')).toEqual({ kind: 'window', action: 'close', app: 'news' });
    expect(one('chart ko bada karo')).toEqual({ kind: 'window', action: 'maximize', app: 'chart-studio' });
    expect(one('minimise news')).toEqual({ kind: 'window', action: 'minimize', app: 'news' });
    expect(one('close this window')).toEqual({ kind: 'window', action: 'close' });
    expect(one('sab windows band karo')).toEqual({ kind: 'all-windows', action: 'close' });
    expect(one('sab chhota karo')).toEqual({ kind: 'all-windows', action: 'minimize' });
  });

  it('swaps windows, including the Hinglish form that contains "aur"', () => {
    expect(one('swap chart with news')).toEqual({ kind: 'swap', a: 'chart-studio', b: 'news' });
    expect(one('chart aur news ki jagah badlo')).toEqual({ kind: 'swap', a: 'chart-studio', b: 'news' });
  });

  it('switches instruments, prefers the longest alias', () => {
    expect(one('silver dikhao')).toEqual({ kind: 'instrument', id: 'XAGUSD' });
    expect(one('switch to EUR/USD')).toEqual({ kind: 'instrument', id: 'EURUSD' });
    expect(one('gold inr dikhao')).toEqual({ kind: 'instrument', id: 'GOLDINR' });
  });

  it('sets timeframes, themes, presets, layouts and communities', () => {
    expect(one('timeframe 4 hour')).toEqual({ kind: 'timeframe', tf: '4h' });
    expect(one('chart 15 minute')).toEqual({ kind: 'timeframe', tf: '15m' });
    expect(one('dark theme')).toEqual({ kind: 'theme', id: 'midnight' });
    expect(one('light mode')).toEqual({ kind: 'theme', id: 'arctic' });
    expect(one('forex desk kholo')).toEqual({ kind: 'preset', id: 'forex' });
    expect(one('arrange in grid')).toEqual({ kind: 'layout', mode: 'grid' });
    expect(one('open gold community')).toEqual({ kind: 'community', id: 'gold' });
    expect(one('oil community ke trading ideas')).toEqual({ kind: 'community', id: 'oil', tab: 'ideas' });
  });

  it('keeps theme/community/preset words from hijacking instruments', () => {
    expect(one('gold dikhao')).toEqual({ kind: 'instrument', id: 'XAUUSD' });
    expect(one('gold theme')).toEqual({ kind: 'theme', id: 'gold' });
  });

  it('chains several commands', () => {
    expect(parseCommands('gold ka chart kholo aur news band karo')).toEqual([
      { kind: 'open-app', app: 'chart-studio', instrument: 'XAUUSD' },
      { kind: 'window', action: 'close', app: 'news' },
    ]);
  });

  it('handles UI, briefing and watchlist commands', () => {
    expect(one('undo')).toEqual({ kind: 'ui', action: 'undo' });
    expect(one('wapas karo')).toEqual({ kind: 'ui', action: 'undo' });
    expect(one('help')).toEqual({ kind: 'ui', action: 'help' });
    expect(one('stop listening')).toEqual({ kind: 'ui', action: 'voice-off' });
    expect(one('short briefing')).toEqual({ kind: 'briefing', length: 'short' });
    expect(one('add gold to watchlist')).toEqual({ kind: 'watchlist', action: 'add', instrument: 'XAUUSD' });
  });

  it('leaves questions to FIN', () => {
    expect(parseCommands('what is gold doing')).toEqual([]);
    expect(parseCommands('kya silver girega')).toEqual([]);
    expect(one('fin what is the biggest risk')).toEqual({ kind: 'ask-fin', text: 'what is the biggest risk' });
    expect(parseCommands('mujhe kuch nahi chahiye')).toEqual([]);
  });

  it('normalises punctuation and Devanagari', () => {
    expect(normalise('Open EUR/USD, please!')).toBe('open eur usd please');
    expect(normalise('चार्ट खोलो')).toBe('chart kholo');
  });
});

describe('Gemini control tools', () => {
  it('passes the server-side validation', () => {
    expect(liveToolsSchema.safeParse(CONTROL_TOOLS).success).toBe(true);
  });

  it('maps tool calls to commands and rejects bad arguments', () => {
    expect(commandFromTool('open_app', { app: 'news' })).toEqual({ kind: 'open-app', app: 'news', instrument: undefined });
    expect(commandFromTool('open_app', { app: 'chart-studio', instrument: 'XAGUSD' })).toEqual({ kind: 'open-app', app: 'chart-studio', instrument: 'XAGUSD' });
    expect(commandFromTool('window_action', { action: 'close' })).toEqual({ kind: 'window', action: 'close', app: undefined });
    expect(commandFromTool('swap_windows', { a: 'news', b: 'chart-studio' })).toEqual({ kind: 'swap', a: 'news', b: 'chart-studio' });
    expect(commandFromTool('open_app', { app: 'place-order' })).toBeNull();
    expect(commandFromTool('select_instrument', { instrument: 'AAPL' })).toBeNull();
    expect(commandFromTool('delete_everything', {})).toBeNull();
  });

  it('every tool has a parser on the client', () => {
    for (const t of CONTROL_TOOLS) {
      const sample: Record<string, string> = {};
      for (const [k, p] of Object.entries(t.parameters.properties)) if (p.enum) sample[k] = p.enum[0];
      expect(commandFromTool(t.name, sample), t.name).not.toBeNull();
    }
  });
});
