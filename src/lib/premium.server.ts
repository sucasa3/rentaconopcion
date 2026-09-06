/**
 * Premium Home Intelligence Membership, sponsorship, consent and the
 * compliance audit trail.
 *
 * Membership belongs to the homeowner. Its funding source (homeowner-paid,
 * SuCasa-granted, sponsor-paid) is recorded but never changes what the
 * homeowner controls, and never touches an agent's entitlement.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DISCLOSURE_VERSION, type ConsentType, type PremiumFundingSource } from "./entitlements";

const admin = () => supabaseAdmin as any;

// --- Compliance audit -------------------------------------------------------

export async function logCompliance(event: {
  category: "entitlement" | "sponsorship" | "consent" | "sharing" | "membership";
  action: string;
  actorUserId?: string | null;
  orgId?: string | null;
  homeownerId?: string | null;
  entityType?: string;
  entityId?: string | null;
  detail?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await admin()
    .from("compliance_audit_events")
    .insert({
      category: event.category,
      action: event.action,
      actor_user_id: event.actorUserId ?? null,
      org_id: event.orgId ?? null,
      homeowner_id: event.homeownerId ?? null,
      entity_type: event.entityType ?? null,
      entity_id: event.entityId ?? null,
      detail: event.detail ?? null,
      metadata: event.metadata ?? {},
    });
}

/** What the lender subscription actually delivered — never a referral count. */
export async function logServiceDelivery(event: {
  orgId: string;
  eventType: string;
  homeownerId?: string | null;
  portfolioClientId?: string | null;
  quantity?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await admin()
    .from("service_delivery_events")
    .insert({
      org_id: event.orgId,
      event_type: event.eventType,
      homeowner_id: event.homeownerId ?? null,
      portfolio_client_id: event.portfolioClientId ?? null,
      quantity: event.quantity ?? 1,
      metadata: event.metadata ?? {},
    });
}

// --- Membership -------------------------------------------------------------

export type MembershipView = {
  isPremium: boolean;
  membership: any | null;
  fundingSource: PremiumFundingSource | null;
  sponsor: { orgId: string; name: string; logoUrl: string | null; contactName: string | null } | null;
  priceCents: number;
};

export async function readMembership(homeownerId: string): Promise<MembershipView> {
  const [{ data: membership }, { data: cfg }] = await Promise.all([
    admin()
      .from("premium_memberships")
      .select("*")
      .eq("homeowner_id", homeownerId)
      .eq("status", "active")
      .maybeSingle(),
    admin().from("platform_config").select("value_int").eq("key", "premium_price_cents").maybeSingle(),
  ]);

  let sponsor: MembershipView["sponsor"] = null;
  if (membership?.sponsorship_id) {
    const { data: s } = await admin()
      .from("premium_sponsorships")
      .select("lender_org_id, status, lender_orgs(name, logo_url, contact_name)")
      .eq("id", membership.sponsorship_id)
      .maybeSingle();
    if (s && s.status === "active") {
      sponsor = {
        orgId: s.lender_org_id,
        name: s.lender_orgs?.name ?? "Your sponsor",
        logoUrl: s.lender_orgs?.logo_url ?? null,
        contactName: s.lender_orgs?.contact_name ?? null,
      };
    }
  }

  return {
    isPremium: !!membership,
    membership: membership ?? null,
    fundingSource: (membership?.funding_source as PremiumFundingSource) ?? null,
    sponsor,
    priceCents: cfg?.value_int ?? 1900,
  };
}

/** Start or replace the homeowner's active membership. */
export async function startMembership(input: {
  homeownerId: string;
  fundingSource: PremiumFundingSource;
  sponsorshipId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
  priceCents?: number | null;
  actorUserId?: string | null;
}) {
  await admin()
    .from("premium_memberships")
    .update({ status: "ended", ends_at: new Date().toISOString() })
    .eq("homeowner_id", input.homeownerId)
    .eq("status", "active");

  const { data, error } = await admin()
    .from("premium_memberships")
    .insert({
      homeowner_id: input.homeownerId,
      funding_source: input.fundingSource,
      sponsorship_id: input.sponsorshipId ?? null,
      stripe_subscription_id: input.stripeSubscriptionId ?? null,
      stripe_customer_id: input.stripeCustomerId ?? null,
      price_cents: input.priceCents ?? null,
      disclosure_version: DISCLOSURE_VERSION,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await logCompliance({
    category: "membership",
    action: "membership_started",
    actorUserId: input.actorUserId ?? null,
    homeownerId: input.homeownerId,
    entityType: "premium_memberships",
    entityId: data.id,
    detail: `Premium started (${input.fundingSource})`,
  });
  return data;
}

export async function endMembership(homeownerId: string, actorUserId?: string | null) {
  await admin()
    .from("premium_memberships")
    .update({ status: "ended", canceled_at: new Date().toISOString(), ends_at: new Date().toISOString() })
    .eq("homeowner_id", homeownerId)
    .eq("status", "active");
  await logCompliance({
    category: "membership",
    action: "membership_ended",
    actorUserId: actorUserId ?? null,
    homeownerId,
    entityType: "premium_memberships",
  });
}

// --- Sponsorship (lender → one named homeowner) -----------------------------

/**
 * Sponsorship is always created for a designated homeowner. Legacy
 * lender-to-agent allocation rows are audit history and are never converted
 * into sponsorships here.
 */
export async function sponsorHomeowner(input: {
  lenderOrgId: string;
  homeownerId: string;
  portfolioClientId?: string | null;
  actorUserId: string;
}) {
  const { data: existing } = await admin()
    .from("premium_sponsorships")
    .select("id")
    .eq("lender_org_id", input.lenderOrgId)
    .eq("homeowner_id", input.homeownerId)
    .eq("status", "active")
    .maybeSingle();

  let sponsorshipId = existing?.id as string | undefined;
  if (!sponsorshipId) {
    const { data, error } = await admin()
      .from("premium_sponsorships")
      .insert({
        lender_org_id: input.lenderOrgId,
        homeowner_id: input.homeownerId,
        portfolio_client_id: input.portfolioClientId ?? null,
        created_by: input.actorUserId,
        disclosure_version: DISCLOSURE_VERSION,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    sponsorshipId = data.id;
  }

  const membership = await startMembership({
    homeownerId: input.homeownerId,
    fundingSource: "sponsor_paid",
    sponsorshipId,
    actorUserId: input.actorUserId,
  });

  await logCompliance({
    category: "sponsorship",
    action: "sponsorship_started",
    actorUserId: input.actorUserId,
    orgId: input.lenderOrgId,
    homeownerId: input.homeownerId,
    entityType: "premium_sponsorships",
    entityId: sponsorshipId ?? null,
    detail: "Lender funded a Premium membership for a designated homeowner",
  });
  await logServiceDelivery({
    orgId: input.lenderOrgId,
    eventType: "premium_membership_sponsored",
    homeownerId: input.homeownerId,
    portfolioClientId: input.portfolioClientId ?? null,
  });

  return { sponsorshipId, membership };
}

export async function endSponsorshipRow(id: string, actorUserId: string) {
  const { data } = await admin()
    .from("premium_sponsorships")
    .select("id, lender_org_id, homeowner_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new Error("Sponsorship not found");

  await admin()
    .from("premium_sponsorships")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", id);
  await admin()
    .from("premium_memberships")
    .update({ status: "ended", ends_at: new Date().toISOString() })
    .eq("sponsorship_id", id)
    .eq("status", "active");

  await logCompliance({
    category: "sponsorship",
    action: "sponsorship_ended",
    actorUserId,
    orgId: data.lender_org_id,
    homeownerId: data.homeowner_id,
    entityType: "premium_sponsorships",
    entityId: id,
  });
}

/** Homeowners this lender currently sponsors, plus what the plan allows. */
export async function sponsorshipsForOrg(orgId: string) {
  const [{ data: rows }, { data: org }] = await Promise.all([
    admin()
      .from("premium_sponsorships")
      .select("id, homeowner_id, portfolio_client_id, status, started_at, ended_at")
      .eq("lender_org_id", orgId)
      .order("started_at", { ascending: false })
      .limit(500),
    admin()
      .from("lender_orgs")
      .select("profile_allowance, plan_key, plan_tiers(profile_allowance)")
      .eq("id", orgId)
      .maybeSingle(),
  ]);
  const list = (rows ?? []) as any[];
  const active = list.filter((r) => r.status === "active");
  const allowance = org?.profile_allowance ?? org?.plan_tiers?.profile_allowance ?? 0;
  return {
    sponsorships: list,
    active: active.length,
    allowance,
    remaining: Math.max(0, allowance - active.length),
  };
}

// --- Consent ----------------------------------------------------------------

export async function recordConsent(input: {
  homeownerId: string;
  recipientOrgId: string | null;
  recipientKind?: "lender" | "agent" | "vendor";
  consentType: ConsentType;
  scope: string[];
  source?: string;
  context?: Record<string, unknown>;
  actorUserId?: string | null;
}) {
  const { data, error } = await admin()
    .from("consent_records")
    .insert({
      homeowner_id: input.homeownerId,
      recipient_org_id: input.recipientOrgId,
      recipient_kind: input.recipientKind ?? "lender",
      consent_type: input.consentType,
      scope: input.scope,
      source: input.source ?? "homeowner_action",
      context: input.context ?? {},
      disclosure_version: DISCLOSURE_VERSION,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await logCompliance({
    category: "consent",
    action: `consent_granted:${input.consentType}`,
    actorUserId: input.actorUserId ?? input.homeownerId,
    orgId: input.recipientOrgId,
    homeownerId: input.homeownerId,
    entityType: "consent_records",
    entityId: data.id,
    detail: `Scope: ${input.scope.join(", ") || "none"}`,
  });
  return data;
}

export async function revokeConsent(id: string, homeownerId: string) {
  await admin()
    .from("consent_records")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("homeowner_id", homeownerId);
  await logCompliance({
    category: "consent",
    action: "consent_revoked",
    actorUserId: homeownerId,
    homeownerId,
    entityType: "consent_records",
    entityId: id,
  });
}

export async function consentsForHomeowner(homeownerId: string) {
  const { data } = await admin()
    .from("consent_records")
    .select("id, recipient_org_id, recipient_kind, consent_type, scope, status, granted_at, revoked_at, lender_orgs(name)")
    .eq("homeowner_id", homeownerId)
    .order("granted_at", { ascending: false })
    .limit(200);
  return (data ?? []) as any[];
}
