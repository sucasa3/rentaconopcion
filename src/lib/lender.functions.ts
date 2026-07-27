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
    await assertLenderAccess(context.supabase, context.userId);
    const { data: memberships, error: mErr } = await context.supabase
      .from("lender_members")
      .select("lender_org_id, role, lender_orgs(id, name)")
      .eq("user_id", context.userId);
    if (mErr) throw new Error(mErr.message);

    const orgIds = (memberships ?? []).map((m: any) => m.lender_org_id);
    if (orgIds.length === 0) return { orgs: [], portfolios: [] as any[] };

    const { data: portfolios, error: pErr } = await context.supabase
      .from("lender_portfolios")
      .select("id, name, lender_org_id, created_at")
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

    return {
      orgs: (memberships ?? []).map((m: any) => ({
        id: m.lender_org_id,
        name: m.lender_orgs?.name ?? "Org",
        role: m.role,
      })),
      portfolios: withCounts,
    };
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
        "id, client_name, client_email, address_line1, city, state, zip, loan_amount_at_close_cents, rate_at_close, close_date, term_months, notes, homeowner_id, created_at",
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
      const consented = c.homeowner_id ? consentedIds.has(c.homeowner_id) : false;
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
        full_name: consented ? c.client_name : maskName(c.client_name ?? ""),
        email: consented ? c.client_email : null,
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
