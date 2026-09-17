/**
 * Free Lender Opportunity Discovery — pure, client-safe rules.
 *
 * Discovery never scores anything of its own. It reads the canonical
 * opportunity engine's output and does three jobs:
 *
 *   1. decide which uploaded rows are valid, unique properties (the allowance
 *      is spent on properties, never on invalid or duplicate rows),
 *   2. pick ONE primary reason per client so the reveal breakdown is mutually
 *      exclusive and adds up to the headline count,
 *   3. decide which opportunities are solid enough to unlock in full.
 *
 * Compliance: an opportunity is an informational signal that a conversation
 * may be worthwhile. Never a statement of qualification, approval, guaranteed
 * savings, or certainty that a transaction will happen.
 */

import type { OpportunityCategory, OpportunityStrength } from "./opportunities";

export const DISCOVERY_ALLOWANCE = 100;
export const DISCOVERY_REVEAL_LIMIT = 5;

export type DiscoveryStatus =
  | "awaiting_upload"
  | "processing"
  | "complete"
  | "failed";

export type OrgDiscoveryState =
  | "discovery_not_started"
  | "discovery_processing"
  | "discovery_complete"
  | "pilot_available"
  | "paid_active";

// ---------------------------------------------------------------------------
// 1. Intake — the allowance is spent on valid unique properties only
// ---------------------------------------------------------------------------

export interface IntakeRow {
  full_name: string;
  address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  email?: string | null;
  loan_balance_cents?: number | null;
  interest_rate_bps?: number | null;
}

export interface IntakeAccounting {
  submitted: number;
  /** Rows without a usable name or locatable address. */
  invalid: number;
  /** Rows whose property was already counted (in this file or already in the book). */
  duplicate: number;
  /** Valid unique properties beyond the free allowance. */
  overAllowance: number;
  accepted: number;
}

export interface IntakeResult<T> {
  accepted: T[];
  accounting: IntakeAccounting;
}

/** A property can only be looked up when we can place it on a map. */
export function rowIsValid(row: IntakeRow): boolean {
  if (!row.full_name || !row.full_name.trim()) return false;
  const street = (row.address ?? "").trim();
  if (street.length < 4) return false;
  const hasCityState = Boolean(row.city?.trim() && row.state?.trim());
  const hasZip = Boolean(row.zip?.trim());
  return hasCityState || hasZip;
}

