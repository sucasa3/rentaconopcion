/**
 * Server side of the comparison rate: read the stored market benchmark,
 * apply a lender's scenario rate when they have set one, and refresh the
 * benchmark from Freddie Mac's published weekly survey.
 *
 * Nothing here ever invents a rate. If no verified observation is stored the
 * caller gets a thrown error and the surface says so out loud.
 */

import {
  BENCHMARK_SERIES,
  isPlausibleRate,
  scenarioIsStale,
  daysSince,
  type BenchmarkRate,
} from "@/lib/market-rate";

const PMMS_URL = "https://www.freddiemac.com/pmms/docs/PMMS_history.csv";
const PMMS_SOURCE = "Freddie Mac PMMS 30-year fixed";

export class MarketRateUnavailableError extends Error {
  constructor() {
    super(
      "No verified market benchmark rate is on file. Savings estimates are paused until the weekly rate refresh succeeds.",
    );
    this.name = "MarketRateUnavailableError";
  }
}

export interface MarketRateRow {
  ratePct: number;
  asOf: string;
  source: string;
  fetchedAt: string;
}

let cached: { at: number; row: MarketRateRow } | null = null;
const CACHE_MS = 5 * 60_000;

/** The most recent stored observation. Throws when there is none. */
export async function latestMarketRate(force = false): Promise<MarketRateRow> {
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.row;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("market_rates")
    .select("rate_pct, as_of_date, source, fetched_at")
    .eq("series_key", BENCHMARK_SERIES)
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const rate = data ? Number(data.rate_pct) : null;
  if (!data || !isPlausibleRate(rate)) throw new MarketRateUnavailableError();

  const row: MarketRateRow = {
    ratePct: rate,
    asOf: String(data.as_of_date).slice(0, 10),
    source: data.source,
    fetchedAt: data.fetched_at,
  };
  cached = { at: Date.now(), row };
  return row;
}

/** Just the number, for signal thresholds that only need a comparison point. */
export async function marketRatePct(): Promise<number> {
  return (await latestMarketRate()).ratePct;
}

/** Same, but never throws — signals fall back to equity-only rules. */
export async function marketRatePctOrNull(): Promise<number | null> {
  try {
    return await marketRatePct();
  } catch {
    return null;
  }
}

function marketBenchmark(m: MarketRateRow): BenchmarkRate {
  return {
    ratePct: m.ratePct,
    kind: "market",
    label: "Market benchmark",
    source: m.source,
    asOf: m.asOf,
    setAt: null,
    stale: false,
    staleDays: null,
    marketRatePct: m.ratePct,
    marketAsOf: m.asOf,
    marketSource: m.source,
  };
}

/**
 * The rate a given surface should use. With an org id, a scenario rate set by
 * that lender wins — but it is always labelled, dated, and flagged when stale.
 * Homeowner surfaces pass no org and always get the market benchmark.
 */
export async function resolveBenchmark(orgId?: string | null): Promise<BenchmarkRate> {
  const market = await latestMarketRate();
  if (!orgId) return marketBenchmark(market);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("lender_orgs")
    .select("scenario_rate_pct, scenario_rate_label, scenario_rate_set_at")
    .eq("id", orgId)
    .maybeSingle();

  const scenario = data?.scenario_rate_pct != null ? Number(data.scenario_rate_pct) : null;
  if (!isPlausibleRate(scenario)) return marketBenchmark(market);

  const setAt = data?.scenario_rate_set_at ?? null;
  return {
    ratePct: scenario,
    kind: "lender_scenario",
    label: data?.scenario_rate_label?.trim() || "Lender scenario rate",
    source: "Set by your team",
    asOf: (setAt ?? market.asOf).slice(0, 10),
    setAt,
    stale: scenarioIsStale(setAt),
    staleDays: daysSince(setAt),
    marketRatePct: market.ratePct,
    marketAsOf: market.asOf,
    marketSource: market.source,
  };
}

// ---------------------------------------------------------------------------
// Refresh from the published weekly survey
// ---------------------------------------------------------------------------

/** Last observation in the PMMS history file: { asOf: 'YYYY-MM-DD', ratePct }. */
export function parsePmmsCsv(csv: string): { asOf: string; ratePct: number } | null {
  const lines = csv.trim().split(/\r?\n/);
  for (let i = lines.length - 1; i > 0; i -= 1) {
    const cols = (lines[i] ?? "").split(",");
    const rate = Number((cols[1] ?? "").trim());
    const parts = (cols[0] ?? "").trim().split("/");
    if (!isPlausibleRate(rate) || parts.length !== 3) continue;
    const [m, d, y] = parts;
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (Number.isNaN(Date.parse(iso))) continue;
    return { asOf: iso, ratePct: rate };
  }
  return null;
}

export interface RefreshResult {
  status: "stored" | "unchanged" | "throttled" | "rejected";
  ratePct: number | null;
  asOf: string | null;
  detail?: string;
}

/** Minimum gap between real fetches, so the endpoint can't be hammered. */
const MIN_REFRESH_GAP_MS = 6 * 3600_000;

export async function refreshMarketRate(opts: { force?: boolean } = {}): Promise<RefreshResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: last } = await supabaseAdmin
    .from("market_rates")
    .select("as_of_date, rate_pct, fetched_at")
    .eq("series_key", BENCHMARK_SERIES)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!opts.force && last?.fetched_at) {
    const age = Date.now() - Date.parse(last.fetched_at);
    if (age >= 0 && age < MIN_REFRESH_GAP_MS) {
      return {
        status: "throttled",
        ratePct: Number(last.rate_pct),
        asOf: String(last.as_of_date).slice(0, 10),
      };
    }
  }

  let csv: string;
  try {
    const res = await fetch(PMMS_URL, { headers: { accept: "text/csv" } });
    if (!res.ok) return { status: "rejected", ratePct: null, asOf: null, detail: `HTTP ${res.status}` };
    csv = await res.text();
  } catch (e) {
    return { status: "rejected", ratePct: null, asOf: null, detail: (e as Error).message };
  }

  const parsed = parsePmmsCsv(csv);
  if (!parsed) return { status: "rejected", ratePct: null, asOf: null, detail: "no usable observation" };

  // Never move the benchmark backwards in time.
  if (last?.as_of_date && parsed.asOf <= String(last.as_of_date).slice(0, 10)) {
    await supabaseAdmin
      .from("market_rates")
      .update({ fetched_at: new Date().toISOString() })
      .eq("series_key", BENCHMARK_SERIES)
      .eq("as_of_date", String(last.as_of_date).slice(0, 10));
    cached = null;
    return { status: "unchanged", ratePct: Number(last.rate_pct), asOf: String(last.as_of_date).slice(0, 10) };
  }

  const { error } = await supabaseAdmin.from("market_rates").upsert(
    {
      series_key: BENCHMARK_SERIES,
      rate_pct: parsed.ratePct,
      as_of_date: parsed.asOf,
      source: PMMS_SOURCE,
      source_url: PMMS_URL,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "series_key,as_of_date" },
  );
  if (error) return { status: "rejected", ratePct: null, asOf: null, detail: error.message };

  cached = null;
  return { status: "stored", ratePct: parsed.ratePct, asOf: parsed.asOf };
}
