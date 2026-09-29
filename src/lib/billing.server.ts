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

/**
 * Hosts that run the preview/development build. Only these may ever use the
 * Stripe test key; the published site and custom domains always run live.
 */
function isPreviewHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.toLowerCase().split(":")[0] ?? "";
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.startsWith("id-preview--") ||
    /^project--[^.]+-dev\.lovable\.app$/.test(h)
  );
}

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
): Promise<T> {
  const m = mode ?? (await currentStripeMode());
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${stripeKey(m)}`,
      "Content-Type": "application/x-www-form-urlencoded",
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
    await stripeRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, "POST", {
      "cancellation_details[comment]": "Homeowner deleted their SuCasa account",
    });
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
