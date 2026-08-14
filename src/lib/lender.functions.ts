import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseClientCsv } from "./lender.server";

async function assertLenderAccess(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin) return { isAdmin: true as const };
  const { data: isLender } = await supabase.rpc("has_role", { _user_id: userId, _role: "lender" });
  if (!isLender) throw new Error("Forbidden: lender access required");
  return { isAdmin: false as const };
}

export const listMyPortfolios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin } = await assertLenderAccess(context.supabase, context.userId);
    const { data: memberships, error: mErr } = await context.supabase
      .from("lender_members")
      .select("lender_org_id, role, lender_orgs(id, name, plan, seat_limit)")
      .eq("user_id", context.userId);
    if (mErr) throw new Error(mErr.message);

    const orgIds = (memberships ?? []).map((m: any) => m.lender_org_id);
    if (orgIds.length === 0)
      return { orgs: [], portfolios: [] as any[], members: [] as any[], isManager: isAdmin };

    const { data: portfolios, error: pErr } = await context.supabase
      .from("lender_portfolios")
      .select("id, name, lender_org_id, assigned_user_id, created_at")
      .in("lender_org_id", orgIds)
      .order("created_at", { ascending: false });
    if (pErr) throw new Error(pErr.message);

    const withCounts = await Promise.all(
      (portfolios ?? []).map(async (p: any) => {
        const { count } = await context.supabase
          .from("lender_portfolio_clients")
          .select("id", { count: "exact", head: true })
          .eq("portfolio_id", p.id);
        return { ...p, client_count: count ?? 0 };
      }),
    );

    // Org roster (names of the officers) — needs elevated read on profiles.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: allMembers } = await supabaseAdmin
      .from("lender_members")
      .select("lender_org_id, user_id, role")
      .in("lender_org_id", orgIds);
    const memberIds = [...new Set((allMembers ?? []).map((m: any) => m.user_id))];
    const { data: profiles } = memberIds.length
      ? await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", memberIds)
      : { data: [] as any[] };
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    const orgs = (memberships ?? []).map((m: any) => ({
      id: m.lender_org_id,
      name: m.lender_orgs?.name ?? "Org",
      plan: m.lender_orgs?.plan ?? "starter",
      seat_limit: m.lender_orgs?.seat_limit ?? null,
      role: m.role,
    }));

    const isManager = isAdmin || orgs.some((o: any) => o.role === "owner");

    return {
      orgs,
      isManager,
      myUserId: context.userId,
      members: (allMembers ?? []).map((m: any) => ({
        org_id: m.lender_org_id,
        user_id: m.user_id,
        role: m.role,
        name: profileMap.get(m.user_id)?.full_name || profileMap.get(m.user_id)?.email || "Member",
        email: profileMap.get(m.user_id)?.email ?? null,
      })),
      portfolios: withCounts.map((p: any) => ({
        ...p,
        // Back-compat alias used by older UI code.
        org_id: p.lender_org_id,
        assigned_name: p.assigned_user_id
          ? profileMap.get(p.assigned_user_id)?.full_name ||
            profileMap.get(p.assigned_user_id)?.email ||
            "Assigned officer"
          : null,
      })),
    };
  });

