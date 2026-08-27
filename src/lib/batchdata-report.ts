/**
 * BatchData test report — pure analysis functions, no server imports.
 *
 * Consumes rows from `batchdata_test_results` (one row per HTTP request,
 * including retries) and produces the audit metrics for a provider
 * evaluation run. Nothing here reads or writes production property data.
 */

import type { NormalizedBatchdataProperty } from "./batchdata-normalize";

export type CoverageKey =
  | "property"
  | "owner"
  | "sales"
  | "tax"
  | "mortgage"
  | "valuation"
  | "permits"
  | "contact";

export const COVERAGE_LABELS: Record<CoverageKey, string> = {
  property: "Property details",
  owner: "Owner",
  sales: "Sales history",
  tax: "Tax",
  mortgage: "Mortgage",
  valuation: "Valuation",
  permits: "Permits",
  contact: "Contact (phones/emails)",
};

/**
 * Groups required for a complete SuCasa Home Profile. Permits and contact are
 * tracked but do not by themselves downgrade a home to PARTIAL, because the
 * Home Profile renders without them.
 */
export const REQUIRED_FOR_FULL: CoverageKey[] = [
  "property",
  "owner",
  "sales",
  "tax",
  "mortgage",
  "valuation",
];

export type Coverage = Record<CoverageKey, boolean>;

export function evaluateCoverage(n: NormalizedBatchdataProperty | null): Coverage {
  if (!n) {
    return {
      property: false,
      owner: false,
      sales: false,
      tax: false,
      mortgage: false,
      valuation: false,
      permits: false,
      contact: false,
    };
  }
  return {
    property: Boolean(n.property.yearBuilt || n.property.sqft || n.property.propertyType || n.property.beds),
    owner: Boolean(n.ownership.ownerName || n.ownership.mailingAddress),
    sales: Boolean(n.sales.lastSaleDate || n.sales.lastSaleAmount || n.sales.priorSales.length),
    tax: Boolean(n.valuation.assessedValue || n.valuation.taxAmount || n.valuation.marketValue),
    mortgage: Boolean(n.mortgage.hasRecord || n.mortgage.loanAmount || n.mortgage.lender),
    valuation: Boolean(n.valuation.estimate),
    permits: n.permits.count > 0,
    contact: n.contact.phones.length > 0 || n.contact.emails.length > 0,
  };
}

export type Completeness = "FULL" | "PARTIAL" | "FAILED";

export function classifyCompleteness(matched: boolean, coverage: Coverage): Completeness {
  if (!matched) return "FAILED";
  return REQUIRED_FOR_FULL.every((k) => coverage[k]) ? "FULL" : "PARTIAL";
}

export function missingRequired(coverage: Coverage): CoverageKey[] {
  return REQUIRED_FOR_FULL.filter((k) => !coverage[k]);
}

export interface CallRow {
  id: string;
  home_index: number | null;
  input_address: string;
  address_normalized: string | null;
  source_label: string | null;
  http_status: number | null;
  success: boolean | null;
  matched: boolean | null;
  attempt: number | null;
  is_retry: boolean | null;
  is_duplicate_address: boolean | null;
  cache_hit: boolean | null;
  request_type: string | null;
  error_message: string | null;
  duration_ms: number | null;
  coverage: Coverage | null;
  completeness: Completeness | null;
  normalized: NormalizedBatchdataProperty | null;
}

export interface HomeSummary {
  key: string;
  index: number;
  address: string;
  label: string | null;
  calls: number;
  providerCalls: number;
  applicationCalls: number;
  retries: number;
  cacheHits: number;
  duplicate: boolean;
  matched: boolean;
  completeness: Completeness;
  missing: CoverageKey[];
  coverage: Coverage | null;
  errors: string[];
}

export interface TestReport {
  homes: HomeSummary[];
  submitted: number;
  matched: number;
  unmatched: number;
  full: number;
  partial: number;
  failed: number;
  totalCalls: number;
  failedCalls: number;
  retryCalls: number;
  duplicateCalls: number;
  cacheHits: number;
  providerCalls: number;
  applicationCalls: number;
  avgCallsPerHome: number;
  medianCallsPerHome: number;
  minCallsPerHome: number;
  maxCallsPerHome: number;
  avgCallsPerMatched: number;
  avgCallsPerFull: number;
  distribution: { bucket: string; homes: number }[];
  coverage: {
    key: CoverageKey;
    label: string;
    returnedHomes: number;
    pctOfMatched: number;
    callsRequired: number;
    status: "Returned" | "Not returned";
  }[];
  partialReasons: { key: CoverageKey; label: string; homes: number }[];
  scale: { homes: number; low: number; expected: number; high: number }[];
  duplicateAddresses: number;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : (((s[mid - 1] as number) + (s[mid] as number)) / 2);
}

