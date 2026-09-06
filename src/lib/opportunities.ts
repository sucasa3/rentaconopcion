/**
 * Client-safe opportunity vocabulary and math.
 *
 * IMPORTANT — product/compliance framing:
 * An "opportunity" is an informational signal that a homeowner MAY benefit
 * from a conversation about their financing. It is never a statement that a
 * homeowner needs a loan, qualifies for one, or is eligible. Underwriting and
 * eligibility determinations are made by the lender, not by SuCasa.
 * All copy in this module must stay in opportunity language.
 */

export const OPPORTUNITY_CATEGORIES = [
  "equity",
  "heloc",
  "refinance_review",
  "move_up",
  "investment",
  "mortgage_review",
  "home_condition",
  "market_timing",
  "free_and_clear",
  "recent_purchase",
  "mortgage_age",
  "permit_activity",
  "distress",
] as const;


export type OpportunityCategory = (typeof OPPORTUNITY_CATEGORIES)[number];
export type OpportunityStrength = "strong" | "moderate" | "emerging";
export type OpportunityState = "open" | "introduced" | "declined" | "expired";

export interface CategoryMeta {
  key: OpportunityCategory;
  label: string;
  /** One line an agent can read to their client. */
  blurb: string;
  /** What the lender side is being offered a conversation about. */
  lenderBlurb: string;
}

export const CATEGORY_META: Record<OpportunityCategory, CategoryMeta> = {
  equity: {
    key: "equity",
    label: "Equity opportunity",
    blurb: "Substantial estimated equity has built up in this home.",
    lenderBlurb: "Homeowner may benefit from a conversation about using their equity.",
  },
  heloc: {
    key: "heloc",
    label: "HELOC opportunity",
    blurb: "High estimated equity with a relatively low loan-to-value.",
    lenderBlurb: "Profile suggests a line-of-credit conversation may be worthwhile.",
  },
  refinance_review: {
    key: "refinance_review",
    label: "Refinance review",
    blurb: "Available signals suggest a financing review may be worthwhile.",
    lenderBlurb: "Rate and seasoning signals suggest a refinance review may be worthwhile.",
  },
  move_up: {
    key: "move_up",
    label: "Move-up opportunity",
    blurb: "Meaningful equity plus tenure and appreciation signals.",
    lenderBlurb: "Homeowner may be positioned to consider a move-up purchase.",
  },
  investment: {
    key: "investment",
    label: "Investment opportunity",
    blurb: "Equity and property signals suggest potential investment financing interest.",
    lenderBlurb: "Signals suggest possible interest in investment property financing.",
  },
  mortgage_review: {
    key: "mortgage_review",
    label: "Mortgage review",
    blurb: "A broader look at this homeowner's financing may be useful.",
    lenderBlurb: "Homeowner may benefit from a general financing review.",
  },
  home_condition: {
    key: "home_condition",
    label: "Home condition",
    blurb: "The home record shows work coming due on a major system.",
    lenderBlurb: "Upcoming work on the home may prompt a financing conversation.",
  },
  market_timing: {
    key: "market_timing",
    label: "Market timing",
    blurb: "Recent behavior suggests this homeowner is weighing a move.",
    lenderBlurb: "Activity suggests a move may be under consideration.",
  },

  free_and_clear: {
    key: "free_and_clear",
    label: "Owned free and clear",
    blurb: "Public records show no open loan against this home.",
    lenderBlurb: "No open loan on record — a first conversation about financing options may be welcome.",
  },
  recent_purchase: {
    key: "recent_purchase",
    label: "Recent purchase",
    blurb: "This home changed hands recently.",
    lenderBlurb: "Recently purchased — a good moment for a relationship-building touch.",
  },
  mortgage_age: {
    key: "mortgage_age",
    label: "Loan age",
    blurb: "This loan has been in place long enough for a review to be useful.",
    lenderBlurb: "Loan seasoning suggests a financing review may be worthwhile.",
  },
  permit_activity: {
    key: "permit_activity",
    label: "Home improvement activity",
    blurb: "Permit records show recent work on this home.",
    lenderBlurb: "Recent permit activity can signal ongoing improvement plans.",
  },
  distress: {
    key: "distress",
    label: "Needs attention",
    blurb: "Public records show a recent filing worth a careful conversation.",
    lenderBlurb: "A recent public filing may warrant a sensitive, timely outreach.",
  },
};

/**
 * Launch status of each opportunity type.
 *
 *  on                      — live, no extra conditions
 *  on_with_guardrails      — live but gated on value/equity confidence or date safety
 *  off_pending_data        — rule exists, waiting on a data field we do not have yet
 *  off_pending_external    — waiting on provider entitlement or account configuration
 */
