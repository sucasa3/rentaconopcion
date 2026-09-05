/**
 * Property data safety layer — pure functions, no server imports.
 *
 * One shared place that decides how confident we are in a piece of provider
 * data. Screens read flags from here instead of inventing their own rules.
 *
 * Guiding principle (product decision): prefer LABELLING data with its date,
 * source and confidence over hiding it. We only suppress when surfacing the
 * value could materially mislead a lender or homeowner.
 */

import type { NormalizedBatchdataProperty } from "./batchdata-normalize";

export interface SafetyThresholds {
  /** Value estimate older than this is labelled "as of <date>". */
  avmStaleDays: number;
  /** Value estimate older than this is unsafe to lead with; label loudly. */
  avmUnsafeDays: number;
  /** Provider confidence (0-100) below this gets a confidence warning. */
  avmLowConfidence: number;
  /** Provider confidence below this is not safe to drive an opportunity. */
  avmUnsafeConfidence: number;
  /** A distress record older than this is history, never "current". */
  distressCurrentDays: number;
  /** Recent-purchase window used by opportunity rules. */
  recentPurchaseDays: number;
}

export const DEFAULT_THRESHOLDS: SafetyThresholds = {
  avmStaleDays: 120,
  avmUnsafeDays: 545,
  avmLowConfidence: 70,
  avmUnsafeConfidence: 40,
  distressCurrentDays: 365,
  recentPurchaseDays: 365,
};

export type SafetySeverity = "info" | "warn" | "block";

export interface SafetyFlag {
  code: string;
  severity: SafetySeverity;
  /** Short sentence safe to show in the interface. */
  message: string;
}

export interface SafetyAssessment {
  flags: SafetyFlag[];
  /** Value estimate is usable as the headline number. */
  valuationUsable: boolean;
  /** Value estimate should carry a visible date/confidence caveat. */
  valuationNeedsCaveat: boolean;
  /** Equity/LTV figures are internally consistent enough to act on. */
  equityUsable: boolean;
  /** Provider clearly shows zero open loans. */
  freeAndClear: boolean;
  /** More than one open loan; balances must stay separate. */
  multiLien: boolean;
  /** LTV present but no balance — never back-calculate a balance from it. */
  balanceMissingWithLtv: boolean;
  /** Only assessor value available; must be labelled as assessor data. */
  assessorOnly: boolean;
  valuationAgeDays: number | null;
}

function ageDays(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86_400_000));
}

