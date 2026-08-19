/**
 * Server-side credit plumbing.
 *
 * Every award is idempotent on an event key, so calling these from a code path
 * that runs twice never inflates a balance. Awards are deliberately written
 * with the service role: an agent must never be able to grant themselves
 * capacity, and the ledger is read-only to everyone in the app.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { creditReason, creditsFor, type CreditEventKind } from "./credits";

const admin = () => supabaseAdmin as any;

/** Award a credit for one portfolio client, once ever, for this event kind. */
export async function awardAgentCredit(
  orgId: string | null | undefined,
  clientId: string | null,
  kind: CreditEventKind,
  suffix?: string,
): Promise<void> {
  if (!orgId) return;
  const delta = creditsFor(kind);
  if (delta <= 0) return;
  const key = `${kind}:${clientId ?? orgId}${suffix ? `:${suffix}` : ""}`;
  try {
    await admin().rpc("award_agent_credit", {
      _org_id: orgId,
      _client_id: clientId,
      _event_key: key,
      _delta: delta,
      _reason: creditReason(kind),
    });
  } catch {
    // Credits must never break the action that earned them.
  }
}

/** Award against every agent-org record that tracks this homeowner. */
export async function awardForHomeowner(
  homeownerId: string,
  kind: CreditEventKind,
  suffix?: string,
): Promise<void> {
  try {
    const { data } = await admin()
      .from("lender_portfolio_clients")
      .select("id, lender_portfolios!inner(lender_org_id, lender_orgs!inner(id, org_type))")
      .eq("homeowner_id", homeownerId);
    for (const row of (data ?? []) as any[]) {
      const org = row.lender_portfolios?.lender_orgs;
      if (org?.org_type !== "agent") continue;
      await awardAgentCredit(org.id, row.id, kind, suffix);
    }
  } catch {
    /* non-fatal */
  }
}

/** Award against a single portfolio client, resolving its agent org. */
export async function awardForClient(
  clientId: string,
  kind: CreditEventKind,
  suffix?: string,
): Promise<void> {
  try {
    const { data } = await admin()
      .from("lender_portfolio_clients")
      .select("id, lender_portfolios!inner(lender_orgs!inner(id, org_type))")
      .eq("id", clientId)
      .maybeSingle();
    const org = (data as any)?.lender_portfolios?.lender_orgs;
    if (org?.org_type !== "agent") return;
    await awardAgentCredit(org.id, clientId, kind, suffix);
  } catch {
    /* non-fatal */
  }
}

// --- Balance ---------------------------------------------------------------

export interface CreditBalance {
  granted: number;
  earned: number;
  purchased: number;
  spent: number;
  remaining: number;
}

const EMPTY: CreditBalance = { granted: 0, earned: 0, purchased: 0, spent: 0, remaining: 0 };

export async function creditBalance(supabase: any, orgId: string): Promise<CreditBalance> {
  const { data, error } = await supabase.rpc("agent_credit_summary", { _org_id: orgId });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { ...EMPTY, ...row } : EMPTY;
}

/** Recent ledger lines, newest first — the "explain my balance" view. */
export async function creditHistory(supabase: any, orgId: string, limit = 40) {
  const { data } = await supabase
    .from("agent_credit_ledger")
    .select("id, kind, delta, reason, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as {
    id: string;
    kind: string;
    delta: number;
    reason: string;
    created_at: string;
  }[];
}

/** Credits earned this calendar month, grouped by reason. */
export async function earnedThisMonth(supabase: any, orgId: string) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await supabase
    .from("agent_credit_ledger")
    .select("delta, reason")
    .eq("org_id", orgId)
    .eq("kind", "earned")
    .gte("created_at", start.toISOString());
  const rows = (data ?? []) as { delta: number; reason: string }[];
  const bySource: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    total += r.delta;
    bySource[r.reason] = (bySource[r.reason] ?? 0) + r.delta;
  }
  return { total, bySource };
}

// --- Sponsored agent seats -------------------------------------------------

export async function seatsForSponsor(supabase: any, sponsorOrgId: string) {
  const { data } = await supabase
    .from("sponsored_agent_seats")
    .select("id, agent_org_id, credits_granted, status, started_at, ended_at")
    .eq("sponsor_org_id", sponsorOrgId)
    .order("started_at", { ascending: false });
  return (data ?? []) as any[];
}

export async function seatsForAgent(supabase: any, agentOrgId: string) {
  const { data } = await supabase
    .from("sponsored_agent_seats")
    .select("id, sponsor_org_id, credits_granted, status, started_at, ended_at")
    .eq("agent_org_id", agentOrgId)
    .eq("status", "active");
  return (data ?? []) as any[];
}

/** Sponsor one connected agent: creates the seat and grants the credits. */
export async function sponsorAgentSeat(
  sponsorOrgId: string,
  agentOrgId: string,
  credits: number,
  userId: string,
) {
  const { data: existing } = await admin()
    .from("sponsored_agent_seats")
    .select("id")
    .eq("sponsor_org_id", sponsorOrgId)
    .eq("agent_org_id", agentOrgId)
    .eq("status", "active")
    .maybeSingle();
  if (existing) throw new Error("This agent is already sponsored by your organization");

  const { data: seat, error } = await admin()
    .from("sponsored_agent_seats")
    .insert({
      sponsor_org_id: sponsorOrgId,
      agent_org_id: agentOrgId,
      credits_granted: credits,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const { error: ledgerError } = await admin().from("agent_credit_ledger").insert({
    org_id: agentOrgId,
    kind: "sponsor",
    delta: credits,
    reason: "Homeowner credits sponsored by a lender partner",
    event_key: `seat:${seat.id}`,
  });
  if (ledgerError) throw new Error(ledgerError.message);
  return { id: seat.id as string, credits };
}

/** Ending a seat stops future grants; credits already spent are never clawed back. */
export async function endAgentSeat(sponsorOrgId: string, seatId: string) {
  const { error } = await admin()
    .from("sponsored_agent_seats")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", seatId)
    .eq("sponsor_org_id", sponsorOrgId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** How many seats this lender's plan includes, and how many are live. */
export async function seatAllowance(supabase: any, sponsorOrgId: string) {
  const { data: org } = await supabase
    .from("lender_orgs")
    .select("plan_key, plan_tiers(sponsored_seats)")
    .eq("id", sponsorOrgId)
    .maybeSingle();
  const included = (org as any)?.plan_tiers?.sponsored_seats ?? null;
  const { count } = await supabase
    .from("sponsored_agent_seats")
    .select("id", { count: "exact", head: true })
    .eq("sponsor_org_id", sponsorOrgId)
    .eq("status", "active");
  const used = count ?? 0;
  return { included, used, remaining: included == null ? null : Math.max(0, included - used) };
}
