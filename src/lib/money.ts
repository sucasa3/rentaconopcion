/**
 * Canonical money units.
 *
 * SuCasa stores money in two different shapes depending on where it came from:
 *
 *   - uploaded lender loan data  → whole cents  (e.g. loan_amount_at_close_cents)
 *   - saved property records     → whole dollars (AVM, tax and mortgage extracts)
 *
 * Every lender-facing figure must be converted to `Cents` **at the adapter
 * boundary where the source is known**, never guessed downstream. `Cents` is a
 * branded type, so a value that has already been normalized cannot be passed
 * back into `centsFromDollars` — that is a compile error, which is what stops
 * this class of bug from being reintroduced.
 */

declare const CENTS: unique symbol;

/** A money amount already normalized to whole cents. */
export type Cents = number & { readonly [CENTS]: true };

/** A plain number that has NOT been normalized yet. Rejects `Cents`. */
type Unnormalized = number & { readonly [CENTS]?: undefined };

type Nullish = null | undefined;

function finite(v: number | Nullish): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Normalize a whole-dollar amount (property records, AVM, tax, mortgage
 * extracts). Passing an already-normalized `Cents` value is a type error.
 */
export function centsFromDollars(value: Unnormalized | Nullish): Cents | null {
  const n = finite(value as number | Nullish);
  return n == null ? null : (Math.round(n * 100) as Cents);
}

/**
 * Mark an amount that is already stored in cents (uploaded loan columns, or a
 * helper that documents a cents return). Idempotent and safe to re-apply.
 */
export function centsFromCents(value: number | Cents | Nullish): Cents | null {
  const n = finite(value as number | Nullish);
  return n == null ? null : (Math.round(n) as Cents);
}

/** Whole dollars, for AI facts and any API that speaks dollars. */
export function toDollars(value: Cents | Nullish): number | null {
  return value == null ? null : Math.round(value / 100);
}

/** Display string. The single place a lender-facing amount is formatted. */
export function formatMoney(value: Cents | Nullish, fallback = "—"): string {
  const d = toDollars(value);
  return d == null ? fallback : `$${d.toLocaleString()}`;
}

/** Subtraction that stays in the canonical unit. */
export function subtractCents(a: Cents | Nullish, b: Cents | Nullish): Cents | null {
  return a == null || b == null ? null : ((a - b) as Cents);
}
