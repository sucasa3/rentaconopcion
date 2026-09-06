/**
 * Lender-facing billing: choose a plan, pay, and have the account activate.
 * Stripe holds the truth; these functions only read it and mirror it.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Plans a lender can buy, with their configured price ids. */
export const listPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { priceIdColumn } = await import("./billing.server");
    const column = priceIdColumn();
    const { data, error } = await context.supabase
      .from("plan_tiers")
      .select(
        "key, name, audience, price_cents, positioning, seat_limit, sponsored_allocation, profile_allowance, stripe_price_id, stripe_test_price_id, sort_order",
      )
      .eq("active", true)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return (data ?? []).map((p: any) => ({
      ...p,
      stripe_price_id: undefined,
      stripe_test_price_id: undefined,
      purchasable: Boolean(p[column]),
    }));
  });

/** Current subscription state for one organization. */
export const getBillingState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string }) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: org, error } = await context.supabase
      .from("lender_orgs")
      .select(
        "id, name, active, plan_key, subscription_status, current_period_end, profile_allowance, sponsored_allocation, seat_limit, activated_at",
      )
      .eq("id", data.orgId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!org) throw new Error("Organization not found");
    return org;
  });

/** Start Stripe Checkout for a plan and return the URL to send the lender to. */
export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; planKey: string; returnUrl: string }) =>
    z
      .object({
        orgId: z.string().uuid(),
        planKey: z.string().min(1),
        returnUrl: z.string().url(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Only a manager of the organization may start a purchase.
    const { data: allowed } = await context.supabase.rpc("is_lender_manager", {
      _user_id: context.userId,
      _org_id: data.orgId,
    });
    if (!allowed) throw new Error("Forbidden: only an owner or admin can manage billing");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureCustomer, stripeRequest } = await import("./billing.server");

    const { data: org } = await supabaseAdmin
      .from("lender_orgs")
      .select("id, name, primary_contact_email, stripe_customer_id")
      .eq("id", data.orgId)
      .maybeSingle();
    if (!org) throw new Error("Organization not found");

    const { data: plan } = await supabaseAdmin
      .from("plan_tiers")
      .select("key, name, stripe_price_id")
      .eq("key", data.planKey)
      .maybeSingle();
    if (!plan?.stripe_price_id) {
      throw new Error(`Plan "${data.planKey}" has no payment price configured yet.`);
    }

    const customer = await ensureCustomer(supabaseAdmin, org);
    const session = await stripeRequest<{ id: string; url: string }>("/checkout/sessions", "POST", {
      mode: "subscription",
      customer,
      client_reference_id: org.id,
      success_url: `${data.returnUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${data.returnUrl}?checkout=cancelled`,
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      subscription_data: { metadata: { sucasa_org_id: org.id } },
      metadata: { sucasa_org_id: org.id, plan_key: plan.key },
    });

    return { url: session.url };
  });

/**
 * Pull the latest subscription from Stripe and activate the account.
 * Called when the lender lands back from Checkout, so activation does not
 * depend on the webhook arriving first.
 */
export const syncSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string }) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("is_lender_member", {
      _user_id: context.userId,
      _org_id: data.orgId,
    });
    if (!allowed) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { stripeRequest, applySubscription } = await import("./billing.server");

    const { data: org } = await supabaseAdmin
      .from("lender_orgs")
      .select("id, stripe_customer_id")
      .eq("id", data.orgId)
      .maybeSingle();
    if (!org?.stripe_customer_id) return { status: "none", activated: false };

    const subs = await stripeRequest<{ data: any[] }>(
      `/subscriptions?customer=${org.stripe_customer_id}&status=all&limit=5`,
    );
    const sub = subs.data?.find((s) => ["active", "trialing", "past_due"].includes(s.status)) ?? subs.data?.[0];
    if (!sub) return { status: "none", activated: false };

    const applied = await applySubscription(supabaseAdmin, sub);
    return { status: applied.status, planKey: applied.planKey, activated: applied.status === "active" };
  });
