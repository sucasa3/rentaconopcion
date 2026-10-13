/**
 * Stripe is the source of truth for whether a lender organization is paid and
 * active. This module talks to Stripe over its REST API (Worker-safe, no SDK)
 * and mirrors the resulting state onto the organization.
 *
 * Pricing is never hard-coded: every plan carries its own configurable Stripe
 * price id in `plan_tiers.stripe_price_id`.
 */

const STRIPE_API = "https://api.stripe.com/v1";

export type StripeMode = "live" | "test";

import { isPreviewHost } from "./stripe-mode";

/**
 * Live vs test is decided by the environment (the host serving the request),
 * never by who the user is. Test mode also requires a test key to exist.
 */
export async function currentStripeMode(): Promise<StripeMode> {
  if (!process.env["STRIPE_TEST_SECRET_KEY"]) return "live";
  try {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const host = getRequestHeader("x-forwarded-host") ?? getRequestHeader("host") ?? null;
    return isPreviewHost(host) ? "test" : "live";
  } catch {
    return "live";
  }
}

function stripeKey(mode: StripeMode): string {
  const key =
    mode === "test" ? process.env["STRIPE_TEST_SECRET_KEY"] : process.env["STRIPE_SECRET_KEY"];
  if (!key) throw new Error("Stripe is not connected yet.");
  if (mode === "test" && !key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
    throw new Error("The Stripe test key is not a test-mode key.");
  }
  return key;
}

/** Which price column a mode reads. Live and test ids never mix. */
export function priceIdColumn(mode: StripeMode): "stripe_price_id" | "stripe_test_price_id" {
  return mode === "test" ? "stripe_test_price_id" : "stripe_price_id";
}

/** Which customer column a mode reads. */
export function customerIdColumn(mode: StripeMode): "stripe_customer_id" | "stripe_test_customer_id" {
  return mode === "test" ? "stripe_test_customer_id" : "stripe_customer_id";
}

/** Flatten a nested object into Stripe's form-encoded parameter syntax. */
function encode(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) {
      out.push(...encode(v as Record<string, unknown>, key));
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === "object") out.push(...encode(item as Record<string, unknown>, `${key}[${i}]`));
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out;
}

export async function stripeRequest<T = any>(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>,
  mode?: StripeMode,
  idempotencyKey?: string,
): Promise<T> {
  const m = mode ?? (await currentStripeMode());
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${stripeKey(m)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body ? encode(body).join("&") : undefined,
  });
  const json: any = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `Stripe error ${res.status}`);
  return json as T;
}

