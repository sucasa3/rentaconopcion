/**
 * Capacity, allocation and archiving.
 *
 * Plan entitlement comes from billing, but every allocation decision is made
 * here against the live pool so nothing can be bypassed from the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

async function assertManager(supabase: any, userId: string, orgId: string) {
  const { data } = await supabase.rpc("is_lender_manager", { _user_id: userId, _org_id: orgId });
  if (!data) throw new Error("Only an owner or admin can change capacity");
}

/** The five capacity numbers plus every sponsored agent's allocation. */
export const getCapacity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertMember } = await import("./network.server");
    await assertMember(context.supabase, context.userId, data.orgId);
    const { poolInputFor } = await import("./capacity.server");
    const { summarizePool } = await import("./profile-pool");
    const input = await poolInputFor(data.orgId);
    return {
      summary: summarizePool(input),
      agents: input.agents,
      addons: input.addons,
      org: {
        id: input.org.id,
        name: input.org.name,
        orgType: input.org.org_type,
        planKey: input.org.plan_key,
        planName: input.org.plan_tiers?.name ?? null,
        subscriptionStatus: input.org.subscription_status ?? "none",
        currentPeriodEnd: input.org.current_period_end ?? null,
        commitmentEndsAt: input.org.commitment_ends_at ?? null,
        pendingPlanKey: input.org.pending_plan_key ?? null,
        pendingPlanEffectiveAt: input.org.pending_plan_effective_at ?? null,
        reservedProfiles: input.org.reserved_profiles ?? 0,
      },
    };
  });

/** Change how many Home Profiles one sponsored agent may keep active. */
export const setAgentAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ orgId: uuid, seatId: uuid, allocation: z.number().int().min(0).max(100000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.orgId);
    const { poolInputFor } = await import("./capacity.server");
    const { canSetAllocation } = await import("./profile-pool");
    const input = await poolInputFor(data.orgId);
    const decision = canSetAllocation(input, data.seatId, data.allocation);
    if (!decision.ok) throw new Error(decision.reason);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("sponsored_agent_seats")
      .update({ credits_granted: data.allocation })
      .eq("id", data.seatId)
      .eq("sponsor_org_id", data.orgId);
    if (error) throw new Error(error.message);
    return { ok: true, allocation: data.allocation };
  });

/** The lender's own cushion. Optional, and zero is fine. */
export const setLenderReserve = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ orgId: uuid, reserve: z.number().int().min(0).max(1000000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.orgId);
    const { poolInputFor } = await import("./capacity.server");
    const { summarizePool } = await import("./profile-pool");
    const input = await poolInputFor(data.orgId);
    const s = summarizePool({ ...input, lenderReserve: 0 });
    const headroom = s.totalCapacity - s.agentAllocated;
    if (data.reserve > headroom) {
      throw new Error(
        `You can reserve at most ${headroom} Home Profiles once agent allocations are counted.`,
      );
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("lender_orgs")
      .update({ reserved_profiles: data.reserve })
      .eq("id", data.orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * End a sponsorship. The agent keeps every Home Profile, document and note;
 * only the lender's sponsorship and financing presence are removed, and the
 * capacity returns to the lender's pool. The agent gets 14 days to choose a
 * new sponsor, a paid Agent plan, or to let the profiles go inactive.
 */
export const endSponsorship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgId: uuid, seatId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.orgId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { graceDeadline, SPONSORSHIP_GRACE_DAYS } = await import("./profile-pool");
    const admin = supabaseAdmin as any;

    const { data: seat } = await admin
      .from("sponsored_agent_seats")
      .select("id, agent_org_id, status")
      .eq("id", data.seatId)
      .eq("sponsor_org_id", data.orgId)
      .maybeSingle();
    if (!seat) throw new Error("That sponsorship could not be found");

    const until = graceDeadline();
    // Allocation drops to zero immediately: capacity returns to the lender.
    const { error } = await admin
      .from("sponsored_agent_seats")
      .update({ status: "ended", ended_at: new Date().toISOString(), grace_until: until, credits_granted: 0 })
      .eq("id", seat.id);
    if (error) throw new Error(error.message);

    // The lender's sponsorship presence on those homeowners is withdrawn.
    await admin
      .from("sponsored_profiles")
      .update({ status: "grace", grace_until: until })
      .eq("sponsor_org_id", data.orgId)
      .eq("agent_org_id", seat.agent_org_id)
      .neq("status", "ended");

    return { ok: true, graceUntil: until, graceDays: SPONSORSHIP_GRACE_DAYS };
  });

/**
 * Archive a Home Profile: everything is kept, but it goes quiet — no
 * refreshes, alerts, opportunities, CRM pushes or sponsored access — and it
 * stops counting against capacity.
 */
export const setProfileArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ clientId: uuid, archived: z.boolean(), reason: z.string().max(200).optional() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: client, error: readErr } = await context.supabase
      .from("lender_portfolio_clients")
      .select("id, portfolio_id, lender_portfolios!inner(lender_org_id)")
      .eq("id", data.clientId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!client) throw new Error("Home Profile not found");
    const orgId = (client as any).lender_portfolios.lender_org_id as string;

    if (!data.archived) {
      const { poolInputFor } = await import("./capacity.server");
      const { canAddProfiles } = await import("./profile-pool");
      const decision = canAddProfiles(await poolInputFor(orgId), 1);
      if (!decision.ok) throw new Error(decision.reason);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("lender_portfolio_clients")
      .update({
        archived_at: data.archived ? new Date().toISOString() : null,
        archived_reason: data.archived ? (data.reason ?? null) : null,
      })
      .eq("id", data.clientId);
    if (error) throw new Error(error.message);
    return { ok: true, archived: data.archived };
  });

/** Cheapest plan + add-on combination for what this organization actually has. */
export const recommendCapacityPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertMember } = await import("./network.server");
    await assertMember(context.supabase, context.userId, data.orgId);
    const { poolInputFor } = await import("./capacity.server");
    const { recommendPlan, summarizePool } = await import("./profile-pool");
    const input = await poolInputFor(data.orgId);
    const summary = summarizePool(input);
    const audience = input.org.org_type === "agent" ? "agent" : "lender";

    const { data: plans } = await context.supabase
      .from("plan_tiers")
      .select("key, name, price_cents, profile_allowance, sponsored_seats")
      .eq("active", true)
      .eq("audience", audience)
      .order("sort_order");
    const { data: addonRow } = await context.supabase
      .from("addon_products")
      .select("key, name, unit_quantity, price_cents")
      .eq("key", "profiles_500")
      .maybeSingle();

    const rec = recommendPlan(
      summary.lenderUsed,
      ((plans ?? []) as any[]).map((p) => ({
        key: p.key,
        name: p.name,
        priceCents: p.price_cents ?? 0,
        profiles: p.profile_allowance ?? 0,
        agentSeats: p.sponsored_seats ?? 0,
      })),
      addonRow
        ? {
            key: (addonRow as any).key,
            name: (addonRow as any).name,
            unitQuantity: (addonRow as any).unit_quantity,
            priceCents: (addonRow as any).price_cents,
          }
        : undefined,
      { minAgentSeats: summary.agentSeatsUsed },
    );
    return { activeProfiles: summary.lenderUsed, recommendation: rec };
  });
