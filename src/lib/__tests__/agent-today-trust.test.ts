import { describe, it, expect } from "vitest";
import { estimateHomeValue, isOfferGrade } from "@/lib/value-engine";
import { evaluateHome } from "@/lib/signals";
import { contactKeyFor, rankScore } from "@/lib/next-best-action";
import { ownerNameMismatch } from "@/lib/client-facts.server";
import type { HomeRecord } from "@/lib/home-record";

describe("value engine — wide disagreement guard", () => {
  // Eduardo Soto's 1292 Monfort Rd record: sold 5 months ago for $105,000,
  // recorded loan $48,827 at a reported 15.5643% LTV (implying ~$313,712),
  // assessor market total $308,100.
  it("drops to review-only confidence when a recent sale contradicts the loan-implied value", () => {
    const r = estimateHomeValue({
      state: "GA",
      now: new Date("2026-10-22"),
      sales: { lastSalePrice: 105_000, lastSaleDate: "2026-05-11" },
      mortgage: { openLienCount: 1, currentBalance: 48_827, ltv: 15.5643 },
      tax: { marketTotal: 308_100, taxYear: 2025 },
    });
    expect(r.confidence).toBe("low");
    expect(isOfferGrade(r)).toBe(false);
    expect(r.reason).toMatch(/rough estimate/i);
  });

  it("keeps high confidence when independent signals agree", () => {
    const r = estimateHomeValue({
      state: "FL",
      sales: { lastSalePrice: 900_000, lastSaleDate: new Date().toISOString().slice(0, 10) },
      mortgage: { openLienCount: 1, currentBalance: 219_000, ltv: 20 },
    });
    expect(r.kind).toBe("mortgage_implied");
    expect(r.confidence).not.toBe("low");
    expect(isOfferGrade(r)).toBe(true);
  });
});

describe("signal engine — year-built guesses never become priorities", () => {
  const recordWith = (source: "year_built" | "logged"): HomeRecord =>
    ({
      asOf: new Date().toISOString(),
      staleClasses: [],
      property: { address: "1 Main St", lastSalePrice: null, lastSaleDate: null },
      financial: { value: { value: null }, refiSignal: null },
      physical: {
        overdue: [
          {
            key: "water_heater",
            label: "Water heater",
            yearsLeft: -6,
            installedYear: 1998,
            expectedYear: 2010,
            source,
            category: "plumbing",
          },
        ],
        dueSoon: [],
        findings: [],
        openFindings: 0,
        timeline: [],
        documentCount: 0,
        serviceLogCount: 0,
      },
      behavior: { valueChecks30d: 0, equityChecks30d: 0, openRequests: 0, sellingIntent: null },
      completeness: { sections: [] },
    }) as unknown as HomeRecord;

  it("caps an age estimate from the year built below the strong band", () => {
    const { signals } = evaluateHome(recordWith("year_built"));
    const s = signals.find((x) => x.type === "component_overdue")!;
    // 44 stays under the opportunity engine's 45-point "moderate" threshold,
    // so a guess can never surface as more than an emerging reminder.
    expect(s.score).toBeLessThanOrEqual(44);
    expect(s.strength).not.toBe("high");
  });

  it("keeps a logged installation date as a real condition signal", () => {
    const { signals } = evaluateHome(recordWith("logged"));
    const s = signals.find((x) => x.type === "component_overdue")!;
    expect(s.score).toBeGreaterThan(70);
    expect(s.strength).toBe("high");
  });
});

describe("ranking — no never-contacted bonus", () => {
  it("scores a never-contacted record the same as a long-quiet one", () => {
    const never = rankScore({ score: 60, strength: "moderate", engagedRecently: false, daysSinceContact: null });
    const quiet = rankScore({ score: 60, strength: "moderate", engagedRecently: false, daysSinceContact: 45 });
    expect(never).toBe(64);
    expect(never).toBe(quiet);
  });
});

describe("contact identity", () => {
  it("groups two property rows with the same email as one person", () => {
    const a = contactKeyFor({ client_name: "Eduardo Soto", client_email: "ed@example.com", client_phone: null });
    const b = contactKeyFor({ client_name: "Eduardo Soto", client_email: "ED@example.com", client_phone: "5551112222" });
    expect(a).toBe(b);
  });

  it("does not merge different people who share a name", () => {
    const a = contactKeyFor({ client_name: "Jose Garcia", client_email: "jose1@example.com" });
    const b = contactKeyFor({ client_name: "Jose Garcia", client_email: "jose2@example.com" });
    expect(a).not.toBe(b);
  });
});

describe("owner mismatch", () => {
  it("flags a record that clearly names a different owner", () => {
    expect(ownerNameMismatch("Amalia Manzo", "SEJKO Enterprises LLC")).toBe(true);
  });
  it("accepts matching and partial names", () => {
    expect(ownerNameMismatch("Amalia Manzo", "Amalia Manzo")).toBe(false);
    expect(ownerNameMismatch("Amalia Manzo", "Manzo Family Trust")).toBe(false);
  });
  it("never flags when either name is missing", () => {
    expect(ownerNameMismatch(null, "SEJKO Enterprises LLC")).toBe(false);
    expect(ownerNameMismatch("Amalia Manzo", null)).toBe(false);
  });
});
