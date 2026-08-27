/**
 * Provider benchmark — pure comparison math, no server imports.
 *
 * Compares a stored ATTOM snapshot against a BatchData snapshot for the SAME
 * property and produces the metrics for the head-to-head evaluation.
 * Nothing here reads or writes production data.
 */

export const BENCHMARK_RATE = 6.5;

export interface ProviderMortgage {
  hasRecord: boolean;
  lender: string | null;
  loanAmount: number | null;
  originationDate: string | null;
  loanType: string | null;
  termYears: number | null;
  interestRate: number | null;
  /** Balance the provider reports directly (null when it does not provide one). */
  reportedBalance: number | null;
  ltv: number | null;
  estimatedPayment: number | null;
  openLienCount: number | null;
  juniorLienCount: number | null;
  hasHeloc: boolean;
}

export interface ProviderSnapshot {
  provider: "attom" | "batchdata";
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  ownerName: string | null;
  ownerOccupied: boolean | null;
  propertyType: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSqft: number | null;
  yearBuilt: number | null;
  assessedValue: number | null;
  marketValue: number | null;
  taxAmount: number | null;
  taxYear: number | null;
  lastSaleDate: string | null;
  lastSaleAmount: number | null;
  priorSaleCount: number;
  avmValue: number | null;
  avmLow: number | null;
  avmHigh: number | null;
  avmConfidence: number | null;
  mortgage: ProviderMortgage;
}

export function emptySnapshot(provider: ProviderSnapshot["provider"]): ProviderSnapshot {
  return {
    provider,
    addressLine1: null,
    city: null,
    state: null,
    zip: null,
    ownerName: null,
    ownerOccupied: null,
    propertyType: null,
    beds: null,
    baths: null,
    sqft: null,
    lotSqft: null,
    yearBuilt: null,
    assessedValue: null,
    marketValue: null,
    taxAmount: null,
    taxYear: null,
    lastSaleDate: null,
    lastSaleAmount: null,
    priorSaleCount: 0,
    avmValue: null,
    avmLow: null,
    avmHigh: null,
    avmConfidence: null,
    mortgage: {
      hasRecord: false,
      lender: null,
      loanAmount: null,
      originationDate: null,
      loanType: null,
      termYears: null,
      interestRate: null,
      reportedBalance: null,
      ltv: null,
      estimatedPayment: null,
      openLienCount: null,
      juniorLienCount: null,
      hasHeloc: false,
    },
  };
}

// ---------------------------------------------------------------- derivation

/** Straight amortization — the same formula SuCasa production uses today. */
export function amortizedBalance(
  loanAmount: number | null,
  ratePct: number | null,
  termYears: number | null,
  originationDate: string | null,
  now = Date.now(),
): number | null {
  if (!loanAmount || !originationDate) return null;
  const r = (ratePct ?? 6) / 100 / 12;
  const n = (termYears ?? 30) * 12;
  const t = new Date(originationDate).getTime();
  if (Number.isNaN(t)) return null;
  const elapsed = Math.max(0, Math.min(n, (now - t) / (30.44 * 24 * 3600 * 1000)));
  if (r === 0) return Math.max(0, Math.round(loanAmount * (1 - elapsed / n)));
  const pow = Math.pow(1 + r, n);
  const powE = Math.pow(1 + r, elapsed);
  return Math.max(0, Math.round(loanAmount * ((pow - powE) / (pow - 1))));
}

export function monthsSince(date: string | null, now = Date.now()): number | null {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((now - t) / (30.44 * 24 * 3600 * 1000)));
}

export interface Derived {
  value: number | null;
  valueSource: "avm" | "assessed" | null;
  balance: number | null;
  balanceSource: "reported" | "amortized" | "none";
  equity: number | null;
  equityPct: number | null;
  ltv: number | null;
  cashOut80: number | null;
  monthsSinceOrigination: number | null;
  tenureMonths: number | null;
  /** SuCasa's existing refi signal, unchanged. */
  refiSignal: "strong" | "moderate" | "watch" | null;
  decisions: Record<DecisionKey, boolean>;
}

export const DECISION_KEYS = [
  "high_equity",
  "refinance",
  "cash_out",
  "heloc",
  "long_term_owner",
  "recent_purchase",
  "rate_opportunity",
] as const;
export type DecisionKey = (typeof DECISION_KEYS)[number];