const AssignSchema = z.object({
  portfolioId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
});
export const assignPortfolioOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AssignSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await assertLenderAccess(context.supabase, context.userId);

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
      if (!me || me.role !== "owner") throw new Error("Forbidden: manager access required");
    }

    if (data.userId) {
      const { data: target } = await context.supabase
        .from("lender_members")
        .select("user_id")
        .eq("lender_org_id", (portfolio as any).lender_org_id)
        .eq("user_id", data.userId)
        .maybeSingle();
      if (!target) throw new Error("That user is not a member of this organization");
    }

    const { error } = await context.supabase
      .from("lender_portfolios")
      .update({ assigned_user_id: data.userId })
      .eq("id", data.portfolioId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


const CreatePortfolioSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
});
export const createPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CreatePortfolioSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertLenderAccess(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("lender_portfolios")
      .insert({ lender_org_id: data.orgId, name: data.name })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// Assumed current 30-yr benchmark rate used for savings math in the demo.
const BENCHMARK_RATE_DEFAULT = 6.25;

function monthlyPayment(principalCents: number, ratePct: number, termMonths: number): number {
  if (!principalCents || !ratePct || !termMonths) return 0;
  const r = ratePct / 100 / 12;
  const n = termMonths;
  const p = principalCents / 100;
  return (p * r) / (1 - Math.pow(1 + r, -n));
}

function monthsBetween(from: string | null, to: Date): number {
  if (!from) return 0;
  const d = new Date(from);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.round((to.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
}

// Rough amortization: how much principal is left after `elapsed` months.
function remainingBalanceCents(
  origCents: number | null,
  ratePct: number | null,
  termMonths: number | null,
  elapsedMonths: number,
): number | null {
  if (!origCents || !ratePct || !termMonths || elapsedMonths <= 0) return origCents ?? null;
  const r = ratePct / 100 / 12;
  const n = termMonths;
  const k = Math.min(elapsedMonths, n);
  const factor = (Math.pow(1 + r, n) - Math.pow(1 + r, k)) / (Math.pow(1 + r, n) - 1);
  return Math.round(origCents * factor);
}

// Simple appreciation heuristic: 4%/yr compounded, capped at 60%.
function estimatedValueCents(origCents: number | null, monthsSinceClose: number): number | null {
  if (!origCents) return null;
  const years = monthsSinceClose / 12;
  const growth = Math.min(0.6, Math.pow(1.04, years) - 1);
  // Assume LTV at close ~80% -> value at close = loan / 0.80.
  const valueAtClose = origCents / 0.8;
  return Math.round(valueAtClose * (1 + growth));
}

type Segment = "refi-ready" | "rate-and-term" | "cash-out" | "watchlist";

function segmentFor(
  ratePct: number | null,
  balanceCents: number | null,
  valueCents: number | null,
  monthsSinceClose: number,
  benchmark: number,
): Segment {
  const equity = (valueCents ?? 0) - (balanceCents ?? 0);
  const seasoned = monthsSinceClose >= 12;
  if (ratePct && seasoned && ratePct - benchmark >= 1) return "refi-ready";
  if (ratePct && seasoned && ratePct - benchmark >= 0.5) return "rate-and-term";
  if (equity >= 75_000 * 100) return "cash-out";
  return "watchlist";
}

export const getPortfolio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        benchmarkRate: z.number().min(1).max(20).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertLenderAccess(context.supabase, context.userId);
    const benchmark = data.benchmarkRate ?? BENCHMARK_RATE_DEFAULT;

    const { data: portfolio, error } = await context.supabase
      .from("lender_portfolios")
      .select("id, name, lender_org_id, created_at, lender_orgs(name)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!portfolio) throw new Error("Portfolio not found");

    const { data: clients, error: cErr } = await context.supabase
      .from("lender_portfolio_clients")
      .select(
        "id, client_name, client_email, client_phone, address_line1, city, state, zip, loan_amount_at_close_cents, rate_at_close, close_date, term_months, notes, homeowner_id, created_at",
      )
      .eq("portfolio_id", data.id)
      .order("close_date", { ascending: false });
    if (cErr) throw new Error(cErr.message);

    const homeownerIds = (clients ?? [])
      .map((c: any) => c.homeowner_id)
      .filter(Boolean) as string[];
    let consentedIds = new Set<string>();
    if (homeownerIds.length) {
      const { data: consents } = await context.supabase
        .from("homeowner_lender_consents")
        .select("homeowner_id")
        .in("homeowner_id", homeownerIds)
        .eq("lender_org_id", (portfolio as any).lender_org_id)
        .is("revoked_at", null);
      consentedIds = new Set((consents ?? []).map((c: any) => c.homeowner_id));
    }

    const now = new Date();
    const enriched = (clients ?? []).map((c: any) => {
      const isColdLead = !c.homeowner_id;
      const consented = c.homeowner_id ? consentedIds.has(c.homeowner_id) : false;
      // Cold leads are the lender's own uploads → always show full name.
      // Linked homeowners are masked until they grant consent.
      const showName = isColdLead || consented;
      const monthsSinceClose = monthsBetween(c.close_date, now);
      const termMonths = c.term_months ?? 360;
      const balance = remainingBalanceCents(
        c.loan_amount_at_close_cents,
        c.rate_at_close,
        termMonths,
        monthsSinceClose,
      );
      const value = estimatedValueCents(c.loan_amount_at_close_cents, monthsSinceClose);
      const equity = (value ?? 0) - (balance ?? 0);
      const ltv =
        value && balance ? Math.round((balance / value) * 1000) / 10 : null; // %
      const currentPmt = monthlyPayment(balance ?? 0, c.rate_at_close ?? 0, termMonths);
      const refiPmt = monthlyPayment(balance ?? 0, benchmark, termMonths);
      const savingsPerMonth = Math.max(0, Math.round(currentPmt - refiPmt));
      const segment = segmentFor(c.rate_at_close, balance, value, monthsSinceClose, benchmark);

      return {
        id: c.id,
        full_name: showName ? c.client_name : maskName(c.client_name ?? ""),
        email: isColdLead || consented ? c.client_email : null,
        phone: isColdLead || consented ? c.client_phone : null,
        address: c.address_line1,
        city: c.city,
        state: c.state,
        zip: c.zip,
        loan_at_close_cents: c.loan_amount_at_close_cents,
        loan_balance_cents: balance,
        estimated_value_cents: value,
        equity_cents: equity,
        ltv_pct: ltv,
        rate_at_close: c.rate_at_close,
        close_date: c.close_date,
        months_since_close: monthsSinceClose,
        term_months: termMonths,
        savings_per_month_dollars: savingsPerMonth,
        note: c.notes,
        segment,
        consent_state: c.homeowner_id ? (consented ? "granted" : "pending") : "cold-lead",
        missing_loan_data: c.loan_amount_at_close_cents == null,
      };
    });


    // Aggregates.
    const total = enriched.length;
    const totalLoanCents = enriched.reduce(
      (s, c) => s + (c.loan_at_close_cents ?? 0),
      0,
    );
    const totalBalanceCents = enriched.reduce(
      (s, c) => s + (c.loan_balance_cents ?? 0),
      0,
    );
    const totalEquityCents = enriched.reduce((s, c) => s + (c.equity_cents ?? 0), 0);
    const weightedRateNum = enriched.reduce(
      (s, c) => s + (c.rate_at_close ?? 0) * (c.loan_at_close_cents ?? 0),
      0,
    );
    const avgRate = totalLoanCents > 0 ? weightedRateNum / totalLoanCents : 0;
    const avgMonthsSinceClose =
      total > 0 ? enriched.reduce((s, c) => s + c.months_since_close, 0) / total : 0;

    const segmentCounts = {
      "refi-ready": 0,
      "rate-and-term": 0,
      "cash-out": 0,
      watchlist: 0,
    } as Record<Segment, number>;
    const consentCounts = { granted: 0, pending: 0, "cold-lead": 0 } as Record<string, number>;
    for (const c of enriched) {
      segmentCounts[c.segment as Segment] += 1;
      consentCounts[c.consent_state] += 1;
    }

    const topRefi = [...enriched]
      .filter((c) => c.savings_per_month_dollars > 0)
      .sort((a, b) => b.savings_per_month_dollars - a.savings_per_month_dollars)
      .slice(0, 10);

    return {
      portfolio: {
        id: (portfolio as any).id,
        name: (portfolio as any).name,
        orgId: (portfolio as any).lender_org_id,
        orgName: (portfolio as any).lender_orgs?.name ?? "Org",
      },
      summary: {
        total,
        total_loan_cents: totalLoanCents,
        total_balance_cents: totalBalanceCents,
        total_equity_cents: totalEquityCents,
        avg_rate: Math.round(avgRate * 100) / 100,
        avg_months_since_close: Math.round(avgMonthsSinceClose),
        benchmark_rate: benchmark,
      },
      segments: segmentCounts,
      consent_counts: consentCounts,
      top_refi_opportunities: topRefi,
      clients: enriched,
    };
  });

function maskName(name: string): string {
  if (!name) return "—";
  const parts = name.split(" ");
  return parts.map((p, i) => (i === parts.length - 1 ? `${p.charAt(0)}.` : p)).join(" ");
}

const IngestSchema = z.object({
  portfolioId: z.string().uuid(),
  csv: z.string().min(1).max(2_000_000),
});
export const ingestPortfolioCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IngestSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertLenderAccess(context.supabase, context.userId);
    const rows = parseClientCsv(data.csv);
    if (rows.length === 0) return { inserted: 0 };

    const payload = rows.map((r) => ({
      portfolio_id: data.portfolioId,
      client_name: r.full_name,
      client_email: r.email ?? null,
      address_line1: r.address,
      city: r.city ?? null,
      state: r.state ?? null,
      zip: r.zip ?? null,
      loan_amount_at_close_cents: r.loan_balance_cents ?? null,
      rate_at_close:
        r.interest_rate_bps != null ? Number((r.interest_rate_bps / 100).toFixed(3)) : null,
      notes: r.note ?? null,
    }));
    const { error } = await context.supabase.from("lender_portfolio_clients").insert(payload);
    if (error) throw new Error(error.message);

    return { inserted: rows.length };
  });

