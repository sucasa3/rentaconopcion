/**
 * Lender command center reads: My Book, Homeowners Served and Permissioned
 * Opportunities.
 *
 * Everything here is built on the sponsorship + consent layer. Sponsorship
 * alone never produces a lead: only an explicit homeowner consent record of
 * type `connection_request` puts a homeowner in the permissioned list, and
 * only `intelligence_access` lets the lender see SuCasa-generated insight.
 * Nothing in this module touches agent entitlements.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const admin = () => supabaseAdmin as any;

export type LenderCommandCenter = Awaited<ReturnType<typeof readLenderCommandCenter>>;

export async function readLenderCommandCenter(orgId: string) {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();

  const [{ data: org }, { data: books }, { data: sponsorships }, { data: consents }, { data: delivery }] =
    await Promise.all([
      admin()
        .from("lender_orgs")
        .select("id, name, plan_key, profile_allowance, plan_tiers(profile_allowance)")
        .eq("id", orgId)
        .maybeSingle(),
      admin().from("lender_portfolios").select("id, name").eq("lender_org_id", orgId),
      admin()
        .from("premium_sponsorships")
        .select("id, homeowner_id, portfolio_client_id, status, started_at, ended_at")
        .eq("lender_org_id", orgId)
        .order("started_at", { ascending: false })
        .limit(500),
      admin()
        .from("consent_records")
        .select("id, homeowner_id, consent_type, scope, status, granted_at, context")
        .eq("recipient_org_id", orgId)
        .eq("status", "granted")
        .order("granted_at", { ascending: false })
        .limit(500),
      admin()
        .from("service_delivery_events")
        .select("event_type, quantity, created_at")
        .eq("org_id", orgId)
        .gte("created_at", since)
        .limit(2000),
    ]);

  const bookIds = (books ?? []).map((b: any) => b.id);
  const { data: clients } = bookIds.length
    ? await admin()
        .from("lender_portfolio_clients")
        .select("id, portfolio_id, client_name, client_email, homeowner_id, archived_at, relationship_basis")
        .in("portfolio_id", bookIds)
    : { data: [] as any[] };

  const rows = (clients ?? []) as any[];
  const active = rows.filter((c) => !c.archived_at);
  const byHomeowner = new Map(active.filter((c) => c.homeowner_id).map((c) => [c.homeowner_id, c]));
  const byClientId = new Map(active.map((c) => [c.id, c]));

  // --- My Book -------------------------------------------------------------
  const allowance = org?.profile_allowance ?? org?.plan_tiers?.profile_allowance ?? 0;
  const myBook = {
    orgName: org?.name ?? "Your team",
    books: (books ?? []).map((b: any) => ({
      id: b.id,
      name: b.name,
      count: active.filter((c) => c.portfolio_id === b.id).length,
    })),
    total: active.length,
    activated: active.filter((c) => c.homeowner_id).length,
    archived: rows.length - active.length,
    allowance,
    remaining: Math.max(0, allowance - active.length),
  };

  // --- Homeowners Served ---------------------------------------------------
  const sponsorRows = (sponsorships ?? []) as any[];
  const activeSponsorships = sponsorRows.filter((s) => s.status === "active");
  const { data: memberships } = activeSponsorships.length
    ? await admin()
        .from("premium_memberships")
        .select("id, homeowner_id, status, funding_source, started_at, sponsorship_id")
        .in(
          "sponsorship_id",
          activeSponsorships.map((s) => s.id),
        )
        .eq("status", "active")
    : { data: [] as any[] };
  const membershipBySponsorship = new Map(
    ((memberships ?? []) as any[]).map((m) => [m.sponsorship_id, m]),
  );

  const deliveryCounts: Record<string, number> = {};
  for (const e of (delivery ?? []) as any[]) {
    deliveryCounts[e.event_type] = (deliveryCounts[e.event_type] ?? 0) + (e.quantity ?? 1);
  }

  const homeownersServed = {
    activeMemberships: activeSponsorships.filter((s) => membershipBySponsorship.has(s.id)).length,
    endedMemberships: sponsorRows.length - activeSponsorships.length,
    remainingSponsorships: Math.max(0, allowance - activeSponsorships.length),
    list: activeSponsorships.slice(0, 50).map((s) => {
      const c =
        (s.portfolio_client_id ? byClientId.get(s.portfolio_client_id) : null) ??
        byHomeowner.get(s.homeowner_id);
      return {
        id: s.id,
        homeownerId: s.homeowner_id,
        name: c?.client_name ?? "Homeowner",
        startedAt: s.started_at,
        membershipActive: membershipBySponsorship.has(s.id),
      };
    }),
    delivered: deliveryCounts,
  };

  // --- Permissioned Opportunities -----------------------------------------
  const consentRows = (consents ?? []) as any[];
  const requests = consentRows.filter((c) => c.consent_type === "connection_request");
  const intelligence = new Set(
    consentRows.filter((c) => c.consent_type === "intelligence_access").map((c) => c.homeowner_id),
  );

  const permissionedClientIds = active
    .filter((c) => c.homeowner_id && intelligence.has(c.homeowner_id))
    .map((c) => c.id);

  const { data: opps } = permissionedClientIds.length
    ? await admin()
        .from("homeowner_opportunities")
        .select("id, portfolio_client_id, category, strength, score, reasons, state")
        .in("portfolio_client_id", permissionedClientIds)
        .eq("state", "open")
        .order("score", { ascending: false })
        .limit(50)
    : { data: [] as any[] };

  const permissioned = {
    requests: requests.slice(0, 50).map((c) => {
      const client = byHomeowner.get(c.homeowner_id);
      return {
        id: c.id,
        homeownerId: c.homeowner_id,
        name: client?.client_name ?? "Homeowner",
        clientId: client?.id ?? null,
        portfolioId: client?.portfolio_id ?? null,
        topic: (c.context as any)?.topic ?? "Wants to talk",
        note: (c.context as any)?.note ?? null,
        scope: (c.scope ?? []) as string[],
        grantedAt: c.granted_at,
        hasIntelligenceAccess: intelligence.has(c.homeowner_id),
      };
    }),
    opportunities: ((opps ?? []) as any[]).map((o) => {
      const c = byClientId.get(o.portfolio_client_id);
      return {
        id: o.id,
        category: o.category,
        strength: o.strength,
        score: o.score,
        reason: (o.reasons ?? [])[0] ?? null,
        name: c?.client_name ?? "Homeowner",
        clientId: o.portfolio_client_id,
        portfolioId: c?.portfolio_id ?? null,
      };
    }),
    intelligenceGrants: intelligence.size,
  };

  return { myBook, homeownersServed, permissioned };
}
