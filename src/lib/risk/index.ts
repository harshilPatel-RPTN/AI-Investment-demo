export interface RiskInput {
  capital: number;
  entry: number;
  stop: number;
  target: number;
  riskMode: 'percent' | 'fixed';
  riskPercent: number;
  riskAmount: number;
  lotSize: number;
  feesPerUnit: number; // illustrative round-trip fee+slippage per unit
}

export interface RiskResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  direction: 'long' | 'short' | null;
  riskBudget: number;
  riskPerUnit: number;
  quantity: number;
  positionValue: number;
  potentialLoss: number;
  potentialGain: number;
  rewardPerUnit: number;
  riskReward: number | null;
  capitalUsedPct: number;
}

const finite = (n: number) => typeof n === 'number' && Number.isFinite(n);

export function computeRisk(i: RiskInput): RiskResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const empty: RiskResult = {
    ok: false, errors, warnings, direction: null, riskBudget: 0, riskPerUnit: 0, quantity: 0,
    positionValue: 0, potentialLoss: 0, potentialGain: 0, rewardPerUnit: 0, riskReward: null, capitalUsedPct: 0,
  };
  if (!finite(i.capital) || i.capital <= 0) errors.push('Capital must be a positive number.');
  if (!finite(i.entry) || i.entry <= 0) errors.push('Entry price must be a positive number.');
  if (!finite(i.stop) || i.stop <= 0) errors.push('Stop-loss price must be a positive number.');
  if (!finite(i.target) || i.target <= 0) errors.push('Target price must be a positive number.');
  if (!finite(i.lotSize) || i.lotSize <= 0) errors.push('Quantity step / lot size must be positive.');
  if (!finite(i.feesPerUnit) || i.feesPerUnit < 0) errors.push('Fees/slippage cannot be negative.');
  if (i.riskMode === 'percent' && (!finite(i.riskPercent) || i.riskPercent <= 0 || i.riskPercent > 100)) errors.push('Risk % must be between 0 and 100.');
  if (i.riskMode === 'fixed' && (!finite(i.riskAmount) || i.riskAmount <= 0)) errors.push('Fixed risk amount must be positive.');
  if (errors.length) return empty;

  if (i.stop === i.entry) {
    errors.push('Stop-loss cannot equal entry (risk per unit would be zero).');
    return empty;
  }
  const direction = i.stop < i.entry ? 'long' : 'short';
  if (direction === 'long' && i.target <= i.entry) errors.push('For a long setup (stop below entry) the target must be above entry.');
  if (direction === 'short' && i.target >= i.entry) errors.push('For a short setup (stop above entry) the target must be below entry.');
  if (errors.length) return { ...empty, direction };

  const riskBudget = i.riskMode === 'percent' ? (i.capital * i.riskPercent) / 100 : i.riskAmount;
  if (riskBudget > i.capital) warnings.push('Risk budget exceeds total capital.');
  const riskPerUnit = Math.abs(i.entry - i.stop) + i.feesPerUnit;
  const rewardPerUnit = Math.abs(i.target - i.entry) - i.feesPerUnit;
  const rawQty = riskBudget / riskPerUnit;
  const quantity = Math.floor(rawQty / i.lotSize + 1e-9) * i.lotSize;
  if (quantity <= 0) warnings.push('Risk budget is smaller than one lot at this stop distance — quantity rounds to zero.');
  const positionValue = quantity * i.entry;
  if (positionValue > i.capital) warnings.push('Position value exceeds capital — this would require leverage/margin.');
  if (i.riskMode === 'percent' && i.riskPercent > 2) warnings.push('Risking more than 2% per trade is above many common rule-of-thumb limits.');
  const riskReward = riskPerUnit > 0 ? rewardPerUnit / riskPerUnit : null;
  if (riskReward != null && riskReward < 1) warnings.push('Reward/risk is below 1:1 after estimated costs.');

  return {
    ok: true, errors, warnings, direction, riskBudget, riskPerUnit, quantity, positionValue,
    potentialLoss: quantity * riskPerUnit,
    potentialGain: quantity * rewardPerUnit,
    rewardPerUnit, riskReward,
    capitalUsedPct: (positionValue / i.capital) * 100,
  };
}

/** FX sizing with a user-configurable pip value (per 1 standard lot in account currency). */
export function fxPositionSize(opts: { accountRisk: number; stopPips: number; pipValuePerLot: number }) {
  const { accountRisk, stopPips, pipValuePerLot } = opts;
  if (![accountRisk, stopPips, pipValuePerLot].every(finite) || accountRisk <= 0 || stopPips <= 0 || pipValuePerLot <= 0) return null;
  return accountRisk / (stopPips * pipValuePerLot);
}

export function priceToPips(diff: number, pipSize: number): number | null {
  if (!finite(diff) || !finite(pipSize) || pipSize <= 0) return null;
  return Math.abs(diff) / pipSize;
}
