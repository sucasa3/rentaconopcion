import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Access: an "agent" is a member of a lender_org whose org_type = 'agent'.
// Admins can see everything.
// ---------------------------------------------------------------------------
async function agentOrgIds(
  supabase: any,
  userId: string,
  opts: { allowEmpty?: boolean } = {},
): Promise<{ ids: string[]; isAdmin: boolean }> {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin) {
    const { data } = await supabase.from("lender_orgs").select("id").eq("org_type", "agent");
    return { ids: (data ?? []).map((o: any) => o.id), isAdmin: true };
  }
  const { data: members } = await supabase
    .from("lender_members")
    .select("lender_org_id, lender_orgs(id, org_type)")
    .eq("user_id", userId);
  const ids = (members ?? [])
    .filter((m: any) => m.lender_orgs?.org_type === "agent")
    .map((m: any) => m.lender_org_id);
  if (!ids.length && !opts.allowEmpty) throw new Error("Forbidden: agent access required");
  return { ids, isAdmin: false };
}

export const listAgentPortfolios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Don't throw here: this is the agent portal landing page, and a signed-in
    // user without agent access should see the empty state, not a crash.
    const { ids, isAdmin } = await agentOrgIds(context.supabase, context.userId, {
      allowEmpty: true,
    });
    if (!ids.length)
      return { orgs: [], portfolios: [], members: [] as any[], isManager: isAdmin, myUserId: context.userId };


    const { data: orgs } = await context.supabase
      .from("lender_orgs")
      .select("id, name, plan, active")
      .in("id", ids);

    const { data: portfolios, error } = await context.supabase
      .from("lender_portfolios")
      .select("id, name, lender_org_id, assigned_user_id, created_at")
      .in("lender_org_id", ids)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const withCounts: Array<{
      id: string;
      name: string;
      lender_org_id: string;
      assigned_user_id: string | null;
      created_at: string;
      client_count: number;
    }> = [];
    for (const p of portfolios ?? []) {
      const { count } = await context.supabase
        .from("lender_portfolio_clients")
        .select("id", { count: "exact", head: true })
        .eq("portfolio_id", p.id);
      withCounts.push({
        id: p.id,
        name: p.name,
        lender_org_id: p.lender_org_id,
        assigned_user_id: p.assigned_user_id ?? null,
        created_at: p.created_at,
        client_count: count ?? 0,
      });
    }

    // Roster of everyone in these agencies (names need an elevated read).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: allMembers } = await supabaseAdmin
      .from("lender_members")
      .select("lender_org_id, user_id, role")
      .in("lender_org_id", ids);
    const memberIds = [...new Set((allMembers ?? []).map((m: any) => m.user_id))];
    const { data: profiles } = memberIds.length
      ? await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", memberIds)
      : { data: [] as any[] };
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    const myRoles = (allMembers ?? []).filter((m: any) => m.user_id === context.userId);
    const isManager = isAdmin || myRoles.some((m: any) => m.role === "owner");

    return {
      orgs: orgs ?? [],
      portfolios: withCounts,
      isManager,
      myUserId: context.userId,
      members: (allMembers ?? []).map((m: any) => ({
        org_id: m.lender_org_id,
        user_id: m.user_id,
        role: m.role,
        name:
          profileMap.get(m.user_id)?.full_name ||
          profileMap.get(m.user_id)?.email ||
          "Team member",
      })),
    };
  });

