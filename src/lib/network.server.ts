/**
 * Agent <-> lender network: connections, de-identified opportunity discovery,
 * agent-approved introductions, sponsored profiles, and campaign approvals.
 *
 * PRIVACY INVARIANT
 * -----------------
 * A lender is not a member of a connected agent's organization, so row-level
 * security already blocks it from reading that agent's clients or
 * opportunities directly. Every lender-facing read in this module goes through
 * an elevated client ONLY after the caller's membership and an active
 * connection have been verified, and it projects a de-identified shape:
 * category, strength, banded equity/LTV/tenure, city/state/ZIP. Never a name,
 * street address, email, or phone.
 *
 * The single exception is `revealApprovedContact`, which requires an
 * introduction request the AGENT has approved, and writes an audit row on
 * every call.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CATEGORY_META, equityBand, ltvBand, tenureBand } from "./opportunities";

export interface MyOrg {
  id: string;
  name: string;
  org_type: string;
  role: string;
  plan_key: string | null;
  sponsored_allocation: number;
  seat_limit: number | null;
}

/** Organizations the caller belongs to, optionally filtered by type. */
export async function myOrgs(
  supabase: any,
  userId: string,
  type?: "lender" | "agent",
): Promise<MyOrg[]> {
  const { data, error } = await supabase
    .from("lender_members")
    .select(
      "role, lender_org_id, lender_orgs(id, name, org_type, plan_key, sponsored_allocation, seat_limit)",
    )
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((m: any) => m.lender_orgs && (!type || m.lender_orgs.org_type === type))
    .map((m: any) => ({
      id: m.lender_orgs.id,
      name: m.lender_orgs.name,
      org_type: m.lender_orgs.org_type,
      role: m.role,
      plan_key: m.lender_orgs.plan_key ?? null,
      sponsored_allocation: m.lender_orgs.sponsored_allocation ?? 0,
      seat_limit: m.lender_orgs.seat_limit ?? null,
    }));
}

export async function assertMember(supabase: any, userId: string, orgId: string): Promise<MyOrg> {
  const orgs = await myOrgs(supabase, userId);
  const found = orgs.find((o) => o.id === orgId);
  if (!found) throw new Error("You do not have access to this organization");
  return found;
}

