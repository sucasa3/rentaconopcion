/**
 * The shared Home Profile pool.
 *
 * A plan gives an organization two numbers: how many Home Profiles it can keep
 * active, and how many agents it can sponsor. Everything else — how much of
 * that pool the lender keeps for itself and how much each sponsored agent
 * gets — is the lender's choice. This module is the single place that math
 * lives, so the screens, the server and the tests all agree.
 *
 * Pure: no database, no network. Callers supply counts.
 */

export type AgentAllocation = {
  seatId: string;
  agentOrgId: string;
  agentName: string;
  /** Profiles this agent may keep active under the sponsorship. */
  allocated: number;
  /** Profiles the agent currently has active (archived ones don't count). */
  used: number;
  status: "active" | "grace" | "ended";
  /** When a grace period ends, if the sponsorship was stopped. */
  graceUntil?: string | null;
};

export type PoolInput = {
  /** Home Profiles included in the plan. */
  planProfiles: number;
  /** Extra profiles from active add-ons. */
  addonProfiles?: number;
  /** Sponsored agent seats included in the plan. */
  planAgentSeats: number;
  /** Extra seats from active add-ons. */
  addonAgentSeats?: number;
  /** Active (non-archived) profiles the lender holds directly. */
  lenderUsed: number;
  /** Optional cushion the lender keeps back for its own future imports. */
  lenderReserve?: number;
  agents: AgentAllocation[];
};

export type PoolSummary = {
  totalCapacity: number;
  lenderUsed: number;
  lenderReserve: number;
  agentAllocated: number;
  agentUsed: number;
  /** Capacity not used by the lender and not allocated to any agent. */
  available: number;
  agentSeatsCap: number;
  agentSeatsUsed: number;
  agentSeatsAvailable: number;
  /** Share of capacity committed (used + allocated + reserve), 0–1. */
  utilization: number;
  /** True once the pool is 80% or more committed. */
  approachingLimit: boolean;
  /** True once nothing is left to allocate or import. */
  atLimit: boolean;
};

const n = (v: number | null | undefined) => (Number.isFinite(v as number) ? Math.max(0, Math.trunc(v as number)) : 0);

const activeAgents = (agents: AgentAllocation[]) => agents.filter((a) => a.status !== "ended");

export function summarizePool(input: PoolInput): PoolSummary {
  const totalCapacity = n(input.planProfiles) + n(input.addonProfiles);
  const agentSeatsCap = n(input.planAgentSeats) + n(input.addonAgentSeats);
  const live = activeAgents(input.agents ?? []);

  const lenderUsed = n(input.lenderUsed);
  const lenderReserve = n(input.lenderReserve);
  const agentAllocated = live.reduce((s, a) => s + n(a.allocated), 0);
  const agentUsed = live.reduce((s, a) => s + n(a.used), 0);

  const committed = lenderUsed + agentAllocated + Math.max(0, lenderReserve - lenderUsed);
  const available = Math.max(0, totalCapacity - committed);
  const agentSeatsUsed = live.length;

  return {
    totalCapacity,
    lenderUsed,
    lenderReserve,
    agentAllocated,
    agentUsed,
    available,
    agentSeatsCap,
    agentSeatsUsed,
    agentSeatsAvailable: Math.max(0, agentSeatsCap - agentSeatsUsed),
    utilization: totalCapacity > 0 ? Math.min(1, committed / totalCapacity) : 1,
    approachingLimit: totalCapacity > 0 && committed / totalCapacity >= 0.8 && committed < totalCapacity,
    atLimit: committed >= totalCapacity,
  };
}

export type Decision = { ok: true } | { ok: false; reason: string };

/**
 * Can the lender set this agent's allocation to `next`?
 * Never below what the agent already has active, never past the pool.
 */
export function canSetAllocation(input: PoolInput, seatId: string, next: number): Decision {
  const target = n(next);
  const agent = input.agents.find((a) => a.seatId === seatId);
  if (!agent) return { ok: false, reason: "That sponsored agent could not be found." };
  if (agent.status === "ended") return { ok: false, reason: "This sponsorship has already ended." };

  if (target < n(agent.used)) {
    return {
      ok: false,
      reason: `${agent.agentName} already has ${agent.used} active Home Profiles. Set at least ${agent.used}, or ask them to archive some first.`,
    };
  }

  const summary = summarizePool(input);
  const headroom = summary.available + n(agent.allocated);
  if (target > headroom) {
    return {
      ok: false,
      reason: `Only ${headroom} Home Profiles are available for ${agent.agentName}. Free up capacity by archiving, reducing another agent, or adding capacity.`,
    };
  }
  return { ok: true };
}

