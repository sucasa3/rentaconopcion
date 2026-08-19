/** Book statistics behind the SuCasa Score. Read as the calling user (RLS). */

export interface BookStats {
  clients: number;
  activated: number;
  profilesComplete: number;
  opportunities: number;
  engagedLast30d: number;
}

export async function agentBookStats(supabase: any, orgId: string): Promise<BookStats> {
  const { data: portfolios } = await supabase
    .from("lender_portfolios")
    .select("id")
    .eq("lender_org_id", orgId);
  const ids = (portfolios ?? []).map((p: any) => p.id);
  if (!ids.length) {
    return { clients: 0, activated: 0, profilesComplete: 0, opportunities: 0, engagedLast30d: 0 };
  }

  const { data: clients } = await supabase
    .from("lender_portfolio_clients")
    .select("id, homeowner_id")
    .in("portfolio_id", ids);
  const rows = (clients ?? []) as { id: string; homeowner_id: string | null }[];
  const homeownerIds = rows.map((r) => r.homeowner_id).filter(Boolean) as string[];

  let profilesComplete = 0;
  if (homeownerIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, address, city, full_name")
      .in("id", homeownerIds.slice(0, 500));
    profilesComplete = (profiles ?? []).filter(
      (p: any) => p.address && p.city && (p.full_name ?? "").length > 0,
    ).length;
  }

  const { count: opportunities } = await supabase
    .from("homeowner_opportunities")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { count: engaged } = await supabase
    .from("lender_activity")
    .select("id", { count: "exact", head: true })
    .eq("lender_org_id", orgId)
    .gte("created_at", since);

  return {
    clients: rows.length,
    activated: homeownerIds.length,
    profilesComplete,
    opportunities: opportunities ?? 0,
    engagedLast30d: engaged ?? 0,
  };
}

/** Remaining homeowner credits for the org that owns this book (null = not an agent org). */
export async function remainingCreditsForPortfolio(
  supabase: any,
  portfolioId: string,
): Promise<number | null> {
  const { data: portfolio } = await supabase
    .from("lender_portfolios")
    .select("lender_org_id, lender_orgs(org_type)")
    .eq("id", portfolioId)
    .maybeSingle();
  if ((portfolio as any)?.lender_orgs?.org_type !== "agent") return null;
  const { creditBalance } = await import("./credits.server");
  const balance = await creditBalance(supabase, (portfolio as any).lender_org_id);
  return balance.remaining;
}