export type OpportunityStatus =
  | "on"
  | "on_with_guardrails"
  | "off_pending_data"
  | "off_pending_external";

export const OPPORTUNITY_STATUS: Record<OpportunityCategory, { status: OpportunityStatus; note: string }> = {
  equity: {
    status: "on_with_guardrails",
    note: "Requires an equity position the Value Engine rates high or medium confidence.",
  },
  heloc: {
    status: "on_with_guardrails",
    note: "Requires a resolved single-lien balance and an actionable equity position.",
  },
  refinance_review: {
    status: "on_with_guardrails",
    note: "Requires a recorded rate; suppressed when equity cannot be stated.",
  },
  move_up: { status: "on_with_guardrails", note: "Requires actionable equity plus tenure." },
  investment: { status: "on_with_guardrails", note: "Requires actionable equity plus occupancy or tenure signal." },
  mortgage_review: { status: "on", note: "Informational only; no equity figures quoted." },
  home_condition: { status: "on", note: "Driven by the home record, not by valuation." },
  market_timing: { status: "on", note: "Driven by homeowner behaviour in the app." },
  free_and_clear: {
    status: "on_with_guardrails",
    note: "Only when the provider clearly reports zero open liens.",
  },
  recent_purchase: { status: "on", note: "Sale date within the recent-purchase window." },
  mortgage_age: { status: "on", note: "Loan seasoning only; quotes no value or equity." },
  permit_activity: { status: "on", note: "Permit records only." },
  distress: {
    status: "off_pending_external",
    note: "Held until provider confirms filing recency semantics; old filings must never read as current.",
  },
};

export const CATEGORY_ORDER: OpportunityCategory[] = [
  "refinance_review",
  "equity",
  "heloc",
  "move_up",
  "market_timing",
  "home_condition",
  "investment",
  "free_and_clear",
  "recent_purchase",
  "permit_activity",
  "mortgage_age",
  "mortgage_review",
  "distress",
];


export function categoryLabel(key: string): string {
  return CATEGORY_META[key as OpportunityCategory]?.label ?? key;
}

export function strengthLabel(s: string): string {
  return s === "strong" ? "Strong" : s === "moderate" ? "Moderate" : "Emerging";
}

/** Coarse equity band used when a homeowner has NOT been identified to a lender. */
export function equityBand(equityCents: number | null | undefined): string {
  const e = (equityCents ?? 0) / 100;
  if (e < 50_000) return "Under $50k";
  if (e < 100_000) return "$50k–$100k";
  if (e < 200_000) return "$100k–$200k";
  if (e < 350_000) return "$200k–$350k";
  if (e < 500_000) return "$350k–$500k";
  return "$500k+";
}

/** Coarse LTV band, same de-identification purpose as equityBand. */
export function ltvBand(ltvPct: number | null | undefined): string {
  if (ltvPct == null) return "Unknown";
  if (ltvPct < 40) return "Under 40%";
  if (ltvPct < 60) return "40–60%";
  if (ltvPct < 80) return "60–80%";
  return "80%+";
}

/** Coarse tenure band. */
export function tenureBand(monthsSinceClose: number): string {
  const y = monthsSinceClose / 12;
  if (y < 1) return "Under 1 year";
  if (y < 3) return "1–3 years";
  if (y < 5) return "3–5 years";
  if (y < 10) return "5–10 years";
  return "10+ years";
}

// ---------------------------------------------------------------------------
// Shared portfolio math (mirrors the lender portfolio view so the engine and
// the dashboards never disagree about a number).
// ---------------------------------------------------------------------------

export const BENCHMARK_RATE_DEFAULT = 6.25;

