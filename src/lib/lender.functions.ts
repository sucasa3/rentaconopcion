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
      .select("org_id, role, lender_orgs(id, name)")
      .eq("user_id", context.userId);
    if (mErr) throw new Error(mErr.message);

    const orgIds = (memberships ?? []).map((m: any) => m.org_id);
    if (orgIds.length === 0) return { orgs: [], portfolios: [] };

    const { data: portfolios, error: pErr } = await context.supabase
      .from("lender_portfolios")
      .select("id, name, org_id, created_at")
      .in("org_id", orgIds)
      .order("created_at", { ascending: false });
    if (pErr) throw new Error(pErr.message);

    // Aggregate counts per portfolio
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
        id: m.org_id,
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
      .insert({ org_id: data.orgId, name: data.name, created_by: context.userId })
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
      .select("id, name, org_id, created_at, lender_orgs(name)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!portfolio) throw new Error("Portfolio not found");

    const { data: clients, error: cErr } = await context.supabase
      .from("lender_portfolio_clients")
      .select(
        "id, full_name, address, city, state, zip, email, loan_balance_cents, interest_rate_bps, note, homeowner_user_id, estimated_value_cents, refi_signal, created_at",
      )
      .eq("portfolio_id", data.id)
      .order("created_at", { ascending: false });
    if (cErr) throw new Error(cErr.message);

    // Consent gating: PII (name/email/address) hidden unless a consent row exists for that homeowner
    const homeownerIds = (clients ?? [])
      .map((c: any) => c.homeowner_user_id)
      .filter(Boolean) as string[];
    let consentedIds = new Set<string>();
    if (homeownerIds.length) {
      const { data: consents } = await context.supabase
        .from("homeowner_lender_consents")
        .select("homeowner_user_id")
        .in("homeowner_user_id", homeownerIds)
        .eq("org_id", portfolio.org_id)
        .eq("revoked", false);
      consentedIds = new Set((consents ?? []).map((c: any) => c.homeowner_user_id));
    }

    return {
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        orgName: portfolio.lender_orgs?.name ?? "Org",
      },
      clients: (clients ?? []).map((c: any) => {
        const consented = c.homeowner_user_id ? consentedIds.has(c.homeowner_user_id) : false;
        // PII hidden by default; address kept (needed for enrichment) but names/email masked
        return {
          ...c,
          consent_state: c.homeowner_user_id
            ? consented
              ? "granted"
              : "pending"
            : "cold-lead",
          full_name: consented ? c.full_name : maskName(c.full_name),
          email: consented ? c.email : null,
        };
      }),
    };
  });

function maskName(name: string): string {
  const parts = name.split(" ");
  return parts
    .map((p, i) => (i === parts.length - 1 ? `${p.charAt(0)}.` : p))
    .join(" ");
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
      full_name: r.full_name,
      address: r.address,
      city: r.city,
      state: r.state,
      zip: r.zip,
      email: r.email,
      loan_balance_cents: r.loan_balance_cents,
      interest_rate_bps: r.interest_rate_bps,
      note: r.note,
    }));
    const { error } = await context.supabase.from("lender_portfolio_clients").insert(payload);
    if (error) throw new Error(error.message);

    await context.supabase.from("lender_activity").insert({
      actor_user_id: context.userId,
      portfolio_id: data.portfolioId,
      action: "csv_ingest",
      detail: { count: rows.length },
    });

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
      .insert({ name: data.name, created_by: context.userId })
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
    // Look up user by email via profiles table
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();
    if (!profile) throw new Error("No user found with that email — they must sign up first.");

    // Insert membership
    const { error: mErr } = await supabaseAdmin
      .from("lender_members")
      .insert({ org_id: data.orgId, user_id: profile.id, role: data.role });
    if (mErr && !mErr.message.includes("duplicate")) throw new Error(mErr.message);

    // Grant lender role
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: profile.id, role: "lender" });

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
