/**
 * HOME PROFILE — the persistent memory layer of the SuCasa Home Record.
 *
 * `home-record.ts` assembles the canonical shape in memory; this module makes
 * it durable. One row per homeowner in `public.home_profiles` holds property,
 * mortgage/valuation, condition/maintenance and behavior sections, so the Home
 * Agent (and any other surface) can reason over the home without re-buying
 * property-record calls on every turn.
 *
 * Server-only: never import from a component.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { assembleHomeRecord, type HomeRecord } from "@/lib/home-record";
import type { PermitLike, ServiceLogLike } from "@/lib/maintenance-rules";

type DB = SupabaseClient<Database>;

/** How long a stored profile is trusted before we refresh it. */
const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;

export type StoredHomeProfile = HomeRecord & {
  lastRefreshedAt: string;
  providerRefreshedAt: string | null;
};

function fullAddress(p: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string | null {
  const s = [p.address, p.city, p.state, p.zip].filter(Boolean).join(", ");
  return s || null;
}

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

/**
 * Rebuild the homeowner's Home Profile from every sensor we have and persist
 * it. Property-record classes are read cache-first unless `forceProvider`.
 */
export async function refreshHomeProfile(
  supabase: DB,
  userId: string,
  opts: { forceProvider?: boolean } = {},
): Promise<StoredHomeProfile> {
  const [{ data: profile }, { data: findings }, { data: serviceLog }, { data: docs }, { data: requests }, { data: activity }, { data: intent }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("address, city, state, zip")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("home_inspection_findings")
        .select("system, urgency, recommended_action")
        .eq("user_id", userId),
      supabase
        .from("home_component_service_log")
        .select("component_key, action, serviced_on, provider, notes")
        .eq("user_id", userId),
      supabase.from("home_documents").select("id").eq("user_id", userId),
      supabase.from("service_requests").select("status").eq("homeowner_id", userId),
      supabase
        .from("homeowner_activity_events")
        .select("event_type, occurred_at")
        .eq("homeowner_id", userId)
        .gte("occurred_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()),
      supabase
        .from("seller_intent_submissions")
        .select("timeframe, created_at")
        .eq("homeowner_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const address = fullAddress(profile ?? {});

  let avm: { estimate?: number | null; low?: number | null; high?: number | null } | null = null;
  let detail: { beds?: number | null; baths?: number | null; sqft?: number | null; yearBuilt?: number | null } | null =
    null;
  let tax: { marketTotal?: number | null; assessedTotal?: number | null; taxAmount?: number | null } | null = null;
  let sales: { lastSalePrice?: number | null; lastSaleDate?: string | null } | null = null;
  let mortgageRate: number | null = null;
  let equity: NonNullable<Parameters<typeof assembleHomeRecord>[0]["equity"]> | null = null;
  let permits: PermitLike[] = [];
  let staleClasses: string[] = [];
  let providerRefreshedAt: string | null = null;
  let addressNormalized: string | null = null;

  if (address) {
    try {
      const {
        getPropertyIntel,
        extractAvm,
        extractDetail,
        extractMortgage,
        extractSales,
        extractTax,
        extractPermits,
        computeEquityRibbon,
      } = await import("@/lib/valuation.server");

      const intel = await getPropertyIntel(address, {
        classes: ["avm", "detail", "mortgage", "sales", "tax", "permits"],
        ...(opts.forceProvider ? {} : { cachedOnlyClasses: ["sales", "tax", "permits"] }),
        requestedBy: userId,
        revenueSource: "home_profile_refresh",
      });

      addressNormalized = intel.address ?? null;
      const a = extractAvm(intel.classes.avm?.data);
      const d = extractDetail(intel.classes.detail?.data);
      const m = extractMortgage(intel.classes.mortgage?.data);
      const s = extractSales(intel.classes.sales?.data);
      const t = intel.classes.tax ? extractTax(intel.classes.tax.data) : null;
      const p = intel.classes.permits ? extractPermits(intel.classes.permits.data) : null;
      const ribbon = computeEquityRibbon(a, m, s, t);

      avm = a ? { estimate: a.estimate ?? null, low: a.low ?? null, high: a.high ?? null } : null;
      detail = d
        ? { beds: d.beds ?? null, baths: d.baths ?? null, sqft: d.sqft ?? null, yearBuilt: d.yearBuilt ?? null }
        : null;
      tax = t
        ? {
            marketTotal: t.marketTotal ?? null,
            assessedTotal: t.assessedTotal ?? null,
            taxAmount: t.taxAmount ?? null,
          }
        : null;
      sales = { lastSalePrice: s?.lastSale?.amount ?? null, lastSaleDate: s?.lastSale?.date ?? null };
      mortgageRate = m?.interestRate ?? null;
      permits = p?.events ?? [];
      equity = {
        estimatedValue: ribbon.estimatedValue,
        loanBalance: ribbon.loanBalanceEstimate,
        equityDollars: ribbon.equityDollars,
        equityPct: ribbon.equityPct,
        cashOutHeadroom: ribbon.cashOutHeadroom80,
        refiSignal: ribbon.refiSignal,
        rate: mortgageRate,
      };
      staleClasses = Object.entries(intel.classes)
        .filter(([, v]) => (v as { stale?: boolean } | undefined)?.stale)
        .map(([k]) => k);
      providerRefreshedAt = new Date().toISOString();
    } catch (e) {
      console.warn("[home-profile] property intel skipped:", (e as Error).message);
    }
  }

  const events = activity ?? [];
  const reqs = requests ?? [];

  const record = assembleHomeRecord({
    homeownerId: userId,
    address,
    addressNormalized,
    avm,
    detail,
    tax,
    sales,
    mortgage: { rate: mortgageRate },
    equity,
    permits,
    valueStatus: undefined,
    staleClasses,
    findings: (findings ?? []) as HomeRecord["physical"]["findings"],
    serviceLog: (serviceLog ?? []) as unknown as ServiceLogLike[],
    documentCount: (docs ?? []).length,
    openRequests: reqs.filter((r) => (r.status ?? "").toLowerCase() !== "completed").length,
    totalRequests: reqs.length,
    valueChecks30d: events.filter((e) => e.event_type === "value_check").length,
    equityChecks30d: events.filter((e) => e.event_type === "equity_view").length,
    sellingIntent: intent?.timeframe ?? null,
    lastActivityAt: events[0]?.occurred_at ?? null,
  });

  const now = new Date().toISOString();

  const { error } = await supabase.from("home_profiles").upsert(
    {
      user_id: userId,
      address,
      address_normalized: addressNormalized,
      property: record.property as never,
      financial: record.financial as never,
      physical: record.physical as never,
      behavior: record.behavior as never,
      completeness: record.completeness as never,
      completeness_pct: record.completeness.pct,
      stale_classes: staleClasses,
      last_refreshed_at: now,
      ...(providerRefreshedAt ? { provider_refreshed_at: providerRefreshedAt } : {}),
    },
    { onConflict: "user_id" },
  );
  if (error) console.warn("[home-profile] persist failed:", error.message);

  return { ...record, lastRefreshedAt: now, providerRefreshedAt };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * The homeowner's persisted Home Profile. Refreshes when missing or stale, so
 * every caller — dashboard, agent, plan — reads one consistent memory.
 */
export async function loadHomeProfile(
  supabase: DB,
  userId: string,
  opts: { refresh?: boolean } = {},
): Promise<StoredHomeProfile> {
  const { data: row } = await supabase
    .from("home_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const fresh =
    row && Date.now() - new Date(row.last_refreshed_at).getTime() < PROFILE_TTL_MS && !opts.refresh;

  if (!fresh) {
    try {
      return await refreshHomeProfile(supabase, userId);
    } catch (e) {
      console.warn("[home-profile] refresh failed:", (e as Error).message);
      if (!row) throw e;
    }
  }

  const stored = row!;
  return {
    homeownerId: userId,
    property: stored.property as never,
    financial: stored.financial as never,
    physical: stored.physical as never,
    behavior: stored.behavior as never,
    completeness: stored.completeness as never,
    staleClasses: stored.stale_classes ?? [],
    asOf: stored.last_refreshed_at,
    lastRefreshedAt: stored.last_refreshed_at,
    providerRefreshedAt: stored.provider_refreshed_at,
  };
}

/** Compact, token-cheap rendering of the stored profile for the Home Agent. */
export function renderHomeProfileForAgent(p: StoredHomeProfile): string[] {
  const lines: string[] = [];
  const money = (n: number | null | undefined) =>
    n == null ? null : `$${Math.round(n).toLocaleString()}`;

  if (p.property?.address) lines.push(`Address: ${p.property.address}`);
  if (p.property?.yearBuilt) lines.push(`Year built: ${p.property.yearBuilt}`);
  if (p.property?.sqft) lines.push(`Size: ${p.property.sqft} sqft`);
  if (p.property?.beds != null || p.property?.baths != null)
    lines.push(`Layout: ${p.property.beds ?? "?"} bd / ${p.property.baths ?? "?"} ba`);
  if (p.property?.lastSaleDate)
    lines.push(
      `Purchased: ${p.property.lastSaleDate}${
        p.property.lastSalePrice ? ` for ${money(p.property.lastSalePrice)}` : ""
      }`,
    );

  const f = p.financial;
  if (f?.value?.value != null) lines.push(`Estimated value: ${money(f.value.value)}`);
  if (f?.loanBalance != null) lines.push(`Loan balance: ${money(f.loanBalance)}`);
  if (f?.rate != null) lines.push(`Mortgage rate: ${f.rate}%`);
  if (f?.equityDollars != null)
    lines.push(
      `Equity: ${money(f.equityDollars)}${
        f.equityPct != null ? ` (${Math.round(f.equityPct * 100)}%)` : ""
      }`,
    );
  if (f?.cashOutHeadroom != null) lines.push(`Cash-out headroom: ${money(f.cashOutHeadroom)}`);
  if (f?.refiSignal) lines.push(`Refi signal: ${f.refiSignal}`);
  if (f?.taxAmount != null) lines.push(`Property tax: ${money(f.taxAmount)}`);

  const ph = p.physical;
  for (const t of ph?.overdue ?? [])
    lines.push(`Overdue: ${t.label} (installed ${t.installedYear}, expected life to ${t.expectedYear})`);
  for (const t of ph?.dueSoon ?? [])
    lines.push(`Due soon: ${t.label} (expected ${t.expectedYear})`);
  if (ph?.openFindings) lines.push(`Open inspection findings: ${ph.openFindings}`);
  if (ph?.serviceLogCount) lines.push(`Logged service records: ${ph.serviceLogCount}`);
  if (ph?.documentCount) lines.push(`Documents on file: ${ph.documentCount}`);

  const b = p.behavior;
  if (b?.openRequests) lines.push(`Open service requests: ${b.openRequests}`);
  if (b?.sellingIntent) lines.push(`Stated plans: ${b.sellingIntent}`);
  if (b?.valueChecks30d) lines.push(`Value checks (30d): ${b.valueChecks30d}`);

  if (p.completeness?.pct != null) {
    const missing = (p.completeness.sections ?? []).flatMap((s) => s.missing).slice(0, 5);
    lines.push(
      `Record completeness: ${p.completeness.pct}%${missing.length ? ` — missing: ${missing.join(", ")}` : ""}`,
    );
  }
  lines.push(`Profile last refreshed: ${p.lastRefreshedAt}`);
  return lines;
}