const AssignAgentSchema = z.object({
  portfolioId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
});
export const assignAgentPortfolioOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AssignAgentSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await agentOrgIds(context.supabase, context.userId);

    const { data: portfolio } = await context.supabase
      .from("lender_portfolios")
      .select("id, lender_org_id")
      .eq("id", data.portfolioId)
      .maybeSingle();
    if (!portfolio) throw new Error("Portfolio not found");

    if (!isAdmin) {
      const { data: me } = await context.supabase
        .from("lender_members")
        .select("role")
        .eq("lender_org_id", (portfolio as any).lender_org_id)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!me || me.role !== "owner") throw new Error("Forbidden: broker access required");
    }

    if (data.userId) {
      const { data: target } = await context.supabase
        .from("lender_members")
        .select("user_id")
        .eq("lender_org_id", (portfolio as any).lender_org_id)
        .eq("user_id", data.userId)
        .maybeSingle();
      if (!target) throw new Error("That user is not a member of this agency");
    }

    const { error } = await context.supabase
      .from("lender_portfolios")
      .update({ assigned_user_id: data.userId })
      .eq("id", data.portfolioId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// ---------------------------------------------------------------------------
// Portfolio view with move scores. Reads ONLY the cached property_intel rows
// (zero ATTOM spend); use enrichAgentPortfolio to fill the cache.
// ---------------------------------------------------------------------------
export const getAgentPortfolio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        sellCostPct: z.number().min(0).max(20).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await agentOrgIds(context.supabase, context.userId);

    const { data: portfolio, error } = await context.supabase
      .from("lender_portfolios")
      .select("id, name, lender_org_id, lender_orgs(name)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!portfolio) throw new Error("Portfolio not found");

    const sellCostPct = data.sellCostPct ?? 8;

    const { data: clients, error: cErr } = await context.supabase
      .from("lender_portfolio_clients")
      .select(
        "id, client_name, client_email, client_phone, address_line1, city, state, zip, close_date, loan_amount_at_close_cents, rate_at_close, term_months, notes, homeowner_id",
      )
      .eq("portfolio_id", data.id);
    if (cErr) throw new Error(cErr.message);

    const ids = (clients ?? []).map((c: any) => c.id);
    let listings: Record<string, any> = {};
    if (ids.length) {
      const { data: ls } = await context.supabase
        .from("property_listing_status")
        .select("*")
        .in("portfolio_client_id", ids);
      for (const l of ls ?? []) listings[l.portfolio_client_id] = l;
    }

    // Behavioral engagement — aggregate counts only, never the raw activity log.
    const engagementByClient: Record<string, any> = {};
    {
      const { data: eng } = await (context.supabase as any).rpc("portfolio_engagement", {
        _portfolio_id: data.id,
      });
      for (const row of (eng as any[]) ?? []) engagementByClient[row.portfolio_client_id] = row;
    }


    // Referral visibility: service requests placed by linked homeowners in
    // this book. Every job is a touchpoint the agent can be credited for.
    const homeownerIds = (clients ?? [])
      .map((c: any) => c.homeowner_id)
      .filter(Boolean) as string[];
    const referralsByHomeowner: Record<string, any[]> = {};
    if (homeownerIds.length) {
      const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
      const { data: reqs } = await admin
        .from("service_requests")
        .select("id, homeowner_id, category, status, created_at, amount_cents, scheduled_at")
        .in("homeowner_id", homeownerIds)
        .order("created_at", { ascending: false })
        .limit(500);
      for (const r of reqs ?? []) {
        (referralsByHomeowner[r.homeowner_id] ??= []).push({
          id: r.id,
          category: r.category,
          status: r.status,
          created_at: r.created_at,
          amount_cents: r.amount_cents,
          scheduled_at: r.scheduled_at,
        });
      }
    }

    // Recommendations due: open, high/medium-urgency inspection findings for
    // linked homeowners that have no matching service job yet.
    const recsByHomeowner: Record<string, any[]> = {};
    if (homeownerIds.length) {
      const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
      const { data: findings } = await admin
        .from("home_inspection_findings")
        .select(
          "id, user_id, system, condition, urgency, recommended_action, recommended_category, created_at",
        )
        .in("user_id", homeownerIds)
        .in("urgency", ["high", "medium"])
        .order("created_at", { ascending: false })
        .limit(500);
      for (const f of findings ?? []) {
        const done = (referralsByHomeowner[f.user_id] ?? []).some(
          (r: any) =>
            f.recommended_category &&
            String(r.category).toLowerCase() === String(f.recommended_category).toLowerCase(),
        );
        if (done) continue;
        const bucket = (recsByHomeowner[f.user_id] ??= []);
        if (bucket.length >= 3) continue;
        bucket.push({
          id: f.id,
          source: "inspection" as const,
          system: f.system,
          condition: f.condition,
          urgency: f.urgency,
          recommended_action: f.recommended_action,
          recommended_category: f.recommended_category,
          created_at: f.created_at,
        });
      }
    }

    // Communicated: campaign sends recorded against clients in this book.
    const touchesByClient: Record<string, any[]> = {};
    if (ids.length) {
      const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
      const { data: sends } = await admin
        .from("campaign_sends")
        .select(
          "id, portfolio_client_id, subject, status, scheduled_for, sent_at, created_at, campaigns:campaign_id(name, channel)",
        )
        .in("portfolio_client_id", ids)
        .order("created_at", { ascending: false })
        .limit(500);
      for (const s of sends ?? []) {
        if (!s.portfolio_client_id) continue;
        (touchesByClient[s.portfolio_client_id] ??= []).push({
          id: s.id,
          subject: s.subject,
          status: s.status,
          scheduled_for: s.scheduled_for,
          sent_at: s.sent_at,
          created_at: s.created_at,
          campaign_name: (s.campaigns as any)?.name ?? "Campaign",
          channel: (s.campaigns as any)?.channel ?? "email",
        });
      }
    }

    // Seen / reviewed state for this agent on this book. Drives the "New" dot
    // and the manual "Mark reviewed" hide.
    const seenState: Record<string, { first_seen_at: string; reviewed_at: string | null }> = {};
    {
      const { data: seenRows } = await context.supabase
        .from("agent_feed_seen")
        .select("item_key, first_seen_at, reviewed_at")
        .eq("user_id", context.userId)
        .eq("portfolio_id", data.id);
      for (const s of seenRows ?? [])
        seenState[s.item_key] = {
          first_seen_at: s.first_seen_at,
          reviewed_at: s.reviewed_at,
        };
    }


    const { normalizeAddress } = await import("@/lib/attom.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      extractOwnership,
      extractCharacteristics,
      extractTaxTrend,
      computeMoveScore,
      computeListingReadiness,
      draftOpener,
    } = await import("@/lib/agent.server");
    const { computeEngagement, combineIntent } = await import("@/lib/engagement");
    const { extractAvm, extractSales, extractMortgage, extractPermits, extractTax, estimateLoanBalance } =
      await import("@/lib/valuation.server");
    const { buildMaintenanceTimeline, needsFromTimeline, recentImprovementNeeds } = await import(
      "@/lib/maintenance-rules"
    );

    const addrKey = (c: any) =>
      normalizeAddress(
        [c.address_line1, c.city, [c.state, c.zip].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", "),
      );

    const keys = Array.from(new Set((clients ?? []).map(addrKey)));
    const intelByAddr: Record<string, any> = {};
    for (let i = 0; i < keys.length; i += 200) {
      const { data: rows } = await supabaseAdmin
        .from("property_intel")
        .select("address_normalized, avm, sales, mortgage, permits, tax, owner, detail")
        .in("address_normalized", keys.slice(i, i + 200));
      for (const r of rows ?? []) intelByAddr[r.address_normalized] = r;
    }

    const enriched = (clients ?? []).map((c: any) => {
      const intel = intelByAddr[addrKey(c)] ?? null;
      const avm = intel?.avm ? extractAvm(intel.avm) : null;
      const sales = intel?.sales ? extractSales(intel.sales) : null;
      const mortgage = intel?.mortgage ? extractMortgage(intel.mortgage) : null;
      const permits = intel?.permits ? extractPermits(intel.permits) : null;
      const owner = intel?.owner ? extractOwnership(intel.owner) : null;
      const chars = intel?.detail ? extractCharacteristics(intel.detail) : null;
      const assessedSummary = intel?.tax ? extractTax(intel.tax) : null;
      const value =
        avm?.estimate ?? assessedSummary?.marketTotal ?? assessedSummary?.assessedTotal ?? null;
      const tax = intel?.tax ? extractTaxTrend(intel.tax, value) : null;

      const balance = mortgage ? estimateLoanBalance(mortgage) : null;
      const equityDollars = value != null && balance != null ? value - balance : null;
      const equityPct = value && equityDollars != null ? Math.max(0, equityDollars / value) : null;

      const lastSaleDate = sales?.lastSale?.date ?? c.close_date ?? null;
      const tenureYears = lastSaleDate
        ? (Date.now() - new Date(lastSaleDate).getTime()) / (365.25 * 24 * 3600 * 1000)
        : null;

      const listing = listings[c.id] ?? null;
      const score = computeMoveScore({
        tenureYears,
        equityPct,
        equityDollars,
        ownerOccupied: owner?.ownerOccupied ?? null,
        lastPermitDate: permits?.lastPermitDate ?? null,
        permitTotalValue: permits?.totalValue ?? null,
        taxChangePct: tax?.taxChangePct ?? null,
        listing: listing
          ? {
              status: listing.status,
              list_price_cents: listing.list_price_cents,
              list_date: listing.list_date,
              expiry_date: listing.expiry_date,
              listed_with_other_agent: listing.listed_with_other_agent,
              listing_agent_name: listing.listing_agent_name,
              source: listing.source,
            }
          : null,
        livingSqft: chars?.livingSqft ?? null,
        beds: chars?.beds ?? null,
      });

      // Behavior layer: what the homeowner actually did lately.
      const engagement = computeEngagement(engagementByClient[c.id] ?? null);
      const intent = combineIntent(score.score, score.band, engagement);

      const readiness = computeListingReadiness({
        estimatedValue: value,
        loanBalance: balance,
        sellCostPct,
        yearBuilt: chars?.yearBuilt ?? null,
        lastPermitDate: permits?.lastPermitDate ?? null,
        tenureYears,
        hasIntel: !!intel,
        listing: listing as any,
        hasContact: !!(c.client_email || c.client_phone),
      });

      const referrals = c.homeowner_id ? referralsByHomeowner[c.homeowner_id] ?? [] : [];
      const inspectionNeeds = c.homeowner_id ? recsByHomeowner[c.homeowner_id] ?? [] : [];
      const touches = touchesByClient[c.id] ?? [];

      // Property-record needs: component lifespans projected off year built and
      // any permit that reset the clock. Works without a linked homeowner.
      const timeline = buildMaintenanceTimeline(chars?.yearBuilt ?? null, permits?.events ?? []);
      const recordNeeds =
        chars?.yearBuilt || (permits?.events?.length ?? 0) > 0
          ? needsFromTimeline(timeline, c.id)
          : [];
      const permitNeeds = recentImprovementNeeds(permits?.events ?? [], c.id);

      // Suppress anything already handled: an open/complete job in the same
      // category, or a campaign already sent that covers it.
      const handledCategories = new Set(
        referrals.map((r: any) => String(r.category ?? "").toLowerCase()),
      );
      const communicatedText = touches
        .map((t: any) => `${t.campaign_name ?? ""} ${t.subject ?? ""}`.toLowerCase())
        .join(" | ");

      const seenCategories = new Set<string>();
      const recommendations = [...inspectionNeeds, ...recordNeeds, ...permitNeeds]
        .filter((r: any) => {
          const cat = String(r.recommended_category ?? "").toLowerCase();
          if (cat) {
            if (handledCategories.has(cat)) return false;
            if (communicatedText.includes(cat)) return false;
            if (seenCategories.has(cat)) return false;
            seenCategories.add(cat);
          }
          return true;
        })
        .slice(0, 3)
        .map((r: any) => ({
          ...r,
          item_key: `rec:${r.id}`,
          is_new: !seenState[`rec:${r.id}`],
          reviewed_at: seenState[`rec:${r.id}`]?.reviewed_at ?? null,
        }));

      const referralsDecorated = referrals.map((r: any) => ({
        ...r,
        item_key: `ref:${r.id}`,
        is_new: !seenState[`ref:${r.id}`],
      }));

      const needsData = !chars?.yearBuilt && (permits?.events?.length ?? 0) === 0;




      return {
        id: c.id,
        name: c.client_name,
        email: c.client_email,
        phone: c.client_phone,
        address: c.address_line1,
        city: c.city,
        state: c.state,
        zip: c.zip,
        linked: !!c.homeowner_id,
        estimated_value: value,
        loan_balance: balance,
        equity_dollars: equityDollars,
        equity_pct: equityPct,
        tenure_years: tenureYears,
        last_sale_price: sales?.lastSale?.amount ?? null,
        last_sale_date: sales?.lastSale?.date ?? null,
        beds: chars?.beds ?? null,
        baths: chars?.baths ?? null,
        sqft: chars?.livingSqft ?? null,
        year_built: chars?.yearBuilt ?? null,
        owner_occupied: owner?.ownerOccupied ?? null,
        permit_total_value: permits?.totalValue ?? null,
        last_permit_date: permits?.lastPermitDate ?? null,
        tax_amount: tax?.latestTaxAmount ?? null,
        tax_change_pct: tax?.taxChangePct ?? null,
        listing,
        has_intel: !!intel,
        move_score: intent.score,
        band: intent.band,
        property_score: score.score,
        engagement_score: engagement.score,
        engagement_signals: engagement.signals,
        last_activity_at: engagement.lastActivityAt,
        has_behavior: engagement.hasBehavior,
        signals: [
          ...engagement.signals.map((s: any) => ({
            kind: "engagement",
            label: s.label,
            detail: s.detail,
            weight: s.weight,
            tone: "hot",
          })),
          ...score.signals,
        ],
        opener: draftOpener(c.client_name, score),
        readiness_score: readiness.score,
        readiness_label: readiness.label,
        readiness_checks: readiness.checks,
        net_proceeds: readiness.netProceeds,
        referrals: referralsDecorated,
        referral_count: referralsDecorated.length,

        recommendations,
        recommendation_count: recommendations.length,
        recommendations_need_data: needsData,
        touches,
        touch_count: touches.length,
      };
    });


    enriched.sort((a, b) => b.move_score - a.move_score);

    const bands = { high: 0, hot: 0, warm: 0, nurture: 0, hold: 0 } as Record<string, number>;
    for (const c of enriched) bands[c.band] += 1;

    const readinessCounts = { "list-ready": 0, "prep-needed": 0, "not-ready": 0 } as Record<
      string,
      number
    >;
    for (const c of enriched) readinessCounts[c.readiness_label] += 1;

    // Top listing opportunities: intent × readiness, highest net proceeds first.
    const topListing = [...enriched]
      .filter((c) => c.band !== "hold" && c.readiness_label !== "not-ready")
      .sort(
        (a, b) =>
          b.move_score * 1.5 +
          b.readiness_score -
          (a.move_score * 1.5 + a.readiness_score),
      )
      .slice(0, 10);

    // High intent seller feed: behavior-backed, freshest first.
    const highIntent = enriched
      .filter((c: any) => c.band === "high")
      .sort((a: any, b: any) => b.move_score - a.move_score)
      .map((c: any) => ({
        client_id: c.id,
        client_name: c.client_name,
        address: c.address_line1,
        score: c.move_score,
        engagement_score: c.engagement_score,
        last_activity_at: c.last_activity_at,
        reason: c.engagement_signals?.[0]?.label ?? "Recent dashboard activity",
        detail: c.engagement_signals?.[0]?.detail ?? null,
        signals: c.engagement_signals ?? [],
        readiness_label: c.readiness_label,
        net_proceeds: c.net_proceeds,
      }));

    const referralFeed = enriched
      .flatMap((c) =>
        (c.referrals ?? []).map((r: any) => ({
          ...r,
          client_id: c.id,
          client_name: c.name,
          city: c.city,
        })),
      )
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 12);

    const recommendationFeed = enriched
      .flatMap((c) =>
        (c.recommendations ?? []).map((r: any) => ({
          ...r,
          client_id: c.id,
          client_name: c.name,
          city: c.city,
        })),
      )
      .sort((a, b) => {
        const rank = (u: string) => (u === "high" ? 0 : u === "medium" ? 1 : 2);
        const d = rank(String(a.urgency)) - rank(String(b.urgency));
        return d !== 0 ? d : a.created_at < b.created_at ? 1 : -1;
      })
      .slice(0, 12);

    const touchFeed = enriched
      .flatMap((c) =>
        (c.touches ?? []).map((t: any) => ({
          ...t,
          client_id: c.id,
          client_name: c.name,
          city: c.city,
        })),
      )
      .sort((a, b) => {
        const at = a.sent_at ?? a.scheduled_for ?? a.created_at;
        const bt = b.sent_at ?? b.scheduled_for ?? b.created_at;
        return at < bt ? 1 : -1;
      })
      .slice(0, 12);

    const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000;
    const touches30d = enriched.reduce(
      (s, c) =>
        s +
        (c.touches ?? []).filter(
          (t: any) => t.sent_at && new Date(t.sent_at).getTime() >= thirtyDaysAgo,
        ).length,
      0,
    );

    return {
      portfolio: {
        id: (portfolio as any).id,
        name: (portfolio as any).name,
        orgName: (portfolio as any).lender_orgs?.name ?? "Agency",
      },
      summary: {
        total: enriched.length,
        with_intel: enriched.filter((c) => c.has_intel).length,
        with_value: enriched.filter((c) => c.estimated_value != null).length,
        unmappable: enriched.filter((c) => !c.city && !c.zip).length,
        bands,
        readiness: readinessCounts,
        sell_cost_pct: sellCostPct,
        total_equity: enriched.reduce((s, c) => s + (c.equity_dollars ?? 0), 0),
        total_gci_potential: Math.round(
          topListing.reduce((s, c) => s + (c.estimated_value ?? 0) * 0.025, 0),
        ),
        avg_tenure:
          enriched.length
            ? enriched.reduce((s, c) => s + (c.tenure_years ?? 0), 0) / enriched.length
            : 0,
        expired: enriched.filter(
          (c) => c.listing?.status === "expired" || c.listing?.status === "withdrawn",
        ).length,
        linked: enriched.filter((c) => c.linked).length,
        active_referrals: referralFeed.filter((r) => r.status !== "completed").length,
        recommendations_due: enriched.reduce(
          (s, c) => s + (c.recommendations ?? []).filter((r: any) => !r.reviewed_at).length,
          0,
        ),
        new_recommendations: enriched.reduce(
          (s, c) =>
            s + (c.recommendations ?? []).filter((r: any) => r.is_new && !r.reviewed_at).length,
          0,
        ),
        new_referrals: enriched.reduce(
          (s, c) => s + (c.referrals ?? []).filter((r: any) => r.is_new).length,
          0,
        ),
        touches_30d: touches30d,
        high_intent: highIntent.length,

      },
      top_listing_opportunities: topListing,
      high_intent_feed: highIntent,
      referral_feed: referralFeed,
      recommendation_feed: recommendationFeed,
      touch_feed: touchFeed,
      clients: enriched,
    };
  });

