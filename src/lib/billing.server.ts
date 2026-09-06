/**
 * Stripe is the source of truth for whether a lender organization is paid and
 * active. This module talks to Stripe over its REST API (Worker-safe, no SDK)
 * and mirrors the resulting state onto the organization.
 *
 * Pricing is never hard-coded: every plan carries its own configurable Stripe
 * price id in `plan_tiers.stripe_price_id`.
 */

const STRIPE_API = "https://api.stripe.com/v1";

function stripeKey(): string {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) throw new Error("Stripe is not connected yet.");
  return key;
}

/**
 * Which price column to use: test-mode keys read stripe_test_price_id,
 * live keys read stripe_price_id. Preview runs on a test key, so it can
 * never charge a real card.
 */
export function priceIdColumn(): "stripe_price_id" | "stripe_test_price_id" {
  return stripeKey().startsWith("sk_test_") ? "stripe_test_price_id" : "stripe_price_id";
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
): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${stripeKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body ? encode(body).join("&") : undefined,
  });
  const json: any = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `Stripe error ${res.status}`);
  return json as T;
}

/** Find or create the Stripe customer for an organization. */
export async function ensureCustomer(
  supabaseAdmin: any,
  org: { id: string; name: string; primary_contact_email: string | null; stripe_customer_id: string | null },
): Promise<string> {
  if (org.stripe_customer_id) return org.stripe_customer_id;
  const customer = await stripeRequest<{ id: string }>("/customers", "POST", {
    name: org.name,
    email: org.primary_contact_email ?? undefined,
    metadata: { sucasa_org_id: org.id },
  });
  await supabaseAdmin
    .from("lender_orgs")
    .update({ stripe_customer_id: customer.id })
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
        .eq("stripe_customer_id", subscription.customer)
        .maybeSingle()
    ).data?.id ??
    null;

  if (!orgId) return { orgId: null, planKey: plan?.key ?? null, status: subscription.status };

  const active = ACTIVE_STATUSES.has(subscription.status);
  const patch: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    current_period_end: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
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

  await supabaseAdmin.from("lender_orgs").update(patch).eq("id", orgId);
  return { orgId, planKey: plan?.key ?? null, status: subscription.status };
}
