import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

/** Credit balance, recent ledger, month recap and SuCasa Score inputs. */
export const getAgentCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { creditBalance, creditHistory, earnedThisMonth, seatsForAgent } = await import(
      "./credits.server"
    );
    const { agentBookStats } = await import("./credits-stats.server");

    const [balance, history, month, seats, stats] = await Promise.all([
      creditBalance(context.supabase, data.orgId),
      creditHistory(context.supabase, data.orgId),
      earnedThisMonth(context.supabase, data.orgId),
      seatsForAgent(context.supabase, data.orgId),
      agentBookStats(context.supabase, data.orgId),
    ]);

    const { data: plan } = await context.supabase
      .from("agent_plans")
      .select("plan_key, status, requested_plan_key, requested_at")
      .eq("org_id", data.orgId)
      .maybeSingle();

    return {
      balance,
      history,
      month,
      seats,
      stats,
      plan: plan ?? { plan_key: "agent_core", status: "active", requested_plan_key: null },
    };
  });

/** Record interest in a paid capacity tier. No billing in this phase. */
export const requestAgentPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ orgId: uuid, planKey: z.enum(["agent_plus", "agent_pro"]) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase
      .from("lender_members")
      .select("id")
      .eq("lender_org_id", data.orgId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member) throw new Error("You do not have access to this organization");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("agent_plans").upsert(
      {
        org_id: data.orgId,
        plan_key: "agent_core",
        status: "requested",
        requested_plan_key: data.planKey,
        requested_at: new Date().toISOString(),
        requested_by: context.userId,
      },
      { onConflict: "org_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Lender side -----------------------------------------------------------

/** Seats this lender has sponsored, plus what the plan allows. */
export const getSponsoredSeats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ lenderOrgId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertMember } = await import("./network.server");
    const { seatsForSponsor, seatAllowance } = await import("./credits.server");
    await assertMember(context.supabase, context.userId, data.lenderOrgId);
    const [seats, allowance] = await Promise.all([
      seatsForSponsor(context.supabase, data.lenderOrgId),
      seatAllowance(context.supabase, data.lenderOrgId),
    ]);
    return { seats, allowance };
  });

/** Sponsor a connected agent with a grant of homeowner credits. */
export const sponsorAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        lenderOrgId: uuid,
        agentOrgId: uuid,
        credits: z.union([z.literal(25), z.literal(50)]).default(25),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { assertMember, assertConnection } = await import("./network.server");
    const { sponsorAgentSeat, seatAllowance } = await import("./credits.server");
    await assertMember(context.supabase, context.userId, data.lenderOrgId);
    await assertConnection(context.supabase, data.lenderOrgId, data.agentOrgId);

    const allowance = await seatAllowance(context.supabase, data.lenderOrgId);
    if (allowance.remaining != null && allowance.remaining <= 0) {
      throw new Error("All sponsored agent seats on your plan are in use");
    }
    return sponsorAgentSeat(data.lenderOrgId, data.agentOrgId, data.credits, context.userId);
  });

/** End a sponsorship. Credits already granted stay with the agent. */
export const endSponsoredSeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ lenderOrgId: uuid, seatId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertMember } = await import("./network.server");
    const { endAgentSeat } = await import("./credits.server");
    await assertMember(context.supabase, context.userId, data.lenderOrgId);
    return endAgentSeat(data.lenderOrgId, data.seatId);
  });
