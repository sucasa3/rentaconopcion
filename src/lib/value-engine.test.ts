import { describe, expect, it } from "vitest";

import { estimateHomeValue, isOfferGrade } from "./value-engine";

const NOW = new Date("2026-09-06T00:00:00Z");

describe("value engine", () => {
  it("prefers a provider estimate when present", () => {
    const r = estimateHomeValue({
      state: "GA",
      avm: { estimate: 400_000, asOf: "2026-08-01" },
      tax: { marketTotal: 372_000, taxYear: 2025 },
      now: NOW,
    });
    expect(r.kind).toBe("provider_avm");
    expect(r.value).toBe(400_000);
    expect(r.corroborated).toBe(true);
    expect(r.confidence).toBe("high");
  });

  it("reconstructs value from a single lien and reported loan-to-value", () => {
    const r = estimateHomeValue({
      state: "PA",
      tax: { marketTotal: 375_500, taxYear: 2025 },
      mortgage: { openLienCount: 1, totalOpenLienBalance: 241_656, ltv: 70.2 },
      now: NOW,
    });
    expect(r.kind).toBe("mortgage_implied");
    expect(r.value).toBe(344_239);
    expect(isOfferGrade(r)).toBe(true);
  });

  it("will not derive value from multiple liens", () => {
    const r = estimateHomeValue({
      state: "GA",
      tax: { marketTotal: 300_000 },
      mortgage: { openLienCount: 2, totalOpenLienBalance: 200_000, ltv: 0.6 },
      now: NOW,
    });
    expect(r.kind).toBe("assessor");
    expect(r.candidates.some((c) => c.kind === "mortgage_implied")).toBe(false);
  });

  it("treats a recent sale as the market answer", () => {
    const r = estimateHomeValue({
      state: "FL",
      sales: { lastSalePrice: 3_000_000, lastSaleDate: "2026-03-06" },
      tax: { marketTotal: 2_916_590, taxYear: 2025 },
      now: NOW,
    });
    expect(r.kind).toBe("recent_sale");
    expect(r.value).toBeGreaterThan(3_000_000);
  });

  it("ages an old sale forward with low confidence only", () => {
    const r = estimateHomeValue({
      state: "OH",
      sales: { lastSalePrice: 100_000, lastSaleDate: "2010-01-01" },
      now: NOW,
    });
    expect(r.kind).toBe("aged_sale");
    expect(r.confidence).toBe("low");
    expect(isOfferGrade(r)).toBe(false);
  });

  it("returns nothing rather than guessing with no data", () => {
    const r = estimateHomeValue({ now: NOW });
    expect(r.value).toBeNull();
    expect(r.confidence).toBeNull();
  });
});
