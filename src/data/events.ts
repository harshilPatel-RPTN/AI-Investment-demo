import type { MarketEvent } from '../types/market';
import { FIXTURE_NOW } from '../lib/seed';

const DAY = 86_400_000;
const at = (days: number, hourUtc = 9) => new Date(Math.floor(FIXTURE_NOW / DAY) * DAY + days * DAY + hourUtc * 3_600_000).toISOString();

/** Economic calendar events, relative to the data clock. */
const EVENTS: MarketEvent[] = [
  { id: 'ev5', title: 'RBI monetary policy decision', date: at(3, 4), type: 'central-bank', importance: 'high', assetClass: 'forex', instrumentIds: ['USDINR', 'EURINR'], description: 'Policy-rate decision for the Indian central bank.', dataMode: 'SIMULATED' },
  { id: 'ev6', title: 'FOMC rate decision', date: at(7, 18), type: 'central-bank', importance: 'high', assetClass: 'macro', instrumentIds: ['EURUSD', 'USDJPY', 'XAUUSD', 'XAGUSD'], description: 'US Federal Reserve decision; USD and gold often sensitive.', dataMode: 'SIMULATED' },
  { id: 'ev7', title: 'ECB policy meeting', date: at(10, 12), type: 'central-bank', importance: 'medium', assetClass: 'forex', instrumentIds: ['EURUSD', 'EURINR', 'EURGBP', 'EURJPY'], description: 'Euro-area rate decision and press conference.', dataMode: 'SIMULATED' },
  { id: 'ev8', title: 'Bank of Japan meeting', date: at(12, 3), type: 'central-bank', importance: 'medium', assetClass: 'forex', instrumentIds: ['USDJPY', 'EURJPY'], description: 'BoJ decision; yield-curve policy commentary.', dataMode: 'SIMULATED' },
  { id: 'ev20', title: 'Bank of England decision', date: at(-1, 11), type: 'central-bank', importance: 'medium', assetClass: 'forex', instrumentIds: ['GBPUSD', 'EURGBP'], description: 'Recent policy decision (already occurred).', dataMode: 'SIMULATED' },
  { id: 'ev22', title: 'SNB policy assessment', date: at(11, 7), type: 'central-bank', importance: 'low', assetClass: 'forex', instrumentIds: ['USDCHF'], description: 'Swiss National Bank decision.', dataMode: 'SIMULATED' },
  { id: 'ev23', title: 'Bank of Canada decision', date: at(6, 14), type: 'central-bank', importance: 'medium', assetClass: 'forex', instrumentIds: ['USDCAD'], description: 'Canadian rate decision; oil-linked currency.', dataMode: 'SIMULATED' },
  { id: 'ev24', title: 'RBA / RBNZ policy statements', date: at(8, 3), type: 'central-bank', importance: 'low', assetClass: 'forex', instrumentIds: ['AUDUSD', 'NZDUSD'], description: 'Australia/New Zealand policy statements.', dataMode: 'SIMULATED' },
  { id: 'ev9', title: 'US crude inventory report', date: at(1, 14), type: 'inventory', importance: 'medium', assetClass: 'oil', instrumentIds: ['WTIUSD', 'BRENTUSD', 'USDCAD'], description: 'Weekly crude stock change release.', dataMode: 'SIMULATED' },
  { id: 'ev10', title: 'US crude inventory report', date: at(8, 14), type: 'inventory', importance: 'medium', assetClass: 'oil', instrumentIds: ['WTIUSD', 'BRENTUSD'], description: 'Weekly crude stock change release.', dataMode: 'SIMULATED' },
  { id: 'ev11', title: 'OPEC+ producer meeting', date: at(5, 10), type: 'inventory', importance: 'high', assetClass: 'oil', instrumentIds: ['BRENTUSD', 'WTIUSD'], description: 'Producer-group meeting on output targets.', dataMode: 'SIMULATED' },
  { id: 'ev25', title: 'Energy agency monthly oil report', date: at(9, 8), type: 'inventory', importance: 'medium', assetClass: 'oil', instrumentIds: ['BRENTUSD'], description: 'Monthly supply/demand outlook.', dataMode: 'SIMULATED' },
  { id: 'ev15', title: 'US CPI inflation release', date: at(4, 12), type: 'macro', importance: 'high', assetClass: 'macro', instrumentIds: ['XAUUSD', 'XAGUSD', 'EURUSD', 'USDJPY'], description: 'Consumer-price data; rates-sensitive assets often react.', dataMode: 'SIMULATED' },
  { id: 'ev16', title: 'India CPI inflation release', date: at(9, 12), type: 'macro', importance: 'medium', assetClass: 'macro', instrumentIds: ['USDINR', 'GOLDINR'], description: 'Domestic inflation print.', dataMode: 'SIMULATED' },
  { id: 'ev17', title: 'US non-farm payrolls', date: at(5, 12), type: 'macro', importance: 'high', assetClass: 'macro', instrumentIds: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD'], description: 'Labour-market release.', dataMode: 'SIMULATED' },
  { id: 'ev18', title: 'China industrial production', date: at(13, 2), type: 'macro', importance: 'low', assetClass: 'macro', instrumentIds: ['AUDUSD', 'XAGUSD', 'BRENTUSD'], description: 'Activity data relevant to industrial metals and commodity FX.', dataMode: 'SIMULATED' },
  { id: 'ev21', title: 'Gold ETF flow report', date: at(3, 15), type: 'macro', importance: 'low', assetClass: 'gold', instrumentIds: ['XAUUSD', 'GOLDINR'], description: 'Weekly investment-flow summary.', dataMode: 'SIMULATED' },
  { id: 'ev26', title: 'Silver Institute demand survey', date: at(14, 9), type: 'macro', importance: 'low', assetClass: 'silver', instrumentIds: ['XAGUSD', 'SILVERINR'], description: 'Industrial demand survey.', dataMode: 'SIMULATED' },
];

export function getEvents(): MarketEvent[] {
  return EVENTS;
}

export function eventsFor(instrumentId: string): MarketEvent[] {
  return EVENTS.filter((e) => e.instrumentIds.includes(instrumentId));
}
