import type { NewsItem } from '../types/market';
import { FIXTURE_NOW } from '../lib/seed';

const H = 3_600_000;
const ago = (h: number) => new Date(FIXTURE_NOW - h * H).toISOString();
const SRC = ['Market Wire', 'Markets Desk', 'Markets Feed'];

type Raw = Omit<NewsItem, 'id' | 'dataMode' | 'source' | 'publishedAt'> & { h: number };

/** Market headlines. */
const RAW: Raw[] = [
  { h: 1, headline: 'Gold firm as real-yield proxy eases', summary: 'A softer real-yield proxy coincides with steady gold demand.', instrumentIds: ['XAUUSD', 'GOLDINR'], assetClass: 'gold', category: 'macro', sentiment: 'bullish' },
  { h: 12, headline: 'Central-bank gold purchases continue, survey shows', summary: 'A survey suggests official-sector buying remains a structural support.', instrumentIds: ['XAUUSD'], assetClass: 'gold', category: 'macro', sentiment: 'bullish' },
  { h: 22, headline: 'Festive jewellery demand outlook cautious at higher prices', summary: 'Retailer commentary notes price-sensitive buyers in INR terms.', instrumentIds: ['GOLDINR'], assetClass: 'gold', category: 'market', sentiment: 'bearish' },
  { h: 7, headline: 'Gold ETF holdings flat for the week in flow tracker', summary: 'Fund-flow data shows neither strong inflows nor outflows.', instrumentIds: ['XAUUSD'], assetClass: 'gold', category: 'market', sentiment: 'neutral' },
  { h: 16, headline: 'Stronger dollar proxy caps gold rally', summary: 'Data shows gold paring gains as the USD proxy firms.', instrumentIds: ['XAUUSD', 'EURUSD'], assetClass: 'gold', category: 'macro', sentiment: 'bearish' },
  { h: 4, headline: 'Silver tracks industrial-demand narrative', summary: 'Solar and electronics demand assumptions support silver prices.', instrumentIds: ['XAGUSD', 'SILVERINR'], assetClass: 'silver', category: 'supply', sentiment: 'bullish' },
  { h: 18, headline: 'Gold/silver ratio stretches', summary: 'The ratio computed from current prices sits above its recent average.', instrumentIds: ['XAGUSD', 'XAUUSD'], assetClass: 'silver', category: 'market', sentiment: 'mixed' },
  { h: 9, headline: 'Silver volatility jumps as positioning unwinds', summary: 'A positioning report flags crowded longs being reduced.', instrumentIds: ['XAGUSD'], assetClass: 'silver', category: 'market', sentiment: 'bearish' },
  { h: 3, headline: 'Crude slips as inventories build', summary: 'A weekly report shows a larger-than-expected stock build.', instrumentIds: ['WTIUSD', 'BRENTUSD'], assetClass: 'oil', category: 'supply', sentiment: 'bearish' },
  { h: 13, headline: 'Producer group signals output discipline in statement', summary: 'Commentary suggests supply restraint may continue.', instrumentIds: ['BRENTUSD', 'WTIUSD'], assetClass: 'oil', category: 'policy', sentiment: 'bullish' },
  { h: 24, headline: 'Demand growth estimates trimmed in agency outlook', summary: 'An agency outlook lowers next-year consumption growth assumptions.', instrumentIds: ['BRENTUSD'], assetClass: 'oil', category: 'macro', sentiment: 'bearish' },
  { h: 6, headline: 'Refinery maintenance season tightens product balances', summary: 'Data shows lower refinery runs supporting product spreads.', instrumentIds: ['WTIUSD'], assetClass: 'oil', category: 'supply', sentiment: 'mixed' },
  { h: 20, headline: 'Shipping-route risk premium fades', summary: 'An easing of transit concerns removes some Brent premium.', instrumentIds: ['BRENTUSD'], assetClass: 'oil', category: 'supply', sentiment: 'bearish' },
  { h: 2, headline: 'Dollar steady ahead of US inflation print', summary: 'FX majors show tight ranges before the CPI release.', instrumentIds: ['EURUSD', 'GBPUSD', 'USDJPY'], assetClass: 'forex', category: 'macro', sentiment: 'neutral' },
  { h: 6, headline: 'Yen weakens as rate-differential theme persists', summary: 'Data shows USD/JPY drifting higher on carry demand.', instrumentIds: ['USDJPY', 'EURJPY'], assetClass: 'forex', category: 'policy', sentiment: 'bullish' },
  { h: 9, headline: 'Rupee range-bound with central-bank smoothing', summary: 'USD/INR shows low realised volatility.', instrumentIds: ['USDINR', 'EURINR'], assetClass: 'forex', category: 'policy', sentiment: 'neutral' },
  { h: 19, headline: 'Aussie and kiwi track commodity sentiment', summary: 'AUD/USD and NZD/USD move alongside metals proxies.', instrumentIds: ['AUDUSD', 'NZDUSD'], assetClass: 'forex', category: 'macro', sentiment: 'mixed' },
  { h: 21, headline: 'Euro area growth data softer than consensus', summary: 'A PMI miss weighs on the euro.', instrumentIds: ['EURUSD', 'EURINR', 'EURGBP'], assetClass: 'forex', category: 'macro', sentiment: 'bearish' },
  { h: 11, headline: 'Sterling supported by sticky services inflation', summary: 'A data print pushes back rate-cut expectations for the pound.', instrumentIds: ['GBPUSD', 'EURGBP'], assetClass: 'forex', category: 'macro', sentiment: 'bullish' },
  { h: 15, headline: 'Swiss franc bid on safe-haven demand', summary: 'Flows show franc strength during a risk-off spell.', instrumentIds: ['USDCHF'], assetClass: 'forex', category: 'market', sentiment: 'bearish' },
  { h: 8, headline: 'Loonie tracks crude moves in correlation note', summary: 'Commentary links USD/CAD swings to oil price changes.', instrumentIds: ['USDCAD', 'WTIUSD'], assetClass: 'forex', category: 'macro', sentiment: 'mixed' },
  { h: 5, headline: 'Global risk appetite mixed as rate expectations shift', summary: 'Cross-asset moves show no clear risk-on or risk-off signal.', instrumentIds: ['XAUUSD', 'EURUSD', 'AUDUSD'], assetClass: 'macro', category: 'macro', sentiment: 'mixed' },
];

const NEWS: NewsItem[] = RAW.map((r, i): NewsItem => {
  const { h, ...rest } = r;
  return { ...rest, id: `nw${i + 1}`, source: SRC[i % SRC.length], publishedAt: ago(h + (i % 3) * 0.25), dataMode: 'SIMULATED' };
}).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

export function getNews(): NewsItem[] {
  return NEWS;
}

export function newsFor(instrumentId: string): NewsItem[] {
  return NEWS.filter((n) => n.instrumentIds.includes(instrumentId));
}