/** Assert an active (connected) relationship between a lender and an agent org. */
export async function assertConnection(
  supabase: any,
  lenderOrgId: string,
  agentOrgId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("agent_lender_connections")
    .select("id, status")
    .eq("lender_org_id", lenderOrgId)
    .eq("agent_org_id", agentOrgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.status !== "connected") {
    throw new Error("You are not connected to this agent");
  }
  return data.id;
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

export interface AgentNetworkSummary {
  connection_id: string;
  agent_org_id: string | null;
  agent_org_name: string;
  status: string;
  invited_email: string | null;
  invited_name: string | null;
  homeowner_count: number;
  opportunity_count: number;
  by_category: Record<string, number>;
  created_at: string;
}

/**
 * Network roll-up for one lender org: every connection, plus aggregate
 * homeowner and opportunity counts for the connected ones. No identities.
 */
export async function lenderNetworkSummary(
  supabase: any,
  lenderOrgId: string,
): Promise<{ agents: AgentNetworkSummary[]; totals: { agents: number; homeowners: number; opportunities: number; by_category: Record<string, number> } }> {
  const { data: connections, error } = await supabase
    .from("agent_lender_connections")
    .select("id, agent_org_id, invited_email, invited_name, status, created_at, lender_orgs!agent_lender_connections_agent_org_id_fkey(name)")
    .eq("lender_org_id", lenderOrgId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = connections ?? [];
  const connectedIds = rows
    .filter((c: any) => c.status === "connected" && c.agent_org_id)
    .map((c: any) => c.agent_org_id as string);

  // Aggregates require reading across the org boundary; membership + the
  // 'connected' status above are the authorization for this elevated read.
  const homeownerCounts = new Map<string, number>();
  const oppCounts = new Map<string, Record<string, number>>();

  if (connectedIds.length) {
    const { data: portfolios } = await supabaseAdmin
      .from("lender_portfolios")
      .select("id, lender_org_id")
      .in("lender_org_id", connectedIds);
    const portfolioOrg = new Map<string, string>(
      (portfolios ?? []).map((p: any) => [p.id, p.lender_org_id]),
    );

    if (portfolioOrg.size) {
      const { data: clients } = await supabaseAdmin
        .from("lender_portfolio_clients")
        .select("id, portfolio_id")
        .in("portfolio_id", [...portfolioOrg.keys()]);
      for (const c of clients ?? []) {
        const org = portfolioOrg.get(c.portfolio_id);
        if (org) homeownerCounts.set(org, (homeownerCounts.get(org) ?? 0) + 1);
      }
    }

    const { data: opps } = await supabaseAdmin
      .from("homeowner_opportunities")
      .select("org_id, category")
      .in("org_id", connectedIds)
      .eq("state", "open");
    for (const o of opps ?? []) {
      const bucket = oppCounts.get(o.org_id) ?? {};
      bucket[o.category] = (bucket[o.category] ?? 0) + 1;
      oppCounts.set(o.org_id, bucket);
    }
  }

  const agents: AgentNetworkSummary[] = rows.map((c: any) => {
    const byCategory = (c.agent_org_id && oppCounts.get(c.agent_org_id)) || {};
    return {
      connection_id: c.id,
      agent_org_id: c.agent_org_id ?? null,
      agent_org_name: c.lender_orgs?.name ?? c.invited_name ?? c.invited_email ?? "Invited agent",
      status: c.status,
      invited_email: c.invited_email ?? null,
      invited_name: c.invited_name ?? null,
      homeowner_count: (c.agent_org_id && homeownerCounts.get(c.agent_org_id)) || 0,
      opportunity_count: Object.values(byCategory).reduce((a: number, b: any) => a + b, 0),
      by_category: byCategory,
      created_at: c.created_at,
    };
  });

  const totals = {
    agents: agents.filter((a) => a.status === "connected").length,
    homeowners: agents.reduce((s, a) => s + a.homeowner_count, 0),
    opportunities: agents.reduce((s, a) => s + a.opportunity_count, 0),
    by_category: agents.reduce<Record<string, number>>((acc, a) => {
      for (const [k, v] of Object.entries(a.by_category)) acc[k] = (acc[k] ?? 0) + v;
      return acc;
    }, {}),
  };

  return { agents, totals };
}

// ---------------------------------------------------------------------------
// De-identified opportunity rows
// ---------------------------------------------------------------------------

export interface DeidentifiedOpportunity {
  id: string;
  category: string;
  category_label: string;
  headline: string;
  strength: string;
  score: number;
  reasons: string[];
  equity_band: string;
  ltv_band: string;
  tenure_band: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  agent_org_id: string;
  /** Set when this lender already has a request on this opportunity. */
  request_status: string | null;
  request_id: string | null;
}

/**
 * De-identified opportunity rows inside one connected agent's network.
 * Contains no name, street address, email, or phone by construction.
 */
export async function deidentifiedOpportunities(
  supabase: any,
  lenderOrgId: string,
  agentOrgId: string,
  opts: { category?: string; limit?: number } = {},
): Promise<DeidentifiedOpportunity[]> {
  await assertConnection(supabase, lenderOrgId, agentOrgId);

  let query = supabaseAdmin
    .from("homeowner_opportunities")
    .select("id, portfolio_client_id, category, strength, score, reasons, signals, state")
    .eq("org_id", agentOrgId)
    .eq("state", "open")
    .order("score", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.category) query = query.eq("category", opts.category);

  const { data: opps, error } = await query;
  if (error) throw new Error(error.message);
  const rows = opps ?? [];
  if (!rows.length) return [];

  const clientIds = [...new Set(rows.map((o: any) => o.portfolio_client_id))];
  // Location only — deliberately no name/address/email/phone selected.
  const { data: clients } = await supabaseAdmin
    .from("lender_portfolio_clients")
    .select("id, city, state, zip")
    .in("id", clientIds);
  const locations = new Map((clients ?? []).map((c: any) => [c.id, c]));

  const { data: requests } = await supabase
    .from("introduction_requests")
    .select("id, opportunity_id, status")
    .eq("lender_org_id", lenderOrgId)
    .in("opportunity_id", rows.map((o: any) => o.id));
  const requestByOpp = new Map((requests ?? []).map((r: any) => [r.opportunity_id, r]));

  return rows.map((o: any) => {
    const loc = locations.get(o.portfolio_client_id);
    const req = requestByOpp.get(o.id);
    return {
      id: o.id,
      category: o.category,
      category_label: CATEGORY_META[o.category as keyof typeof CATEGORY_META]?.label ?? o.category,
      headline:
        CATEGORY_META[o.category as keyof typeof CATEGORY_META]?.lenderBlurb ??
        "Homeowner may benefit from a financing conversation.",
      strength: o.strength,
      score: o.score,
      reasons: o.reasons ?? [],
      equity_band: equityBand(o.signals?.equity_cents),
      ltv_band: ltvBand(o.signals?.ltv_pct),
      tenure_band: tenureBand(o.signals?.months_since_close ?? 0),
      city: loc?.city ?? null,
      state: loc?.state ?? null,
      zip: loc?.zip ?? null,
      agent_org_id: agentOrgId,
      request_status: req?.status ?? null,
      request_id: req?.id ?? null,
    };
  });
}

/**
 * Reveal homeowner contact for an introduction the AGENT has approved.
 * Writes an audit row on every call. This is the only path in the codebase
 * that hands lender-side callers identifying homeowner details.
 */
export async function revealApprovedContact(
  supabase: any,
  userId: string,
  requestId: string,
) {
  const { data: req, error } = await supabase
    .from("introduction_requests")
    .select("id, status, lender_org_id, agent_org_id, portfolio_client_id, category")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!req) throw new Error("Introduction request not found");
  if (req.status !== "approved") {
    throw new Error("This introduction has not been approved by the agent yet");
  }
  await assertMember(supabase, userId, req.lender_org_id);

  const { data: client } = await supabaseAdmin
    .from("lender_portfolio_clients")
    .select("id, client_name, client_email, client_phone, address_line1, city, state, zip")
    .eq("id", req.portfolio_client_id)
    .maybeSingle();
  if (!client) throw new Error("Homeowner record not found");

  await supabase.from("introduction_reveals").insert({
    introduction_request_id: req.id,
    lender_org_id: req.lender_org_id,
    agent_org_id: req.agent_org_id,
    portfolio_client_id: req.portfolio_client_id,
    viewed_by: userId,
  });

  return {
    request_id: req.id,
    name: client.client_name,
    email: client.client_email,
    phone: client.client_phone,
    address: client.address_line1,
    city: client.city,
    state: client.state,
    zip: client.zip,
  };
}
