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

import { estimateHomeValue, type ValueEngineResult } from "@/lib/value-engine";
import { resolveEquity, equityOffersAllowed } from "@/lib/equity";
import type { LienStatus } from "@/lib/mortgage-position";


import { ATTOM_TTL_DAYS, normalizeAddress, type AttomEndpoint } from "./attom.server";

export type IntelClass = AttomEndpoint;
export type DataProvider = "attom" | "batchdata";

export interface GetPropertyIntelOptions {
  classes: IntelClass[];
  revenueSource: string; // 'signup_enrichment' | 'refresh' | 'report' | 'lead_claim' | ...
  requestedBy?: string | null;
  forceRefresh?: boolean;
  /**
   * Per-class freshness overrides (days). Background work uses a longer
   * valuation window than on-demand user requests.
   */
  ttlOverrides?: Partial<Record<IntelClass, number>>;
  /** Never spend on these classes — serve them only if already cached. */
  cachedOnlyClasses?: IntelClass[];
}

export interface PropertyIntelResult {
  address: string;
  classes: Partial<Record<IntelClass, { data: unknown; fetchedAt: string; stale: boolean }>>;
  budget: { callsUsed: number; callsIncluded: number; pct: number; cacheOnly: boolean };
  errors: Partial<Record<IntelClass, string>>;
}

