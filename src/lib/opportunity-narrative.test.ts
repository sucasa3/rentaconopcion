import { describe, expect, it } from "vitest";
import { buildNarrative, narrativeFactSheet } from "./opportunity-narrative";
import { assertFactsConsistent, emptyClientFacts, type ClientFacts } from "./client-facts";

/** Kevin-shaped facts: long tenure, small home, meaningful equity. */
const kevin: ClientFacts = {
  ...emptyClientFacts("kevin"),
  value: 265_000,
  loanBalance: 143_000,
  equityDollars: 122_000,
  equityPct: 0.46,
  ltvPct: 54,
  ratePct: 4.25,
  tenureYears: 21.6,
  beds: 1,
  sqft: 625,
  equityActionable: true,
  hasRecord: true,
};

const FORBIDDEN_FOR_AGENTS = [
  "heloc",
  "home equity line",
  "cash-out",
  "cash out",
  "refinanc",
  "qualify",
  "approved",
  "loan-to-value",
  "ltv",
];

const OVERCLAIMS = ["likely outgrown", "prime candidate", "needs more space", "ready to move"];

const allText = (n: ReturnType<typeof buildNarrative>) =>
  [
    n.headline,
    n.whyNow,
    n.whyItMatters,
    n.howToBeUseful,
    n.cta,
    n.openerSeed,
    ...n.supportingSignals,
  ]
    .join(" ")
    .toLowerCase();

describe("agent narratives", () => {
  it("turns financing detections into a relationship play", () => {
    const n = buildNarrative({
      role: "agent",
      facts: kevin,
      categories: ["heloc", "equity", "mortgage_age"],
      firstName: "Kevin",
    });
    expect(n.headline).toBe("Possible move-up / future-plans conversation");
    for (const bad of FORBIDDEN_FOR_AGENTS) expect(allText(n)).not.toContain(bad);
  });

  it("keeps financing as a secondary signal only", () => {
    const n = buildNarrative({
      role: "agent",
      facts: kevin,
      categories: ["heloc"],
      firstName: "Kevin",
    });
    expect(n.secondarySignals.join(" ")).toContain("equity");
    expect(n.secondarySignals.length).toBeLessThanOrEqual(2);
  });

  it("never overclaims that a home has been outgrown", () => {
    const n = buildNarrative({ role: "agent", facts: kevin, categories: ["move_up"] });
    for (const bad of OVERCLAIMS) expect(allText(n)).not.toContain(bad);
  });

  it("tells exactly one primary story when many signals exist", () => {
    const n = buildNarrative({
      role: "agent",
      facts: kevin,
      categories: ["heloc", "equity", "move_up", "mortgage_age", "market_activity"],
    });
    expect(n.headline).toBe("Possible move-up / future-plans conversation");
    expect(n.supportingSignals.length).toBeGreaterThan(1);
  });

  it("surfaces supporting signals from canonical facts only", () => {
    const n = buildNarrative({ role: "agent", facts: kevin, categories: ["move_up"] });
    expect(n.supportingSignals).toContain("21.6 years owned");
    expect(n.supportingSignals).toContain("625 sq ft");
    expect(n.supportingSignals).toContain("1 bedroom");
  });

  it("leads with an explicit homeowner request", () => {
    const n = buildNarrative({
      role: "agent",
      facts: kevin,
      categories: ["heloc"],
      homeownerRequested: true,
      requestTopic: "financing",
    });
    expect(n.headline).toBe("Homeowner asked for help");
    expect(n.complianceNote).toContain("licensed mortgage professional");
  });

  it("is deterministic", () => {
    const input = { role: "agent" as const, facts: kevin, categories: ["heloc"] };
    expect(buildNarrative(input)).toEqual(buildNarrative(input));
  });
});

describe("lender narratives", () => {
  it("keeps financing primary with compliance language", () => {
    const n = buildNarrative({
      role: "lender",
      facts: kevin,
      categories: ["heloc"],
      firstName: "Kevin",
    });
    expect(n.headline).toBe("Equity / HELOC review");
    expect(n.complianceNote).toContain("subject to qualification");
  });

  it("reads the same facts as the agent view", () => {
    const a = buildNarrative({ role: "agent", facts: kevin, categories: ["heloc"] });
    const l = buildNarrative({ role: "lender", facts: kevin, categories: ["heloc"] });
    expect(a.supportingSignals).toEqual(l.supportingSignals);
    expect(a.headline).not.toEqual(l.headline);
  });
});

describe("canonical facts", () => {
  it("omits suppressed equity from the AI fact sheet", () => {
    const sheet = narrativeFactSheet({ ...kevin, equityActionable: false });
    expect(sheet["estimated equity"]).toBeUndefined();
    expect(sheet["estimated value"]).toBe("$265,000");
  });

  it("fails loudly when a surface renders a different number", () => {
    expect(() => assertFactsConsistent("test card", kevin, { equityDollars: 216_000 })).toThrow();
    expect(() => assertFactsConsistent("test card", kevin, { equityDollars: 122_000 })).not.toThrow();
  });
});
