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

describe("copyAgreesWithFacts", () => {
  const facts = {
    ...emptyClientFacts("c1"),
    value: 126_919,
    loanBalance: 68_536,
    equityDollars: 58_383,
    equityPct: 0.46,
    ltvPct: 54,
    tenureYears: 22,
    equityActionable: true,
  };

  it("rejects a legacy agent opener with financing language and a stale number", () => {
    const r = copyAgreesWithFacts(
      "You have $216,020 in equity and 23.7% LTV — consider a HELOC.",
      facts,
      "agent",
    );
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("heloc");
    expect(r.violations).toContain("ltv");
  });

  it("accepts a relationship-first agent opener using canonical numbers", () => {
    const r = copyAgreesWithFacts(
      "Hi Kevin — you've been there 22 years and built about $58K in estimated equity. Want a value update?",
      facts,
      "agent",
    );
    expect(r.ok).toBe(true);
  });

  it("lets a lender state balance and LTV but still blocks invented numbers", () => {
    expect(copyAgreesWithFacts("Estimated LTV 54% on a $68,536 balance.", facts, "lender").ok).toBe(
      true,
    );
    expect(copyAgreesWithFacts("Estimated equity of $216,020.", facts, "lender").ok).toBe(false);
  });

  it("falls back to the deterministic seed when copy fails", () => {
    const n = buildNarrative({ role: "agent", facts, categories: ["heloc"], firstName: "Kevin" });
    expect(safeOpener("Consider a cash-out refinance.", n, facts, "agent")).toBe(n.openerSeed);
    expect(safeOpener(null, n, facts, "agent")).toBe(n.openerSeed);
  });
});
