/**
 * Shared opportunity engine — server-only.
 *
 * When an agent and a lender both have the same homeowner in their books and
 * at least one side has an open opportunity, SuCasa creates a shared
 * opportunity so both professionals can co-work the relationship.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface SyncResult {
  created: number;
  skipped: number;
}

export async function syncSharedOpportunities(
  supabaseAdmin: SupabaseClient<Database>,
  opts: { connectionId?: string } = {},
): Promise<SyncResult> {
  let connQuery = supabaseAdmin
    .from("agent_lender_connections")
    .select("id, agent_org_id, lender_org_id")
    .eq("status", "active");
  if (opts.connectionId) connQuery = connQuery.eq("id", opts.connectionId);

  const { data: connections, error: connErr } = await connQuery;
  if (connErr) throw new Error(connErr.message);
  if (!connections?.length) return { created: 0, skipped: 0 };

  let created = 0;
  let skipped = 0;

  for (const conn of connections) {
    const [{ data: agentPortfolios }, { data: lenderPortfolios }] = await Promise.all([
      supabaseAdmin.from("lender_portfolios").select("id").eq("lender_org_id", conn.agent_org_id),
      supabaseAdmin.from("lender_portfolios").select("id").eq("lender_org_id", conn.lender_org_id),
    ]);

    const agentPortfolioIds = (agentPortfolios ?? []).map((p) => p.id);
    const lenderPortfolioIds = (lenderPortfolios ?? []).map((p) => p.id);
    if (!agentPortfolioIds.length || !lenderPortfolioIds.length) continue;

    const [{ data: agentClients }, { data: lenderClients }] = await Promise.all([
      supabaseAdmin
        .from("lender_portfolio_clients")
        .select("id, homeowner_id, client_email")
        .in("portfolio_id", agentPortfolioIds),
      supabaseAdmin
        .from("lender_portfolio_clients")
        .select("id, homeowner_id, client_email")
        .in("portfolio_id", lenderPortfolioIds),
    ]);

    const keyFor = (c: { homeowner_id: string | null; client_email: string | null }) =>
      c.homeowner_id ?? c.client_email?.toLowerCase()?.trim() ?? null;

    const agentByKey = new Map<string, string>();
    const lenderByKey = new Map<string, string>();

    for (const c of agentClients ?? []) {
      const k = keyFor(c);
      if (k && !agentByKey.has(k)) agentByKey.set(k, c.id);
    }
    for (const c of lenderClients ?? []) {
      const k = keyFor(c);
      if (k && !lenderByKey.has(k)) lenderByKey.set(k, c.id);
    }

    const matchedKeys = [...agentByKey.keys()].filter((k) => lenderByKey.has(k));
    if (!matchedKeys.length) continue;

    const matchedClientIds = new Set<string>();
    for (const k of matchedKeys) {
      matchedClientIds.add(agentByKey.get(k)!);
      matchedClientIds.add(lenderByKey.get(k)!);
    }

    const { data: opps } = await supabaseAdmin
      .from("homeowner_opportunities")
      .select("id, portfolio_client_id, org_id, category, strength, score")
      .in("portfolio_client_id", [...matchedClientIds])
      .eq("state", "open");

    const oppByClient = new Map<string, { id: string; score: number }[]>();
    for (const o of opps ?? []) {
      if (!oppByClient.has(o.portfolio_client_id)) oppByClient.set(o.portfolio_client_id, []);
      oppByClient.get(o.portfolio_client_id)!.push({ id: o.id, score: o.score ?? 0 });
    }

    const { data: existing } = await supabaseAdmin
      .from("shared_opportunities")
      .select("agent_opportunity_id, lender_opportunity_id, portfolio_client_id")
      .eq("connection_id", conn.id);

    const existingKeys = new Set(
      (existing ?? []).map(
        (e) => `${e.agent_opportunity_id ?? "null"}:${e.lender_opportunity_id ?? "null"}:${e.portfolio_client_id}`,
      ),
    );

    for (const k of matchedKeys) {
      const agentClientId = agentByKey.get(k)!;
      const lenderClientId = lenderByKey.get(k)!;
      const agentOpps = (oppByClient.get(agentClientId) ?? []).sort((a, b) => b.score - a.score);
      const lenderOpps = (oppByClient.get(lenderClientId) ?? []).sort((a, b) => b.score - a.score);

      if (!agentOpps.length && !lenderOpps.length) continue;

      const bestAgent = agentOpps[0];
      const bestLender = lenderOpps[0];
      const key = `${bestAgent?.id ?? "null"}:${bestLender?.id ?? "null"}:${lenderClientId}`;

      if (existingKeys.has(key)) {
        skipped++;
        continue;
      }

      const { error: insertErr } = await supabaseAdmin.from("shared_opportunities").insert({
        connection_id: conn.id,
        agent_org_id: conn.agent_org_id,
        lender_org_id: conn.lender_org_id,
        portfolio_client_id: lenderClientId,
        agent_opportunity_id: bestAgent?.id ?? null,
        lender_opportunity_id: bestLender?.id ?? null,
        status: "open",
      });

      if (insertErr) {
        console.error("Failed to create shared opportunity:", insertErr.message);
        skipped++;
      } else {
        created++;
        existingKeys.add(key);
      }
    }
  }

  return { created, skipped };
}
