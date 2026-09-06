/**
 * Stripe webhook: keeps subscription state in sync when payments succeed,
 * fail, or a subscription is cancelled. Signature is verified before any
 * write; without a configured signing secret the endpoint refuses traffic.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

function verify(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=") as [string, string]),
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const a = Buffer.from(v1);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        if (!secret) return new Response("Webhook secret not configured", { status: 503 });

        const body = await request.text();
        if (!verify(body, request.headers.get("stripe-signature"), secret)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const event = JSON.parse(body) as { type: string; data: { object: any } };
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { applySubscription, stripeRequest } = await import("@/lib/billing.server");

        /**
         * A homeowner's own Premium membership is a separate product from a
         * lender subscription: it belongs to the homeowner and never touches
         * an organization's plan.
         */
        const homeownerId = (sub: any): string | null =>
          sub?.metadata?.sucasa_product === "premium_membership"
            ? (sub.metadata.sucasa_homeowner_id ?? null)
            : null;

        async function route(sub: any) {
          const owner = homeownerId(sub);
          if (!owner) {
            await applySubscription(supabaseAdmin, sub);
            return;
          }
          const premium = await import("@/lib/premium.server");
          const live = ["active", "trialing", "past_due"].includes(sub.status);
          if (live) {
            await premium.startMembership({
              homeownerId: owner,
              fundingSource: "homeowner_paid",
              stripeSubscriptionId: sub.id,
              stripeCustomerId: sub.customer ?? null,
              priceCents: sub.items?.data?.[0]?.price?.unit_amount ?? null,
            });
          } else {
            await premium.endMembership(owner);
          }
        }

        switch (event.type) {
          case "checkout.session.completed": {
            const subId = event.data.object?.subscription;
            if (subId) await route(await stripeRequest(`/subscriptions/${subId}`));
            break;
          }
          case "customer.subscription.created":
          case "customer.subscription.updated":
          case "customer.subscription.deleted":
          case "invoice.payment_failed":
          case "invoice.payment_succeeded": {
            const obj = event.data.object;
            const sub = obj?.object === "subscription" ? obj : obj?.subscription
              ? await stripeRequest(`/subscriptions/${obj.subscription}`)
              : null;
            if (sub) await route(sub);
            break;
          }
          default:
            break;
        }

        return new Response("ok");
      },
    },
  },
});
