import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Access: an "agent" is a member of a lender_org whose org_type = 'agent'.
// Admins can see everything.
// ---------------------------------------------------------------------------
async function agentOrgIds(supabase: any, userId: string): Promise<{ ids: string[]; isAdmin: boolean }> {
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
  if (!ids.length) throw new Error("Forbidden: agent access required");
  return { ids, isAdmin: false };
}

export const listAgentPortfolios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { ids } = await agentOrgIds(context.supabase, context.userId);
    if (!ids.length) return { orgs: [], portfolios: [] };

    const { data: orgs } = await context.supabase
      .from("lender_orgs")
      .select("id, name, plan, active")
      .in("id", ids);

    const { data: portfolios, error } = await context.supabase
      .from("lender_portfolios")
      .select("id, name, lender_org_id, created_at")
      .in("lender_org_id", ids)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const withCounts: Array<{
      id: string;
      name: string;
      lender_org_id: string;
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
        created_at: p.created_at,
        client_count: count ?? 0,
      });
    }
    return { orgs: orgs ?? [], portfolios: withCounts };
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


    const { normalizeAddress } = await import("@/lib/attom.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      extractOwnership,
      extractCharacteristics,
      extractTaxTrend,
      computeMoveScore,
      draftOpener,
    } = await import("@/lib/agent.server");
    const { extractAvm, extractSales, extractMortgage, extractPermits, estimateLoanBalance } =
      await import("@/lib/valuation.server");

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
      const value = avm?.estimate ?? null;
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

      return {
        id: c.id,
        name: c.client_name,
        email: c.client_email,
        phone: c.client_phone,
        address: c.address_line1,
        city: c.city,
        state: c.state,
        zip: c.zip,
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
        move_score: score.score,
        band: score.band,
        signals: score.signals,
        opener: draftOpener(c.client_name, score),
      };
    });

    enriched.sort((a, b) => b.move_score - a.move_score);

    const bands = { hot: 0, warm: 0, nurture: 0, hold: 0 } as Record<string, number>;
    for (const c of enriched) bands[c.band] += 1;

    return {
      portfolio: {
        id: (portfolio as any).id,
        name: (portfolio as any).name,
        orgName: (portfolio as any).lender_orgs?.name ?? "Agency",
      },
      summary: {
        total: enriched.length,
        with_intel: enriched.filter((c) => c.has_intel).length,
        bands,
        total_equity: enriched.reduce((s, c) => s + (c.equity_dollars ?? 0), 0),
        avg_tenure:
          enriched.length
            ? enriched.reduce((s, c) => s + (c.tenure_years ?? 0), 0) / enriched.length
            : 0,
        expired: enriched.filter(
          (c) => c.listing?.status === "expired" || c.listing?.status === "withdrawn",
        ).length,
      },
      clients: enriched,
    };
  });

// ---------------------------------------------------------------------------
// Listing status upsert (manual today, Fello/MLS events later).
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
      .limit(200);
    if (error) throw new Error(error.message);

    const { normalizeAddress } = await import("@/lib/attom.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getPropertyIntel } = await import("@/lib/valuation.server");

    const targets: Array<{ full: string }> = [];
    for (const r of rows ?? []) {
      if (!r.address_line1) continue;
      const full = [r.address_line1, r.city, [r.state, r.zip].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ");
      const { data: existing } = await supabaseAdmin
        .from("property_intel")
        .select("owner, detail, avm")
        .eq("address_normalized", normalizeAddress(full))
        .maybeSingle();
      if (existing?.owner && existing?.detail && existing?.avm) continue;
      targets.push({ full });
      if (targets.length >= data.limit) break;
    }

    let ok = 0;
    let failed = 0;
    for (const t of targets) {
      try {
        await getPropertyIntel(t.full, {
          classes: ["avm", "detail", "owner", "sales", "tax", "permits", "mortgage"],
          revenueSource: "agent_dashboard",
          requestedBy: context.userId,
        });
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    return { enriched: ok, failed, remaining: Math.max(0, (rows?.length ?? 0) - ok) };
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
    const { extractAvm, extractSales, extractMortgage, extractPermits, estimateLoanBalance } =
      await import("@/lib/valuation.server");

    const avm = intel?.avm ? extractAvm(intel.avm) : null;
    const sales = intel?.sales ? extractSales(intel.sales) : null;
    const mortgage = intel?.mortgage ? extractMortgage(intel.mortgage) : null;
    const permits = intel?.permits ? extractPermits(intel.permits) : null;
    const owner = intel?.owner ? extractOwnership(intel.owner) : null;
    const chars = intel?.detail ? extractCharacteristics(intel.detail) : null;
    const value = avm?.estimate ?? null;
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
// Admin: create a demo agency + book of business from the Fello sample data.
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
    const { getFelloHomeowners } = await import("@/lib/fello-import.server");

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
      const rows = getFelloHomeowners().map((h) => ({ portfolio_id: portfolio!.id, ...h }));
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await supabaseAdmin
          .from("lender_portfolio_clients")
          .insert(rows.slice(i, i + 100));
        if (error) throw new Error(error.message);
      }
    }

    return { orgId: org!.id, portfolioId: portfolio!.id };
  });