const AddClientSchema = z.object({
  portfolioId: z.string().uuid(),
  fullName: z.string().trim().min(1).max(160),
  address: z.string().trim().min(1).max(240),
  city: z.string().trim().max(120).optional().nullable(),
  state: z.string().trim().max(40).optional().nullable(),
  zip: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().email().optional().or(z.literal("")).nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  loanAmount: z.number().min(0).max(100_000_000).optional().nullable(),
  rate: z.number().min(0).max(25).optional().nullable(),
  closeDate: z.string().trim().max(20).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});
export const addPortfolioClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AddClientSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertLenderAccess(context.supabase, context.userId);
    const { error } = await context.supabase.from("lender_portfolio_clients").insert({
      portfolio_id: data.portfolioId,
      client_name: data.fullName,
      client_email: data.email || null,
      client_phone: data.phone || null,
      address_line1: data.address,
      city: data.city || null,
      state: data.state || null,
      zip: data.zip || null,
      loan_amount_at_close_cents:
        data.loanAmount != null ? Math.round(data.loanAmount * 100) : null,
      rate_at_close: data.rate ?? null,
      close_date: data.closeDate || null,
      notes: data.notes || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });


const CreateOrgSchema = z.object({ name: z.string().trim().min(1).max(120) });
export const createLenderOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CreateOrgSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin only");
    const { data: row, error } = await context.supabase
      .from("lender_orgs")
      .insert({ name: data.name })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const AddMemberSchema = z.object({
  orgId: z.string().uuid(),
  email: z.string().trim().email(),
  role: z.enum(["owner", "member"]).default("member"),
});
export const addLenderMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AddMemberSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();
    if (!profile) throw new Error("No user found with that email — they must sign up first.");

    const { error: mErr } = await supabaseAdmin
      .from("lender_members")
      .insert({ lender_org_id: data.orgId, user_id: profile.id, role: data.role });
    if (mErr && !mErr.message.includes("duplicate")) throw new Error(mErr.message);

    await supabaseAdmin.from("user_roles").insert({ user_id: profile.id, role: "lender" });

    return { ok: true, userId: profile.id };
  });

