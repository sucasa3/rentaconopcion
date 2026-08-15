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
};

export const CATEGORY_ORDER: OpportunityCategory[] = [
  "refinance_review",
  "equity",
  "heloc",
  "move_up",
  "market_timing",
  "home_condition",
  "investment",
  "mortgage_review",
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
}

export function deriveSignals(input: {
  loanAtCloseCents: number | null;
  ratePct: number | null;
  termMonths: number | null;
  closeDate: string | null;
  benchmarkRate?: number;
  permitCount?: number;
  likelyNonOwnerOccupied?: boolean;
  now?: Date;
}): ClientSignals {
  const now = input.now ?? new Date();
  const benchmarkRate = input.benchmarkRate ?? BENCHMARK_RATE_DEFAULT;
  const termMonths = input.termMonths ?? 360;
  const monthsSinceClose = monthsBetween(input.closeDate, now);
  const balanceCents = remainingBalanceCents(
    input.loanAtCloseCents,
    input.ratePct,
    termMonths,
    monthsSinceClose,
  );
  const valueCents = estimatedValueCents(input.loanAtCloseCents, monthsSinceClose);
  const equityCents = (valueCents ?? 0) - (balanceCents ?? 0);
  const ltvPct =
    valueCents && balanceCents ? Math.round((balanceCents / valueCents) * 1000) / 10 : null;

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
