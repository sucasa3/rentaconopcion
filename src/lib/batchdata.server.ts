/**
 * BatchData provider — server-only.
 *
 * BatchData's /property/lookup/all-attributes endpoint returns a broad bundle
 * of property, ownership, tax, mortgage, sales, and permit data in a single
 * POST call. We map that bundle onto the same internal summaries ATTOM uses,
 * so callers (valuation, enrichment, opportunities) don't need to change.
 */

import {
  type AvmSummary,
  type DetailSummary,
  type TaxSummary,
  type SalesSummary,
  type MortgageSummary,
  type PermitsSummary,
} from "./valuation.server";

const BATCHDATA_BASE = "https://api.batchdata.com/api/v1";

// BatchData trial/entry pricing is typically per-match; we record a flat
// estimate per successful all-attributes lookup. Adjust once we know the plan.
const DEFAULT_COST_CENTS = 10;

export type BatchdataEndpoint =
  | "avm"
  | "detail"
  | "tax"
  | "sales"
  | "permits"
  | "neighborhood"
  | "risk"
  | "owner"
  | "mortgage";

export const BATCHDATA_TTL_DAYS: Record<BatchdataEndpoint, number> = {
  avm: 30,
  detail: 3650,
  tax: 3650,
  sales: 365,
  permits: 90,
  neighborhood: 365,
  risk: 365,
  owner: 365,
  mortgage: 180,
};

export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseAddress(address: string): {
  address_line1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  const address_line1 = parts[0] ?? "";
  let city: string | null = null;
  let state: string | null = null;
  let zip: string | null = null;

  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const m = last.match(/^([A-Za-z\s]+)\s+([A-Za-z]{2})\s+([\d\-]{4,})$/);
    if (m) {
      city = m[1].trim();
      state = m[2];
      zip = m[3];
    } else {
      const m2 = last.match(/^([A-Za-z]{2})\s+([\d\-]{4,})$/);
      if (m2) {
        state = m2[1];
        zip = m2[2];
      } else {
        city = last;
      }
    }
  }

  return { address_line1, city, state, zip };
}

export type BatchdataFetchResult =
  | { ok: true; data: unknown; status: number }
  | { ok: false; error: string; status: number };

/**
 * Low-level BatchData fetcher for the all-attributes lookup.
 * One call returns property, owner, tax, mortgage, sales, and permit data.
 */
export async function batchdataFetchAll(address: string): Promise<BatchdataFetchResult> {
  const apiKey = process.env["BATCHDATA_API_KEY"];
  if (!apiKey) {
    return { ok: false, error: "BATCHDATA_API_KEY not configured", status: 500 };
  }

  const parsed = parseAddress(address);
  if (!parsed.address_line1 || (!parsed.city && !parsed.state && !parsed.zip)) {
    return { ok: false, error: "Incomplete address: street + city/state/ZIP required", status: 422 };
  }

  const url = `${BATCHDATA_BASE}/property/lookup/all-attributes`;

  // BatchData accepts either a structured address object or a one-line string.
  // We send the structured form first; the mapper below is defensive about
  // whichever shape the API actually returns.
  const body = {
    addresses: [
      {
        address_line1: parsed.address_line1,
        city: parsed.city,
        state: parsed.state,
        zip: parsed.zip,
      },
    ],
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const status = res.status;
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `BatchData ${status}: ${text.slice(0, 200)}`, status };
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, error: `BatchData returned non-JSON: ${text.slice(0, 200)}`, status: 500 };
    }
    return { ok: true, data, status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), status: 0 };
  }
}

export function batchdataCostCents(_endpoint: BatchdataEndpoint): number {
  return DEFAULT_COST_CENTS;
}

// ---------- Response normalizers ----------
// BatchData returns a single property object per address. We normalize it to
// the same summary shapes used by ATTOM extractors so downstream code is
// provider-agnostic.

type BatchdataProperty = {
  address?: {
    address_line1?: string;
    city?: string;
    state?: string;
    zip?: string;
    full?: string;
  };
  property?: {
    bedrooms?: number;
    bathrooms?: number;
    square_feet?: number;
    lot_size?: number;
    year_built?: number;
    property_type?: string;
    use_code?: string;
  };
  valuation?: {
    estimated_value?: number;
    low?: number;
    high?: number;
    confidence?: number | string;
    value_date?: string;
  };
  assessment?: {
    assessed_value?: number;
    market_value?: number;
    tax_amount?: number;
    tax_year?: number;
  };
  owner?: {
    name?: string;
    mailing_address?: string;
    owner_occupied?: boolean;
  };
  mortgage?: {
    loan_amount?: number;
    lender?: string;
    date?: string;
    interest_rate?: number;
    loan_type?: string;
    term_years?: number;
    term_months?: number;
  };
  sales_history?: Array<{
    date?: string;
    amount?: number;
    document_type?: string;
  }>;
  permits?: Array<{
    date?: string;
    type?: string;
    sub_type?: string;
    description?: string;
    value?: number;
    status?: string;
  }>;
};