export const listAllOrgs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin only");
    const { data, error } = await context.supabase
      .from("lender_orgs")
      .select("id, name, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// -----------------------------------------------------------------------------
// Demo seeder: creates a "SuCasa Demo Lender" org, adds the caller as a member,
// grants them the lender role, and inserts 250 realistic clients into a demo
// portfolio. Idempotent by portfolio name — running it twice does not duplicate.
// -----------------------------------------------------------------------------
export const seedDemoPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { generateDemoClients } = await import("./lender-demo.server");

    const DEMO_ORG_NAME = "SuCasa Demo Lender";
    const DEMO_PORTFOLIO_NAME = "Demo Book · 250 Clients";

    // 1. Find or create the demo org.
    let orgId: string;
    const { data: existingOrg } = await supabaseAdmin
      .from("lender_orgs")
      .select("id")
      .eq("name", DEMO_ORG_NAME)
      .maybeSingle();
    if (existingOrg) {
      orgId = existingOrg.id;
    } else {
      const { data: newOrg, error: oErr } = await supabaseAdmin
        .from("lender_orgs")
        .insert({ name: DEMO_ORG_NAME, plan: "demo", active: true })
        .select("id")
        .single();
      if (oErr) throw new Error(oErr.message);
      orgId = newOrg.id;
    }

    // 2. Ensure the caller is a member.
    const { data: existingMember } = await supabaseAdmin
      .from("lender_members")
      .select("id")
      .eq("lender_org_id", orgId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!existingMember) {
      await supabaseAdmin
        .from("lender_members")
        .insert({ lender_org_id: orgId, user_id: context.userId, role: "owner" });
    }

    // 3. Grant lender role (idempotent — user_roles has unique(user_id, role)).
    const { data: hasLenderRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", context.userId)
      .eq("role", "lender")
      .maybeSingle();
    if (!hasLenderRole) {
      await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: context.userId, role: "lender" });
    }

    // 4. Find or create the demo portfolio.
    let portfolioId: string;
    const { data: existingPortfolio } = await supabaseAdmin
      .from("lender_portfolios")
      .select("id")
      .eq("lender_org_id", orgId)
      .eq("name", DEMO_PORTFOLIO_NAME)
      .maybeSingle();
    if (existingPortfolio) {
      portfolioId = existingPortfolio.id;
    } else {
      const { data: newP, error: pErr } = await supabaseAdmin
        .from("lender_portfolios")
        .insert({ lender_org_id: orgId, name: DEMO_PORTFOLIO_NAME })
        .select("id")
        .single();
      if (pErr) throw new Error(pErr.message);
      portfolioId = newP.id;
    }

    // 5. Seed 250 clients only if the portfolio is empty.
    const { count } = await supabaseAdmin
      .from("lender_portfolio_clients")
      .select("id", { count: "exact", head: true })
      .eq("portfolio_id", portfolioId);
    if ((count ?? 0) === 0) {
      const rows = generateDemoClients(250).map((c) => ({
        portfolio_id: portfolioId,
        ...c,
      }));
      // Insert in chunks to stay well under any row-size limits.
      const chunkSize = 100;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const { error: iErr } = await supabaseAdmin
          .from("lender_portfolio_clients")
          .insert(rows.slice(i, i + chunkSize));
        if (iErr) throw new Error(iErr.message);
      }
    }

    return { orgId, portfolioId, seeded: (count ?? 0) === 0 };
  });

