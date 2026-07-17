/**
 * Valuation abstraction — the ONE interface UI code and server fns talk to.
 * Providers (attom, fello, mock) sit behind this so we can:
 *   - swap providers per-field without touching callers,
 *   - cache in Postgres with per-class TTLs,
 *   - enforce a monthly budget cap,
 *   - log every call with a revenue_source for revenue-per-call analysis.
 *
 * Server-only (filename enforced). Never import from routes/components; wrap
 * in a createServerFn in `property-intel.functions.ts`.
 */

import { attomCostCents, attomFetch, ATTOM_TTL_DAYS, normalizeAddress, type AttomEndpoint } from "./attom.server";

export type IntelClass = AttomEndpoint;

export interface GetPropertyIntelOptions {
  classes: IntelClass[];
  revenueSource: string; // 'signup_enrichment' | 'refresh' | 'report' | 'lead_claim' | ...
  requestedBy?: string | null;
  forceRefresh?: boolean;
}

export interface PropertyIntelResult {
  address: string;
  classes: Partial<Record<IntelClass, { data: unknown; fetchedAt: string; stale: boolean }>>;
  budget: { callsUsed: number; callsIncluded: number; pct: number; cacheOnly: boolean };
  errors: Partial<Record<IntelClass, string>>;
}

function ttlOk(fetchedAt: string | null, cls: IntelClass): boolean {
  if (!fetchedAt) return false;
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  return ageMs < ATTOM_TTL_DAYS[cls] * 24 * 60 * 60 * 1000;
}

export async function getPropertyIntel(
  address: string,
  opts: GetPropertyIntelOptions,
): Promise<PropertyIntelResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const normalized = normalizeAddress(address);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthKey = monthStart.toISOString().slice(0, 10);

  // 1. Load current-month budget (row seeded by migration)
  const { data: budgetRow } = await supabaseAdmin
    .from("attom_monthly_budget")
    .select("id, calls_used, tier_calls_included, soft_cap_pct, cache_only_mode")
    .eq("month", monthKey)
    .maybeSingle();

  let callsUsed = budgetRow?.calls_used ?? 0;
  const callsIncluded = budgetRow?.tier_calls_included ?? 5000;
  const softCapPct = budgetRow?.soft_cap_pct ?? 80;
  let cacheOnly = budgetRow?.cache_only_mode ?? false;
  if ((callsUsed / callsIncluded) * 100 >= softCapPct) cacheOnly = true;

  // 2. Load existing intel row (may be null)
  const { data: existing } = await supabaseAdmin
    .from("property_intel")
    .select("*")
    .eq("address_normalized", normalized)
    .maybeSingle();

  const result: PropertyIntelResult = {
    address: normalized,
    classes: {},
    budget: { callsUsed, callsIncluded, pct: (callsUsed / callsIncluded) * 100, cacheOnly },
    errors: {},
  };

  const updates: Record<string, unknown> = {};
  let touched = false;

  for (const cls of opts.classes) {
    const cachedData = existing?.[cls] as unknown;
    const cachedAt = existing?.[`${cls}_fetched_at`] as string | null;
    const fresh = !opts.forceRefresh && ttlOk(cachedAt, cls);

    // Cache hit path
    if (fresh && cachedData) {
      result.classes[cls] = { data: cachedData, fetchedAt: cachedAt!, stale: false };
      await supabaseAdmin.from("attom_call_log").insert({
        endpoint: cls,
        address_normalized: normalized,
        requested_by: opts.requestedBy ?? null,
        cache_hit: true,
        cost_cents: 0,
        status: 200,
        revenue_source: opts.revenueSource,
      });
      continue;
    }

    // Cache-only mode: return stale if we have it, else record the miss.
    if (cacheOnly) {
      if (cachedData) {
        result.classes[cls] = { data: cachedData, fetchedAt: cachedAt ?? new Date(0).toISOString(), stale: true };
      } else {
        result.errors[cls] = "Monthly ATTOM budget cap reached; no cached data available.";
      }
      continue;
    }

    // Cache miss + budget available → live fetch
    const fetched = await attomFetch(cls, address);
    const cost = attomCostCents(cls);
    callsUsed += 1;

    await supabaseAdmin.from("attom_call_log").insert({
      endpoint: cls,
      address_normalized: normalized,
      requested_by: opts.requestedBy ?? null,
      cache_hit: false,
      cost_cents: cost,
      status: fetched.status,
      error_message: fetched.ok ? null : fetched.error,
      revenue_source: opts.revenueSource,
    });

    if (!fetched.ok) {
      result.errors[cls] = fetched.error;
      // Serve stale on error if we have it
      if (cachedData) {
        result.classes[cls] = { data: cachedData, fetchedAt: cachedAt ?? new Date(0).toISOString(), stale: true };
      }
      continue;
    }

    const now = new Date().toISOString();
    updates[cls] = fetched.data;
    updates[`${cls}_fetched_at`] = now;
    touched = true;
    result.classes[cls] = { data: fetched.data, fetchedAt: now, stale: false };
  }

  // 3. Persist any new/refreshed classes into property_intel (upsert)
  if (touched) {
    const parts = address.split(",").map((p) => p.trim());
    await supabaseAdmin
      .from("property_intel")
      .upsert(
        {
          address_normalized: normalized,
          address_line1: parts[0] ?? address,
          city: parts[1] ?? null,
          state: parts[2]?.split(" ")[0] ?? null,
          zip: parts[2]?.split(" ")[1] ?? null,
          ...updates,
        },
        { onConflict: "address_normalized" },
      );
  }

  // 4. Update budget counter (only for live calls we made this invocation)
  if (callsUsed !== (budgetRow?.calls_used ?? 0)) {
    await supabaseAdmin
      .from("attom_monthly_budget")
      .upsert(
        {
          month: monthKey,
          calls_used: callsUsed,
          cost_cents_used: callsUsed * TRIAL_COST_CENTS_PER_CALL,
        },
        { onConflict: "month" },
      );
  }

  result.budget = {
    callsUsed,
    callsIncluded,
    pct: (callsUsed / callsIncluded) * 100,
    cacheOnly,
  };
  return result;
}

