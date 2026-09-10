/**
 * Reading the comparison rate, and letting a lender set their own scenario rate.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RATE_MAX, RATE_MIN, type BenchmarkRate } from "@/lib/market-rate";

async function assertOrgMember(supabase: any, userId: string, orgId: string) {
  const { data } = await supabase.rpc("is_lender_member", { _user_id: userId, _org_id: orgId });
  if (!data) throw new Error("You don't have access to this organization.");
}

/** The rate this surface should quote, with its source and as-of date. */
export const getBenchmarkRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ orgId: z.string().uuid().optional() }).default({}).parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<
    { ok: true; benchmark: BenchmarkRate } | { ok: false; error: string }
  > => {
    const { resolveBenchmark } = await import("./market-rate.server");
    if (data.orgId) await assertOrgMember(context.supabase, context.userId, data.orgId);
    try {
      return { ok: true, benchmark: await resolveBenchmark(data.orgId ?? null) };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

/** Set (or reconfirm) the organization's scenario rate. */
export const setScenarioRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        ratePct: z.number().min(RATE_MIN).max(RATE_MAX),
        label: z.string().trim().max(40).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.orgId);
    const { error } = await context.supabase
      .from("lender_orgs")
      .update({
        scenario_rate_pct: data.ratePct,
        scenario_rate_label: data.label?.trim() || "Lender scenario rate",
        scenario_rate_set_at: new Date().toISOString(),
        scenario_rate_set_by: context.userId,
      })
      .eq("id", data.orgId);
    if (error) throw new Error(error.message);

    const { resolveBenchmark } = await import("./market-rate.server");
    return { ok: true as const, benchmark: await resolveBenchmark(data.orgId) };
  });

/** Drop back to the market benchmark. */
export const clearScenarioRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.supabase, context.userId, data.orgId);
    const { error } = await context.supabase
      .from("lender_orgs")
      .update({
        scenario_rate_pct: null,
        scenario_rate_label: null,
        scenario_rate_set_at: null,
        scenario_rate_set_by: null,
      })
      .eq("id", data.orgId);
    if (error) throw new Error(error.message);

    const { resolveBenchmark } = await import("./market-rate.server");
    return { ok: true as const, benchmark: await resolveBenchmark(data.orgId) };
  });