export const DECISION_LABELS: Record<DecisionKey, string> = {
  high_equity: "High equity",
  refinance: "Refinance opportunity",
  cash_out: "Cash-out opportunity",
  heloc: "HELOC / second lien",
  long_term_owner: "Long-term owner",
  recent_purchase: "Recent purchase",
  rate_opportunity: "Mortgage-rate opportunity",
};

/** Decisions whose answer depends on mortgage data specifically. */
export const MORTGAGE_DEPENDENT: DecisionKey[] = [
  "high_equity",
  "refinance",
  "cash_out",
  "heloc",
  "rate_opportunity",
];

export function derive(s: ProviderSnapshot, now = Date.now()): Derived {
  const value = s.avmValue ?? s.marketValue ?? s.assessedValue ?? null;
  const valueSource: Derived["valueSource"] =
    s.avmValue != null ? "avm" : value != null ? "assessed" : null;

  const amortized = amortizedBalance(
    s.mortgage.loanAmount,
    s.mortgage.interestRate,
    s.mortgage.termYears,
    s.mortgage.originationDate,
    now,
  );
  const balance = s.mortgage.reportedBalance ?? amortized;
  const balanceSource: Derived["balanceSource"] =
    s.mortgage.reportedBalance != null ? "reported" : amortized != null ? "amortized" : "none";

  const effectiveBalance = s.mortgage.hasRecord ? balance : 0;
  const equity = value != null && effectiveBalance != null ? value - effectiveBalance : null;
  const equityPct = value && equity != null ? Math.max(0, Math.min(1, equity / value)) : null;
  const ltv =
    value && effectiveBalance != null ? Math.round((effectiveBalance / value) * 1000) / 10 : null;
  const cashOut =
    value != null && effectiveBalance != null
      ? Math.max(0, Math.round(value * 0.8 - effectiveBalance))
      : null;

  // SuCasa's existing refi rule, copied verbatim in behaviour.
  let refi: Derived["refiSignal"] = null;
  if (equityPct != null && s.mortgage.interestRate != null) {
    const spread = s.mortgage.interestRate - BENCHMARK_RATE;
    if (equityPct >= 0.2 && spread >= 1) refi = "strong";
    else if (equityPct >= 0.2 && spread >= 0.5) refi = "moderate";
    else if (equityPct >= 0.15) refi = "watch";
  } else if (equityPct != null) {
    if (equityPct >= 0.5) refi = "strong";
    else if (equityPct >= 0.3) refi = "moderate";
    else if (equityPct >= 0.2) refi = "watch";
  } else if (value != null && !s.mortgage.hasRecord) {
    refi = "moderate";
  }

  const monthsOrig = monthsSince(s.mortgage.originationDate, now);
  const tenure = monthsSince(s.lastSaleDate, now);

  const decisions: Record<DecisionKey, boolean> = {
    high_equity: (equity ?? 0) >= 100_000,
    refinance: refi === "strong" || refi === "moderate",
    cash_out: (cashOut ?? 0) >= 25_000,
    heloc: (equity ?? 0) >= 75_000 && ltv != null && ltv <= 65,
    long_term_owner: (tenure ?? 0) >= 84,
    recent_purchase: tenure != null && tenure <= 24,
    rate_opportunity:
      s.mortgage.interestRate != null &&
      (monthsOrig ?? 0) >= 12 &&
      s.mortgage.interestRate - BENCHMARK_RATE >= 0.5,
  };

  return {
    value,
    valueSource,
    balance,
    balanceSource,
    equity,
    equityPct,
    ltv,
    cashOut80: cashOut,
    monthsSinceOrigination: monthsOrig,
    tenureMonths: tenure,
    refiSignal: refi,
    decisions,
  };
}

// --------------------------------------------------------------- comparisons

export interface NumericAgreement {
  field: string;
  bothPresent: number;
  attomOnly: number;
  batchOnly: number;
  neither: number;
  within5: number;
  within10: number;
  within20: number;
  medianAbsPctDiff: number | null;
  medianAbsDiff: number | null;
}

export function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? (a[mid] as number) : (((a[mid - 1] as number) + (a[mid] as number)) / 2);
}

