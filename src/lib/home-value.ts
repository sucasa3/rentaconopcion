/**
 * ONE source of truth for "what is this home worth".
 *
 * Every surface (homeowner hero, home intelligence, equity card, home score,
 * assistant, lender + agent portfolios) must resolve value through this so a
 * home can never show a number in one place and a dash in another.
 *
 * The actual reasoning lives in the SuCasa Value Engine
 * (`src/lib/value-engine.ts`), which builds independent candidates from the
 * automated estimate, recent sale, recorded loan data and assessor records.
 */

import {
  estimateHomeValue,
  type ValueEngineInput,
  type ValueEngineResult,
  type ValueConfidence,
} from "@/lib/value-engine";

export type HomeValueSource = "avm" | "assessed" | "sale" | "mortgage" | null;

export interface ResolvedHomeValue {
  value: number | null;
  source: HomeValueSource;
  /** short, user-facing label for where the number came from */
  label: string | null;
  low?: number | null;
  high?: number | null;
  confidence?: ValueConfidence | null;
  /** one plain sentence explaining how we got here */
  reason?: string;
}

export function resolveHomeValue(input: ValueEngineInput): ResolvedHomeValue {
  return homeValueFromResult(estimateHomeValue(input));
}

/**
 * Presentation shape for an ALREADY-computed Value Engine result. Callers that
 * have a result in hand (e.g. the equity ribbon) must use this instead of
 * running the engine a second time, so value and equity can never disagree.
 */
export function homeValueFromResult(r: ValueEngineResult): ResolvedHomeValue {
  const source: HomeValueSource =
    r.kind === "provider_avm"
      ? "avm"
      : r.kind === "recent_sale" || r.kind === "aged_sale"
        ? "sale"
        : r.kind === "mortgage_implied"
          ? "mortgage"
          : r.kind === "assessor"
            ? "assessed"
            : null;

  return {
    value: r.value,
    source,
    label: r.label,
    low: r.low,
    high: r.high,
    confidence: r.confidence,
    reason: r.reason,
  };
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