/** Same normalization the property cache uses, so one home is one property. */
export function propertyKey(row: IntakeRow): string {
  return [row.address, row.city, [row.state, row.zip].filter(Boolean).join(" ")]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Spend the allowance on valid, unique, not-already-present properties and
 * report exactly what was excluded and why.
 */
export function planIntake<T extends IntakeRow>(
  rows: T[],
  opts: { allowance?: number; existingKeys?: Iterable<string> } = {},
): IntakeResult<T> {
  const allowance = opts.allowance ?? DISCOVERY_ALLOWANCE;
  const seen = new Set<string>(opts.existingKeys ?? []);
  const accounting: IntakeAccounting = {
    submitted: rows.length,
    invalid: 0,
    duplicate: 0,
    overAllowance: 0,
    accepted: 0,
  };
  const accepted: T[] = [];

  for (const row of rows) {
    if (!rowIsValid(row)) {
      accounting.invalid += 1;
      continue;
    }
    const key = propertyKey(row);
    if (seen.has(key)) {
      accounting.duplicate += 1;
      continue;
    }
    seen.add(key);
    if (accepted.length >= allowance) {
      accounting.overAllowance += 1;
      continue;
    }
    accepted.push(row);
  }

  accounting.accepted = accepted.length;
  return { accepted, accounting };
}

// ---------------------------------------------------------------------------
// 2. One primary reason per client → a breakdown that adds up
// ---------------------------------------------------------------------------

export const DISCOVERY_GROUPS = ["mortgage_review", "equity", "plans", "other"] as const;
export type DiscoveryGroup = (typeof DISCOVERY_GROUPS)[number];

export const GROUP_LABEL: Record<DiscoveryGroup, string> = {
  mortgage_review: "Mortgage reviews",
  equity: "Equity conversations",
  plans: "Plans and timing",
  other: "Other signals",
};

export const GROUP_BLURB: Record<DiscoveryGroup, string> = {
  mortgage_review: "Loan facts suggest a review of the current mortgage may be worthwhile.",
  equity: "Estimated equity has moved enough that an equity conversation may be worthwhile.",
  plans: "Signals suggest the homeowner's plans for the home may be changing.",
  other: "Other property or engagement signals worth a look.",
};

const GROUP_OF: Record<OpportunityCategory, DiscoveryGroup> = {
  refinance_review: "mortgage_review",
  mortgage_review: "mortgage_review",
  mortgage_age: "mortgage_review",
  equity: "equity",
  heloc: "equity",
  free_and_clear: "equity",
  move_up: "plans",
  investment: "plans",
  recent_purchase: "plans",
  market_timing: "plans",
  home_condition: "other",
  permit_activity: "other",
  distress: "other",
};

export function groupOf(category: OpportunityCategory | string): DiscoveryGroup {
  return GROUP_OF[category as OpportunityCategory] ?? "other";
}

export interface CandidateOpportunity {
  id?: string | null;
  portfolioClientId: string;
  category: OpportunityCategory | string;
  strength: OpportunityStrength | string;
  score: number;
  /** Canonical value confidence behind any dollar figure, when one is quoted. */
  valueConfidence?: "high" | "medium" | "low" | null;
  /** Canonical estimated value in cents, when the record has one. */
  valueCents?: number | null;
}

export interface RankedClient {
  portfolioClientId: string;
  opportunityId: string | null;
  primaryCategory: string;
  primaryGroup: DiscoveryGroup;
  score: number;
  strength: string;
  rank: number;
  revealEligible: boolean;
}

/**
 * A client's primary reason is their single highest-scoring canonical
 * opportunity. Secondary signals are untouched and still shown inside that
 * client's own detail view.
 */
export function rankClients(candidates: CandidateOpportunity[]): RankedClient[] {
  const best = new Map<string, CandidateOpportunity>();
  for (const c of candidates) {
    const current = best.get(c.portfolioClientId);
    if (!current || c.score > current.score) best.set(c.portfolioClientId, c);
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .map((c, i) => ({
      portfolioClientId: c.portfolioClientId,
      opportunityId: c.id ?? null,
      primaryCategory: String(c.category),
      primaryGroup: groupOf(c.category),
      score: c.score,
      strength: String(c.strength),
      rank: i + 1,
      revealEligible: revealEligible(c),
    }));
}

/**
 * Only opportunities that already satisfy the canonical data-quality bar are
 * unlocked. Thresholds are never lowered to fill the Top 5 — if only three
 * qualify, three are revealed and the copy says so.
 */
export function revealEligible(c: CandidateOpportunity): boolean {
  if (c.strength === "emerging") return false;
  if (c.score < 45) return false;
  const group = groupOf(c.category);
  if (group === "equity") {
    // A dollar-denominated equity conversation needs a usable canonical value.
    if (c.valueCents == null) return false;
    if (c.valueConfidence === "low") return false;
  }
  return true;
}

export interface DiscoverySummary {
  analyzed: number;
  /** Unique clients with at least one canonical opportunity. */
  clientsWithOpportunities: number;
  /** Mutually exclusive: one primary reason per client; sums to the headline. */
  byGroup: Record<DiscoveryGroup, number>;
  /** Subset flag, reported separately so nothing is double-counted. */
  timeSensitive: number;
  revealable: number;
  previewOnly: number;
}

export function summarize(analyzed: number, ranked: RankedClient[]): DiscoverySummary {
  const byGroup: Record<DiscoveryGroup, number> = {
    mortgage_review: 0,
    equity: 0,
    plans: 0,
    other: 0,
  };
  let timeSensitive = 0;
  for (const r of ranked) {
    byGroup[r.primaryGroup] += 1;
    if (r.strength === "strong") timeSensitive += 1;
  }
  const revealable = Math.min(
    DISCOVERY_REVEAL_LIMIT,
    ranked.filter((r) => r.revealEligible).length,
  );
  return {
    analyzed,
    clientsWithOpportunities: ranked.length,
    byGroup,
    timeSensitive,
    revealable,
    previewOnly: Math.max(0, ranked.length - revealable),
  };
}

/** Which ranked clients get unlocked in full. */
export function revealSelection(ranked: RankedClient[]): RankedClient[] {
  return ranked.filter((r) => r.revealEligible).slice(0, DISCOVERY_REVEAL_LIMIT);
}

// ---------------------------------------------------------------------------
// 3. Reveal copy — truthful at every count
// ---------------------------------------------------------------------------

export function headline(summary: DiscoverySummary): string {
  const n = summary.clientsWithOpportunities;
  if (n === 0) {
    return "We didn't find a signal worth a call in this sample today.";
  }
  if (n === 1) return "We found 1 client worth a closer look today.";
  return `We found ${n} clients worth a closer look today.`;
}

export function supportingLine(summary: DiscoverySummary): string {
  if (summary.clientsWithOpportunities === 0) {
    return "Nothing here is hidden — this sample simply has no signal today. A larger sample usually does.";
  }
  return "These opportunities were already inside your database. SuCasa helped you see them.";
}

/** Internal-only unit economics. Never rendered to a lender. */
export function estimatedCostTenThousandths(
  properties: number,
  perPropertyTenThousandths: number,
): number {
  return Math.max(0, Math.round(properties * perPropertyTenThousandths));
}
