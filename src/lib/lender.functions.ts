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

export const getPortfolio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertLenderAccess(context.supabase, context.userId);
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
        "id, client_name, client_email, address_line1, city, state, zip, loan_amount_at_close_cents, rate_at_close, close_date, notes, homeowner_id, created_at",
      )
      .eq("portfolio_id", data.id)
      .order("created_at", { ascending: false });
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

    return {
      portfolio: {
        id: (portfolio as any).id,
        name: (portfolio as any).name,
        orgName: (portfolio as any).lender_orgs?.name ?? "Org",
      },
      clients: (clients ?? []).map((c: any) => {
        const consented = c.homeowner_id ? consentedIds.has(c.homeowner_id) : false;
        return {
          id: c.id,
          full_name: consented ? c.client_name : maskName(c.client_name ?? ""),
          email: consented ? c.client_email : null,
          address: c.address_line1,
          city: c.city,
          state: c.state,
          zip: c.zip,
          loan_balance_cents: c.loan_amount_at_close_cents,
          rate_at_close: c.rate_at_close,
          note: c.notes,
          consent_state: c.homeowner_id ? (consented ? "granted" : "pending") : "cold-lead",
        };
      }),
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