// -----------------------------------------------------------------------------
// Roster import seeder: creates a starter portfolio under the demo lender org
// and inserts the 76 homeowners from the frozen CSV roster export (2026-07-27).
// Idempotent by portfolio name.
// -----------------------------------------------------------------------------
export const seedRosterImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getSeedHomeowners } = await import("./portfolio-seed.server");

    const ORG_NAME = "SuCasa Demo Lender";
    const PORTFOLIO_NAME = "Client Roster · 76 Homeowners";

    // Ensure org
    let orgId: string;
    const { data: existingOrg } = await supabaseAdmin
      .from("lender_orgs").select("id").eq("name", ORG_NAME).maybeSingle();
    if (existingOrg) {
      orgId = existingOrg.id;
    } else {
      const { data: newOrg, error } = await supabaseAdmin
        .from("lender_orgs")
        .insert({ name: ORG_NAME, plan: "demo", active: true })
        .select("id").single();
      if (error) throw new Error(error.message);
      orgId = newOrg.id;
    }

    // Ensure membership
    const { data: existingMember } = await supabaseAdmin
      .from("lender_members").select("id")
      .eq("lender_org_id", orgId).eq("user_id", context.userId).maybeSingle();
    if (!existingMember) {
      await supabaseAdmin.from("lender_members")
        .insert({ lender_org_id: orgId, user_id: context.userId, role: "owner" });
    }

    // Ensure lender role
    const { data: hasLenderRole } = await supabaseAdmin
      .from("user_roles").select("id")
      .eq("user_id", context.userId).eq("role", "lender").maybeSingle();
    if (!hasLenderRole) {
      await supabaseAdmin.from("user_roles")
        .insert({ user_id: context.userId, role: "lender" });
    }

    // Ensure portfolio
    let portfolioId: string;
    const { data: existingPortfolio } = await supabaseAdmin
      .from("lender_portfolios").select("id")
      .eq("lender_org_id", orgId).eq("name", PORTFOLIO_NAME).maybeSingle();
    if (existingPortfolio) {
      portfolioId = existingPortfolio.id;
    } else {
      const { data: newP, error } = await supabaseAdmin
        .from("lender_portfolios")
        .insert({ lender_org_id: orgId, name: PORTFOLIO_NAME })
        .select("id").single();
      if (error) throw new Error(error.message);
      portfolioId = newP.id;
    }

    // Seed only if empty
    const { count } = await supabaseAdmin
      .from("lender_portfolio_clients")
      .select("id", { count: "exact", head: true })
      .eq("portfolio_id", portfolioId);
    if ((count ?? 0) === 0) {
      const rows = getSeedHomeowners().map((h) => ({ portfolio_id: portfolioId, ...h }));
      const chunk = 100;
      for (let i = 0; i < rows.length; i += chunk) {
        const { error } = await supabaseAdmin
          .from("lender_portfolio_clients").insert(rows.slice(i, i + chunk));
        if (error) throw new Error(error.message);
      }
    }

    return { orgId, portfolioId, seeded: (count ?? 0) === 0, total: 76 };
  });