// ---------------------------------------------------------------------------
// Listing status upsert (manual today, MLS events later).
// ---------------------------------------------------------------------------
export const setListingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        status: z.enum(["off_market", "active", "pending", "sold", "expired", "withdrawn"]),
        listPriceCents: z.number().int().nonnegative().nullable().optional(),
        listDate: z.string().nullable().optional(),
        expiryDate: z.string().nullable().optional(),
        listedWithOtherAgent: z.boolean().optional(),
        listingAgentName: z.string().max(160).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await agentOrgIds(context.supabase, context.userId);
    const { error } = await context.supabase.from("property_listing_status").upsert(
      {
        portfolio_client_id: data.clientId,
        status: data.status,
        list_price_cents: data.listPriceCents ?? null,
        list_date: data.listDate || null,
        expiry_date: data.expiryDate || null,
        listed_with_other_agent: data.listedWithOtherAgent ?? false,
        listing_agent_name: data.listingAgentName || null,
        source: "manual",
      },
      { onConflict: "portfolio_client_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Cache warm-up: pulls the agent-relevant ATTOM classes for rows that have no
// cached intel yet. Batched + capped so ATTOM spend stays predictable.
// ---------------------------------------------------------------------------
export const enrichAgentPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ portfolioId: z.string().uuid(), limit: z.number().int().min(1).max(50).default(10) })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await agentOrgIds(context.supabase, context.userId);

    const { data: rows, error } = await context.supabase
      .from("lender_portfolio_clients")
      .select("id, address_line1, city, state, zip")
      .eq("portfolio_id", data.portfolioId)
      .limit(1000);
    if (error) throw new Error(error.message);

    const { normalizeAddress } = await import("@/lib/attom.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getPropertyIntel } = await import("@/lib/valuation.server");

    // 1. Build the full set of mappable, de-duplicated addresses in the book.
    const addresses = new Map<string, string>(); // normalized -> full
    let unmappable = 0;
    for (const r of rows ?? []) {
      if (!r.address_line1 || /address on file/i.test(r.address_line1) || (!r.city && !r.zip)) {
        unmappable += 1;
        continue;
      }
      const full = [r.address_line1, r.city, [r.state, r.zip].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ");
      addresses.set(normalizeAddress(full), full);
    }

    // 2. One query for what's already cached, instead of a round-trip per row.
    const keys = [...addresses.keys()];
    const cached = new Set<string>();
    for (let i = 0; i < keys.length; i += 200) {
      const { data: hit } = await supabaseAdmin
        .from("property_intel")
        .select("address_normalized, owner, detail, avm")
        .in("address_normalized", keys.slice(i, i + 200));
      for (const row of hit ?? []) {
        if (row.owner && row.detail && row.avm) cached.add(row.address_normalized);
      }
    }

    const pending = keys.filter((k) => !cached.has(k));
    const targets = pending.slice(0, data.limit).map((k) => addresses.get(k)!);

    let ok = 0;
    let failed = 0;
    for (const full of targets) {
      try {
        await getPropertyIntel(full, {
          classes: ["avm", "detail", "mortgage", "permits"],
          revenueSource: "agent_dashboard",
          requestedBy: context.userId,
        });
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    return {
      enriched: ok,
      failed,
      unmappable,
      remaining: Math.max(0, pending.length - ok),
      totalPending: pending.length,
    };
  });


// ---------------------------------------------------------------------------
// AI listing brief for one client.
// ---------------------------------------------------------------------------
export const generateAgentBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clientId: z.string().uuid(), language: z.enum(["en", "es"]).default("en") }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await agentOrgIds(context.supabase, context.userId);

    const { data: client, error } = await context.supabase
      .from("lender_portfolio_clients")
      .select("id, client_name, address_line1, city, state, zip, close_date")
      .eq("id", data.clientId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!client) throw new Error("Client not found");

    const { normalizeAddress } = await import("@/lib/attom.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const full = [client.address_line1, client.city, [client.state, client.zip].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", ");
    const { data: intel } = await supabaseAdmin
      .from("property_intel")
      .select("avm, sales, mortgage, permits, tax, owner, detail")
      .eq("address_normalized", normalizeAddress(full))
      .maybeSingle();

    const { data: listing } = await context.supabase
      .from("property_listing_status")
      .select("*")
      .eq("portfolio_client_id", data.clientId)
      .maybeSingle();

    const {
      extractOwnership,
      extractCharacteristics,
      extractTaxTrend,
      computeMoveScore,
    } = await import("@/lib/agent.server");
    const { extractAvm, extractSales, extractMortgage, extractPermits, extractTax, estimateLoanBalance } =
      await import("@/lib/valuation.server");
    const { buildMaintenanceTimeline, needsFromTimeline, recentImprovementNeeds } = await import(
      "@/lib/maintenance-rules"
    );

    const avm = intel?.avm ? extractAvm(intel.avm) : null;
    const sales = intel?.sales ? extractSales(intel.sales) : null;
    const mortgage = intel?.mortgage ? extractMortgage(intel.mortgage) : null;
    const permits = intel?.permits ? extractPermits(intel.permits) : null;
    const owner = intel?.owner ? extractOwnership(intel.owner) : null;
    const chars = intel?.detail ? extractCharacteristics(intel.detail) : null;
    const assessedSummary = intel?.tax ? extractTax(intel.tax) : null;
    const value =
      avm?.estimate ?? assessedSummary?.marketTotal ?? assessedSummary?.assessedTotal ?? null;
    const tax = intel?.tax ? extractTaxTrend(intel.tax, value) : null;
    const balance = mortgage ? estimateLoanBalance(mortgage) : null;
    const equity = value != null && balance != null ? value - balance : null;
    const lastSaleDate = sales?.lastSale?.date ?? client.close_date ?? null;
    const tenureYears = lastSaleDate
      ? (Date.now() - new Date(lastSaleDate).getTime()) / (365.25 * 24 * 3600 * 1000)
      : null;

    const score = computeMoveScore({
      tenureYears,
      equityPct: value && equity != null ? equity / value : null,
      equityDollars: equity,
      ownerOccupied: owner?.ownerOccupied ?? null,
      lastPermitDate: permits?.lastPermitDate ?? null,
      permitTotalValue: permits?.totalValue ?? null,
      taxChangePct: tax?.taxChangePct ?? null,
      listing: listing as any,
      livingSqft: chars?.livingSqft ?? null,
      beds: chars?.beds ?? null,
    });

    const facts = {
      owner: client.client_name,
      address: full,
      estimatedValue: value,
      lastSale: sales?.lastSale ?? null,
      tenureYears: tenureYears ? Math.round(tenureYears * 10) / 10 : null,
      equity,
      characteristics: chars,
      permits: permits?.events?.slice(0, 5) ?? [],
      tax,
      listing: listing ?? null,
      moveScore: score.score,
      signals: score.signals.map((s) => `${s.label}: ${s.detail}`),
    };

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      return { brief: score.signals.map((s) => `• ${s.label} — ${s.detail}`).join("\n"), ai: false };
    }

    const sys =
      data.language === "es"
        ? "Eres un coach de ventas para agentes inmobiliarios. Responde en español, conciso, sin inventar datos."
        : "You are a listing coach for a residential real estate agent. Be concise, specific, and never invent data that is not in the facts.";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: `Write a listing brief for this homeowner using ONLY these facts.
Sections:
1) Why now (2 sentences)
2) Three data-backed talking points (bullets, cite the numbers)
3) One suggested outreach message (under 60 words, warm, no pressure)
If the property is listed with another agent, say only that outreach must stay value-only.

FACTS:
${JSON.stringify(facts, null, 2)}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      return { brief: score.signals.map((s) => `• ${s.label} — ${s.detail}`).join("\n"), ai: false };
    }
    const json: any = await res.json();
    return { brief: json?.choices?.[0]?.message?.content ?? "", ai: true, score: score.score };
  });

// ---------------------------------------------------------------------------
// Admin: create a demo agency + book of business from the roster sample data.
// ---------------------------------------------------------------------------
export const seedAgentDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getSeedHomeowners } = await import("@/lib/portfolio-seed.server");

    let { data: org } = await supabaseAdmin
      .from("lender_orgs")
      .select("id")
      .eq("name", "SuCasa Demo Realty")
      .maybeSingle();
    if (!org) {
      const { data: created, error } = await supabaseAdmin
        .from("lender_orgs")
        .insert({ name: "SuCasa Demo Realty", org_type: "agent", plan: "founding" })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      org = created;
    }
    await supabaseAdmin
      .from("lender_members")
      .insert({ lender_org_id: org!.id, user_id: context.userId, role: "owner" });

    let { data: portfolio } = await supabaseAdmin
      .from("lender_portfolios")
      .select("id")
      .eq("lender_org_id", org!.id)
      .maybeSingle();
    if (!portfolio) {
      const { data: created, error } = await supabaseAdmin
        .from("lender_portfolios")
        .insert({ lender_org_id: org!.id, name: "Sphere & past clients" })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      portfolio = created;
    }

    const { count } = await supabaseAdmin
      .from("lender_portfolio_clients")
      .select("id", { count: "exact", head: true })
      .eq("portfolio_id", portfolio!.id);
    if ((count ?? 0) === 0) {
      const rows = getSeedHomeowners().map((h) => ({ portfolio_id: portfolio!.id, ...h }));
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await supabaseAdmin
          .from("lender_portfolio_clients")
          .insert(rows.slice(i, i + 100));
        if (error) throw new Error(error.message);
      }
    }

    return { orgId: org!.id, portfolioId: portfolio!.id };
  });

// ---------------------------------------------------------------------------
// Coverage report: per-home pull status (value / mortgage present) + last pull.
// ---------------------------------------------------------------------------
export const getPortfolioCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ portfolioId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await agentOrgIds(context.supabase, context.userId);

    const { data: rows, error } = await context.supabase
      .from("lender_portfolio_clients")
      .select("id, client_name, client_email, address_line1, city, state, zip")
      .eq("portfolio_id", data.portfolioId)
      .limit(1000);
    if (error) throw new Error(error.message);

    const { normalizeAddress } = await import("@/lib/attom.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const mapped = (rows ?? []).map((r) => {
      const mappable = Boolean(
        r.address_line1 && !/address on file/i.test(r.address_line1) && (r.city || r.zip),
      );
      const full = [r.address_line1, r.city, [r.state, r.zip].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ");
      return { ...r, mappable, full, key: mappable ? normalizeAddress(full) : null };
    });

    const keys = [...new Set(mapped.map((m) => m.key).filter(Boolean) as string[])];
    const intel = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < keys.length; i += 200) {
      const { data: hit } = await supabaseAdmin
        .from("property_intel")
        .select(
          "address_normalized, avm, detail, mortgage, avm_fetched_at, detail_fetched_at, mortgage_fetched_at, sales_fetched_at, tax_fetched_at, permits_fetched_at, owner_fetched_at",
        )
        .in("address_normalized", keys.slice(i, i + 200));
      for (const row of hit ?? []) intel.set(row.address_normalized, row as Record<string, unknown>);
    }

    const items = mapped.map((m) => {
      const row = m.key ? intel.get(m.key) : undefined;
      const stamps = [
        "avm_fetched_at",
        "detail_fetched_at",
        "mortgage_fetched_at",
        "sales_fetched_at",
        "tax_fetched_at",
        "permits_fetched_at",
        "owner_fetched_at",
      ]
        .map((k) => (row?.[k] as string | null) ?? null)
        .filter(Boolean) as string[];
      const lastPulledAt = stamps.length
        ? stamps.reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
        : null;
      const hasValue = Boolean(row?.avm);
      const hasDetail = Boolean(row?.detail);
      const hasMortgage = Boolean(row?.mortgage);
      return {
        id: m.id,
        name: m.client_name,
        email: m.client_email,
        address: m.mappable ? m.full : m.address_line1 || "—",
        street: m.address_line1 ?? "",
        city: m.city ?? "",
        state: m.state ?? "",
        zip: m.zip ?? "",
        mappable: m.mappable,
        hasValue,
        hasDetail,
        hasMortgage,
        hasEquity: hasValue && hasMortgage,
        lastPulledAt,
        status: !m.mappable
          ? ("no_address" as const)
          : hasValue && hasDetail && hasMortgage
            ? ("complete" as const)
            : hasValue || hasDetail || hasMortgage
              ? ("partial" as const)
              : ("missing" as const),
      };
    });

    return {
      items,
      counts: {
        total: items.length,
        complete: items.filter((i) => i.status === "complete").length,
        partial: items.filter((i) => i.status === "partial").length,
        missing: items.filter((i) => i.status === "missing").length,
        no_address: items.filter((i) => i.status === "no_address").length,
      },
    };
  });

// ---------------------------------------------------------------------------
// Bulk retry: re-fetch value / equity / mortgage classes only for homes whose
// coverage is Partial or Not pulled. Complete + no-address rows are skipped.
// ---------------------------------------------------------------------------
export const retryPortfolioPulls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        portfolioId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(25),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await agentOrgIds(context.supabase, context.userId);

    const { data: rows, error } = await context.supabase
      .from("lender_portfolio_clients")
      .select("id, address_line1, city, state, zip")
      .eq("portfolio_id", data.portfolioId)
      .limit(1000);
    if (error) throw new Error(error.message);

    const { normalizeAddress } = await import("@/lib/attom.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getPropertyIntel } = await import("@/lib/valuation.server");

    const addresses = new Map<string, string>();
    let skippedNoAddress = 0;
    for (const r of rows ?? []) {
      if (!r.address_line1 || /address on file/i.test(r.address_line1) || (!r.city && !r.zip)) {
        skippedNoAddress += 1;
        continue;
      }
      const full = [r.address_line1, r.city, [r.state, r.zip].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ");
      addresses.set(normalizeAddress(full), full);
    }

    const keys = [...addresses.keys()];
    const complete = new Set<string>();
    for (let i = 0; i < keys.length; i += 200) {
      const { data: hit } = await supabaseAdmin
        .from("property_intel")
        .select("address_normalized, avm, detail, mortgage")
        .in("address_normalized", keys.slice(i, i + 200));
      for (const row of hit ?? []) {
        if (row.avm && row.detail && row.mortgage) complete.add(row.address_normalized);
      }
    }

    // Partial + not-pulled only.
    const pending = keys.filter((k) => !complete.has(k));
    const targets = pending.slice(0, data.limit).map((k) => addresses.get(k)!);

    let ok = 0;
    let failed = 0;
    for (const full of targets) {
      try {
        await getPropertyIntel(full, {
          classes: ["avm", "detail", "mortgage"],
          revenueSource: "agent_retry_pull",
          requestedBy: context.userId,
        });
        ok += 1;
      } catch {
        failed += 1;
      }
    }

    return {
      retried: ok,
      failed,
      skippedNoAddress,
      totalPending: pending.length,
      remaining: Math.max(0, pending.length - ok),
    };
  });

// ---------------------------------------------------------------------------
// Records budget: monthly property-records usage for the current month, so
// agents can see the remaining allowance before kicking off a bulk pull.
// Provider-neutral field names — the UI never names the data vendor.
// ---------------------------------------------------------------------------
export const getRecordsBudget = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await agentOrgIds(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const monthKey = monthStart.toISOString().slice(0, 10);

    const { data: b } = await supabaseAdmin
      .from("attom_monthly_budget")
      .select("tier_calls_included, calls_used, soft_cap_pct, cache_only_mode")
      .eq("month", monthKey)
      .maybeSingle();

    if (!b) return null;
    const included = b.tier_calls_included || 0;
    const used = b.calls_used || 0;
    return {
      used,
      included,
      remaining: Math.max(0, included - used),
      pct: included > 0 ? Math.round((used / included) * 100) : 0,
      softCapPct: b.soft_cap_pct,
      cacheOnly: b.cache_only_mode,
    };
  });

// ---------------------------------------------------------------------------
// Address backfill: for households whose street address is missing or is the
// "Address on file" placeholder, look the contact up by email in the CRM and
// write back any mailing address we find. Property records are keyed by
// address, so this is what unlocks value / equity / mortgage for those rows.
// ---------------------------------------------------------------------------
export const backfillPortfolioAddresses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        portfolioId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(25),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await agentOrgIds(context.supabase, context.userId);

    const { data: rows, error } = await context.supabase
      .from("lender_portfolio_clients")
      .select("id, client_email, address_line1, city, zip")
      .eq("portfolio_id", data.portfolioId)
      .limit(1000);
    if (error) throw new Error(error.message);

    const pending = (rows ?? []).filter(
      (r) =>
        Boolean(r.client_email) &&
        (!r.address_line1 ||
          /address on file/i.test(r.address_line1) ||
          (!r.city && !r.zip)),
    );

    const targets = pending.slice(0, data.limit);
    if (targets.length === 0) {
      return { found: 0, notFound: 0, remaining: 0, scanned: 0 };
    }

    const { findContactAddressByEmail } = await import("@/lib/ghl.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let found = 0;
    let notFound = 0;
    for (const row of targets) {
      let hit = null;
      try {
        hit = await findContactAddressByEmail(row.client_email!);
      } catch {
        hit = null;
      }
      if (!hit?.street) {
        notFound += 1;
        continue;
      }
      const { error: upErr } = await supabaseAdmin
        .from("lender_portfolio_clients")
        .update({
          address_line1: hit.street,
          city: hit.city ?? row.city,
          state: hit.state,
          zip: hit.zip,
        })
        .eq("id", row.id);
      if (upErr) notFound += 1;
      else found += 1;
    }

    return {
      found,
      notFound,
      scanned: targets.length,
      remaining: Math.max(0, pending.length - targets.length),
    };
  });

// ---------------------------------------------------------------------------
// Manual address edit for a single household — the fallback when the CRM has
// no address either.
// ---------------------------------------------------------------------------
export const updateClientAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        street: z.string().trim().min(3).max(200),
        city: z.string().trim().max(100).optional().default(""),
        state: z.string().trim().max(2).optional().default(""),
        zip: z.string().trim().max(10).optional().default(""),
      })
      .refine((v) => Boolean(v.city || v.zip), {
        message: "Add a city or ZIP so the address can be matched",
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await agentOrgIds(context.supabase, context.userId);

    const { error } = await context.supabase
      .from("lender_portfolio_clients")
      .update({
        address_line1: data.street,
        city: data.city || null,
        state: data.state ? data.state.toUpperCase() : null,
        zip: data.zip || null,
      })
      .eq("id", data.clientId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Client-activity "new" markers: auto-clear on view, plus manual review.
// ---------------------------------------------------------------------------
export const markAgentFeedSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        portfolioId: z.string().uuid(),
        items: z
          .array(
            z.object({
              itemKey: z.string().min(1),
              kind: z.enum(["recommendation", "referral"]),
            }),
          )
          .max(200),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await agentOrgIds(context.supabase, context.userId);
    if (!data.items.length) return { ok: true, marked: 0 };

    const rows = data.items.map((it) => ({
      user_id: context.userId,
      portfolio_id: data.portfolioId,
      item_key: it.itemKey,
      kind: it.kind,
    }));
    const { error } = await context.supabase
      .from("agent_feed_seen")
      .upsert(rows, { onConflict: "user_id,portfolio_id,item_key", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { ok: true, marked: rows.length };
  });

export const setAgentFeedReviewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        portfolioId: z.string().uuid(),
        itemKey: z.string().min(1),
        reviewed: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await agentOrgIds(context.supabase, context.userId);
    const { error } = await context.supabase.from("agent_feed_seen").upsert(
      {
        user_id: context.userId,
        portfolio_id: data.portfolioId,
        item_key: data.itemKey,
        kind: "recommendation",
        reviewed_at: data.reviewed ? new Date().toISOString() : null,
      },
      { onConflict: "user_id,portfolio_id,item_key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Add a single homeowner to an agent's sphere (manual, one-by-one entry).
export const addAgentPortfolioClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        portfolioId: z.string().uuid(),
        fullName: z.string().trim().min(1).max(160),
        address: z.string().trim().min(1).max(240),
        city: z.string().trim().max(120).optional().nullable(),
        state: z.string().trim().max(40).optional().nullable(),
        zip: z.string().trim().max(20).optional().nullable(),
        email: z.string().trim().email().optional().or(z.literal("")).nullable(),
        phone: z.string().trim().max(40).optional().nullable(),
        notes: z.string().trim().max(2000).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await agentOrgIds(context.supabase, context.userId);
    const remaining = await remainingCreditsForPortfolio(context.supabase, data.portfolioId);
    if (remaining != null && remaining <= 0) {
      throw new Error(
        "You're out of homeowner credits. Earn more by activating clients, or unlock 100 more homeowners.",
      );
    }
    const { data: row, error } = await context.supabase
      .from("lender_portfolio_clients")
      .insert({
        portfolio_id: data.portfolioId,
        client_name: data.fullName,
        client_email: data.email || null,
        client_phone: data.phone || null,
        address_line1: data.address,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        notes: data.notes || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id as string };
  });

/** Remaining homeowner credits for the org that owns this book (null = not an agent org). */
async function remainingCreditsForPortfolio(
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

// Bulk-add homeowners to an agent's sphere from a CSV/Excel upload.
export const ingestAgentPortfolioCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        portfolioId: z.string().uuid(),
        csv: z.string().min(1).max(2_000_000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await agentOrgIds(context.supabase, context.userId);
    const { parseClientCsv } = await import("./lender.server");
    const parsed = parseClientCsv(data.csv);
    if (parsed.length === 0) return { inserted: 0, skipped: 0, remaining: null };

    // Import up to the remaining balance and say plainly what was held back.
    const remaining = await remainingCreditsForPortfolio(context.supabase, data.portfolioId);
    const rows = remaining == null ? parsed : parsed.slice(0, Math.max(0, remaining));
    const skipped = parsed.length - rows.length;
    if (rows.length === 0) {
      throw new Error(
        `You're out of homeowner credits, so none of these ${parsed.length} rows were imported. Unlock more homeowner connections to continue.`,
      );
    }

    const payload = rows.map((r) => ({
      portfolio_id: data.portfolioId,
      client_name: r.full_name,
      client_email: r.email ?? null,
      address_line1: r.address,
      city: r.city ?? null,
      state: r.state ?? null,
      zip: r.zip ?? null,
      notes: r.note ?? null,
    }));
    const { error } = await context.supabase.from("lender_portfolio_clients").insert(payload);
    if (error) throw new Error(error.message);
    return {
      inserted: rows.length,
      skipped,
      remaining: remaining == null ? null : Math.max(0, remaining - rows.length),
    };
  });