export function assessPropertySafety(
  n: NormalizedBatchdataProperty | null,
  thresholds: SafetyThresholds = DEFAULT_THRESHOLDS,
): SafetyAssessment {
  const flags: SafetyFlag[] = [];
  const empty: SafetyAssessment = {
    flags: [{ code: "no_data", severity: "block", message: "No property record matched this address." }],
    valuationUsable: false,
    valuationNeedsCaveat: false,
    equityUsable: false,
    freeAndClear: false,
    multiLien: false,
    balanceMissingWithLtv: false,
    assessorOnly: false,
    valuationAgeDays: null,
  };
  if (!n) return empty;

  const v = n.valuation;
  const m = n.mortgage;
  const age = ageDays(v.asOf);

  // --- Valuation ---------------------------------------------------------
  let valuationUsable = v.estimate != null;
  let valuationNeedsCaveat = false;

  if (v.estimate == null) {
    flags.push({
      code: "no_avm",
      severity: "warn",
      message: "No market estimate returned for this property.",
    });
  } else {
    if (age == null) {
      valuationNeedsCaveat = true;
      flags.push({
        code: "avm_no_date",
        severity: "warn",
        message: "Estimate has no date from the data source — treat as undated.",
      });
    } else if (age >= thresholds.avmUnsafeDays) {
      valuationNeedsCaveat = true;
      flags.push({
        code: "avm_very_stale",
        severity: "warn",
        message: `Estimate is over ${Math.floor(age / 30)} months old — show the date, don't lead with the number.`,
      });
    } else if (age >= thresholds.avmStaleDays) {
      valuationNeedsCaveat = true;
      flags.push({
        code: "avm_stale",
        severity: "info",
        message: `Estimate dated ${v.asOf} — label as of that date.`,
      });
    }

    if (v.confidence != null && v.confidence < thresholds.avmUnsafeConfidence) {
      valuationNeedsCaveat = true;
      flags.push({
        code: "avm_very_low_confidence",
        severity: "warn",
        message: "Data source reports low confidence in this estimate.",
      });
    } else if (v.confidence != null && v.confidence < thresholds.avmLowConfidence) {
      valuationNeedsCaveat = true;
      flags.push({
        code: "avm_low_confidence",
        severity: "info",
        message: "Moderate confidence estimate — show the range too.",
      });
    }
  }

  const assessorOnly = v.estimate == null && (v.marketValue != null || v.assessedValue != null);
  if (assessorOnly) {
    flags.push({
      code: "assessor_only",
      severity: "info",
      message: "Only the county assessor value is available — must be labelled as assessor value.",
    });
  }

  // --- Loans / equity ----------------------------------------------------
  const lienCount = m.openLienCount ?? (m.liens.length || null);
  const freeAndClear = lienCount === 0 && m.totalOpenLienBalance == null && !m.hasRecord;
  const multiLien = (lienCount ?? 0) > 1;
  const balanceMissingWithLtv = m.ltv != null && m.loanAmount == null && m.totalOpenLienBalance == null;

  if (multiLien) {
    flags.push({
      code: "multi_lien",
      severity: "warn",
      message: "More than one loan on record — balances and loan-to-value stay separate per loan.",
    });
  }
  if (balanceMissingWithLtv) {
    flags.push({
      code: "balance_missing_with_ltv",
      severity: "warn",
      message: "Loan-to-value returned without a balance — the balance is not estimated from it.",
    });
  }
  if (lienCount == null && !m.hasRecord) {
    flags.push({
      code: "lien_unknown",
      severity: "info",
      message: "No loan records returned — this is not proof the home is owned outright.",
    });
  }

  const equityUsable =
    !balanceMissingWithLtv &&
    !multiLien &&
    valuationUsable &&
    (m.equityPercent != null || m.estimatedEquity != null || (m.loanAmount != null && v.estimate != null));

  if (v.estimate != null && (age ?? 0) >= thresholds.avmUnsafeDays) {
    // Still shown, just never the sole basis for a money conversation.
    valuationUsable = true;
  }

  return {
    flags,
    valuationUsable,
    valuationNeedsCaveat,
    equityUsable,
    freeAndClear,
    multiLien,
    balanceMissingWithLtv,
    assessorOnly,
    valuationAgeDays: age,
  };
}

export type Readiness = "GREEN" | "YELLOW" | "RED";

/**
 * Production-readiness rating for a single enriched property.
 * GREEN  = safe to surface as-is.
 * YELLOW = safe to surface with a visible caveat.
 * RED    = do not attach to a homeowner.
 */
export function classifyReadiness(opts: {
  matched: boolean;
  normalized: NormalizedBatchdataProperty | null;
  unit: string | null;
  thresholds?: SafetyThresholds;
}): { readiness: Readiness; reason: string; safety: SafetyAssessment } {
  const safety = assessPropertySafety(opts.normalized, opts.thresholds);
  if (!opts.matched || !opts.normalized) {
    return { readiness: "RED", reason: "No property matched this address.", safety };
  }

  const n = opts.normalized;
  const hasCore = Boolean(n.property.yearBuilt || n.property.sqft || n.property.propertyType);
  const hasOwner = Boolean(n.ownership.ownerName);

  if (!hasCore && !n.valuation.estimate) {
    return { readiness: "RED", reason: "Matched, but no usable property or value data returned.", safety };
  }

  const reasons: string[] = [];
  if (opts.unit) {
    reasons.push("Unit address — cannot confirm the record is the unit rather than the building.");
  }
  if (safety.valuationNeedsCaveat) {
    reasons.push("Value estimate needs a date or confidence caveat.");
  }
  if (safety.multiLien) reasons.push("Multiple loans — do not combine balances.");
  if (safety.balanceMissingWithLtv) reasons.push("Loan-to-value without a balance.");
  if (!hasOwner) reasons.push("No owner name returned.");
  if (!n.valuation.estimate) reasons.push("No market estimate returned.");

  if (reasons.length === 0) {
    return { readiness: "GREEN", reason: "Complete, current and internally consistent.", safety };
  }
  return { readiness: "YELLOW", reason: reasons.join(" "), safety };
}