// -----------------------------------------------------------------------------
// Enrich portfolio clients from ATTOM: fills in close_date, loan_amount,
// rate, and term for rows missing loan data by fetching mortgage + sales.
// Uses the cached valuation abstraction so re-runs are cheap.
// -----------------------------------------------------------------------------
const EnrichSchema = z.object({
  portfolioId: z.string().uuid(),
  limit: z.number().int().min(1).max(200).optional(),
});
export const enrichPortfolioFromAttom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => EnrichSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertLenderAccess(context.supabase, context.userId);

    // Verify the caller can see the portfolio (RLS-scoped read).
    const { data: portfolio, error: pErr } = await context.supabase
      .from("lender_portfolios")
      .select("id")
      .eq("id", data.portfolioId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!portfolio) throw new Error("Portfolio not found");


    const { data: allRows, error: cErr } = await context.supabase
      .from("lender_portfolio_clients")
      .select("id, address_line1, city, state, zip, loan_amount_at_close_cents")
      .eq("portfolio_id", data.portfolioId)
      .is("loan_amount_at_close_cents", null);
    if (cErr) throw new Error(cErr.message);
    // Cap each pass so automatic background pulls never burn the monthly
    // records allowance in one page load.
    const rows = data.limit ? (allRows ?? []).slice(0, data.limit) : (allRows ?? []);
    const pendingBefore = (allRows ?? []).length;


    const { getPropertyIntel } = await import("./valuation.server");
    const { extractMortgage, extractSales } = await import("./valuation.server");

    let enriched = 0;
    let skipped = 0;
    let failed = 0;

    for (const r of rows ?? []) {
      if (!r.address_line1) {
        skipped += 1;
        continue;
      }
      const fullAddress = [
        r.address_line1,
        r.city,
        [r.state, r.zip].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(", ");
      try {
        const intel = await getPropertyIntel(fullAddress, {
          classes: ["mortgage", "sales"],
          // Sale history is conditional — free if cached, bought below only
          // when mortgage records can't date the loan.
          cachedOnlyClasses: ["sales"],
          revenueSource: "lender_enrichment",
          requestedBy: context.userId,
        });
        const mRaw = intel.classes.mortgage?.data ?? null;
        let sRaw = intel.classes.sales?.data ?? null;
        const m = mRaw ? extractMortgage(mRaw) : null;
        if (!sRaw && !m?.originationDate) {
          const salesIntel = await getPropertyIntel(fullAddress, {
            classes: ["sales"],
            revenueSource: "lender_enrichment_conditional",
            requestedBy: context.userId,
          });
          sRaw = salesIntel.classes.sales?.data ?? null;
        }
        const s = sRaw ? extractSales(sRaw) : null;

        const closeDate =
          m?.originationDate ?? s?.lastSale?.date ?? null;

        const loanCents = m?.loanAmount ? Math.round(m.loanAmount * 100) : null;
        const termMonths = m?.termMonths ?? null;

        // ATTOM's detailmortgage endpoint doesn't return interest rate.
        // Fall back to Freddie Mac PMMS annual average 30-yr rates by
        // origination year so refi math / segments are meaningful.
        // https://www.freddiemac.com/pmms/pmms30
        const PMMS_ANNUAL: Record<number, number> = {
          2000: 8.05, 2001: 6.97, 2002: 6.54, 2003: 5.83, 2004: 5.84,
          2005: 5.87, 2006: 6.41, 2007: 6.34, 2008: 6.03, 2009: 5.04,
          2010: 4.69, 2011: 4.45, 2012: 3.66, 2013: 3.98, 2014: 4.17,
          2015: 3.85, 2016: 3.65, 2017: 3.99, 2018: 4.54, 2019: 3.94,
          2020: 3.11, 2021: 2.96, 2022: 5.34, 2023: 6.81, 2024: 6.72,
          2025: 6.80, 2026: 6.50,
        };
        let rate = m?.interestRate ?? null;
        let rateEstimated = false;
        if (rate == null && closeDate) {
          const yr = Number(closeDate.slice(0, 4));
          if (PMMS_ANNUAL[yr] != null) {
            rate = PMMS_ANNUAL[yr];
            rateEstimated = true;
          }
        }

        if (loanCents == null && closeDate == null) {
          skipped += 1;
          continue;
        }

        const update: {
          close_date?: string;
          loan_amount_at_close_cents?: number;
          rate_at_close?: number;
          term_months?: number;
          notes?: string;
        } = {};

        if (closeDate) update.close_date = closeDate.slice(0, 10);
        if (loanCents != null) update.loan_amount_at_close_cents = loanCents;
        if (rate != null) update.rate_at_close = rate;
        if (termMonths != null) update.term_months = termMonths;
        if (rateEstimated) update.notes = "rate est. (PMMS)";


        const { error: uErr } = await context.supabase
          .from("lender_portfolio_clients")
          .update(update)
          .eq("id", r.id);
        if (uErr) {
          failed += 1;
          continue;
        }
        enriched += 1;
      } catch {
        failed += 1;
      }
    }

    return {
      enriched,
      skipped,
      failed,
      total: rows.length,
      remaining: Math.max(0, pendingBefore - enriched - skipped),
    };
  });

