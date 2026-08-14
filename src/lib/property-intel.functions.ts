/**
 * Server functions the app calls to fetch cached + budgeted property intel.
 * All heavy lifting lives in `valuation.server.ts`.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveHomeValue, type ValueStatus } from "@/lib/home-value";


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

    if (error)
      return {
        ok: false as const,
        error: "Could not load profile",
        valueStatus: "no_address" as const,
        classes: {},
        budget: null,
      };
    if (!profile?.address) {
      return {
        ok: false as const,
        error: "No address on profile",
        valueStatus: "no_address" as const,
        classes: {},
        budget: null,
      };
    }
    // A street line alone can't be matched against property records — we need a
    // city/state or a ZIP. Bail out before spending a lookup.
    if (!(profile.city && profile.state) && !profile.zip) {
      return {
        ok: false as const,
        error: "incomplete_address",
        valueStatus: "incomplete_address" as const,
        address: profile.address,
        classes: {},
        budget: null,
      };
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
      matchedProperty,
    } = await import("@/lib/valuation.server");
    // Call policy: the core records (profile, valuation, mortgage, permits) are
    // always resolved. Assessor/tax and sale history are conditional — served
    // from cache when we already have them, and only bought when a screen
    // genuinely can't be filled without them.
    const CONDITIONAL = ["tax", "sales", "owner", "neighborhood", "risk"] as const;
    const requested = data.classes;
    const conditional = requested.filter((c) => CONDITIONAL.includes(c as never));

    const result = await getPropertyIntel(fullAddress, {
      classes: requested,
      revenueSource: data.revenueSource,
      requestedBy: context.userId,
      forceRefresh: data.forceRefresh,
      // conditional classes on this first pass are free-only
      cachedOnlyClasses: conditional,
    });

    let avm = result.classes.avm ? extractAvm(result.classes.avm.data) : null;
    const detail = result.classes.detail ? extractDetail(result.classes.detail.data) : null;
    let tax = result.classes.tax ? extractTax(result.classes.tax.data) : null;
    let sales = result.classes.sales ? extractSales(result.classes.sales.data) : null;
    const mortgage = result.classes.mortgage ? extractMortgage(result.classes.mortgage.data) : null;
    const permits = result.classes.permits ? extractPermits(result.classes.permits.data) : null;

    // Follow-up spend, only where it buys a value we can't otherwise show:
    //  - assessor/tax when the valuation came back empty (assessed fallback),
    //  - sale history when we have none on file (bought once, held a year).
    const followUp: typeof conditional = [];
    if (conditional.includes("tax") && !tax && avm?.estimate == null) followUp.push("tax");
    if (conditional.includes("sales") && !sales) followUp.push("sales");
    if (followUp.length > 0) {
      const extra = await getPropertyIntel(fullAddress, {
        classes: followUp,
        revenueSource: `${data.revenueSource}_conditional`,
        requestedBy: context.userId,
      });
      if (extra.classes.tax) tax = extractTax(extra.classes.tax.data);
      if (extra.classes.sales) sales = extractSales(extra.classes.sales.data);
      if (extra.classes.avm) avm = extractAvm(extra.classes.avm.data);
      Object.assign(result.classes, extra.classes);
      Object.assign(result.errors, extra.errors);
      result.budget = extra.budget;
    }

    const equity = avm || mortgage || tax ? computeEquityRibbon(avm, mortgage, sales, tax) : null;


    // Backfill any missing address pieces from the matched public record so the
    // next lookup is an exact match (a missing ZIP breaks valuation matching).
    if (result.classes.detail && (!profile.city || !profile.state || !profile.zip)) {
      const matched = matchedProperty(result.classes.detail.data);
      const patch: { city?: string; state?: string; zip?: string } = {};
      if (!profile.city && matched.city) patch.city = matched.city;
      if (!profile.state && matched.state) patch.state = matched.state;
      if (!profile.zip && matched.zip) patch.zip = matched.zip;
      if (Object.keys(patch).length > 0) {
        await context.supabase.from("profiles").update(patch).eq("id", context.userId);
      }

    }


    const resolved = resolveHomeValue({ avm, tax, equity });
    const valueStatus: ValueStatus =
      resolved.value != null
        ? "resolved"
        : result.budget?.cacheOnly
          ? "budget_capped"
          : "no_coverage";

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
      /** canonical resolved value — every surface should read this */
      value: resolved,
      valueStatus,
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
