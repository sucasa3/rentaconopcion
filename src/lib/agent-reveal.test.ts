import { describe, expect, it } from "vitest";
import {
  agentRevealHeadline,
  agentRevealSupporting,
  anniversaryThisMonth,
  buildAgentReveal,
  primaryGroupOf,
  type AgentRevealClient,
} from "./agent-reveal";

const NOW = new Date("2026-06-15T00:00:00Z");

function client(over: Partial<AgentRevealClient> & { id: string }): AgentRevealClient {
  return { has_intel: true, ...over };
}

describe("primaryGroupOf", () => {
  it("puts a hot band into move signals", () => {
    expect(primaryGroupOf(client({ id: "a", band: "hot" }), NOW)).toBe("move_signals");
  });

  it("treats an expired listing as a move signal even at a low band", () => {
    expect(
      primaryGroupOf(client({ id: "a", band: "nurture", listing: { status: "expired" } }), NOW),
    ).toBe("move_signals");
  });

  it("uses engagement only when real behavior exists", () => {
    expect(
      primaryGroupOf(client({ id: "a", band: "warm", has_behavior: true, engagement_score: 12 }), NOW),
    ).toBe("engagement");
    expect(
      primaryGroupOf(client({ id: "a", band: "warm", has_behavior: false, engagement_score: 12 }), NOW),
    ).toBeNull();
  });

  it("flags a material tax change or a recent permit as a property change", () => {
    expect(primaryGroupOf(client({ id: "a", tax_change_pct: -9 }), NOW)).toBe("property_change");
    expect(primaryGroupOf(client({ id: "b", last_permit_date: "2025-08-01" }), NOW)).toBe(
      "property_change",
    );
    expect(primaryGroupOf(client({ id: "c", tax_change_pct: 1 }), NOW)).toBeNull();
  });

  it("recognizes anniversaries and long tenure", () => {
    expect(primaryGroupOf(client({ id: "a", last_sale_date: "2019-06-02" }), NOW)).toBe("lifecycle");
    expect(primaryGroupOf(client({ id: "b", tenure_years: 9 }), NOW)).toBe("lifecycle");
    expect(anniversaryThisMonth("2026-06-02", NOW)).toBe(false);
  });

  it("falls back to a home-care reason to reach out", () => {
    expect(primaryGroupOf(client({ id: "a", recommendation_count: 2 }), NOW)).toBe("follow_up");
  });

  it("returns null when nothing canonical supports an outreach reason", () => {
    expect(primaryGroupOf(client({ id: "a", band: "nurture", tenure_years: 2 }), NOW)).toBeNull();
  });
});

describe("buildAgentReveal", () => {
  const clients = [
    client({ id: "1", band: "high", move_score: 90 }),
    client({ id: "2", has_behavior: true, engagement_score: 20, move_score: 40 }),
    client({ id: "3", tenure_years: 12, move_score: 30 }),
    client({ id: "4", band: "nurture", tenure_years: 1, has_intel: false }),
  ];

  it("assigns exactly one group per relationship so counts never double", () => {
    const { items, summary } = buildAgentReveal(clients, NOW);
    expect(items.length).toBe(3);
    const total = Object.values(summary.byGroup).reduce((a, b) => a + b, 0);
    expect(total).toBe(summary.opportunities);
    expect(summary.analyzed).toBe(4);
    expect(summary.quiet).toBe(1);
    expect(summary.awaitingRecords).toBe(1);
  });

  it("ranks by the canonical move score", () => {
    const { items } = buildAgentReveal(clients, NOW);
    expect(items.map((i) => i.clientId)).toEqual(["1", "2", "3"]);
  });

  it("never locks anything: every found opportunity is returned", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      client({ id: `c${i}`, band: "hot", move_score: i }),
    );
    expect(buildAgentReveal(many, NOW).items.length).toBe(30);
  });

  it("writes an honest headline when nothing stands out", () => {
    const { summary } = buildAgentReveal([client({ id: "x", tenure_years: 1 })], NOW);
    expect(agentRevealHeadline(summary)).toBe("We analyzed 1 of your past clients");
    expect(agentRevealSupporting(summary)).toContain("Nothing stands out today");
  });

  it("keeps the free-workspace promise in the supporting line", () => {
    const { summary } = buildAgentReveal(clients, NOW);
    expect(agentRevealHeadline(summary)).toContain("3 relationships");
    expect(agentRevealSupporting(summary)).toContain("stay in your free workspace");
  });
});