// ---------------------------------------------------------------------------
// Monthly property-records allowance, lender-scoped. Drives the automatic
// background pulls: the UI stops pulling once the soft cap is reached.
// Provider-neutral field names — the UI never names the data vendor.
// ---------------------------------------------------------------------------
export const getLenderRecordsBudget = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertLenderAccess(context.supabase, context.userId);
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
// Homeowner-facing: refi lender matching + intent handoff.
// ---------------------------------------------------------------------------

export const getMatchedLenderForMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: portfolioMatch } = await supabaseAdmin
      .from("lender_portfolio_clients")
      .select("portfolio_id, lender_portfolios(lender_org_id)")
      .eq("homeowner_id", context.userId)
      .limit(1)
      .maybeSingle();
    const matchedOrgId =
      (portfolioMatch as any)?.lender_portfolios?.lender_org_id ?? null;

    let orgId: string | null = matchedOrgId;
    let matchType: "portfolio" | "roundrobin" = "portfolio";
    if (!orgId) {
      const { data: fallback } = await supabaseAdmin
        .from("lender_orgs")
        .select("id")
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      orgId = fallback?.id ?? null;
      matchType = "roundrobin";
    }
    if (!orgId) return null;

    const { data: org } = await supabaseAdmin
      .from("lender_orgs")
      .select("id, name, license_number, primary_contact_email")
      .eq("id", orgId)
      .maybeSingle();
    if (!org) return null;

    return {
      orgId: org.id as string,
      name: org.name as string,
      licenseNumber: (org.license_number as string | null) ?? null,
      contactEmail: (org.primary_contact_email as string | null) ?? null,
      contactPhone: null as string | null,
      matchType,
    };
  });

