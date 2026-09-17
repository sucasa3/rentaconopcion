import { describe, expect, it } from "vitest";
import {
  DISCOVERY_ALLOWANCE,
  estimatedCostTenThousandths,
  headline,
  planIntake,
  rankClients,
  revealSelection,
  summarize,
  type CandidateOpportunity,
} from "./discovery";

const row = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    full_name: "Jane Doe",
    address: "123 Main St",
    city: "Roswell",
    state: "GA",
    zip: "30075",
    ...over,
  }) as any;

describe("discovery intake", () => {
  it("does not spend the allowance on invalid rows", () => {
    const { accepted, accounting } = planIntake([
      row(),
      row({ full_name: "", address: "9 Oak Ave" }),
      row({ address: "", city: null, state: null, zip: null }),
      row({ address: "45 Pine Rd", city: null, state: null, zip: null }),
    ]);
    expect(accepted).toHaveLength(1);
    expect(accounting.invalid).toBe(3);
    expect(accounting.accepted).toBe(1);
  });

  it("counts one property once, however many rows repeat it", () => {
    const { accepted, accounting } = planIntake([
      row(),
      row({ full_name: "Jane D." }),
      row({ address: "123  main st" }),
      row({ address: "77 Elm St" }),
    ]);
    expect(accepted).toHaveLength(2);
    expect(accounting.duplicate).toBe(2);
  });

  it("skips properties already in the book", () => {
    const { accepted, accounting } = planIntake([row()], {
      existingKeys: ["123 main st, roswell, ga 30075"],
    });
    expect(accepted).toHaveLength(0);
    expect(accounting.duplicate).toBe(1);
  });

  it("accepts up to 100 valid unique properties and reports the rest", () => {
    const rows = Array.from({ length: 130 }, (_, i) => row({ address: `${i + 1} Main St` }));
    const { accepted, accounting } = planIntake(rows);
    expect(accepted).toHaveLength(DISCOVERY_ALLOWANCE);
    expect(accounting.overAllowance).toBe(30);
  });
});

describe("primary reason and breakdown", () => {
  const candidates: CandidateOpportunity[] = [
    { portfolioClientId: "a", category: "refinance_review", strength: "strong", score: 90 },
    { portfolioClientId: "a", category: "equity", strength: "moderate", score: 60, valueCents: 50_000_00 },
    { portfolioClientId: "b", category: "equity", strength: "strong", score: 80, valueCents: 60_000_00, valueConfidence: "high" },
    { portfolioClientId: "c", category: "permit_activity", strength: "emerging", score: 30 },
  ];

  it("gives each client exactly one primary reason", () => {
    const ranked = rankClients(candidates);
    expect(ranked).toHaveLength(3);
    expect(ranked[0].portfolioClientId).toBe("a");
    expect(ranked[0].primaryCategory).toBe("refinance_review");
  });

  it("produces a breakdown that adds up to the headline count", () => {
    const ranked = rankClients(candidates);
    const summary = summarize(100, ranked);
    const sum = Object.values(summary.byGroup).reduce((a, b) => a + b, 0);
    expect(sum).toBe(summary.clientsWithOpportunities);
  });

  it("never reveals more than the number that clears the quality bar", () => {
    const ranked = rankClients(candidates);
    const revealed = revealSelection(ranked);
    expect(revealed).toHaveLength(2);
    expect(revealed.every((r) => r.revealEligible)).toBe(true);
  });

  it("withholds an equity reveal with no canonical value behind it", () => {
    const ranked = rankClients([
      { portfolioClientId: "z", category: "equity", strength: "strong", score: 88 },
    ]);
    expect(ranked[0].revealEligible).toBe(false);
  });

  it("tells the truth when nothing was found", () => {
    const summary = summarize(100, []);
    expect(summary.clientsWithOpportunities).toBe(0);
    expect(headline(summary)).toContain("didn't find");
  });
});

describe("internal unit economics", () => {
  it("uses the configured per-property assumption", () => {
    // 100 properties × $0.0155 = $1.55 → 15_500 ten-thousandths of a dollar
    expect(estimatedCostTenThousandths(100, 155)).toBe(15_500);
  });
});
