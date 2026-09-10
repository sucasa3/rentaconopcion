import { describe, it, expect } from "vitest";
import {
  asOfLabel,
  benchmarkCaption,
  daysSince,
  isPlausibleRate,
  provenanceOf,
  scenarioIsStale,
  SCENARIO_STALE_DAYS,
  type BenchmarkRate,
} from "@/lib/market-rate";
import { parsePmmsCsv } from "@/lib/market-rate.server";
import { estimateRefiSavings } from "@/lib/refi";
import { deriveSignals } from "@/lib/opportunities";

const NOW = Date.parse("2026-09-10T12:00:00Z");

function scenario(setAt: string | null): BenchmarkRate {
  return {
    ratePct: 5.75,
    kind: "lender_scenario",
    label: "FHA scenario",
    source: "Set by your team",
    asOf: "2026-09-01",
    setAt,
    stale: scenarioIsStale(setAt, NOW),
    staleDays: daysSince(setAt, NOW),
    marketRatePct: 6.71,
    marketAsOf: "2026-09-03",
    marketSource: "Freddie Mac PMMS 30-year fixed",
  };
}

describe("scenario rate staleness", () => {
  it("is fresh inside the confirmation window", () => {
    expect(scenarioIsStale("2026-09-05T00:00:00Z", NOW)).toBe(false);
  });

  it("goes stale after the window", () => {
    expect(scenarioIsStale("2026-08-25T00:00:00Z", NOW)).toBe(true);
    expect(daysSince("2026-08-25T00:00:00Z", NOW)).toBeGreaterThan(SCENARIO_STALE_DAYS);
  });

  it("treats a missing set date as stale rather than trusted", () => {
    expect(scenarioIsStale(null, NOW)).toBe(true);
  });

  it("says out loud when a scenario rate needs confirming", () => {
    expect(benchmarkCaption(scenario("2026-08-01T00:00:00Z"))).toContain("needs confirming");
    expect(benchmarkCaption(scenario("2026-09-09T00:00:00Z"))).not.toContain("needs confirming");
  });
});

describe("provenance", () => {
  it("keeps the rate, date and source that produced a figure", () => {
    const p = provenanceOf(scenario("2026-09-09T00:00:00Z"));
    expect(p).toEqual({
      benchmark_rate_pct: 5.75,
      benchmark_as_of: "2026-09-09",
      benchmark_source: "FHA scenario (lender scenario rate)",
    });
  });

  it("labels a market observation with its published source", () => {
    const market: BenchmarkRate = {
      ratePct: 6.71,
      kind: "market",
      label: "Market benchmark",
      source: "Freddie Mac PMMS 30-year fixed",
      asOf: "2026-09-03",
      setAt: null,
      stale: false,
      staleDays: null,
      marketRatePct: 6.71,
      marketAsOf: "2026-09-03",
      marketSource: "Freddie Mac PMMS 30-year fixed",
    };
    expect(provenanceOf(market).benchmark_source).toBe("Freddie Mac PMMS 30-year fixed");
    expect(asOfLabel(market.asOf)).toBe("as of Sep 3, 2026");
  });
});

describe("no invented rate", () => {
  it("produces no savings estimate without a comparison rate", () => {
    expect(estimateRefiSavings(300_000, 7.5, null)).toBeNull();
    expect(estimateRefiSavings(300_000, 7.5, 6.71)?.monthlySavings).toBeGreaterThan(0);
  });

  it("raises no rate-based opportunity without a comparison rate", () => {
    const base = {
      loanAtCloseCents: 30_000_000,
      ratePct: 7.75,
      termMonths: 360,
      closeDate: "2020-01-01",
      now: new Date(NOW),
    };
    const without = deriveSignals(base);
    expect(without.benchmarkRate).toBeNull();
    expect(without.savingsPerMonth).toBe(0);

    const with_ = deriveSignals({ ...base, benchmarkRate: 6.71 });
    expect(with_.savingsPerMonth).toBeGreaterThan(0);
  });

  it("rejects implausible observations", () => {
    expect(isPlausibleRate(0)).toBe(false);
    expect(isPlausibleRate(97)).toBe(false);
    expect(isPlausibleRate(6.71)).toBe(true);
  });
});

describe("published survey parsing", () => {
  it("takes the most recent usable observation", () => {
    const csv = [
      "date,pmms30,pmms30p,pmms15,pmms15p",
      "8/27/2026,6.56,0.6,5.80,0.6",
      "9/3/2026,6.71,0.6,5.90,0.6",
      "9/10/2026,,,,",
    ].join("\n");
    expect(parsePmmsCsv(csv)).toEqual({ asOf: "2026-09-03", ratePct: 6.71 });
  });

  it("returns nothing rather than a guess when the file is unusable", () => {
    expect(parsePmmsCsv("date,pmms30\nnonsense,abc")).toBeNull();
  });
});
