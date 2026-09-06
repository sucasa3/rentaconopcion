/**
 * ONE shared equity resolver.
 *
 * Every surface and every opportunity rule that talks about equity, LTV,
 * cash-out headroom or free-and-clear status must come through here. It takes
 * the SuCasa Value Engine's answer plus the recorded lien picture and returns
 * a single resolved position, including an explicit suppression reason when the
 * data is not safe to act on.
 *
 * Pure — no provider calls, no database access.
 */

import { isOfferGrade, type ValueEngineResult, type ValueConfidence } from "@/lib/value-engine";

export interface LienInput {
  /** balance if known — never inferred from an LTV */
  balance?: number | null;
  originalAmount?: number | null;
  lender?: string | null;
  position?: number | null;
  originationDate?: string | null;
  interestRate?: number | null;
}

export interface EquityResolverInput {
  value: ValueEngineResult;
  mortgage?: {
    /** false when public records show no open loan at all */
    hasRecord?: boolean | null;
    openLienCount?: number | null;
    /** sum of open lien balances as reported by the provider */
    totalOpenLienBalance?: number | null;
    /** best available single-loan balance estimate */
    balanceEstimate?: number | null;
    /** provider-reported loan-to-value, fraction or percent */
    ltv?: number | null;
    liens?: LienInput[] | null;
  } | null;
}

export type EquitySuppression =
  | null
  | "value_confidence_too_low"
  | "no_value"
  | "balance_unknown"
  | "multi_lien_unclear";

export interface ResolvedEquity {
  /** the value the equity math was built on */
  value: number | null;
  valueSource: string | null;
  valueConfidence: ValueConfidence | null;

  equityDollars: number | null;
  equityPct: number | null;
  ltvPct: number | null;
  balance: number | null;
  /** 80% loan-to-value headroom above the current balance */
  cashOutHeadroom: number | null;

  freeAndClear: boolean;
  multiLien: boolean;
  /** open liens kept separate — never merged into one implied loan */
  liens: LienInput[];
  openLienCount: number | null;

  confidence: ValueConfidence | null;
  /** set when equity-based products must not be offered */
  suppression: EquitySuppression;
  suppressionReason: string | null;
  /** true when a lender may act on this equity position */
  actionable: boolean;
}

function pos(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

export function resolveEquity(input: EquityResolverInput): ResolvedEquity {
  const v = input.value;
  const m = input.mortgage ?? null;
  const liens = (m?.liens ?? []).filter(Boolean);
  const openLienCount = m?.openLienCount ?? (liens.length > 0 ? liens.length : null);
  const noRecord = m?.hasRecord === false || openLienCount === 0;
  const multiLien = (openLienCount ?? 0) > 1;

  const base: ResolvedEquity = {
    value: v.value,
    valueSource: v.kind,
    valueConfidence: v.confidence,
    equityDollars: null,
    equityPct: null,
    ltvPct: null,
    balance: null,
    cashOutHeadroom: null,
    freeAndClear: noRecord,
    multiLien,
    liens,
    openLienCount,
    confidence: v.confidence,
    suppression: null,
    suppressionReason: null,
    actionable: false,
  };

  if (v.value == null) {
    return {
      ...base,
      suppression: "no_value",
      suppressionReason: "No home value could be established from public records yet.",
    };
  }

  if (!isOfferGrade(v)) {
    return {
      ...base,
      suppression: "value_confidence_too_low",
      suppressionReason:
        "The home value is too uncertain to quote equity from. The underlying records are kept for review.",
    };
  }

  // Balance: never invented. Free-and-clear means a real zero.
  const reported = pos(m?.totalOpenLienBalance);
  const summed = liens.reduce<number | null>((s, l) => {
    const b = pos(l.balance);
    return b == null ? s : (s ?? 0) + b;
  }, null);
  const balance = noRecord ? 0 : (reported ?? summed ?? pos(m?.balanceEstimate));

  if (balance == null) {
    return {
      ...base,
      suppression: "balance_unknown",
      suppressionReason:
        "Public records show a loan but no balance, so equity cannot be stated. The loan record is preserved.",
    };
  }

  // More than one open loan whose balances don't all resolve: keep the liens
  // visible but do not merge them into a single equity figure.
  if (multiLien && reported == null && (summed == null || liens.some((l) => pos(l.balance) == null))) {
    return {
      ...base,
      balance: null,
      suppression: "multi_lien_unclear",
      suppressionReason:
        "This home has more than one recorded loan and the balances don't fully resolve. Each loan is listed separately.",
    };
  }

  const equity = Math.round(v.value - balance);
  const equityPct = Math.max(0, Math.min(1, equity / v.value));
  const ltvPct = Math.round((balance / v.value) * 1000) / 10;
  const cashOutHeadroom = Math.max(0, Math.round(v.value * 0.8 - balance));

  // A multi-lien home with fully resolved balances is actionable, but never at
  // high confidence — the lien relationship still needs a human look.
  const confidence: ValueConfidence =
    multiLien && v.confidence === "high" ? "medium" : (v.confidence ?? "medium");

  return {
    ...base,
    balance,
    equityDollars: equity,
    equityPct,
    ltvPct,
    cashOutHeadroom,
    confidence,
    actionable: true,
  };
}

/** Equity-based products (HELOC, cash-out, refinance quotes) may be offered. */
export function equityOffersAllowed(e: ResolvedEquity): boolean {
  return e.actionable && e.suppression === null && e.equityDollars != null;
}