function round(n: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export function buildReport(rows: CallRow[]): TestReport {
  // Group every logged request by the home it belongs to.
  const groups = new Map<string, CallRow[]>();
  rows.forEach((r, i) => {
    const key = r.home_index != null ? `h${r.home_index}` : `r${i}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  });

  const homes: HomeSummary[] = [];
  let index = 0;
  for (const [key, list] of groups) {
    index += 1;
    const last = list[list.length - 1] as CallRow;
    const coverage = (last.coverage ?? evaluateCoverage(last.normalized)) as Coverage;
    const matched = Boolean(last.matched);
    const completeness = (last.completeness as Completeness | null) ?? classifyCompleteness(matched, coverage);
    // Provider calls = the requests BatchData genuinely needed (first attempt
    // per home). Everything else — retries, duplicate lookups, cache-served
    // repeats — is application-generated.
    const providerCalls = list.filter((r) => !r.is_retry && !r.cache_hit && !r.is_duplicate_address).length;
    homes.push({
      key,
      index: last.home_index ?? index,
      address: last.input_address,
      label: last.source_label,
      calls: list.filter((r) => !r.cache_hit).length,
      providerCalls,
      applicationCalls: list.filter((r) => !r.cache_hit).length - providerCalls,
      retries: list.filter((r) => r.is_retry).length,
      cacheHits: list.filter((r) => r.cache_hit).length,
      duplicate: Boolean(last.is_duplicate_address),
      matched,
      completeness,
      missing: matched ? missingRequired(coverage) : [],
      coverage: matched ? coverage : null,
      errors: list.map((r) => r.error_message).filter((e): e is string => Boolean(e)),
    });
  }

  homes.sort((a, b) => a.index - b.index);

  const submitted = homes.length;
  const matchedHomes = homes.filter((h) => h.matched);
  const fullHomes = homes.filter((h) => h.completeness === "FULL");
  const partialHomes = homes.filter((h) => h.completeness === "PARTIAL");
  const failedHomes = homes.filter((h) => h.completeness === "FAILED");

  const realCalls = rows.filter((r) => !r.cache_hit);
  const callCounts = homes.map((h) => h.calls);

  const coverageRows = (Object.keys(COVERAGE_LABELS) as CoverageKey[]).map((k) => {
    const returnedHomes = matchedHomes.filter((h) => h.coverage?.[k]).length;
    return {
      key: k,
      label: COVERAGE_LABELS[k],
      returnedHomes,
      pctOfMatched: matchedHomes.length ? round((returnedHomes / matchedHomes.length) * 100, 1) : 0,
      // Every group above arrives in the same bundled lookup response.
      callsRequired: 1,
      status: (returnedHomes > 0 ? "Returned" : "Not returned") as "Returned" | "Not returned",
    };
  });

  const partialReasons = (Object.keys(COVERAGE_LABELS) as CoverageKey[])
    .map((k) => ({
      key: k,
      label: COVERAGE_LABELS[k],
      homes: partialHomes.filter((h) => h.missing.includes(k)).length,
    }))
    .filter((r) => r.homes > 0)
    .sort((a, b) => b.homes - a.homes);

  const avg = submitted ? realCalls.length / submitted : 0;
  const med = median(callCounts);
  const min = callCounts.length ? Math.min(...callCounts) : 0;
  const max = callCounts.length ? Math.max(...callCounts) : 0;

  const scale = [1000, 10_000, 100_000].map((n) => ({
    homes: n,
    low: Math.round(n * (min || avg)),
    expected: Math.round(n * avg),
    high: Math.round(n * (max || avg)),
  }));

  const buckets = ["1", "2", "3", "4", "5+"];
  const distribution = buckets.map((bucket) => ({
    bucket: `${bucket} call${bucket === "1" ? "" : "s"}`,
    homes: homes.filter((h) => (bucket === "5+" ? h.calls >= 5 : h.calls === Number(bucket))).length,
  }));

  const providerCalls = homes.reduce((s, h) => s + h.providerCalls, 0);

  return {
    homes,
    submitted,
    matched: matchedHomes.length,
    unmatched: submitted - matchedHomes.length,
    full: fullHomes.length,
    partial: partialHomes.length,
    failed: failedHomes.length,
    totalCalls: realCalls.length,
    failedCalls: realCalls.filter((r) => !r.success).length,
    retryCalls: realCalls.filter((r) => r.is_retry).length,
    duplicateCalls: realCalls.filter((r) => r.is_duplicate_address).length,
    cacheHits: rows.filter((r) => r.cache_hit).length,
    providerCalls,
    applicationCalls: realCalls.length - providerCalls,
    avgCallsPerHome: round(avg),
    medianCallsPerHome: round(med),
    minCallsPerHome: min,
    maxCallsPerHome: max,
    avgCallsPerMatched: matchedHomes.length
      ? round(matchedHomes.reduce((s, h) => s + h.calls, 0) / matchedHomes.length)
      : 0,
    avgCallsPerFull: fullHomes.length
      ? round(fullHomes.reduce((s, h) => s + h.calls, 0) / fullHomes.length)
      : 0,
    distribution,
    coverage: coverageRows,
    partialReasons,
    scale,
    duplicateAddresses: homes.filter((h) => h.duplicate).length,
  };
}
