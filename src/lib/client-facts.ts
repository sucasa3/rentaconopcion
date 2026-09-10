/**
 * THE CANONICAL FACT SNAPSHOT for one homeowner in a book of business.
 *
 * Exactly one place in SuCasa decides what a home is worth, what is owed on
 * it, how much equity is in it, how long it has been owned and how big it is:
 * `clientFactsFor()` in `client-facts.server.ts`. Every professional surface —
 * roster, Today card, opportunity card, homeowner detail, listing brief, email
 * draft, text draft, review brief — formats THIS object and never recomputes
 * any of its numbers.
 *
 * This module is client-safe: types, formatters and the development-time
 * consistency check only.
 */

import type { LienStatus } from "@/lib/mortgage-position";

export interface ClientFacts {
  clientId: string;
  /** Estimated market value, whole dollars. Null when we cannot state one. */
  value: number | null;
  valueSource: string | null;
  valueConfidence: "high" | "medium" | "low" | null;
  valueMethodology: string | null;
  /** Estimated remaining loan balance, whole dollars. */
  loanBalance: number | null;
  /** Estimated equity, whole dollars. */
  equityDollars: number | null;
  /** Equity as a share of value, 0–1. */
  equityPct: number | null;
  /** Loan-to-value, percent (e.g. 54.2). */
  ltvPct: number | null;
  /** Recorded note rate, percent. */
  ratePct: number | null;
  /** Years of ownership. */
  tenureYears: number | null;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
  taxAmount: number | null;
  assessedTotal: number | null;
  taxChangePct: number | null;
  permitCount: number;
  lastPermitDate: string | null;
  permitTotalValue: number | null;
  ownerOccupied: boolean | null;
  /** Equity figures are safe enough to act on. */
  equityActionable: boolean;
  /** Why equity is withheld, when it is. */
  suppressionReason: string | null;
  /** No current open mortgage found and a prior mortgage trail exists. */
  freeAndClear: boolean;
  /** Canonical mortgage-position classification. */
  lienStatus: LienStatus;
  multiLien: boolean;
  /** True when there is no cached property record for this address yet. */
  hasRecord: boolean;
}

export function emptyClientFacts(clientId: string): ClientFacts {
  return {
    clientId,
    value: null,
    valueSource: null,
    valueConfidence: null,
    valueMethodology: null,
    loanBalance: null,
    equityDollars: null,
    equityPct: null,
    ltvPct: null,
    ratePct: null,
    tenureYears: null,
    lastSaleDate: null,
    lastSalePrice: null,
    beds: null,
    baths: null,
    sqft: null,
    yearBuilt: null,
    propertyType: null,
    taxAmount: null,
    assessedTotal: null,
    taxChangePct: null,
    permitCount: 0,
    lastPermitDate: null,
    permitTotalValue: null,
    ownerOccupied: null,
    equityActionable: false,
    suppressionReason: null,
    freeAndClear: false,
    lienStatus: "unconfirmed",
    multiLien: false,
    hasRecord: false,
  };
}

// ---------------------------------------------------------------------------
// Formatting — the only sanctioned way to turn a canonical number into words
// ---------------------------------------------------------------------------

export function money(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return `$${Math.round(n).toLocaleString()}`;
}

/** Rounded, conversational form used in openers and drafts: "about $58K". */
export function roughMoney(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  const v = Math.abs(n);
  if (v >= 1_000_000) return `about $${(n / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `about $${Math.round(n / 1000)}K`;
  return `about $${Math.round(n).toLocaleString()}`;
}

export function pct(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return `${Math.round(n)}%`;
}

export function years(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return `${Math.round(n * 10) / 10} yrs owned`;
}

// ---------------------------------------------------------------------------
// Defensive consistency check (development and tests only)
// ---------------------------------------------------------------------------

const NUMERIC_KEYS = [
  "value",
  "loanBalance",
  "equityDollars",
  "equityPct",
  "ltvPct",
  "ratePct",
  "tenureYears",
  "sqft",
  "beds",
  "baths",
  "taxAmount",
] as const;

/**
 * Compare what a surface is about to render against the canonical snapshot.
 * In development and tests a mismatch throws loudly; in production it is
 * logged once and the canonical value wins.
 */
export function assertFactsConsistent(
  surface: string,
  canonical: ClientFacts,
  used: Partial<Record<(typeof NUMERIC_KEYS)[number], number | null | undefined>>,
): void {
  const drift: string[] = [];
  for (const key of NUMERIC_KEYS) {
    if (!(key in used)) continue;
    const a = canonical[key] as number | null;
    const b = used[key] ?? null;
    if (a == null && b == null) continue;
    if (a == null || b == null || Math.abs(a - b) > Math.max(1, Math.abs(a) * 0.005)) {
      drift.push(`${key}: canonical ${a ?? "none"} vs rendered ${b ?? "none"}`);
    }
  }
  if (!drift.length) return;
  const message = `[facts] ${surface} disagrees with the canonical snapshot — ${drift.join("; ")}`;
  const dev =
    typeof process !== "undefined" &&
    (process.env?.["NODE_ENV"] === "development" || process.env?.["NODE_ENV"] === "test");
  if (dev) throw new Error(message);
  console.error(message);
}
