/**
 * Server functions the app calls to fetch cached + budgeted property intel.
 * All heavy lifting lives in `valuation.server.ts`.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GetMyHomeIntelInput = z.object({
  classes: z
    .array(z.enum(["avm", "detail", "tax", "sales", "permits", "neighborhood", "risk", "owner", "mortgage"]))
    .min(1),
  forceRefresh: z.boolean().optional(),
  revenueSource: z.string().default("dashboard_view"),
});

/** Get intel for the signed-in homeowner's own address. */
export const getMyHomeIntel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GetMyHomeIntelInput.parse(input))
  .handler(async ({ data, context }) => {
    // Look up the caller's address from profiles (RLS as user)
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .select("address, city, state, zip")
      .eq("id", context.userId)
      .maybeSingle();

    if (error) return { ok: false as const, error: "Could not load profile", classes: {}, budget: null };
    if (!profile?.address) {
      return { ok: false as const, error: "No address on profile", classes: {}, budget: null };
    }

    const fullAddress = [profile.address, profile.city, profile.state, profile.zip]
      .filter(Boolean)
      .join(", ");

    const {
      getPropertyIntel,
      extractAvm,
      extractDetail,
      extractTax,
      extractSales,
      extractMortgage,
      extractPermits,
      computeEquityRibbon,
    } = await import("@/lib/valuation.server");
    const result = await getPropertyIntel(fullAddress, {
      classes: data.classes,
      revenueSource: data.revenueSource,
      requestedBy: context.userId,
      forceRefresh: data.forceRefresh,
    });

    const avm = result.classes.avm ? extractAvm(result.classes.avm.data) : null;
    const detail = result.classes.detail ? extractDetail(result.classes.detail.data) : null;
    const tax = result.classes.tax ? extractTax(result.classes.tax.data) : null;
    const sales = result.classes.sales ? extractSales(result.classes.sales.data) : null;
    const mortgage = result.classes.mortgage ? extractMortgage(result.classes.mortgage.data) : null;
    const permits = result.classes.permits ? extractPermits(result.classes.permits.data) : null;
    const equity = avm || mortgage ? computeEquityRibbon(avm, mortgage, sales) : null;

    return {
      ok: true as const,
      address: fullAddress,
      avm,
      detail,
      tax,
      sales,
      mortgage,
      permits,
      equity,
      staleClasses: Object.entries(result.classes)
        .filter(([, v]) => v?.stale)
        .map(([k]) => k),
      errors: result.errors,
      budget: result.budget,
    };
  });

/** Admin-only: current ATTOM spend widget data. */
export const getAttomSpend = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const monthKey = monthStart.toISOString().slice(0, 10);

    const { data: budget } = await context.supabase
      .from("attom_monthly_budget")
      .select("*")
      .eq("month", monthKey)
      .maybeSingle();

    const { data: recent } = await context.supabase
      .from("attom_call_log")
      .select("endpoint, cache_hit, cost_cents, revenue_source, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    return { budget, recent: recent ?? [] };
  });
