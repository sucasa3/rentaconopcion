/**
 * Tunable factors for the SuCasa Value Engine.
 *
 * These live apart from the engine logic so they can be re-calibrated from
 * backtest output without touching any decision code.
 */

/** Default annual home-price drift used to age a sale price forward. */
export const DEFAULT_ANNUAL_DRIFT = 0.045;

/** Per-state annual drift overrides (fraction/year). */
export const STATE_ANNUAL_DRIFT: Record<string, number> = {
  FL: 0.035,
  TX: 0.03,
  GA: 0.05,
  PA: 0.04,
  CA: 0.04,
  AZ: 0.035,
  NC: 0.055,
  TN: 0.05,
  OH: 0.05,
  NY: 0.035,
};

/**
 * Ratio of the assessor's stated "market value" to true market value.
 * 1.0 means the county publishes a full-market figure. Values below 1 mean the
 * published number runs low and must be grossed up.
 *
 * Starting values are conservative; the backtest recalibrates them.
 */
export const DEFAULT_ASSESSMENT_RATIO = 0.92;

export const STATE_ASSESSMENT_RATIO: Record<string, number> = {
  // Calibrated 2026-09-06 against 73 stored records that carried both an
  // assessor value and a provider automated estimate.
  FL: 0.78, // Save Our Homes cap holds assessed values well below market (n=4)
  GA: 0.93, // n=69, median assessor/estimate ratio 0.932
  PA: 0.8, // long reassessment cycles
  TX: 0.97,
  CA: 0.7, // Prop 13 caps growth at 2%/yr
  NY: 0.85,
  NC: 0.95,
  TN: 0.9,
  OH: 0.9,
  AZ: 0.9,
};

export function annualDrift(state: string | null | undefined): number {
  if (!state) return DEFAULT_ANNUAL_DRIFT;
  return STATE_ANNUAL_DRIFT[state.toUpperCase()] ?? DEFAULT_ANNUAL_DRIFT;
}

export function assessmentRatio(state: string | null | undefined): number {
  if (!state) return DEFAULT_ASSESSMENT_RATIO;
  return STATE_ASSESSMENT_RATIO[state.toUpperCase()] ?? DEFAULT_ASSESSMENT_RATIO;
}

/** Candidates within this relative distance of each other count as agreeing. */
export const AGREEMENT_TOLERANCE = 0.1;

/** A sale this recent is treated as the market's own answer. */
export const RECENT_SALE_MONTHS = 12;