const RefiIntentSchema = z.object({
  orgId: z.string().uuid(),
  estSavingsMonthly: z.number().int().min(0).max(100_000).optional(),
});
export const createRefiIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RefiIntentSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("address, city, state, zip")
      .eq("id", context.userId)
      .maybeSingle();

    const { data: req, error: rErr } = await context.supabase
      .from("service_requests")
      .insert({
        homeowner_id: context.userId,
        category: "refinance",
        source: "sucasa",
        status: "Matched",
        address: profile?.address ?? null,
        city: profile?.city ?? null,
        state: profile?.state ?? null,
        zip: profile?.zip ?? null,
        notes:
          data.estSavingsMonthly != null
            ? `Refi interest from dashboard hero · est. savings ~$${data.estSavingsMonthly}/mo`
            : "Refi interest from dashboard hero",
      })
      .select("id")
      .single();
    if (rErr) throw new Error(rErr.message);

    const { data: existing } = await supabaseAdmin
      .from("homeowner_lender_consents")
      .select("id, revoked_at")
      .eq("homeowner_id", context.userId)
      .eq("lender_org_id", data.orgId)
      .eq("scope", "refi_intent")
      .maybeSingle();
    if (!existing) {
      await supabaseAdmin.from("homeowner_lender_consents").insert({
        homeowner_id: context.userId,
        lender_org_id: data.orgId,
        scope: "refi_intent",
        granted_at: new Date().toISOString(),
      });
    } else if (existing.revoked_at) {
      await supabaseAdmin
        .from("homeowner_lender_consents")
        .update({ revoked_at: null, granted_at: new Date().toISOString() })
        .eq("id", existing.id);
    }

    const { data: pc } = await supabaseAdmin
      .from("lender_portfolio_clients")
      .select("id, portfolio_id, lender_portfolios(lender_org_id)")
      .eq("homeowner_id", context.userId)
      .limit(1)
      .maybeSingle();
    if (pc && (pc as any).lender_portfolios?.lender_org_id === data.orgId) {
      await supabaseAdmin.from("lender_activity").insert({
        lender_org_id: data.orgId,
        portfolio_client_id: (pc as any).id,
        actor_user_id: context.userId,
        action: "refi_intent",
        detail:
          data.estSavingsMonthly != null
            ? `Homeowner opened refi lead · est. $${data.estSavingsMonthly}/mo savings`
            : "Homeowner opened refi lead",
      });
    }

    return { ok: true as const, requestId: req.id as string };
  });



