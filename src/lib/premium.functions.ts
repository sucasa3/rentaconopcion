import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

/** The signed-in homeowner's Premium status, funding source and sponsor. */
export const getMyPremium = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readMembership } = await import("./premium.server");
    return readMembership(context.userId);
  });

/** Start a Stripe checkout for the homeowner's own $19/mo membership. */
export const startPremiumCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ returnUrl: z.string().url() }).parse(i))
  .handler(async ({ data, context }) => {
    const { stripeRequest } = await import("./billing.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: cfg } = await admin()
      .from("platform_config")
      .select("value_text")
      .eq("key", "premium_stripe_price_id")
      .maybeSingle();
    const priceId = cfg?.value_text;
    if (!priceId) throw new Error("Premium is not available for purchase yet.");

    const email = (context.claims as any)?.email ?? undefined;
    const session = await stripeRequest<{ url: string }>("/checkout/sessions", "POST", {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      success_url: `${data.returnUrl}?premium=success`,
      cancel_url: `${data.returnUrl}?premium=cancelled`,
      allow_promotion_codes: true,
      metadata: { sucasa_homeowner_id: context.userId, sucasa_product: "premium_membership" },
      subscription_data: {
        metadata: { sucasa_homeowner_id: context.userId, sucasa_product: "premium_membership" },
      },
    });
    return { url: session.url };
  });

/** Admin-only: grant Premium directly from SuCasa (pilots, comps, agent clients). */
export const grantPremium = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ homeownerId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { startMembership } = await import("./premium.server");
    return startMembership({
      homeownerId: data.homeownerId,
      fundingSource: "sucasa_grant",
      actorUserId: context.userId,
    });
  });

/** A lender sponsoring Premium for one designated homeowner. */
export const sponsorHomeownerPremium = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ lenderOrgId: uuid, homeownerId: uuid, portfolioClientId: uuid.optional() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: isManager } = await context.supabase.rpc("is_lender_manager", {
      _user_id: context.userId,
      _org_id: data.lenderOrgId,
    });
    if (!isManager) throw new Error("Only a manager can sponsor a membership");
    const { sponsorHomeowner } = await import("./premium.server");
    return sponsorHomeowner({
      lenderOrgId: data.lenderOrgId,
      homeownerId: data.homeownerId,
      portfolioClientId: data.portfolioClientId ?? null,
      actorUserId: context.userId,
    });
  });

/** Premium memberships this organization currently funds. */
export const getOrgSponsorships = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: isMember } = await context.supabase.rpc("is_lender_member", {
      _user_id: context.userId,
      _org_id: data.orgId,
    });
    if (!isMember) throw new Error("Forbidden");
    const { sponsorshipsForOrg } = await import("./premium.server");
    return sponsorshipsForOrg(data.orgId);
  });

export const endPremiumSponsorship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { endSponsorshipRow } = await import("./premium.server");
    await endSponsorshipRow(data.id, context.userId);
    return { ok: true };
  });

// --- Homeowner-controlled connection ---------------------------------------

/**
 * The homeowner asks to be connected about a specific topic. This is the only
 * thing that turns an insight into a conversation: sponsorship alone never
 * creates a lead.
 */
export const requestConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        recipientOrgId: uuid.nullable(),
        recipientKind: z.enum(["lender", "agent", "vendor"]).default("lender"),
        topic: z.string().max(160),
        scope: z.array(z.string().max(80)).max(20),
        note: z.string().max(1000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { recordConsent, logServiceDelivery } = await import("./premium.server");
    const consent = await recordConsent({
      homeownerId: context.userId,
      recipientOrgId: data.recipientOrgId,
      recipientKind: data.recipientKind,
      consentType: "connection_request",
      scope: data.scope,
      source: "homeowner_request",
      context: { topic: data.topic, note: data.note ?? null },
    });
    // Asking to connect also authorizes exactly the intelligence listed.
    await recordConsent({
      homeownerId: context.userId,
      recipientOrgId: data.recipientOrgId,
      recipientKind: data.recipientKind,
      consentType: "intelligence_access",
      scope: data.scope,
      source: "homeowner_request",
      context: { topic: data.topic, via: consent.id },
    });
    if (data.recipientOrgId) {
      await logServiceDelivery({
        orgId: data.recipientOrgId,
        eventType: "homeowner_connection_request",
        homeownerId: context.userId,
        metadata: { topic: data.topic },
      });
    }
    return { ok: true, consentId: consent.id };
  });

/** Everything the homeowner has permitted, and to whom. */
export const getMyConsents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { consentsForHomeowner } = await import("./premium.server");
    return { consents: await consentsForHomeowner(context.userId) };
  });

export const revokeMyConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { revokeConsent } = await import("./premium.server");
    await revokeConsent(data.id, context.userId);
    return { ok: true };
  });

/** Homeowners who asked this organization to connect — the only real lead list. */
export const getConnectionRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: isMember } = await context.supabase.rpc("is_lender_member", {
      _user_id: context.userId,
      _org_id: data.orgId,
    });
    if (!isMember) throw new Error("Forbidden");
    const { data: rows } = await context.supabase
      .from("consent_records")
      .select("id, homeowner_id, scope, context, granted_at, status")
      .eq("recipient_org_id", data.orgId)
      .eq("consent_type", "connection_request")
      .eq("status", "granted")
      .order("granted_at", { ascending: false })
      .limit(200);
    return { requests: (rows ?? []) as any[] };
  });