export function monthsBetween(from: string | null, to: Date): number {
  if (!from) return 0;
  const d = new Date(from);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.round((to.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
}

/** Rough amortization: principal left after `elapsed` months. */
export function remainingBalanceCents(
  origCents: number | null,
  ratePct: number | null,
  termMonths: number | null,
  elapsedMonths: number,
): number | null {
  if (!origCents || !ratePct || !termMonths || elapsedMonths <= 0) return origCents ?? null;
  const r = ratePct / 100 / 12;
  const n = termMonths;
  const k = Math.min(elapsedMonths, n);
  const factor = (Math.pow(1 + r, n) - Math.pow(1 + r, k)) / (Math.pow(1 + r, n) - 1);
  return Math.round(origCents * factor);
}

/** Simple appreciation heuristic: 4%/yr compounded, capped at 60%. */
export function estimatedValueCents(
  origCents: number | null,
  monthsSinceClose: number,
): number | null {
  if (!origCents) return null;
  const years = monthsSinceClose / 12;
  const growth = Math.min(0.6, Math.pow(1.04, years) - 1);
  const valueAtClose = origCents / 0.8; // assume ~80% LTV at close
  return Math.round(valueAtClose * (1 + growth));
}

export interface ClientSignals {
  equityCents: number;
  valueCents: number | null;
  balanceCents: number | null;
  ltvPct: number | null;
  ratePct: number | null;
  monthsSinceClose: number;
  benchmarkRate: number;
  /** Estimated monthly P&I saving at the benchmark rate. */
  savingsPerMonth: number;
  /** Recent permit activity on the property, if property records show any. */
  permitCount: number;
  /** True when the mailing address differs from the property address. */
  likelyNonOwnerOccupied: boolean;

  // --- Value Engine provenance (the only sanctioned source of value) --------
  /** which Value Engine method produced valueCents, null when unenriched */
  valueSource: string | null;
  valueConfidence: "high" | "medium" | "low" | null;
  valueMethodology: string | null;
  /** equity figures are safe enough for a lender to act on */
  equityActionable: boolean;
  /** why equity products are withheld, when they are */
  equitySuppressionReason: string | null;
  /** provider clearly reports zero open liens */
  freeAndClear: boolean;
  /** more than one open recorded loan */
  multiLien: boolean;
  /** months since the property last changed hands, from sale records */
  monthsSinceSale: number | null;
}

/**
 * Value + equity facts as resolved by the SuCasa Value Engine and the shared
 * equity resolver. When absent, the loan-fact heuristic still produces a rough
 * value for context, but equity-based opportunities stay suppressed.
 */
export interface EngineFacts {
  value: number | null;
  valueSource: string | null;
  valueConfidence: "high" | "medium" | "low" | null;
  valueMethodology: string | null;
  balance: number | null;
  equityDollars: number | null;
  ltvPct: number | null;
  actionable: boolean;
  suppressionReason: string | null;
  freeAndClear: boolean;
  multiLien: boolean;
}

export function deriveSignals(input: {
  loanAtCloseCents: number | null;
  ratePct: number | null;
  termMonths: number | null;
  closeDate: string | null;
  benchmarkRate?: number;
  permitCount?: number;
  likelyNonOwnerOccupied?: boolean;
  /** resolved value/equity — always preferred over the heuristic */
  engine?: EngineFacts | null;
  monthsSinceSale?: number | null;
  now?: Date;
}): ClientSignals {
  const now = input.now ?? new Date();
  const benchmarkRate = input.benchmarkRate ?? BENCHMARK_RATE_DEFAULT;
  const termMonths = input.termMonths ?? 360;
  const monthsSinceClose = monthsBetween(input.closeDate, now);
  const heuristicBalance = remainingBalanceCents(
    input.loanAtCloseCents,
    input.ratePct,
    termMonths,
    monthsSinceClose,
  );

  const e = input.engine ?? null;
  const engineValueCents = e?.value != null ? Math.round(e.value * 100) : null;
  const engineBalanceCents = e?.balance != null ? Math.round(e.balance * 100) : null;

  const valueCents = engineValueCents ?? estimatedValueCents(input.loanAtCloseCents, monthsSinceClose);
  const balanceCents = engineBalanceCents ?? heuristicBalance;
  const equityCents =
    e?.equityDollars != null
      ? Math.round(e.equityDollars * 100)
      : (valueCents ?? 0) - (balanceCents ?? 0);
  const ltvPct =
    e?.ltvPct ??
    (valueCents && balanceCents ? Math.round((balanceCents / valueCents) * 1000) / 10 : null);

  const p = (balanceCents ?? 0) / 100;
  const pay = (rate: number) => {
    if (!p || !rate) return 0;
    const r = rate / 100 / 12;
    return (p * r) / (1 - Math.pow(1 + r, -termMonths));
  };
  const savingsPerMonth = input.ratePct
    ? Math.max(0, Math.round(pay(input.ratePct) - pay(benchmarkRate)))
    : 0;

  return {
    equityCents,
    valueCents,
    balanceCents,
    ltvPct,
    ratePct: input.ratePct,
    monthsSinceClose,
    benchmarkRate,
    savingsPerMonth,
    permitCount: input.permitCount ?? 0,
    likelyNonOwnerOccupied: input.likelyNonOwnerOccupied ?? false,
    valueSource: e?.valueSource ?? null,
    valueConfidence: e?.valueConfidence ?? null,
    valueMethodology: e?.valueMethodology ?? null,
    equityActionable: e?.actionable ?? false,
    equitySuppressionReason:
      e?.suppressionReason ??
      (e
        ? null
        : "This home's records haven't been enriched yet, so equity figures are estimates only."),
    freeAndClear: e?.freeAndClear ?? false,
    multiLien: e?.multiLien ?? false,
    monthsSinceSale: input.monthsSinceSale ?? null,
  };
}


export interface DerivedOpportunity {
  category: OpportunityCategory;
  strength: OpportunityStrength;
  score: number;
  reasons: string[];
}

function usd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

function bandStrength(score: number): OpportunityStrength {
  if (score >= 70) return "strong";
  if (score >= 45) return "moderate";
  return "emerging";
}

/**
 * Turn raw signals into named opportunities.
 * Deliberately conservative: a client with thin data yields few or none,
 * rather than a confident-looking guess.
 */
export function deriveOpportunities(s: ClientSignals): DerivedOpportunity[] {
  const out: DerivedOpportunity[] = [];
  const equity = s.equityCents;
  const seasoned = s.monthsSinceClose >= 12;

  // --- Refinance review -----------------------------------------------------
  if (s.ratePct != null && seasoned && s.ratePct - s.benchmarkRate >= 0.5) {
    const delta = s.ratePct - s.benchmarkRate;
    const score = Math.min(100, 40 + delta * 25 + (s.savingsPerMonth > 200 ? 15 : 0));
    out.push({
      category: "refinance_review",
      strength: bandStrength(score),
      score: Math.round(score),
      reasons: [
        `Current rate is about ${delta.toFixed(2)} points above the ${s.benchmarkRate}% benchmark`,
        s.savingsPerMonth > 0
          ? `Estimated monthly difference of about $${s.savingsPerMonth.toLocaleString()} at the benchmark rate`
          : "A rate review may be worthwhile",
        `Loan has been seasoned about ${Math.round(s.monthsSinceClose / 12)} year(s)`,
      ],
    });
  }

  // --- Equity ---------------------------------------------------------------
  if (equity >= 100_000 * 100) {
    const score = Math.min(100, 35 + equity / 100 / 10_000);
    out.push({
      category: "equity",
      strength: bandStrength(score),
      score: Math.round(score),
      reasons: [
        `Estimated equity of about ${usd(equity)}`,
        s.ltvPct != null ? `Estimated loan-to-value around ${s.ltvPct}%` : "Equity has built up since close",
      ],
    });
  }

  // --- HELOC ----------------------------------------------------------------
  if (equity >= 75_000 * 100 && s.ltvPct != null && s.ltvPct <= 65) {
    const score = Math.min(100, 45 + (65 - s.ltvPct) * 1.5);
    out.push({
      category: "heloc",
      strength: bandStrength(score),
      score: Math.round(score),
      reasons: [
        `Estimated loan-to-value around ${s.ltvPct}%, below the 65% mark`,
        `Estimated equity of about ${usd(equity)}`,
        s.permitCount > 0
          ? `Property records show ${s.permitCount} recent permit(s), which can indicate ongoing improvement plans`
          : "Equity position may support a line of credit conversation",
      ],
    });
  }

  // --- Move-up --------------------------------------------------------------
  if (equity >= 150_000 * 100 && s.monthsSinceClose >= 60) {
    const score = Math.min(100, 40 + s.monthsSinceClose / 6 + equity / 100 / 20_000);
    out.push({
      category: "move_up",
      strength: bandStrength(score),
      score: Math.round(score),
      reasons: [
        `About ${Math.round(s.monthsSinceClose / 12)} years of ownership`,
        `Estimated equity of about ${usd(equity)} could support a move-up down payment`,
      ],
    });
  }

  // --- Investment -----------------------------------------------------------
  if (equity >= 200_000 * 100 && (s.likelyNonOwnerOccupied || s.monthsSinceClose >= 84)) {
    const score = Math.min(100, 40 + (s.likelyNonOwnerOccupied ? 25 : 0) + equity / 100 / 25_000);
    out.push({
      category: "investment",
      strength: bandStrength(score),
      score: Math.round(score),
      reasons: [
        `Estimated equity of about ${usd(equity)}`,
        s.likelyNonOwnerOccupied
          ? "Property records suggest the mailing address differs from the property address"
          : `Long tenure of about ${Math.round(s.monthsSinceClose / 12)} years`,
      ],
    });
  }

  // --- Mortgage review (catch-all, only when nothing sharper applies) --------
  if (out.length === 0 && s.monthsSinceClose >= 24 && (s.balanceCents ?? 0) > 0) {
    out.push({
      category: "mortgage_review",
      strength: "emerging",
      score: 25,
      reasons: [
        `About ${Math.round(s.monthsSinceClose / 12)} years since this loan closed`,
        "A general financing review may be useful",
      ],
    });
  }

  return out;
}
