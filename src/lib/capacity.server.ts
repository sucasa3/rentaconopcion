/**
 * Reads the real numbers behind the shared Home Profile pool.
 *
 * Sponsorship, profile ownership, plan entitlement and billing stay separate:
 * this module only reports capacity and never moves a homeowner record.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AgentAllocation, PoolInput } from "./profile-pool";

const admin = () => supabaseAdmin as any;

/** Active (non-archived) Home Profiles held by one organization. */
export async function activeProfileCount(orgId: string): Promise<number> {
  const { data } = await admin()
    .from("lender_portfolios")
    .select("id")
    .eq("lender_org_id", orgId);
  const ids = ((data ?? []) as { id: string }[]).map((p) => p.id);
  if (!ids.length) return 0;
  const { count } = await admin()
    .from("lender_portfolio_clients")
    .select("id", { count: "exact", head: true })
    .in("portfolio_id", ids)
    .is("archived_at", null);
  return count ?? 0;
}

export type AddonRow = {
  id: string;
  addon_key: string;
  quantity: number;
  name: string;
  kind: "profiles" | "agent_seats";
  unit_quantity: number;
  price_cents: number;
};

export async function activeAddons(orgId: string): Promise<AddonRow[]> {
  const { data } = await admin()
    .from("org_addons")
    .select("id, addon_key, quantity, addon_products(name, kind, unit_quantity, price_cents)")
    .eq("org_id", orgId)
    .eq("status", "active");
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    addon_key: r.addon_key,
    quantity: r.quantity,
    name: r.addon_products?.name ?? r.addon_key,
    kind: r.addon_products?.kind ?? "profiles",
    unit_quantity: r.addon_products?.unit_quantity ?? 0,
    price_cents: r.addon_products?.price_cents ?? 0,
  }));
}

/** Everything the pool engine needs for one organization. */
export async function poolInputFor(orgId: string): Promise<
  PoolInput & { org: any; addons: AddonRow[] }
> {
  const { data: org } = await admin()
    .from("lender_orgs")
    .select(
      "id, name, org_type, plan_key, profile_allowance, sponsored_allocation, reserved_profiles, subscription_status, current_period_end, commitment_ends_at, pending_plan_key, pending_plan_effective_at, plan_tiers(name, price_cents, profile_allowance, sponsored_seats)",
    )
    .eq("id", orgId)
    .maybeSingle();
  if (!org) throw new Error("Organization not found");

  const [addons, lenderUsed, seatRows] = await Promise.all([
    activeAddons(orgId),
    activeProfileCount(orgId),
    admin()
      .from("sponsored_agent_seats")
      .select("id, agent_org_id, credits_granted, status, grace_until, lender_orgs!sponsored_agent_seats_agent_org_id_fkey(name)")
      .eq("sponsor_org_id", orgId)
      .neq("status", "ended")
      .then((r: any) => (r.data ?? []) as any[]),
  ]);

  const agents: AgentAllocation[] = await Promise.all(
    seatRows.map(async (s: any) => ({
      seatId: s.id,
      agentOrgId: s.agent_org_id,
      agentName: s.lender_orgs?.name ?? "Agent",
      allocated: s.credits_granted ?? 0,
      used: await activeProfileCount(s.agent_org_id),
      status: (s.status === "grace" ? "grace" : "active") as AgentAllocation["status"],
      graceUntil: s.grace_until ?? null,
    })),
  );

  const addonProfiles = addons
    .filter((a) => a.kind === "profiles")
    .reduce((s, a) => s + a.quantity * a.unit_quantity, 0);
  const addonAgentSeats = addons
    .filter((a) => a.kind === "agent_seats")
    .reduce((s, a) => s + a.quantity * a.unit_quantity, 0);

  return {
    org,
    addons,
    planProfiles: org.profile_allowance ?? org.plan_tiers?.profile_allowance ?? 0,
    addonProfiles,
    planAgentSeats: org.sponsored_allocation ?? org.plan_tiers?.sponsored_seats ?? 0,
    addonAgentSeats,
    lenderUsed,
    lenderReserve: org.reserved_profiles ?? 0,
    agents,
  };
}

/**
 * Guard before adding Home Profiles: warn-then-block at the hard limit, with
 * a message that names the ways out. Never silently trims data.
 */
export async function assertCapacityForPortfolio(portfolioId: string, count = 1): Promise<void> {
  const { data: portfolio } = await admin()
    .from("lender_portfolios")
    .select("lender_org_id")
    .eq("id", portfolioId)
    .maybeSingle();
  const orgId = (portfolio as any)?.lender_org_id;
  if (!orgId) return;
  const { canAddProfiles } = await import("./profile-pool");
  const decision = canAddProfiles(await poolInputFor(orgId), count);
  if (!decision.ok) throw new Error(decision.reason);
}
