/**
 * Server-side opportunity engine.
 *
 * Reads the signals SuCasa already holds for a book of clients, derives named
 * opportunities, and persists them so every surface (agent book, lender
 * network view, campaign audiences, alerts) reads the same objects.
 *
 * Compliance note: opportunities are informational signals only. Nothing here
 * makes an eligibility or underwriting determination.
 */

import { normalizeAddress } from "./attom.server";
import {
  deriveOpportunities,
  deriveSignals,
  type ClientSignals,
  type DerivedOpportunity,
} from "./opportunities";

export interface PortfolioClientRow {
  id: string;
  portfolio_id: string;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  address_line1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  close_date: string | null;
  loan_amount_at_close_cents: number | null;
  rate_at_close: number | null;
  term_months: number | null;
  homeowner_id: string | null;
}

const CLIENT_COLUMNS =
  "id, portfolio_id, client_name, client_email, client_phone, address_line1, city, state, zip, close_date, loan_amount_at_close_cents, rate_at_close, term_months, homeowner_id";

/** Resolve the org that owns a portfolio, and assert the caller belongs to it. */
export async function assertPortfolioOrg(
  supabase: any,
  portfolioId: string,
): Promise<{ orgId: string; orgName: string; orgType: string }> {
  const { data, error } = await supabase
    .from("lender_portfolios")
    .select("id, lender_org_id, lender_orgs(name, org_type)")
    .eq("id", portfolioId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Book not found, or you do not have access to it");
  return {
    orgId: data.lender_org_id,
    orgName: data.lender_orgs?.name ?? "Organization",
    orgType: data.lender_orgs?.org_type ?? "lender",
  };
}

/**
 * Property-records context keyed by normalized address: recent permit activity
 * and an owner-occupancy hint. Missing records simply yield no extra signal.
 */
async function propertyContext(
  supabase: any,
  clients: PortfolioClientRow[],
): Promise<Map<string, { permitCount: number; likelyNonOwnerOccupied: boolean }>> {
  const out = new Map<string, { permitCount: number; likelyNonOwnerOccupied: boolean }>();
  const keys = [...new Set(clients.map((c) => normalizeAddress(c.address_line1 ?? "")))].filter(
    Boolean,
  );
  if (!keys.length) return out;

  for (let i = 0; i < keys.length; i += 200) {
    const slice = keys.slice(i, i + 200);
    const { data } = await supabase
      .from("property_intel")
      .select("address_normalized, permits, owner")
      .in("address_normalized", slice);
    for (const row of data ?? []) {
      const permits = Array.isArray(row.permits)
        ? row.permits
        : Array.isArray(row.permits?.permits)
          ? row.permits.permits
          : [];
      const owner = row.owner ?? {};
      const mailing =
        owner?.mailingAddressOneLine ?? owner?.mailing?.oneLine ?? owner?.mailingAddress ?? null;
      const likelyNonOwnerOccupied =
        typeof mailing === "string" && mailing.length > 5
          ? normalizeAddress(mailing) !== row.address_normalized
          : false;
      out.set(row.address_normalized, {
        permitCount: permits.length,
        likelyNonOwnerOccupied,
      });
    }
  }
  return out;
}

export interface ComputedClientOpportunities {
  client: PortfolioClientRow;
  signals: ClientSignals;
  opportunities: DerivedOpportunity[];
}

/** Derive (without persisting) opportunities for every client in a book. */
export async function computeForPortfolio(
  supabase: any,
  portfolioId: string,
  benchmarkRate?: number,
): Promise<ComputedClientOpportunities[]> {
  const { data: clients, error } = await supabase
    .from("lender_portfolio_clients")
    .select(CLIENT_COLUMNS)
    .eq("portfolio_id", portfolioId);
  if (error) throw new Error(error.message);

  const rows = (clients ?? []) as PortfolioClientRow[];
  const ctx = await propertyContext(supabase, rows);
  const now = new Date();

  return rows.map((c) => {
    const extra = ctx.get(normalizeAddress(c.address_line1 ?? "")) ?? {
      permitCount: 0,
      likelyNonOwnerOccupied: false,
    };
    const signals = deriveSignals({
      loanAtCloseCents: c.loan_amount_at_close_cents,
      ratePct: c.rate_at_close,
      termMonths: c.term_months,
      closeDate: c.close_date,
      benchmarkRate,
      permitCount: extra.permitCount,
      likelyNonOwnerOccupied: extra.likelyNonOwnerOccupied,
      now,
    });
    return { client: c, signals, opportunities: deriveOpportunities(signals) };
  });
}

/**
 * Recompute and persist opportunities for a book.
 * Categories that no longer apply are removed unless an introduction has
 * already been made against them (state !== 'open'), which we keep for history.
 */
export async function persistPortfolioOpportunities(
  supabase: any,
  portfolioId: string,
  orgId: string,
  benchmarkRate?: number,
): Promise<{ clients: number; opportunities: number }> {
  const computed = await computeForPortfolio(supabase, portfolioId, benchmarkRate);
  if (!computed.length) return { clients: 0, opportunities: 0 };

  const clientIds = computed.map((c) => c.client.id);
  const { data: existing } = await supabase
    .from("homeowner_opportunities")
    .select("id, portfolio_client_id, category, state")
    .in("portfolio_client_id", clientIds);

  const keep = new Set<string>();
  const rows: any[] = [];
  const computedAt = new Date().toISOString();

  for (const entry of computed) {
    for (const opp of entry.opportunities) {
      keep.add(`${entry.client.id}:${opp.category}`);
      rows.push({
        portfolio_client_id: entry.client.id,
        org_id: orgId,
        category: opp.category,
        strength: opp.strength,
        score: opp.score,
        reasons: opp.reasons,
        signals: {
          equity_cents: entry.signals.equityCents,
          value_cents: entry.signals.valueCents,
          balance_cents: entry.signals.balanceCents,
          ltv_pct: entry.signals.ltvPct,
          rate_pct: entry.signals.ratePct,
          months_since_close: entry.signals.monthsSinceClose,
          savings_per_month: entry.signals.savingsPerMonth,
          benchmark_rate: entry.signals.benchmarkRate,
          permit_count: entry.signals.permitCount,
        },
        computed_at: computedAt,
      });
    }
  }

  if (rows.length) {
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase
        .from("homeowner_opportunities")
        .upsert(rows.slice(i, i + 200), { onConflict: "portfolio_client_id,category" });
      if (error) throw new Error(error.message);
    }
  }

  // Retire opportunities that no longer hold, but never delete history where
  // an introduction was already made.
  const stale = (existing ?? [])
    .filter(
      (e: any) => e.state === "open" && !keep.has(`${e.portfolio_client_id}:${e.category}`),
    )
    .map((e: any) => e.id);
  if (stale.length) {
    await supabase.from("homeowner_opportunities").delete().in("id", stale);
  }

  return { clients: computed.length, opportunities: rows.length };
}