const TRIAL_COST_CENTS_PER_CALL = 10;

// ---------- Extractors: pull the fields UI actually cares about ----------
// ATTOM responses are deeply nested; keep the shape stable for the UI.

export interface AvmSummary {
  estimate: number | null;
  low: number | null;
  high: number | null;
  confidence: number | null;
  asOf: string | null;
}
export function extractAvm(raw: unknown): AvmSummary {
  const r = raw as { property?: Array<{ avm?: { amount?: { value?: number; low?: number; high?: number; confidence?: number }; eventDate?: string } }> } | null;
  const avm = r?.property?.[0]?.avm;
  return {
    estimate: avm?.amount?.value ?? null,
    low: avm?.amount?.low ?? null,
    high: avm?.amount?.high ?? null,
    confidence: avm?.amount?.confidence ?? null,
    asOf: avm?.eventDate ?? null,
  };
}

export interface DetailSummary {
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSqft: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
}
export function extractDetail(raw: unknown): DetailSummary {
  const r = raw as { property?: Array<{ building?: { rooms?: { beds?: number; bathstotal?: number }; size?: { livingsize?: number }; summary?: { yearbuilt?: number } }; lot?: { lotsize2?: number }; summary?: { proptype?: string } }> } | null;
  const p = r?.property?.[0];
  return {
    beds: p?.building?.rooms?.beds ?? null,
    baths: p?.building?.rooms?.bathstotal ?? null,
    sqft: p?.building?.size?.livingsize ?? null,
    lotSqft: p?.lot?.lotsize2 ?? null,
    yearBuilt: p?.building?.summary?.yearbuilt ?? null,
    propertyType: p?.summary?.proptype ?? null,
  };
}

export interface TaxSummary {
  assessedTotal: number | null;
  marketTotal: number | null;
  taxAmount: number | null;
  taxYear: number | null;
}
export function extractTax(raw: unknown): TaxSummary {
  const r = raw as { property?: Array<{ assessment?: { assessed?: { assdttlvalue?: number }; market?: { mktttlvalue?: number }; tax?: { taxamt?: number; taxyear?: number } } }> } | null;
  const a = r?.property?.[0]?.assessment;
  return {
    assessedTotal: a?.assessed?.assdttlvalue ?? null,
    marketTotal: a?.market?.mktttlvalue ?? null,
    taxAmount: a?.tax?.taxamt ?? null,
    taxYear: a?.tax?.taxyear ?? null,
  };
}
