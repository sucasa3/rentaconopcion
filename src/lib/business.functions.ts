import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Business-side reads for the agent and lender command centers.
 *
 * One request fills the whole dashboard: headline counts, today's list, the
 * single opportunity set and campaign performance. No property-record lookups
 * happen here — the dashboard never triggers an external data pull.
 */

async function myOrgs(supabase: any, userId: string, orgType: "agent" | "lender") {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin) {
    const { data } = await supabase
      .from("lender_orgs")
      .select("id, name, org_type, plan")
      .eq("org_type", orgType);
    return { orgs: data ?? [], isAdmin: true, isManager: true };
  }
  const { data: members } = await supabase
    .from("lender_members")
    .select("lender_org_id, role, lender_orgs(id, name, org_type, plan)")
    .eq("user_id", userId);
  const mine = (members ?? []).filter((m: any) => m.lender_orgs?.org_type === orgType);
  return {
    orgs: mine.map((m: any) => m.lender_orgs),
    isAdmin: false,
    isManager: mine.some((m: any) => m.role === "owner"),
  };
}

export const getMyWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roleList = (roles ?? []).map((r: any) => r.role as string);

    const { data: members } = await supabase
      .from("lender_members")
      .select("role, lender_orgs(id, name, org_type)")
      .eq("user_id", userId);
    const orgTypes = (members ?? []).map((m: any) => m.lender_orgs?.org_type).filter(Boolean);

    const isAgent = orgTypes.includes("agent");
    const isLender = orgTypes.includes("lender") || roleList.includes("lender");
    const isAdmin = roleList.includes("admin");

    const home = isAgent ? "/agent" : isLender ? "/lender" : isAdmin ? "/admin" : "/dashboard";
    return { roles: roleList, isAgent, isLender, isAdmin, home };
  });

export const getBusinessOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ orgType: z.enum(["agent", "lender"]) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { orgs, isManager } = await myOrgs(supabase, userId, data.orgType);
    const orgIds = orgs.map((o: any) => o.id);

    const empty = {
      orgs: [] as any[],
      isManager,
      myUserId: userId,
      books: [] as any[],
      counts: { people: 0, activated: 0, prospects: 0, opportunities: 0, campaigns: 0 },
      opportunities: [] as any[],
      today: [] as any[],
      campaigns: [] as any[],
    };
    if (!orgIds.length) return empty;

    const { data: portfolios } = await supabase
      .from("lender_portfolios")
      .select("id, name, lender_org_id, assigned_user_id")
      .in("lender_org_id", orgIds);

    const visible = (portfolios ?? []).filter(
      (p: any) => isManager || !p.assigned_user_id || p.assigned_user_id === userId,
    );
    const bookIds = visible.map((p: any) => p.id);
    if (!bookIds.length) return { ...empty, orgs };

    const { data: clients } = await supabase
      .from("lender_portfolio_clients")
      .select("id, portfolio_id, client_name, client_email, homeowner_id, created_at, updated_at")
      .in("portfolio_id", bookIds);
    const rows = clients ?? [];
    const clientById = new Map(rows.map((c: any) => [c.id, c]));

    const { data: opps } = rows.length
      ? await supabase
          .from("homeowner_opportunities")
          .select("id, portfolio_client_id, category, strength, score, reasons, state")
          .in(
            "portfolio_client_id",
            rows.map((r: any) => r.id),
          )
          .eq("state", "open")
          .order("score", { ascending: false })
          .limit(200)
      : { data: [] as any[] };

    const opportunities = (opps ?? []).map((o: any) => {
      const c: any = clientById.get(o.portfolio_client_id);
      return {
        id: o.id,
        category: o.category,
        strength: o.strength,
        score: o.score,
        reason: (o.reasons ?? [])[0] ?? null,
        clientId: o.portfolio_client_id,
        clientName: c?.client_name ?? "Homeowner",
        activated: Boolean(c?.homeowner_id),
        portfolioId: c?.portfolio_id ?? null,
      };
    });

    // Campaigns: what is switched on for these orgs, plus delivery counts.
    const { data: activations } = await supabase
      .from("campaign_activations")
      .select("id, campaign_id, active, lender_org_id, campaigns(id, name, key)")
      .in("lender_org_id", orgIds)
      .eq("active", true);

    const campaignIds = [...new Set((activations ?? []).map((a: any) => a.campaign_id))];
    const { data: sends } = campaignIds.length
      ? await supabase
          .from("campaign_sends")
          .select("campaign_id, status")
          .in("campaign_id", campaignIds)
          .in("lender_org_id", orgIds)
      : { data: [] as any[] };

    const campaigns = campaignIds.map((id) => {
      const a: any = (activations ?? []).find((x: any) => x.campaign_id === id);
      const mine = (sends ?? []).filter((s: any) => s.campaign_id === id);
      return {
        id,
        name: a?.campaigns?.name ?? "Campaign",
        key: a?.campaigns?.key ?? null,
        sent: mine.filter((s: any) => s.status === "sent").length,
        queued: mine.filter((s: any) => s.status !== "sent").length,
        people: mine.length,
      };
    });

    // Today: the few people who most deserve a touch right now.
    const recentlyActivated = rows
      .filter((c: any) => c.homeowner_id)
      .slice(0, 20)
      .map((c: any) => ({
        kind: "activated" as const,
        clientId: c.id,
        portfolioId: c.portfolio_id,
        name: c.client_name ?? "Homeowner",
        line: "Activated their Home Profile",
      }));

    const today = [
      ...opportunities.slice(0, 3).map((o) => ({
        kind: "opportunity" as const,
        clientId: o.clientId,
        portfolioId: o.portfolioId,
        name: o.clientName,
        line: o.reason ?? "New signal",
        category: o.category,
      })),
      ...recentlyActivated.slice(0, 2),
    ];

    return {
      orgs,
      isManager,
      myUserId: userId,
      books: visible.map((p: any) => ({
        id: p.id,
        name: p.name,
        orgId: p.lender_org_id,
        clientCount: rows.filter((c: any) => c.portfolio_id === p.id).length,
      })),
      counts: {
        people: rows.length,
        activated: rows.filter((c: any) => c.homeowner_id).length,
        prospects: rows.filter((c: any) => !c.homeowner_id).length,
        opportunities: opportunities.length,
        campaigns: campaigns.length,
      },
      opportunities: opportunities.slice(0, 24),
      today,
      campaigns,
    };
  });