/** Can the lender sponsor one more agent with this starting allocation? */
export function canAddAgent(input: PoolInput, allocation: number): Decision {
  const summary = summarizePool(input);
  if (summary.agentSeatsAvailable <= 0) {
    return {
      ok: false,
      reason: `Your plan covers ${summary.agentSeatsCap} sponsored agents and all of them are in use. Add sponsored-agent capacity or end a sponsorship first.`,
    };
  }
  const want = n(allocation);
  if (want > summary.available) {
    return {
      ok: false,
      reason: `Only ${summary.available} Home Profiles are available to allocate. Reduce the amount, archive profiles, or add capacity.`,
    };
  }
  return { ok: true };
}

/** Can this organization add `count` more active Home Profiles right now? */
export function canAddProfiles(input: PoolInput, count = 1): Decision {
  const summary = summarizePool(input);
  const want = Math.max(1, n(count));
  const headroom = Math.max(0, summary.totalCapacity - summary.lenderUsed - summary.agentAllocated);
  if (want > headroom) {
    return {
      ok: false,
      reason:
        headroom === 0
          ? "You've reached your Home Profile limit. Upgrade your plan, add capacity, or archive profiles you no longer work."
          : `Only ${headroom} Home Profiles are left. Upgrade your plan, add capacity, or archive profiles you no longer work.`,
    };
  }
  return { ok: true };
}

/**
 * Ending a sponsorship never takes the agent's work away: they keep their
 * Home Profiles and client data, the lender's sponsorship is removed, and the
 * capacity returns to the lender's pool.
 */
export const SPONSORSHIP_GRACE_DAYS = 14;

export function graceDeadline(from: Date = new Date()): string {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + SPONSORSHIP_GRACE_DAYS);
  return d.toISOString();
}

// --- Plan recommendation ---------------------------------------------------

export type PlanOption = {
  key: string;
  name: string;
  priceCents: number;
  profiles: number;
  agentSeats?: number;
};

export type AddonOption = {
  key: string;
  name: string;
  unitQuantity: number;
  priceCents: number;
};

export type Recommendation = {
  plan: PlanOption;
  addonUnits: number;
  addon?: AddonOption;
  totalProfiles: number;
  monthlyCents: number;
  summary: string;
};

/**
 * Cheapest valid combination of plan plus capacity add-ons for the number of
 * active Home Profiles an organization actually has.
 */
export function recommendPlan(
  activeProfiles: number,
  plans: PlanOption[],
  addon?: AddonOption,
  opts?: { minAgentSeats?: number },
): Recommendation | null {
  const need = n(activeProfiles);
  const minSeats = n(opts?.minAgentSeats);
  const eligible = plans.filter((p) => (p.agentSeats ?? 0) >= minSeats);
  let best: Recommendation | null = null;

  for (const plan of eligible) {
    const shortfall = Math.max(0, need - plan.profiles);
    if (shortfall > 0 && !addon) continue;
    const units = shortfall > 0 && addon ? Math.ceil(shortfall / addon.unitQuantity) : 0;
    const monthlyCents = plan.priceCents + units * (addon?.priceCents ?? 0);
    const totalProfiles = plan.profiles + units * (addon?.unitQuantity ?? 0);
    const candidate: Recommendation = {
      plan,
      addonUnits: units,
      ...(addon && units > 0 ? { addon } : {}),
      totalProfiles,
      monthlyCents,
      summary:
        units > 0 && addon
          ? `${plan.name} + ${units} × ${addon.name}`
          : plan.name,
    };
    if (
      !best ||
      candidate.monthlyCents < best.monthlyCents ||
      (candidate.monthlyCents === best.monthlyCents && candidate.totalProfiles > best.totalProfiles)
    ) {
      best = candidate;
    }
  }
  return best;
}

/**
 * What blocks a downgrade, in plain language. Empty array means it can go
 * ahead at the next billing date.
 */
export function downgradeBlockers(
  current: { activeProfiles: number; sponsoredAgents: number },
  target: { name: string; profiles: number; agentSeats: number },
): string[] {
  const out: string[] = [];
  if (current.activeProfiles > target.profiles) {
    out.push(
      `${target.name} covers ${target.profiles.toLocaleString()} Home Profiles and you have ${current.activeProfiles.toLocaleString()} active. Archive or reassign ${(current.activeProfiles - target.profiles).toLocaleString()} before the change can take effect.`,
    );
  }
  if (current.sponsoredAgents > target.agentSeats) {
    out.push(
      `${target.name} covers ${target.agentSeats} sponsored agents and you have ${current.sponsoredAgents}. End ${current.sponsoredAgents - target.agentSeats} sponsorship(s) first.`,
    );
  }
  return out;
}
