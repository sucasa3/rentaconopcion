/**
 * ONE source of truth for "what is this home worth".
 *
 * Every surface (homeowner hero, home intelligence, equity card, home score,
 * assistant, lender + agent portfolios) must resolve value through this so a
 * home can never show a number in one place and a dash in another.
 *
 * Order: automated valuation → assessor market value → assessed total.
 */

export type HomeValueSource = "avm" | "assessed" | null;

export interface ResolvedHomeValue {
  value: number | null;
  source: HomeValueSource;
  /** short, user-facing label for where the number came from */
  label: string | null;
}

export function resolveHomeValue(input: {
  avm?: { estimate?: number | null } | null;
  tax?: { marketTotal?: number | null; assessedTotal?: number | null } | null;
  equity?: { estimatedValue?: number | null } | null;
}): ResolvedHomeValue {
  const avm = input.avm?.estimate ?? null;
  if (avm != null) return { value: avm, source: "avm", label: "Automated estimate" };

  const assessed = input.tax?.marketTotal ?? input.tax?.assessedTotal ?? null;
  if (assessed != null)
    return { value: assessed, source: "assessed", label: "From assessor records" };

  const fromEquity = input.equity?.estimatedValue ?? null;
  if (fromEquity != null)
    return { value: fromEquity, source: "assessed", label: "From assessor records" };

  return { value: null, source: null, label: null };
}

/** Status the UI uses to pick a message instead of rendering a bare dash. */
export type ValueStatus =
  | "resolved"
  | "no_coverage"
  | "incomplete_address"
  | "no_address"
  | "budget_capped";

export function valueStatusMessage(status: ValueStatus): string {
  switch (status) {
    case "no_coverage":
      return "No valuation on public record for this address yet.";
    case "incomplete_address":
      return "Finish your address (city, state and ZIP) so we can match your property records.";
    case "no_address":
      return "Add your home address to see value and equity.";
    case "budget_capped":
      return "Waiting on property records — showing cached data for now.";
    default:
      return "";
  }
}
