import type { Community, CommunityId } from '../../types/community';

/** The four fixed communities. There is no API for adding more — this list is the whole set. */
export const COMMUNITIES: readonly Community[] = [
  {
    id: 'forex',
    name: 'Forex Community',
    short: 'Forex',
    description: 'Currency pairs, central banks and rate differentials — EUR/USD, GBP/USD, USD/JPY and more.',
    instrumentIds: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDINR', 'USDCHF', 'USDCAD', 'NZDUSD', 'EURGBP', 'EURJPY', 'EURINR'],
    accent: '#6ea8fe',
    baseMembers: 4820,
  },
  {
    id: 'gold',
    name: 'Gold Community',
    short: 'Gold',
    description: 'XAU/USD analysis, real yields, central-bank demand and gold trading ideas.',
    instrumentIds: ['XAUUSD', 'GOLDINR'],
    accent: '#e3b341',
    baseMembers: 3910,
  },
  {
    id: 'silver',
    name: 'Silver Community',
    short: 'Silver',
    description: 'XAG/USD, industrial demand, the gold/silver ratio and silver setups.',
    instrumentIds: ['XAGUSD', 'SILVERINR'],
    accent: '#b9c4d4',
    baseMembers: 2140,
  },
  {
    id: 'oil',
    name: 'Oil Community',
    short: 'Oil',
    description: 'WTI and Brent crude — inventories, OPEC+ policy, spreads and energy trade ideas.',
    instrumentIds: ['WTIUSD', 'BRENTUSD'],
    accent: '#e08a4f',
    baseMembers: 2760,
  },
];

const BY_ID = new Map(COMMUNITIES.map((c) => [c.id, c]));

export function getCommunity(id: string): Community | undefined {
  return BY_ID.get(id as CommunityId);
}

export function isCommunityId(id: unknown): id is CommunityId {
  return typeof id === 'string' && BY_ID.has(id as CommunityId);
}

/** True when the instrument may be tagged in the given community (enforces feed separation). */
export function instrumentBelongs(communityId: CommunityId, instrumentId: string): boolean {
  return BY_ID.get(communityId)?.instrumentIds.includes(instrumentId) ?? false;
}