export function compareNumericField(
  field: string,
  pairs: Array<{ attom: number | null; batch: number | null }>,
): NumericAgreement {
  let bothPresent = 0;
  let attomOnly = 0;
  let batchOnly = 0;
  let neither = 0;
  let within5 = 0;
  let within10 = 0;
  let within20 = 0;
  const pcts: number[] = [];
  const diffs: number[] = [];

  for (const p of pairs) {
    const a = p.attom;
    const b = p.batch;
    if (a != null && b != null) {
      bothPresent += 1;
      const diff = Math.abs(b - a);
      diffs.push(diff);
      const base = Math.abs(a) || Math.abs(b);
      const pct = base ? (diff / base) * 100 : 0;
      pcts.push(pct);
      if (pct <= 5) within5 += 1;
      if (pct <= 10) within10 += 1;
      if (pct <= 20) within20 += 1;
    } else if (a != null) attomOnly += 1;
    else if (b != null) batchOnly += 1;
    else neither += 1;
  }

  return {
    field,
    bothPresent,
    attomOnly,
    batchOnly,
    neither,
    within5,
    within10,
    within20,
    medianAbsPctDiff: median(pcts),
    medianAbsDiff: median(diffs),
  };
}

export function normalizeStreet(s: string | null): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\b(street|st)\b/g, "st")
    .replace(/\b(road|rd)\b/g, "rd")
    .replace(/\b(drive|dr)\b/g, "dr")
    .replace(/\b(avenue|ave)\b/g, "ave")
    .replace(/\b(lane|ln)\b/g, "ln")
    .replace(/\b(court|ct)\b/g, "ct")
    .replace(/\b(circle|cir)\b/g, "cir")
    .replace(/\b(place|pl)\b/g, "pl")
    .replace(/\b(boulevard|blvd)\b/g, "blvd")
    .replace(/\b(terrace|ter)\b/g, "ter")
    .replace(/\b(parkway|pkwy)\b/g, "pkwy")
    .replace(/\b(trail|trl)\b/g, "trl")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(name: string | null): string[] {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

export type MatchClass = "exact" | "probable" | "mismatch" | "no_match";

export function classifyMatch(a: ProviderSnapshot, b: ProviderSnapshot): {
  match: MatchClass;
  addressAgree: boolean;
  ownerAgree: boolean | null;
  typeAgree: boolean | null;
} {
  const hasBatch = Boolean(b.addressLine1 || b.avmValue || b.mortgage.hasRecord || b.ownerName);
  if (!hasBatch) {
    return { match: "no_match", addressAgree: false, ownerAgree: null, typeAgree: null };
  }
  const streetAgree = normalizeStreet(a.addressLine1) === normalizeStreet(b.addressLine1);
  const zipAgree = (a.zip ?? "").slice(0, 5) === (b.zip ?? "").slice(0, 5);
  const addressAgree = streetAgree && (zipAgree || !a.zip || !b.zip);

  const at = nameTokens(a.ownerName);
  const bt = nameTokens(b.ownerName);
  const ownerAgree =
    at.length && bt.length ? at.some((t) => bt.includes(t)) : null;

  const typeAgree =
    a.propertyType && b.propertyType
      ? sameType(a.propertyType, b.propertyType)
      : null;

  let match: MatchClass;
  if (addressAgree && ownerAgree !== false) match = "exact";
  else if (addressAgree) match = "probable";
  else if (streetAgree || zipAgree) match = "probable";
  else match = "mismatch";

  return { match, addressAgree, ownerAgree, typeAgree };
}

function sameType(a: string, b: string): boolean {
  const norm = (s: string) => {
    const t = s.toLowerCase();
    if (/(single family|sfr|townhouse|residential)/.test(t)) return "sfr";
    if (/(condo)/.test(t)) return "condo";
    if (/(duplex|triplex|multi|apartment)/.test(t)) return "multi";
    if (/(vacant|land|agricult)/.test(t)) return "land";
    return t;
  };
  return norm(a) === norm(b);
}

// ------------------------------------------------------------------- results

export interface PropertyPair {
  propertyId: string;
  address: string;
  county: string | null;
  attom: ProviderSnapshot;
  batch: ProviderSnapshot | null;
  /** Provider call metadata for the BatchData side. */
  call: { success: boolean; httpStatus: number | null; durationMs: number | null; error: string | null };
}