function firstProperty(raw: unknown): BatchdataProperty | null {
  const r = raw as {
    data?: { properties?: BatchdataProperty[] } | BatchdataProperty[];
    properties?: BatchdataProperty[];
    property?: BatchdataProperty;
  } | null;

  if (!r) return null;

  if (Array.isArray(r.data)) return r.data[0] ?? null;
  if (Array.isArray(r.properties)) return r.properties[0] ?? null;
  if (r.data && Array.isArray((r.data as { properties?: BatchdataProperty[] }).properties)) {
    return (r.data as { properties: BatchdataProperty[] }).properties[0] ?? null;
  }
  if (r.property) return r.property;
  return null;
}

export function extractAvm(raw: unknown): AvmSummary {
  const p = firstProperty(raw);
  const v = p?.valuation;
  return {
    estimate: v?.estimated_value ?? null,
    low: v?.low ?? null,
    high: v?.high ?? null,
    confidence: typeof v?.confidence === "number" ? v.confidence : null,
    asOf: v?.value_date ?? null,
  };
}

export function extractDetail(raw: unknown): DetailSummary {
  const p = firstProperty(raw);
  const prop = p?.property;
  return {
    beds: prop?.bedrooms ?? null,
    baths: prop?.bathrooms ?? null,
    sqft: prop?.square_feet ?? null,
    lotSqft: prop?.lot_size ?? null,
    yearBuilt: prop?.year_built ?? null,
    propertyType: prop?.property_type ?? prop?.use_code ?? null,
  };
}

export function extractTax(raw: unknown): TaxSummary {
  const p = firstProperty(raw);
  const a = p?.assessment;
  return {
    assessedTotal: a?.assessed_value ?? null,
    marketTotal: a?.market_value ?? null,
    taxAmount: a?.tax_amount ?? null,
    taxYear: a?.tax_year ?? null,
  };
}

export function extractOwner(raw: unknown): { name: string | null; mailingAddress: string | null; ownerOccupied: boolean | null } {
  const p = firstProperty(raw);
  const o = p?.owner;
  return {
    name: o?.name ?? null,
    mailingAddress: o?.mailing_address ?? null,
    ownerOccupied: o?.owner_occupied ?? null,
  };
}

export function extractSales(raw: unknown): SalesSummary {
  const p = firstProperty(raw);
  const rows = p?.sales_history ?? [];
  const events = rows
    .map((s) => ({ date: s.date ?? null, amount: s.amount ?? null, docType: s.document_type ?? null }))
    .filter((e) => e.date || e.amount);
  events.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const [last, ...rest] = events;
  const tenureYears = last?.date
    ? Math.max(0, Math.round((Date.now() - new Date(last.date).getTime()) / (365.25 * 24 * 3600 * 1000)))
    : null;
  return { lastSale: last ?? null, priorSales: rest, tenureYears };
}

export function extractMortgage(raw: unknown): MortgageSummary {
  const p = firstProperty(raw);
  const m = p?.mortgage;
  const amount = m?.loan_amount ?? null;
  const lender = m?.lender ?? null;
  const date = m?.date ?? null;
  const interestRate = m?.interest_rate ?? null;
  const loanType = m?.loan_type ?? null;
  const hasRecord = Boolean((amount && amount > 0) || lender || date || interestRate);

  let termMonths: number | null = null;
  let termYears: number | null = null;
  if (m?.term_months) {
    termMonths = m.term_months;
    termYears = Math.round(m.term_months / 12);
  } else if (m?.term_years) {
    termYears = m.term_years;
    termMonths = m.term_years * 12;
  }

  return {
    hasRecord,
    loanAmount: amount && amount > 0 ? amount : null,
    lender,
    originationDate: date,
    interestRate,
    loanType,
    termYears,
    termMonths,
  };
}

export function extractPermits(raw: unknown): PermitsSummary {
  const p = firstProperty(raw);
  const rows = p?.permits ?? [];
  const events = rows.map((r) => ({
    date: r.date ?? null,
    type: [r.type, r.sub_type].filter(Boolean).join(" · ") || null,
    description: r.description ?? null,
    value: r.value ?? null,
    status: r.status ?? null,
  }));
  events.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const totalValue = events.reduce((sum, e) => sum + (e.value ?? 0), 0) || null;
  return { events, totalValue, lastPermitDate: events[0]?.date ?? null };
}