/**
 * Stop a subscription so no further renewal or charge can occur. Invoices,
 * charges and customer records stay with the payment provider: those are
 * billing/accounting records SuCasa must retain.
 */
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  try {
    await stripeRequest(
      `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
      "POST",
      { "cancellation_details[comment]": "Homeowner deleted their SuCasa account" },
      "live",
    );
  } catch (e) {
    // Already canceled, or no longer present upstream: that is the end state we
    // wanted, so it is not a failure.
    const msg = e instanceof Error ? e.message : String(e);
    if (/no such subscription|already canceled|canceled subscription/i.test(msg)) return;
    throw e;
  }
}

/** Find or create the Stripe customer for an organization, per mode. */
export async function ensureCustomer(
  supabaseAdmin: any,
  org: { id: string; name: string; primary_contact_email: string | null; stripe_customer_id: string | null; stripe_test_customer_id?: string | null },
  mode: StripeMode,
): Promise<string> {
  const column = customerIdColumn(mode);
  const existing = (org as any)[column] as string | null | undefined;
  if (existing) return existing;
  const customer = await stripeRequest<{ id: string }>(
    "/customers",
    "POST",
    {
      name: org.name,
      email: org.primary_contact_email ?? undefined,
      metadata: { sucasa_org_id: org.id },
    },
    mode,
  );
  await supabaseAdmin
    .from("lender_orgs")
    .update({ [column]: customer.id })
    .eq("id", org.id);
  return customer.id;
}

/** Statuses that entitle the organization to use the product. */
const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

/**
 * Mirror a Stripe subscription onto the organization: plan, allowances and
 * activation all follow the payment state.
 */
export async function applySubscription(
  supabaseAdmin: any,
  subscription: {
    id: string;
    status: string;
    customer: string;
    current_period_end?: number;
    items?: { data?: Array<{ price?: { id?: string } }> };
    metadata?: Record<string, string>;
  },
): Promise<{ orgId: string | null; planKey: string | null; status: string }> {
  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;

  // Match the incoming price id against either the live or test column, so
  // test-mode subscriptions activate plans exactly like live ones.
  const { data: plan } = priceId
    ? await supabaseAdmin
        .from("plan_tiers")
        .select("key, profile_allowance, sponsored_allocation, seat_limit")
        .or(`stripe_price_id.eq.${priceId},stripe_test_price_id.eq.${priceId}`)
        .maybeSingle()
    : { data: null };

  const orgId =
    subscription.metadata?.["sucasa_org_id"] ??
    (
      await supabaseAdmin
        .from("lender_orgs")
        .select("id")
        .or(
          `stripe_customer_id.eq.${subscription.customer},stripe_test_customer_id.eq.${subscription.customer}`,
        )
        .maybeSingle()
    ).data?.id ??
    null;

  if (!orgId) return { orgId: null, planKey: plan?.key ?? null, status: subscription.status };

  const active = ACTIVE_STATUSES.has(subscription.status);
  const patch: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    // Newer Stripe API versions report the period end per item; a prepaid
    // (trialing) subscription's next charge is its trial end.
    current_period_end: (() => {
      const s: any = subscription;
      const ts = s.status === "trialing" && s.trial_end ? s.trial_end
        : (s.current_period_end ?? s.items?.data?.[0]?.current_period_end);
      return ts ? new Date(ts * 1000).toISOString() : null;
    })(),
    active,
  };
  if (plan) {
    patch["plan_key"] = plan.key;
    patch["profile_allowance"] = plan.profile_allowance ?? 0;
    patch["sponsored_allocation"] = plan.sponsored_allocation ?? 0;
    if (plan.seat_limit != null) patch["seat_limit"] = plan.seat_limit;
  }
  if (active) {
    const { data: existing } = await supabaseAdmin
      .from("lender_orgs")
      .select("activated_at")
      .eq("id", orgId)
      .maybeSingle();
    if (!existing?.activated_at) patch["activated_at"] = new Date().toISOString();
  }

  const { data: orgRow } = await supabaseAdmin
    .from("lender_orgs")
    .select("org_type")
    .eq("id", orgId)
    .maybeSingle();
  const isAgent = orgRow?.org_type === "agent";
  // An agent's free access never depends on a subscription being active.
  if (isAgent && !active) delete patch["active"];

  await supabaseAdmin.from("lender_orgs").update(patch).eq("id", orgId);

  // Seat allowance follows the plan: excess members are suspended (data kept)
  // using the manager's retained selection, then owner-first deterministic order.
  if (!isAgent && plan) {
    await supabaseAdmin.rpc("apply_lender_seat_allowance" as any, { _org_id: orgId });
  }

  if (isAgent) {
    // Paid agent capacity is TOTAL (it includes the free 100). The ledger gets
    // a single top-up step per change; webhook retries compute a zero delta.
    const { planCapacityTopUp } = await import("./agent-discovery");
    const target = active && plan ? planCapacityTopUp(plan.profile_allowance) : 0;
    await supabaseAdmin.rpc("set_agent_plan_capacity", {
      _org_id: orgId,
      _target: target,
      _ref: subscription.id,
    });
  }
  return { orgId, planKey: plan?.key ?? null, status: subscription.status };
}

export const LAUNCH_PREPAID_DAYS = 90;

/**
 * The $397 launch offer is a one-time payment (Checkout mode "payment") so the
 * customer sees "$397 due today", never "90 days free". Once it is paid, the
 * monthly MLO Growth subscription is created to start billing exactly 90 days
 * after payment. Safe to call repeatedly (webhook retries + return sync): the
 * Stripe idempotency key and the session-id lookup create at most one subscription.
 */
export async function finalizeLaunchPayment(
  supabaseAdmin: any,
  session: any,
  mode: StripeMode,
): Promise<any | null> {
  if (session?.mode !== "payment" || session?.metadata?.plan_key !== "mlo_growth_launch") return null;
  if (session.payment_status !== "paid") return null;
  const orgId = session.metadata?.sucasa_org_id ?? session.client_reference_id;
  const customer = session.customer;
  if (!orgId || !customer) return null;

  const existing = await stripeRequest<{ data: any[] }>(
    `/subscriptions?customer=${customer}&status=all&limit=20`, "GET", undefined, mode,
  );
  const already = existing.data?.find((s) => s.metadata?.sucasa_launch_session === session.id);
  if (already) { await applySubscription(supabaseAdmin, already); return already; }

  const { data: plan } = await supabaseAdmin
    .from("plan_tiers").select("stripe_price_id, stripe_test_price_id").eq("key", "mlo_growth_v2").maybeSingle();
  const growthPrice = plan?.[priceIdColumn(mode)];
  if (!growthPrice) throw new Error("MLO Growth price not configured");

  const pi = typeof session.payment_intent === "string"
    ? await stripeRequest(`/payment_intents/${session.payment_intent}`, "GET", undefined, mode)
    : session.payment_intent;
  const paymentMethod = typeof pi?.payment_method === "string" ? pi.payment_method : pi?.payment_method?.id;
  const paidAt = Number(pi?.created ?? session.created ?? Math.floor(Date.now() / 1000));
  const startsAt = paidAt + LAUNCH_PREPAID_DAYS * 86400;

  const sub = await stripeRequest("/subscriptions", "POST", {
    customer,
    items: [{ price: growthPrice, quantity: 1 }],
    // Prepaid period: nothing is charged until the 90 paid days end.
    trial_end: startsAt,
    ...(paymentMethod ? { default_payment_method: paymentMethod } : {}),
    trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
    metadata: { sucasa_org_id: orgId, plan_key: "mlo_growth_v2", sucasa_launch_session: session.id, sucasa_prepaid_until: String(startsAt) },
  }, mode, `launch-sub-${session.id}`);
  await applySubscription(supabaseAdmin, sub);
  return sub;
}
