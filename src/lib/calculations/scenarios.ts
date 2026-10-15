import type { AssetClass, Instrument } from '../../types/market';

export interface ScenarioAssumptions {
  horizonDays: number; // 1..250
  volMultiplier: number; // scales the realised-vol based move
  bullProb: number; // raw weights, normalised below
  baseProb: number;
  bearProb: number;
  bullSigma: number; // move in σ units
  bearSigma: number;
  baseDriftPct: number; // base-case % move
}

export const DEFAULT_ASSUMPTIONS: ScenarioAssumptions = {
  horizonDays: 20, volMultiplier: 1, bullProb: 30, baseProb: 45, bearProb: 25, bullSigma: 1, bearSigma: 1, baseDriftPct: 0,
};

export interface ScenarioCase {
  id: 'bull' | 'base' | 'bear';
  label: string;
  probability: number; // normalised %
  movePct: number;
  level: number;
}

/**
 * Hypothetical levels: σ_horizon = annualVol × √(horizon/periodsPerYear) × multiplier.
 * Bull = +bullSigma·σ, Bear = −bearSigma·σ, Base = baseDriftPct. Pure arithmetic, not a forecast.
 */
export function computeScenarios(inst: Instrument, annualVolPct: number | null, a: ScenarioAssumptions) {
  const periods = inst.assetClass === 'crypto' ? 365 : inst.assetClass === 'forex' ? 260 : 252;
  const vol = annualVolPct != null && Number.isFinite(annualVolPct) ? annualVolPct : 20;
  const horizon = Math.max(1, Math.min(250, a.horizonDays || 1));
  const sigmaPct = vol * Math.sqrt(horizon / periods) * Math.max(0, a.volMultiplier);
  const total = Math.max(0, a.bullProb) + Math.max(0, a.baseProb) + Math.max(0, a.bearProb);
  const norm = (x: number) => (total > 0 ? (Math.max(0, x) / total) * 100 : 100 / 3);
  const mk = (id: ScenarioCase['id'], label: string, prob: number, move: number): ScenarioCase => ({ id, label, probability: norm(prob), movePct: move, level: inst.price * (1 + move / 100) });
  const cases = [
    mk('bull', 'Bull case', a.bullProb, a.bullSigma * sigmaPct),
    mk('base', 'Base case', a.baseProb, a.baseDriftPct),
    mk('bear', 'Bear case', a.bearProb, -a.bearSigma * sigmaPct),
  ];
  const weightedMovePct = cases.reduce((acc, c) => acc + (c.probability / 100) * c.movePct, 0);
  return { cases, sigmaPct, weightedMovePct, weightsValid: total > 0 };
}

export const SCENARIO_NOTES: Record<AssetClass, Record<'bull' | 'base' | 'bear', { drivers: string[]; risks: string[]; invalidation: string[] }>> = {
  equity: {
    bull: { drivers: ['Earnings beat vs. estimates', 'Broad index uptrend continues', 'Supportive foreign flows'], risks: ['Valuation already elevated', 'Event risk around results'], invalidation: ['Close back below SMA(50)', 'Benchmark index breaks its trend'] },
    base: { drivers: ['Results in line', 'Range-bound benchmark'], risks: ['Sector rotation'], invalidation: ['Break of recent 60-bar range'] },
    bear: { drivers: ['Guidance cut', 'Risk-off in benchmark', 'Weaker currency'], risks: ['Short squeeze on positive surprise'], invalidation: ['Reclaim of SMA(50) with rising RSI'] },
  },
  index: {
    bull: { drivers: ['Broad earnings upgrades', 'Positive flows'], risks: ['Narrow breadth'], invalidation: ['Close below SMA(50)'] },
    base: { drivers: ['Mixed macro data'], risks: ['Policy surprises'], invalidation: ['Range break'] },
    bear: { drivers: ['Policy tightening surprise', 'Global risk-off'], risks: ['Sharp relief rallies'], invalidation: ['Reclaim of SMA(50)'] },
  },
  gold: {
    bull: { drivers: ['Weaker USD proxy', 'Lower real-yield assumption', 'Safe-haven demand'], risks: ['Stronger USD'], invalidation: ['USD proxy reverses higher'] },
    base: { drivers: ['Stable rates expectations'], risks: ['Event volatility (CPI, FOMC)'], invalidation: ['Range break'] },
    bear: { drivers: ['Stronger USD', 'Higher real-yield assumption', 'Risk-on rotation'], risks: ['Geopolitical shock'], invalidation: ['New highs on rising volume'] },
  },
  silver: {
    bull: { drivers: ['Industrial demand narrative', 'Weaker USD'], risks: ['High beta to gold'], invalidation: ['Gold/silver ratio widens sharply'] },
    base: { drivers: ['Follows gold'], risks: ['Volatility spikes'], invalidation: ['Range break'] },
    bear: { drivers: ['Growth slowdown', 'Stronger USD'], risks: ['Supply disruption'], invalidation: ['Reclaim of SMA(50)'] },
  },
  crypto: {
    bull: { drivers: ['Risk appetite rising', 'Positive fund-flow assumption'], risks: ['Extreme volatility', 'Leverage flushes'], invalidation: ['Loss of SMA(50) on 24/7 trading'] },
    base: { drivers: ['Consolidation'], risks: ['Weekend gaps'], invalidation: ['Range break'] },
    bear: { drivers: ['Risk-off', 'Regulatory headline risk'], risks: ['Violent short squeezes'], invalidation: ['Reclaim of prior swing high'] },
  },
  oil: {
    bull: { drivers: ['Inventory draws', 'Producer discipline'], risks: ['Demand downgrades'], invalidation: ['Consecutive inventory builds'] },
    base: { drivers: ['Balanced supply/demand'], risks: ['Headline-driven spikes'], invalidation: ['Range break'] },
    bear: { drivers: ['Inventory builds', 'Weaker growth proxy'], risks: ['Supply disruption premium'], invalidation: ['Close above recent resistance'] },
  },
  forex: {
    bull: { drivers: ['Rate differential favours base currency'], risks: ['Central-bank intervention'], invalidation: ['Policy surprise against base currency'] },
    base: { drivers: ['Policy on hold'], risks: ['Data surprises'], invalidation: ['Range break'] },
    bear: { drivers: ['Rate differential favours quote currency'], risks: ['Risk-sentiment swings'], invalidation: ['Reclaim of SMA(50)'] },
  },
};
