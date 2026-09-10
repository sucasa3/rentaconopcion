/**
 * ONE place that decides the current mortgage position of a property.
 *
 * BatchData cannot cleanly prove that a home is owned free and clear, so we
 * classify what the records actually support and nothing more:
 *
 *   confirmed_open   current open lien(s) are actually present
 *   likely_paid_off  no current open lien + a prior mortgage trail + no
 *                    recent-sale recording lag concern
 *   unconfirmed      insufficient evidence either way
 *
 * The same module also reconstructs the provider's internal valuation from a
 * current loan position. Pure, no IO — safe on the client.
 */

export type LienStatus = "confirmed_open" | "likely_paid_off" | "unconfirmed";

/** Mortgage recording can lag a sale; a conservative window for that lag. */
export const SALE_LAG_DAYS = 120;

function pos(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

function daysSince(date: string | null | undefined, now: Date): number | null {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (now.getTime() - t) / 86_400_000);
}

export interface LienStatusInput {
  /** provider-reported count of CURRENT open liens */
  openLienCount?: number | null;
  /** current open liens only — never historical records */
  liens?: Array<unknown> | null;
  /** historical mortgage records: evidence of a payoff trail only */
  history?: Array<unknown> | null;
  /** most recent recorded sale, used only for the zero-lien lag guardrail */
  lastSaleDate?: string | null;
  now?: Date;
}

/**
 * Order matters: a genuine current open lien always wins. A recent sale can
 * only make a ZERO-lien record ambiguous — it never downgrades a real lien.
 */
export function classifyLienStatus(input: LienStatusInput): LienStatus {
  const now = input.now ?? new Date();
  const lienRows = (input.liens ?? []).filter(Boolean);
  const count = input.openLienCount ?? null;

  if ((count ?? 0) > 0 || lienRows.length > 0) return "confirmed_open";

  // From here on there are no current open liens on record.
  const saleAge = daysSince(input.lastSaleDate, now);
  if (saleAge != null && saleAge <= SALE_LAG_DAYS) return "unconfirmed";

  const hasTrail = (input.history ?? []).filter(Boolean).length > 0;
  if (count === 0 && hasTrail) return "likely_paid_off";

  return "unconfirmed";
}

/** LTV may arrive as a percentage (20) or a fraction (0.20). */
export function ltvFraction(ltv: number | null | undefined): number | null {
  const v = pos(ltv ?? null);
  if (v == null) return null;
  const f = v > 1.5 ? v / 100 : v;
  if (f < 0.05 || f > 1.25) return null;
  return f;
}

export interface MortgageImpliedInput {
  openLienCount?: number | null;
  /** CURRENT open balance only — never an original/historical loan amount */
  currentBalance?: number | null;
  ltv?: number | null;
}

/**
 * Reconstructs the provider's own valuation: current open balance divided by
 * the LTV they reported against it. Requires all three of exactly one current
 * open lien, a positive current balance, and a valid LTV.
 */
export function mortgageImpliedValue(input: MortgageImpliedInput): number | null {
  if (input.openLienCount !== 1) return null;
  const balance = pos(input.currentBalance);
  if (balance == null) return null;
  const f = ltvFraction(input.ltv);
  if (f == null) return null;
  return Math.round(balance / f);
}
