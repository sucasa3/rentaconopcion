/**
 * Valuation abstraction — the ONE interface UI code and server fns talk to.
 * Providers (attom, mock) sit behind this so we can:
 *   - swap providers per-field without touching callers,
 *   - cache in Postgres with per-class TTLs,
 *   - enforce a monthly budget cap,
 *   - log every call with a revenue_source for revenue-per-call analysis.
 *
 * Server-only (filename enforced). Never import from routes/components; wrap
 * in a createServerFn in `property-intel.functions.ts`.
 */

import { BENCHMARK_REFI_RATE } from "./refi";

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

  // Resolve `detail` first: its canonical address + property id are the
  // fallback keys we use when a raw address string fails to match.
  const ordered = [...opts.classes].sort((a, b) =>
    a === "detail" ? -1 : b === "detail" ? 1 : 0,
  );

  for (const cls of ordered) {

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

  // 2b. Valuation fallback — the AVM endpoint is stricter about address
  // matching than the rest. When it comes back empty but the detail lookup
  // matched, retry using the provider's canonical one-line address, then by
  // property id. Costs at most one extra call and only when we'd otherwise
  // show a blank value.
  const wantsAvm = opts.classes.includes("avm");
  const avmEmpty = !result.classes.avm || extractAvm(result.classes.avm.data).estimate == null;
  if (wantsAvm && avmEmpty && !cacheOnly) {
    const detailData = (result.classes.detail?.data ?? existing?.detail) as unknown;
    const matched = matchedProperty(detailData);
    const attempts: Array<{ addr: string; attomId?: string | null }> = [];
    if (matched.oneLine && normalizeAddress(matched.oneLine) !== normalized) {
      attempts.push({ addr: matched.oneLine });
    }
    if (matched.attomId) attempts.push({ addr: address, attomId: matched.attomId });

    for (const attempt of attempts) {
      const retry = await attomFetch("avm", attempt.addr, { attomId: attempt.attomId ?? null });
      callsUsed += 1;
      await supabaseAdmin.from("attom_call_log").insert({
        endpoint: "avm",
        address_normalized: normalized,
        requested_by: opts.requestedBy ?? null,
        cache_hit: false,
        cost_cents: attomCostCents("avm"),
        status: retry.status,
        error_message: retry.ok ? null : retry.error,
        revenue_source: `${opts.revenueSource}_avm_fallback`,
      });
      if (retry.ok && extractAvm(retry.data).estimate != null) {
        const now = new Date().toISOString();
        updates["avm"] = retry.data;
        updates["avm_fetched_at"] = now;
        touched = true;
        result.classes.avm = { data: retry.data, fetchedAt: now, stale: false };
        delete result.errors.avm;
        break;
      }
    }
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

// ---------- Matched-property identity (from the `detail` response) ----------
export function matchedProperty(raw: unknown): {
  attomId: string | null;
  oneLine: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  const r = raw as {
    status?: { attomId?: number | string };
    property?: Array<{
      identifier?: { attomId?: number | string; Id?: number | string };
      address?: { oneLine?: string; locality?: string; countrySubd?: string; postal1?: string };
    }>;
  } | null;
  const p = r?.property?.[0];
  const id = p?.identifier?.attomId ?? p?.identifier?.Id ?? r?.status?.attomId ?? null;

  return {
    attomId: id != null ? String(id) : null,
    oneLine: p?.address?.oneLine ?? null,
    city: p?.address?.locality ?? null,
    state: p?.address?.countrySubd ?? null,
    zip: p?.address?.postal1 ?? null,
  };
}

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
  const r = raw as { property?: Array<{ building?: { rooms?: { beds?: number; bathstotal?: number }; size?: { livingsize?: number }; summary?: { yearbuilt?: number } }; lot?: { lotsize2?: number }; summary?: { proptype?: string; yearbuilt?: number } }> } | null;
  const p = r?.property?.[0];
  return {
    beds: p?.building?.rooms?.beds ?? null,
    baths: p?.building?.rooms?.bathstotal ?? null,
    sqft: p?.building?.size?.livingsize ?? null,
    lotSqft: p?.lot?.lotsize2 ?? null,
    yearBuilt: p?.summary?.yearbuilt ?? p?.building?.summary?.yearbuilt ?? null,

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

// ---------- Sales history ----------
export interface SaleEvent {
  date: string | null;
  amount: number | null;
  docType: string | null;
}
export interface SalesSummary {
  lastSale: SaleEvent | null;
  priorSales: SaleEvent[];
  tenureYears: number | null;
}
export function extractSales(raw: unknown): SalesSummary {
  const r = raw as {
    property?: Array<{
      salehistory?: Array<{
        saleTransDate?: string;
        amount?: { saleamt?: number };
        salesearchdate?: string;
        saleTransType?: string;
      }>;
    }>;
  } | null;
  const rows = r?.property?.[0]?.salehistory ?? [];
  const events: SaleEvent[] = rows
    .map((s) => ({
      date: s.saleTransDate ?? s.salesearchdate ?? null,
      amount: s.amount?.saleamt ?? null,
      docType: s.saleTransType ?? null,
    }))
    .filter((e) => e.date || e.amount);
  const [last, ...rest] = events;
  const tenureYears = last?.date
    ? Math.max(0, Math.round((Date.now() - new Date(last.date).getTime()) / (365.25 * 24 * 3600 * 1000)))
    : null;
  return { lastSale: last ?? null, priorSales: rest, tenureYears };
}

// ---------- Mortgage ----------
export interface MortgageSummary {
  /** false when public records show no open mortgage for the property */
  hasRecord: boolean;
  loanAmount: number | null;

  lender: string | null;
  originationDate: string | null;
  interestRate: number | null;
  loanType: string | null;
  termYears: number | null;
  termMonths: number | null;
}
export function extractMortgage(raw: unknown): MortgageSummary {
  const r = raw as {
    property?: Array<{
      mortgage?: {
        // ATTOM /property/detailmortgage returns fields directly on `mortgage`.
        amount?: number;
        date?: string;
        term?: number | { termType?: string; termYears?: number };
        interestRate?: number;
        loantypecode?: string;
        deedtype?: string;
        lender?: { lastname?: string } | string;
        // Some payloads may wrap under FirstConcurrent — kept as fallback.
        FirstConcurrent?: {
          amount?: number;
          lender?: string;
          date?: string;
          interestRate?: number;
          term?: { termType?: string; termYears?: number };
        };
      };
    }>;
  } | null;
  const mtg = r?.property?.[0]?.mortgage;
  const fc = mtg?.FirstConcurrent;

  const amount = mtg?.amount ?? fc?.amount ?? null;
  const date = mtg?.date ?? fc?.date ?? null;
  const interestRate = mtg?.interestRate ?? fc?.interestRate ?? null;

  // `term` may be a number of months, or `{ termYears }`, or absent.
  let termMonths: number | null = null;
  let termYears: number | null = null;
  const rawTerm = mtg?.term ?? fc?.term ?? null;
  if (typeof rawTerm === "number") {
    termMonths = rawTerm;
    termYears = Math.round(rawTerm / 12);
  } else if (rawTerm && typeof rawTerm === "object" && rawTerm.termYears) {
    termYears = rawTerm.termYears;
    termMonths = rawTerm.termYears * 12;
  }

  const lender =
    typeof mtg?.lender === "object"
      ? mtg?.lender?.lastname ?? null
      : (mtg?.lender as string | undefined) ?? (fc?.lender ?? null);

  const loanType =
    mtg?.loantypecode ??
    (typeof rawTerm === "object" ? rawTerm?.termType ?? null : null);

  // A record with amount 0 and no lender means "nothing recorded", not a
  // zero-dollar loan. Surface that as "no open mortgage on record".
  const hasRecord = Boolean((amount && amount > 0) || lender || date || interestRate);

  return {
    hasRecord,
    loanAmount: amount && amount > 0 ? amount : null,
    lender: lender ?? null,
    originationDate: date ?? null,
    interestRate: interestRate ?? null,
    loanType: loanType ?? null,
    termYears,
    termMonths,
  };
}




// ---------- Permits ----------
export interface PermitEvent {
  date: string | null;
  type: string | null;
  description: string | null;
  value: number | null;
  status: string | null;
}
export interface PermitsSummary {
  events: PermitEvent[];
  totalValue: number | null;
  lastPermitDate: string | null;
}
type RawPermit = {
  effectiveDate?: string;
  type?: string;
  subType?: string;
  description?: string;
  projectName?: string;
  classifiers?: string[];
  jobValue?: number;
  status?: string;
};

export function extractPermits(raw: unknown): PermitsSummary {
  const p = (raw as { property?: Array<Record<string, unknown>> } | null)?.property?.[0] ?? null;
  // ATTOM returns permits either at property[].buildingPermits (current) or
  // nested under building.permits (older shape). Support both.
  const rows = ((p?.["buildingPermits"] as RawPermit[] | undefined) ??
    ((p?.["building"] as { permits?: RawPermit[] } | undefined)?.permits ??
      [])) as RawPermit[];

  const events: PermitEvent[] = rows.map((r) => ({
    date: r.effectiveDate ?? null,
    type: [r.type, r.subType].filter(Boolean).join(" · ") || null,
    description:
      [r.description, (r.classifiers ?? []).join(", ")].filter(Boolean).join(" — ") || null,
    value: r.jobValue ?? null,
    status: r.status ?? null,
  }));
  events.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const totalValue = events.reduce((sum, e) => sum + (e.value ?? 0), 0) || null;
  return {
    events,
    totalValue,
    lastPermitDate: events[0]?.date ?? null,
  };
}

// ---------- Derived intelligence (no extra API cost) ----------

export interface EquityRibbon {
  estimatedValue: number | null;
  loanBalanceEstimate: number | null;
  equityDollars: number | null;
  equityPct: number | null;
  cashOutHeadroom80: number | null; // 80% LTV cash-out ceiling
  refiSignal: "strong" | "moderate" | "watch" | null;
  tenureYears: number | null;
}

/**
 * Straight-line amortization estimate of remaining balance. ATTOM gives us
 * origination amount + date + rate; we don't get live servicer balance, so
 * we approximate. Good enough for the equity ribbon + refi signal.
 */
export function estimateLoanBalance(m: MortgageSummary): number | null {
  if (!m.loanAmount || !m.originationDate) return null;
  const rate = (m.interestRate ?? 6) / 100 / 12;
  const nMonths = (m.termYears ?? 30) * 12;
  const elapsed = Math.max(
    0,
    Math.min(nMonths, (Date.now() - new Date(m.originationDate).getTime()) / (30.44 * 24 * 3600 * 1000)),
  );
  if (rate === 0) return Math.max(0, m.loanAmount * (1 - elapsed / nMonths));
  // Standard remaining-balance formula
  const pow = Math.pow(1 + rate, nMonths);
  const powE = Math.pow(1 + rate, elapsed);
  const balance = m.loanAmount * ((pow - powE) / (pow - 1));
  return Math.max(0, Math.round(balance));
}

export function computeEquityRibbon(
  avm: AvmSummary | null,
  mortgage: MortgageSummary | null,
  sales: SalesSummary | null,
): EquityRibbon {
  const value = avm?.estimate ?? null;
  const balance = mortgage ? estimateLoanBalance(mortgage) : null;
  const equity = value != null && balance != null ? value - balance : null;
  const equityPct = value && equity != null ? Math.max(0, Math.min(1, equity / value)) : null;
  const cashOut = value != null && balance != null ? Math.max(0, Math.round(value * 0.8 - balance)) : null;

  let refi: EquityRibbon["refiSignal"] = null;
  const marketRate = BENCHMARK_REFI_RATE;
  if (equityPct != null && mortgage?.interestRate != null) {
    // Rate-driven refi: 20%+ equity AND current market meaningfully below their rate.
    const spread = mortgage.interestRate - marketRate;
    if (equityPct >= 0.2 && spread >= 1) refi = "strong";
    else if (equityPct >= 0.2 && spread >= 0.5) refi = "moderate";
    else if (equityPct >= 0.15) refi = "watch";
  } else if (equityPct != null) {
    // Equity-driven signal when ATTOM has no mortgage record: cash-out / HELOC angle.
    if (equityPct >= 0.5) refi = "strong";
    else if (equityPct >= 0.3) refi = "moderate";
    else if (equityPct >= 0.2) refi = "watch";
  } else if (value != null && mortgage == null) {
    // No mortgage on file at all — likely owned free-and-clear or unrecorded.
    // Treat as moderate cash-out opportunity.
    refi = "moderate";
  }

  return {
    estimatedValue: value,
    loanBalanceEstimate: balance,
    equityDollars: equity,
    equityPct,
    cashOutHeadroom80: cashOut,
    refiSignal: refi,
    tenureYears: sales?.tenureYears ?? null,
  };
}