/** Full-detail opportunities for a book the caller's own org owns. */
export async function listPortfolioOpportunityRows(supabase: any, portfolioId: string) {
  const { data: clients, error: cErr } = await supabase
    .from("lender_portfolio_clients")
    .select(CLIENT_COLUMNS)
    .eq("portfolio_id", portfolioId);
  if (cErr) throw new Error(cErr.message);

  const rows = (clients ?? []) as PortfolioClientRow[];
  if (!rows.length) return { opportunities: [], counts: {} as Record<string, number> };

  const { data: opps, error } = await supabase
    .from("homeowner_opportunities")
    .select("id, portfolio_client_id, category, strength, score, reasons, signals, state, computed_at")
    .in(
      "portfolio_client_id",
      rows.map((r) => r.id),
    )
    .order("score", { ascending: false });
  if (error) throw new Error(error.message);

  const byId = new Map(rows.map((r) => [r.id, r]));
  const counts: Record<string, number> = {};

  const opportunities = (opps ?? []).map((o: any) => {
    counts[o.category] = (counts[o.category] ?? 0) + 1;
    const c = byId.get(o.portfolio_client_id);
    return {
      id: o.id,
      category: o.category,
      strength: o.strength,
      score: o.score,
      reasons: o.reasons ?? [],
      signals: o.signals ?? {},
      state: o.state,
      computed_at: o.computed_at,
      client_id: o.portfolio_client_id,
      client_name: c?.client_name ?? null,
      client_email: c?.client_email ?? null,
      client_phone: c?.client_phone ?? null,
      address: c?.address_line1 ?? null,
      city: c?.city ?? null,
      state_code: c?.state ?? null,
      zip: c?.zip ?? null,
      homeowner_id: c?.homeowner_id ?? null,
    };
  });

  return { opportunities, counts };
}