function ttlOk(fetchedAt: string | null, cls: IntelClass, overrideDays?: number): boolean {
  if (!fetchedAt) return false;
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  return ageMs < (overrideDays ?? ATTOM_TTL_DAYS[cls]) * 24 * 60 * 60 * 1000;
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

  // Provider policy: BatchData is the only live source. Historical ATTOM
  // columns stay as cached fallback, but they are never "fresh" — freshness
  // exists only for data a BatchData enrichment wrote.
  const bdEnrichedAt = (existing?.source === "batchdata"
    ? (existing?.batchdata_enriched_at as string | null)
    : null) ?? null;

  const serveCached = (cls: IntelClass, stale: boolean) => {
    const data = existing?.[cls] as unknown;
    if (!data) return false;
    const at = (existing?.[`${cls}_fetched_at`] as string | null) ?? new Date(0).toISOString();
    result.classes[cls] = { data, fetchedAt: at, stale };
    return true;
  };

  const needLive: IntelClass[] = [];
  for (const cls of opts.classes) {
    const cachedOnly = opts.cachedOnlyClasses?.includes(cls) ?? false;
    const fresh = !opts.forceRefresh && ttlOk(bdEnrichedAt, cls, opts.ttlOverrides?.[cls]);
    if (fresh || cachedOnly) {
      // BatchData-fresh class: serve whatever the enrichment stored (an older
      // ATTOM value in a class BatchData left empty stays marked stale).
      const fromBd =
        !!bdEnrichedAt &&
        !!existing?.[`${cls}_fetched_at`] &&
        new Date(existing[`${cls}_fetched_at`] as string).getTime() >=
          new Date(bdEnrichedAt).getTime() - 60_000;
      serveCached(cls, !(fresh && fromBd));
      continue;
    }
    needLive.push(cls);
  }

  // Idempotency guards before any paid call.
  const { data: bdMiss } = await supabaseAdmin
    .from("property_intel_misses")
    .select("reason, suppressed_until")
    .eq("address_normalized", normalized)
    .eq("endpoint", "batchdata")
    .gt("suppressed_until", new Date().toISOString())
    .maybeSingle();
  // A manual refresh never re-buys a record BatchData filled in the last day.
  const recentlyEnriched =
    !!bdEnrichedAt && Date.now() - new Date(bdEnrichedAt).getTime() < 24 * 3600_000;
  const suppressed =
    !!bdMiss && (bdMiss.reason === "no_result" || !opts.forceRefresh);

  const serveStale = (classes: IntelClass[], err: string) => {
    for (const cls of classes) {
      if (!serveCached(cls, true)) result.errors[cls] = err;
    }
  };

  if (needLive.length) {
    if (cacheOnly) {
      serveStale(needLive, "Monthly property-record budget cap reached; no cached data available.");
    } else if (suppressed) {
      serveStale(
        needLive,
        bdMiss?.reason === "no_result" ? "No record on file for this address." : "Property records temporarily unavailable.",
      );
    } else if (recentlyEnriched && opts.forceRefresh) {
      for (const cls of needLive) serveCached(cls, false);
    } else {
      const { batchdataLookup } = await import("./batchdata-live.server");
      const { firstBatchdataProperty, normalizeBatchdataProperty, isMatched, parseTestAddress } =
        await import("./batchdata-normalize");
      const { batchdataToSummaries } = await import("./batchdata-summaries");

      const res = await batchdataLookup(address);
      const normalizedProp = res.ok ? normalizeBatchdataProperty(firstBatchdataProperty(res.data)) : null;
      const matched = res.ok && isMatched(normalizedProp);
      if (res.ok) callsUsed += 1;

      await supabaseAdmin.from("batchdata_call_log").insert({
        endpoint: "all-attributes",
        address_normalized: normalized,
        requested_by: opts.requestedBy ?? null,
        cache_hit: false,
        cost_cents: res.ok ? TRIAL_COST_CENTS_PER_CALL : 0,
        status: res.status,
        error_message: res.ok ? (matched ? null : "no_match") : res.error,
        revenue_source: opts.revenueSource,
      });

      if (!res.ok || !matched) {
        const noResult = res.ok && !matched;
        const unauthorized = !res.ok && (res.status === 401 || res.status === 403);
        const days = noResult ? 30 : unauthorized ? 7 : 1;
        await supabaseAdmin.from("property_intel_misses").upsert(
          {
            address_normalized: normalized,
            endpoint: "batchdata",
            reason: noResult ? "no_result" : unauthorized ? "unauthorized" : "error",
            status: res.status,
            last_seen_at: new Date().toISOString(),
            suppressed_until: new Date(Date.now() + days * 86400_000).toISOString(),
          },
          { onConflict: "address_normalized,endpoint" },
        );
        serveStale(needLive, noResult ? "No record on file for this address." : res.ok ? "" : res.error);
      } else {
        const now = new Date().toISOString();
        const sums = batchdataToSummaries(normalizedProp!);
        const parsed = parseTestAddress(address);
        const byClass: Partial<Record<IntelClass, unknown>> = {
          detail: sums.detail,
          tax: sums.tax,
          sales: sums.sales,
          mortgage: sums.mortgage,
          permits: sums.permits,
          owner: sums.owner,
        };
        if (sums.avm) byClass.avm = sums.avm;
        // One bundled response fills every class it covers; classes it leaves
        // empty keep their historical cache (never deleted).
        for (const [cls, data] of Object.entries(byClass)) {
          updates[cls] = data;
          updates[`${cls}_fetched_at`] = now;
        }
        updates.source = "batchdata";
        updates.batchdata_enriched_at = now;
        updates.address_line1 = parsed.address_line1 ?? address;
        updates.city = parsed.city;
        updates.state = parsed.state;
        updates.zip = parsed.zip;
        touched = true;
        for (const cls of needLive) {
          const data = byClass[cls];
          if (data) result.classes[cls] = { data, fetchedAt: now, stale: false };
          else serveCached(cls, true);
        }
      }
    }
  }

  // 3. Persist the new BatchData enrichment onto the shared property record.
  if (touched) {
    await supabaseAdmin
      .from("property_intel")
      .upsert(
        { address_normalized: normalized, address_line1: address, ...updates } as any,
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
export function isAvmSummary(raw: unknown): raw is AvmSummary {
  return (
    raw != null &&
    typeof raw === "object" &&
    "estimate" in raw &&
    !("property" in raw)
  );
}
export function extractAvm(raw: unknown): AvmSummary {
  if (isAvmSummary(raw)) return raw;
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
export function isDetailSummary(raw: unknown): raw is DetailSummary {
  return raw != null && typeof raw === "object" && "beds" in raw && !("property" in raw);
}
export function extractDetail(raw: unknown): DetailSummary {
  if (isDetailSummary(raw)) return raw;
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
export function isTaxSummary(raw: unknown): raw is TaxSummary {
  return raw != null && typeof raw === "object" && "assessedTotal" in raw && !("property" in raw);
}
export function extractTax(raw: unknown): TaxSummary {
  if (isTaxSummary(raw)) return raw;
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
export function isSalesSummary(raw: unknown): raw is SalesSummary {
  return raw != null && typeof raw === "object" && "lastSale" in raw && !("property" in raw);
}
export function extractSales(raw: unknown): SalesSummary {
  if (isSalesSummary(raw)) return raw;
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

  // --- Provider (BatchData) current-position fields, when available ---------
  /** provider-reported count of CURRENT open liens */
  openLienCount?: number | null;
  totalOpenLienBalance?: number | null;
  /** CURRENT open balance only — never an original/historical loan amount */
  currentBalance?: number | null;
  /** shared mortgage-position classification (see mortgage-position.ts) */
  lienStatus?: LienStatus | null;
  ltv?: number | null;
  liens?: Array<{ balance?: number | null; lender?: string | null; position?: number | null }> | null;
  /** historical mortgage records — evidence only, never a current lien */
  history?: Array<{
    lender?: string | null;
    amount?: number | null;
    recordingDate?: string | null;
    loanType?: string | null;
  }> | null;
}
export function isMortgageSummary(raw: unknown): raw is MortgageSummary {
  return raw != null && typeof raw === "object" && "hasRecord" in raw && !("property" in raw);
}
export function extractMortgage(raw: unknown): MortgageSummary {
  if (isMortgageSummary(raw)) return raw;
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
export function isPermitsSummary(raw: unknown): raw is PermitsSummary {
  return raw != null && typeof raw === "object" && "events" in raw && !("property" in raw);
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
  if (isPermitsSummary(raw)) return raw;
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
  /**
   * Truthful methodology behind estimatedValue. Never collapse these: audits
   * depend on knowing which one produced the number.
   */
  valueSource: "avm" | "mortgage_implied" | "recent_sale" | "assessed" | null;
  loanBalanceEstimate: number | null;
  equityDollars: number | null;
  equityPct: number | null;
  cashOutHeadroom80: number | null; // 80% LTV cash-out ceiling
  refiSignal: "strong" | "moderate" | "watch" | null;
  tenureYears: number | null;
  /**
   * No current open mortgage found AND a prior mortgage trail exists — read as
   * "appears paid off", never as a proven free-and-clear title.
   */
  noMortgageOnRecord: boolean;
  /** shared mortgage-position classification behind the equity figures */
  lienStatus: LienStatus;
  /** the full Value Engine result, so callers never recompute value */
  valueResult: ValueEngineResult;
  /** how confident the Value Engine is in estimatedValue */
  valueConfidence: "high" | "medium" | "low" | null;
  /** machine label of the valuation method used */
  valueMethodology: string;
  /** set when equity figures must not drive a lender offer */
  equitySuppression: string | null;
  equitySuppressionReason: string | null;
  /** true when a lender may act on the equity position */
  equityActionable: boolean;
  /** more than one open recorded loan */
  multiLien: boolean;
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
  tax?: TaxSummary | null,
  state?: string | null,
  /**
   * Resolved market comparison rate (see market-rate.server). When absent, the
   * rate-spread rule is skipped and the signal falls back to equity alone —
   * we never compare against a made-up rate.
   */
  marketRatePct?: number | null,
): EquityRibbon {

  // Value always comes from the shared SuCasa Value Engine — this function
  // never decides what a home is worth on its own.
  const resolved = estimateHomeValue({
    state: state ?? null,
    avm,
    tax,
    sales: {
      lastSalePrice: sales?.lastSale?.amount ?? null,
      lastSaleDate: sales?.lastSale?.date ?? null,
    },
    mortgage: mortgage
      ? {
          openLienCount: mortgage.openLienCount ?? null,
          totalOpenLienBalance: mortgage.totalOpenLienBalance ?? null,
          currentBalance: mortgage.currentBalance ?? null,
          loanAmount: mortgage.loanAmount,
          ltv: mortgage.ltv ?? null,
        }
      : null,
  });

  const mExt = mortgage;
  const balanceEstimate = mortgage && mortgage.hasRecord !== false ? estimateLoanBalance(mortgage) : null;

  const equity = resolveEquity({
    value: resolved,
    mortgage: mortgage
      ? {
          hasRecord: mortgage.hasRecord,
          openLienCount: mExt?.openLienCount ?? null,
          totalOpenLienBalance: mExt?.totalOpenLienBalance ?? null,
          balanceEstimate,
          ltv: mExt?.ltv ?? null,
          lienStatus: mExt?.lienStatus ?? null,
          liens: mExt?.liens ?? null,
          lastSaleDate: sales?.lastSale?.date ?? null,
        }
      : null,
  });

  // Methodology is reported truthfully rather than collapsed into "assessed".
  const valueSource: EquityRibbon["valueSource"] =
    resolved.value == null
      ? null
      : resolved.kind === "provider_avm"
        ? "avm"
        : resolved.kind === "mortgage_implied"
          ? "mortgage_implied"
          : resolved.kind === "recent_sale"
            ? "recent_sale"
            : "assessed";

  // Equity owns the mortgage-position read; the ribbon never re-infers it.
  const noMortgageOnRecord = equity.freeAndClear;

  // Refi/cash-out signal only fires on an equity position we are allowed to
  // act on; otherwise the raw data stays visible but no signal is raised.
  let refi: EquityRibbon["refiSignal"] = null;
  if (equityOffersAllowed(equity)) {
    const equityPct = equity.equityPct;
    const marketRate = marketRatePct ?? null;
    if (equityPct != null && mortgage?.interestRate != null && marketRate != null) {
      const spread = mortgage.interestRate - marketRate;

      if (equityPct >= 0.2 && spread >= 1) refi = "strong";
      else if (equityPct >= 0.2 && spread >= 0.5) refi = "moderate";
      else if (equityPct >= 0.15) refi = "watch";
    } else if (equityPct != null) {
      if (equityPct >= 0.5) refi = "strong";
      else if (equityPct >= 0.3) refi = "moderate";
      else if (equityPct >= 0.2) refi = "watch";
    }
  }

  return {
    estimatedValue: resolved.value,
    valueSource,
    loanBalanceEstimate: equity.balance ?? balanceEstimate,
    equityDollars: equity.equityDollars,
    equityPct: equity.equityPct,
    cashOutHeadroom80: equityOffersAllowed(equity) ? equity.cashOutHeadroom : null,
    refiSignal: refi,
    tenureYears: sales?.tenureYears ?? null,
    noMortgageOnRecord,
    lienStatus: equity.lienStatus,
    valueResult: resolved,
    valueConfidence: resolved.confidence,
    valueMethodology: resolved.methodology,
    equitySuppression: equity.suppression,
    equitySuppressionReason: equity.suppressionReason,
    equityActionable: equityOffersAllowed(equity),
    multiLien: equity.multiLien,
  };
}

