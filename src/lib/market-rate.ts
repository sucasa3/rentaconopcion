/**
 * The comparison rate used for every refinance savings estimate in SuCasa.
 *
 * There is exactly one default: the latest observed market benchmark (Freddie
 * Mac PMMS 30-year fixed), stored in `market_rates` with its source and as-of
 * date. A lender may replace it with their own scenario rate for their own
 * organization; a scenario rate carries the moment it was set and goes stale
 * after a week so nobody quotes savings off a rate they set and forgot.
 *
 * This module is client-safe: constants, types and formatting only.
 */

/** The series we treat as "the market rate". */
export const BENCHMARK_SERIES = "pmms30";

/** A lender scenario rate must be reconfirmed after this many days. */
export const SCENARIO_STALE_DAYS = 7;

/** Anything outside this band is a bad observation, not a market move. */
export const RATE_MIN = 2;
export const RATE_MAX = 15;

export function isPlausibleRate(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= RATE_MIN && n <= RATE_MAX;
}

export interface BenchmarkRate {
  /** The rate every savings calculation on this surface should use. */
  ratePct: number;
  kind: "market" | "lender_scenario";
  /** Short human label: "Market benchmark" or the lender's own label. */
  label: string;
  /** Where the number came from. */
  source: string;
  /** Observation date (market) or the date it was set (scenario), ISO. */
  asOf: string;
  /** When a lender set their scenario rate, ISO timestamp. */
  setAt: string | null;
  /** A scenario rate older than SCENARIO_STALE_DAYS needs reconfirming. */
  stale: boolean;
  staleDays: number | null;
  /** The market benchmark, always carried so a scenario can be compared/cleared. */
  marketRatePct: number | null;
  marketAsOf: string | null;
  marketSource: string | null;
}

export function daysSince(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

export function scenarioIsStale(setAt: string | null | undefined, now: number = Date.now()): boolean {
  const d = daysSince(setAt, now);
  return d == null || d > SCENARIO_STALE_DAYS;
}

/** "as of Sep 3, 2026" */
export function asOfLabel(iso: string | null | undefined): string {
  if (!iso) return "date unknown";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "date unknown";
  return `as of ${d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}

/** One line under any savings figure: which rate produced it and how old it is. */
export function benchmarkCaption(b: BenchmarkRate | null | undefined): string {
  if (!b) return "";
  const rate = `${b.ratePct.toFixed(2)}%`;
  if (b.kind === "market") return `${b.label} ${rate} · ${b.source} · ${asOfLabel(b.asOf)}`;
  const set = `set ${asOfLabel(b.setAt ?? b.asOf).replace("as of ", "")}`;
  return `${b.label} ${rate} · your scenario rate · ${set}${b.stale ? " · needs confirming" : ""}`;
}

/** The estimate disclaimer that must accompany any borrower savings figure. */
export const SAVINGS_DISCLAIMER =
  "Estimate only, based on the comparison rate shown and standard amortization (principal & interest). Not a rate offer or an approval.";

/** Provenance stored alongside anything we generate or send. */
export interface RateProvenance {
  benchmark_rate_pct: number;
  benchmark_as_of: string;
  benchmark_source: string;
}

export function provenanceOf(b: BenchmarkRate): RateProvenance {
  return {
    benchmark_rate_pct: b.ratePct,
    benchmark_as_of: b.asOf.slice(0, 10),
    benchmark_source: b.kind === "market" ? b.source : `${b.label} (lender scenario rate)`,
  };
}
