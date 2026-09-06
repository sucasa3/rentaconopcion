import { describe, expect, it } from "vitest";
import {
  canAddAgent,
  canAddProfiles,
  canSetAllocation,
  downgradeBlockers,
  recommendPlan,
  summarizePool,
  type PoolInput,
} from "./profile-pool";

const base: PoolInput = {
  planProfiles: 1000,
  planAgentSeats: 10,
  lenderUsed: 180,
  agents: [
    { seatId: "a", agentOrgId: "o1", agentName: "Sofia", allocated: 250, used: 180, status: "active" },
    { seatId: "b", agentOrgId: "o2", agentName: "Ben", allocated: 100, used: 12, status: "active" },
    { seatId: "c", agentOrgId: "o3", agentName: "Cai", allocated: 300, used: 0, status: "ended" },
  ],
};

describe("summarizePool", () => {
  it("counts only live sponsorships", () => {
    const s = summarizePool(base);
    expect(s.totalCapacity).toBe(1000);
    expect(s.agentAllocated).toBe(350);
    expect(s.agentUsed).toBe(192);
    expect(s.available).toBe(470);
    expect(s.agentSeatsUsed).toBe(2);
    expect(s.agentSeatsAvailable).toBe(8);
  });

  it("adds add-on capacity", () => {
    const s = summarizePool({ ...base, addonProfiles: 500, addonAgentSeats: 5 });
    expect(s.totalCapacity).toBe(1500);
    expect(s.agentSeatsCap).toBe(15);
  });

  it("honours an optional lender reserve", () => {
    const s = summarizePool({ ...base, lenderReserve: 400 });
    expect(s.available).toBe(250); // 1000 - 180 used - 350 allocated - 220 unused reserve
  });

  it("flags approaching and hard limits", () => {
    expect(summarizePool({ ...base, lenderUsed: 500 }).approachingLimit).toBe(true);
    expect(summarizePool({ ...base, lenderUsed: 650 }).atLimit).toBe(true);
  });
});

describe("allocation decisions", () => {
  it("refuses to drop below what an agent already uses", () => {
    const d = canSetAllocation(base, "a", 100);
    expect(d.ok).toBe(false);
    expect(d.ok === false && d.reason).toContain("180");
  });

  it("allows raising within the pool and refuses beyond it", () => {
    expect(canSetAllocation(base, "b", 500).ok).toBe(true);
    expect(canSetAllocation(base, "b", 700).ok).toBe(false);
  });

  it("caps the number of sponsored agents", () => {
    const many: PoolInput = {
      ...base,
      planAgentSeats: 2,
    };
    expect(canAddAgent(many, 50).ok).toBe(false);
    expect(canAddAgent(base, 50).ok).toBe(true);
    expect(canAddAgent(base, 900).ok).toBe(false);
  });

  it("blocks new profiles at the hard limit", () => {
    expect(canAddProfiles(base, 100).ok).toBe(true);
    const full = { ...base, lenderUsed: 650 };
    const d = canAddProfiles(full, 1);
    expect(d.ok).toBe(false);
    expect(d.ok === false && d.reason).toMatch(/archive/i);
  });
});

describe("recommendPlan", () => {
  const plans = [
    { key: "agent", name: "Agent", priceCents: 4900, profiles: 250 },
    { key: "agent_growth", name: "Agent Growth", priceCents: 9900, profiles: 1000 },
  ];
  const addon = { key: "profiles_500", name: "+500 Home Profiles", unitQuantity: 500, priceCents: 4900 };

  it("picks the cheapest plan that fits", () => {
    expect(recommendPlan(200, plans, addon)?.summary).toBe("Agent");
  });

  it("adds capacity when no plan alone fits", () => {
    const r = recommendPlan(1420, plans, addon);
    expect(r?.summary).toBe("Agent Growth + 1 × +500 Home Profiles");
    expect(r?.totalProfiles).toBe(1500);
    expect(r?.monthlyCents).toBe(14800);
  });

  it("prefers a bigger plan over stacking many add-ons", () => {
    const r = recommendPlan(900, plans, addon);
    expect(r?.plan.key).toBe("agent_growth"); // 9900 beats 4900 + 2×4900
  });
});

describe("downgradeBlockers", () => {
  it("explains exactly what must be reduced", () => {
    const b = downgradeBlockers(
      { activeProfiles: 1200, sponsoredAgents: 8 },
      { name: "MLO", profiles: 250, agentSeats: 3 },
    );
    expect(b).toHaveLength(2);
    expect(b[0]).toContain("950");
    expect(b[1]).toContain("5");
  });

  it("is empty when the smaller plan fits", () => {
    expect(
      downgradeBlockers({ activeProfiles: 100, sponsoredAgents: 1 }, { name: "MLO", profiles: 250, agentSeats: 3 }),
    ).toEqual([]);
  });
});
