/**
 * ATTOM vs BatchData head-to-head benchmark — server only.
 *
 * READ-ONLY with respect to ATTOM: this module never calls the ATTOM API and
 * never writes to `property_intel`, `attom_*`, the enrichment queue, or any
 * homeowner-facing table. The only provider calls it makes are BatchData
 * lookups, and results land exclusively in the isolated test tables.
 */

import {
  extractAvm,
  extractDetail,
  extractMortgage,
  extractSales,
  extractTax,
} from "./valuation.server";
import type { NormalizedBatchdataProperty } from "./batchdata-normalize";
import {
  BENCHMARK_RATE,
  DECISION_KEYS,
  DECISION_LABELS,
  MORTGAGE_DEPENDENT,
  classifyMatch,
  compareNumericField,
  derive,
  emptySnapshot,
  median,
  type DecisionKey,
  type ProviderSnapshot,
} from "./benchmark-compare";

export const BENCHMARK_SEED = "sucasa-bench-2026-08-27";
export const BENCHMARK_SIZE = 100;

// ------------------------------------------------------------------ sampling

/** Deterministic 32-bit hash, so the same seed always yields the same sample. */
function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface SampleRow {
  propertyId: string;
  address: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  county: string | null;
  propertyType: string | null;
  attomValue: number | null;
}

function attomCounty(row: any): string | null {
  return (
    row?.detail?.property?.[0]?.area?.countrysecsubd ??
    row?.avm?.property?.[0]?.area?.countrysecsubd ??
    row?.mortgage?.property?.[0]?.area?.countrysecsubd ??
    null
  );
}

function attomType(row: any): string | null {
  return (
    row?.detail?.property?.[0]?.summary?.propclass ??
    row?.avm?.property?.[0]?.summary?.propclass ??
    row?.mortgage?.property?.[0]?.summary?.propclass ??
    null
  );
}

function hasMortgageRecord(m: any): boolean {
  if (!m || typeof m !== "object") return false;
  const p = m?.property?.[0]?.mortgage;
  if (!p) return false;
  return Boolean(p.amount || p.date || p.lender || p.term);
}

export async function loadEligibleProperties(): Promise<any[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows: any[] = [];
  const pageSize = 200;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("property_intel")
      .select("id, address_line1, city, state, zip, avm, detail, tax, sales, mortgage, owner")
      .not("mortgage", "is", null)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows.filter(
    (r) => hasMortgageRecord(r.mortgage) && r.address_line1 && r.city && r.state && r.zip,
  );
}

export interface SampleReport {
  totalEligible: number;
  seed: string;
  size: number;
  selectionMethod: string;
  rows: SampleRow[];
  countyDistribution: Array<{ key: string; count: number }>;
  stateDistribution: Array<{ key: string; count: number }>;
  typeDistribution: Array<{ key: string; count: number }>;
  valueDistribution: {
    withValue: number;
    min: number | null;
    p25: number | null;
    median: number | null;
    p75: number | null;
    max: number | null;
  };
}

function tally(values: Array<string | null>): Array<{ key: string; count: number }> {
  const m = new Map<string, number>();
  for (const v of values) {
    const k = v ?? "(unknown)";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (pos - lo);
}

export async function buildSample(
  seed = BENCHMARK_SEED,
  size = BENCHMARK_SIZE,
): Promise<SampleReport> {
  const eligible = await loadEligibleProperties();
  const ordered = [...eligible].sort(
    (a, b) => hash32(`${a.id}|${seed}`) - hash32(`${b.id}|${seed}`),
  );
  const picked = ordered.slice(0, size);

  const rows: SampleRow[] = picked.map((r) => ({
    propertyId: r.id,
    addressLine1: r.address_line1,
    city: r.city,
    state: r.state,
    zip: r.zip,
    address: `${r.address_line1}, ${r.city}, ${r.state} ${r.zip}`,
    county: attomCounty(r),
    propertyType: attomType(r),
    attomValue: extractAvm(r.avm).estimate ?? null,
  }));

  const values = rows
    .map((r) => r.attomValue)
    .filter((v): v is number => typeof v === "number")
    .sort((a, b) => a - b);

  return {
    totalEligible: eligible.length,
    seed,
    size: rows.length,
    selectionMethod:
      "Deterministic pseudo-random: every eligible property id is hashed with a fixed seed (FNV-1a) and the lowest N hashes are taken. No manual selection, reproducible from the seed alone.",
    rows,
    countyDistribution: tally(rows.map((r) => (r.county ? `${r.county}, ${r.state}` : null))),
    stateDistribution: tally(rows.map((r) => r.state)),
    typeDistribution: tally(rows.map((r) => r.propertyType)),
    valueDistribution: {
      withValue: values.length,
      min: values[0] ?? null,
      p25: quantile(values, 0.25),
      median: quantile(values, 0.5),
      p75: quantile(values, 0.75),
      max: values[values.length - 1] ?? null,
    },
  };
}

// ------------------------------------------------------------------ snapshots

export function attomSnapshot(row: any): ProviderSnapshot {
  const s = emptySnapshot("attom");
  const avm = extractAvm(row.avm);
  const detail = extractDetail(row.detail ?? row.avm);
  const tax = extractTax(row.tax);
  const sales = extractSales(row.sales);
  const mtg = extractMortgage(row.mortgage);

  const ownerBlock =
    row?.owner?.property?.[0]?.owner ??
    row?.detail?.property?.[0]?.owner ??
    row?.avm?.property?.[0]?.owner ??
    row?.mortgage?.property?.[0]?.owner ??
    null;
  const summary =
    row?.detail?.property?.[0]?.summary ?? row?.avm?.property?.[0]?.summary ?? null;

  // Second concurrent mortgage, when ATTOM records one.
  const concurrent = row?.avm?.property?.[0]?.sale?.mortgage ?? row?.mortgage?.property?.[0]?.sale?.mortgage ?? null;
  const second = concurrent?.SecondConcurrent ?? null;
  const hasSecond = Boolean(second && (second.amount || second.lender || second.date));

  s.addressLine1 = row.address_line1 ?? null;
  s.city = row.city ?? null;
  s.state = row.state ?? null;
  s.zip = row.zip ?? null;
  s.ownerName = ownerBlock?.owner1?.fullname ?? null;
  s.ownerOccupied = summary?.absenteeInd
    ? /owner occupied/i.test(String(summary.absenteeInd))
    : ownerBlock?.absenteeownerstatus
      ? ownerBlock.absenteeownerstatus === "O"
      : null;
  s.propertyType = attomType(row) ?? detail.propertyType;
  s.beds = detail.beds;
  s.baths = detail.baths;
  s.sqft = detail.sqft && detail.sqft > 0 ? detail.sqft : null;
  s.lotSqft = detail.lotSqft;
  s.yearBuilt = detail.yearBuilt;
  s.assessedValue = tax.assessedTotal;
  s.marketValue = tax.marketTotal;
  s.taxAmount = tax.taxAmount;
  s.taxYear = tax.taxYear;
  s.lastSaleDate = sales.lastSale?.date ?? null;
  s.lastSaleAmount = sales.lastSale?.amount ?? null;
  s.priorSaleCount = sales.priorSales.length;
  s.avmValue = avm.estimate;
  s.avmLow = avm.low;
  s.avmHigh = avm.high;
  s.avmConfidence =
    avm.confidence ?? (row?.avm?.property?.[0]?.avm?.amount?.scr as number | undefined) ?? null;

  s.mortgage = {
    hasRecord: mtg.hasRecord,
    lender: mtg.lender,
    loanAmount: mtg.loanAmount,
    originationDate: mtg.originationDate,
    loanType: mtg.loanType,
    termYears: mtg.termYears,
    interestRate: mtg.interestRate,
    reportedBalance: null, // ATTOM does not provide a current balance
    ltv: null,
    estimatedPayment: null,
    openLienCount: mtg.hasRecord ? (hasSecond ? 2 : 1) : 0,
    juniorLienCount: hasSecond ? 1 : null,
    hasHeloc: hasSecond && /credit|heloc|equity/i.test(String(second?.loantypecode ?? "")),
  };
  return s;
}

export function batchSnapshot(n: NormalizedBatchdataProperty | null): ProviderSnapshot | null {
  if (!n) return null;
  const s = emptySnapshot("batchdata");
  s.addressLine1 = n.property.addressLine1;
  s.city = n.property.city;
  s.state = n.property.state;
  s.zip = n.property.zip;
  s.ownerName = n.ownership.ownerName;
  s.ownerOccupied = n.ownership.ownerOccupied;
  s.propertyType = n.property.propertyType;
  s.beds = n.property.beds;
  s.baths = n.property.baths;
  s.sqft = n.property.sqft;
  s.lotSqft = n.property.lotSqft;
  s.yearBuilt = n.property.yearBuilt;
  s.assessedValue = n.valuation.assessedValue;
  s.marketValue = n.valuation.marketValue;
  s.taxAmount = n.valuation.taxAmount;
  s.taxYear = n.valuation.taxYear;
  s.lastSaleDate = n.sales.lastSaleDate;
  s.lastSaleAmount = n.sales.lastSaleAmount;
  s.priorSaleCount = Math.max(0, n.sales.priorSales.length - 1);
  s.avmValue = n.valuation.estimate;
  s.avmLow = n.valuation.low;
  s.avmHigh = n.valuation.high;
  s.avmConfidence = n.valuation.confidence;

  const liens = n.mortgage.liens ?? [];
  const heloc = liens.some((l) => /credit|heloc|equity/i.test(String(l.loanType ?? "")));
  s.mortgage = {
    hasRecord: n.mortgage.hasRecord,
    lender: n.mortgage.lender,
    loanAmount: liens.length
      ? [...liens].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0]?.amount ?? n.mortgage.loanAmount
      : n.mortgage.loanAmount,
    originationDate: n.mortgage.originationDate,
    loanType: n.mortgage.loanType,
    termYears: n.mortgage.termYears,
    interestRate: n.mortgage.interestRate,
    reportedBalance: n.mortgage.totalOpenLienBalance,
    ltv: n.mortgage.ltv,
    estimatedPayment: n.mortgage.estimatedPayment,
    openLienCount: n.mortgage.openLienCount ?? (liens.length || null),
    juniorLienCount: Math.max(0, (n.mortgage.openLienCount ?? liens.length) - 1) || null,
    hasHeloc: heloc,
  };
  return s;
}

// --------------------------------------------------------------------- runner

export async function runBenchmark(opts: {
  createdBy: string;
  seed?: string;
  size?: number;
  label?: string;
}): Promise<{ runId: string; requested: number; sample: SampleReport; blocked: string | null }> {
  const sample = await buildSample(opts.seed ?? BENCHMARK_SEED, opts.size ?? BENCHMARK_SIZE);
  const { runBatchdataTest } = await import("./batchdata-test.server");
  const { runId, blocked } = await runBatchdataTest({
    label: opts.label ?? `ATTOM benchmark — ${sample.size} properties`,
    createdBy: opts.createdBy,
    notes: `benchmark:${sample.seed}`,
    noRetry: true,
    inputs: sample.rows.map((r) => ({ address: r.address, sourceLabel: `pi:${r.propertyId}` })),
  });
  return { runId, requested: sample.size, sample, blocked };

}

// --------------------------------------------------------------------- report

export interface BenchmarkReport {
  runId: string;
  generatedAt: string;
  api: {
    requested: number;
    calls: number;
    success: number;
    failed: number;
    noMatch: number;
    matched: number;
    avgLatencyMs: number | null;
    medianLatencyMs: number | null;
    p95LatencyMs: number | null;
    errors: Array<{ key: string; count: number }>;
    callsPerProperty: number;
    attom: {
      callsPerProperty: number | null;
      successRatePct: number | null;
      avgLatencyMs: number | null;
      totalCalls: number;
      properties: number;
    } | null;
  };
  match: Record<string, number> & { addressAgree: number; ownerAgree: number; ownerDisagree: number; ownerUnknown: number; typeAgree: number; typeDisagree: number };
  fields: ReturnType<typeof compareNumericField>[];
  valuation: {
    benchmarkCount: number;
    attomMedianApePct: number | null;
    attomMeanApePct: number | null;
    batchMedianApePct: number | null;
    batchMeanApePct: number | null;
    outliers: Array<{
      address: string;
      salePrice: number;
      saleDate: string | null;
      attom: number | null;
      batch: number | null;
      attomRatio: number | null;
      batchRatio: number | null;
    }>;
  };
  mortgage: {
    coverage: Array<{ field: string; attom: number; batch: number; both: number; agree: number | null; attomOnly: number; batchOnly: number }>;
    freshness: {
      same: number;
      batchNewer: number;
      attomNewer: number;
      onlyOne: number;
      disagreements: Array<{
        address: string;
        attomDate: string | null;
        attomLender: string | null;
        attomAmount: number | null;
        batchDate: string | null;
        batchLender: string | null;
        batchAmount: number | null;
        batchRate: number | null;
      }>;
    };
    liens: { attomSecond: number; batchSecond: number; attomHeloc: number; batchHeloc: number; batchMultiLien: number; attomMultiLien: number };
  };
  refi: {
    bothYes: number;
    bothNo: number;
    attomOnly: number;
    batchOnly: number;
    agreementPct: number;
    disagreements: Array<{
      address: string;
      attom: { value: number | null; balance: number | null; rate: number | null; ltv: number | null; signal: string | null };
      batch: { value: number | null; balance: number | null; rate: number | null; ltv: number | null; signal: string | null };
      reason: string;
    }>;
  };
  equity: {
    compared: number;
    within5: number;
    within10: number;
    within20: number;
    over20: number;
    medianAbsDiff: number | null;
    medianAbsPctDiff: number | null;
    causes: Array<{ key: string; count: number }>;
  };
  completeness: Array<{ field: string; batchPct: number; attomPct: number; winner: string }>;
  decisions: {
    perDecision: Array<{ key: DecisionKey; label: string; agree: number; compared: number; agreementPct: number; attomYes: number; batchYes: number; mortgageDependent: boolean }>;
    overallAgreementPct: number;
    mortgageDependentAgreementPct: number;
  };
  scorecard: {
    rows: Array<{ category: string; batch: number; attom: number; note: string }>;
    batchTotal: number;
    attomTotal: number;
    batchScore100: number;
    attomScore100: number;
  };
  perProperty: Array<Record<string, string | number | null>>;
}

export async function buildBenchmarkReport(runId: string): Promise<BenchmarkReport> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: resultRows, error } = await supabaseAdmin
    .from("batchdata_test_results")
    .select(
      "id, home_index, source_label, input_address, success, matched, http_status, duration_ms, error_message, normalized, attempt",
    )
    .eq("test_run_id", runId)
    .order("home_index", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = resultRows ?? [];
  // Keep the final attempt per home.
  const finalByHome = new Map<number, any>();
  for (const r of rows) finalByHome.set(r.home_index ?? 0, r);
  const finals = [...finalByHome.values()];

  const propertyIds = finals
    .map((r) => String(r.source_label ?? "").replace(/^pi:/, ""))
    .filter((v) => v.length > 10);

  const attomRows: any[] = [];
  for (let i = 0; i < propertyIds.length; i += 50) {
    const { data } = await supabaseAdmin
      .from("property_intel")
      .select("id, address_line1, city, state, zip, avm, detail, tax, sales, mortgage, owner")
      .in("id", propertyIds.slice(i, i + 50));
    attomRows.push(...(data ?? []));
  }
  const attomById = new Map(attomRows.map((r) => [r.id, r]));

  interface Pair {
    propertyId: string;
    address: string;
    attom: ProviderSnapshot;
    batch: ProviderSnapshot | null;
    row: any;
  }
  const pairs: Pair[] = [];
  for (const r of finals) {
    const pid = String(r.source_label ?? "").replace(/^pi:/, "");
    const src = attomById.get(pid);
    if (!src) continue;
    pairs.push({
      propertyId: pid,
      address: r.input_address,
      attom: attomSnapshot(src),
      batch: r.success ? batchSnapshot(r.normalized as NormalizedBatchdataProperty | null) : null,
      row: r,
    });
  }

  const now = Date.now();
  const derivedPairs = pairs.map((p) => ({
    ...p,
    dA: derive(p.attom, now),
    dB: p.batch ? derive(p.batch, now) : null,
  }));

  // ---- API ----------------------------------------------------------------
  const latencies = rows.map((r) => r.duration_ms ?? 0).filter((v) => v > 0).sort((a, b) => a - b);
  const errorTally = new Map<string, number>();
  for (const r of rows) {
    if (!r.success) {
      const key = r.error_message ?? `HTTP ${r.http_status}`;
      errorTally.set(key, (errorTally.get(key) ?? 0) + 1);
    }
  }
  const successRows = finals.filter((r) => r.success);
  const matchedRows = successRows.filter((r) => r.matched);

  const { data: attomCalls } = await supabaseAdmin
    .from("attom_call_log")
    .select("id, success, duration_ms, property_intel_id")
    .limit(5000);
  const attomLog = attomCalls ?? [];
  const attomProps = new Set(attomLog.map((c: any) => c.property_intel_id).filter(Boolean));
  const attomLatencies = attomLog.map((c: any) => c.duration_ms).filter((v: any) => typeof v === "number" && v > 0);

  const api: BenchmarkReport["api"] = {
    requested: finals.length,
    calls: rows.length,
    success: successRows.length,
    failed: finals.length - successRows.length,
    noMatch: successRows.length - matchedRows.length,
    matched: matchedRows.length,
    avgLatencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
    medianLatencyMs: median(latencies),
    p95LatencyMs: latencies.length ? (latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] as number) : null,
    errors: [...errorTally.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    callsPerProperty: finals.length ? Math.round((rows.length / finals.length) * 100) / 100 : 0,
    attom: attomLog.length
      ? {
          totalCalls: attomLog.length,
          properties: attomProps.size,
          callsPerProperty: attomProps.size ? Math.round((attomLog.length / attomProps.size) * 100) / 100 : null,
          successRatePct: Math.round((attomLog.filter((c: any) => c.success).length / attomLog.length) * 1000) / 10,
          avgLatencyMs: attomLatencies.length
            ? Math.round(attomLatencies.reduce((a: number, b: number) => a + b, 0) / attomLatencies.length)
            : null,
        }
      : null,
  };

  // ---- 1. Match -----------------------------------------------------------
  const match = { exact: 0, probable: 0, mismatch: 0, no_match: 0, addressAgree: 0, ownerAgree: 0, ownerDisagree: 0, ownerUnknown: 0, typeAgree: 0, typeDisagree: 0 } as BenchmarkReport["match"];
  const matchByProperty = new Map<string, ReturnType<typeof classifyMatch>>();
  for (const p of derivedPairs) {
    const m = p.batch
      ? classifyMatch(p.attom, p.batch)
      : { match: "no_match" as const, addressAgree: false, ownerAgree: null, typeAgree: null };
    matchByProperty.set(p.propertyId, m);
    (match as any)[m.match] += 1;
    if (m.addressAgree) match.addressAgree += 1;
    if (m.ownerAgree === true) match.ownerAgree += 1;
    else if (m.ownerAgree === false) match.ownerDisagree += 1;
    else match.ownerUnknown += 1;
    if (m.typeAgree === true) match.typeAgree += 1;
    else if (m.typeAgree === false) match.typeDisagree += 1;
  }

  // ---- 2. Field comparison ------------------------------------------------
  const numericFields: Array<[string, (s: ProviderSnapshot) => number | null]> = [
    ["beds", (s) => s.beds],
    ["baths", (s) => s.baths],
    ["living sqft", (s) => s.sqft],
    ["lot sqft", (s) => s.lotSqft],
    ["year built", (s) => s.yearBuilt],
    ["assessed value", (s) => s.assessedValue],
    ["market value", (s) => s.marketValue],
    ["tax amount", (s) => s.taxAmount],
    ["tax year", (s) => s.taxYear],
    ["last sale price", (s) => s.lastSaleAmount],
    ["valuation (AVM)", (s) => s.avmValue],
    ["original loan amount", (s) => s.mortgage.loanAmount],
    ["interest rate", (s) => s.mortgage.interestRate],
    ["loan term (yrs)", (s) => s.mortgage.termYears],
  ];
  const fields = numericFields.map(([name, get]) =>
    compareNumericField(
      name,
      derivedPairs.map((p) => ({ attom: get(p.attom), batch: p.batch ? get(p.batch) : null })),
    ),
  );

  // ---- 3. Valuation ground truth -----------------------------------------
  const GT_CUTOFF = new Date(now - 5 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const gt = derivedPairs.filter((p) => {
    const d = p.attom.lastSaleDate;
    const amt = p.attom.lastSaleAmount;
    return Boolean(d && d >= GT_CUTOFF && amt && amt > 20000);
  });
  const attomApe: number[] = [];
  const batchApe: number[] = [];
  const outliers: BenchmarkReport["valuation"]["outliers"] = [];
  for (const p of gt) {
    const sale = p.attom.lastSaleAmount as number;
    const a = p.attom.avmValue;
    const b = p.batch?.avmValue ?? null;
    if (a != null) attomApe.push((Math.abs(a - sale) / sale) * 100);
    if (b != null) batchApe.push((Math.abs(b - sale) / sale) * 100);
    const ar = a != null ? a / sale : null;
    const br = b != null ? b / sale : null;
    if ((ar != null && (ar > 2 || ar < 0.5)) || (br != null && (br > 2 || br < 0.5))) {
      outliers.push({
        address: p.address,
        salePrice: sale,
        saleDate: p.attom.lastSaleDate,
        attom: a,
        batch: b,
        attomRatio: ar != null ? Math.round(ar * 100) / 100 : null,
        batchRatio: br != null ? Math.round(br * 100) / 100 : null,
      });
    }
  }
  const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const valuation: BenchmarkReport["valuation"] = {
    benchmarkCount: gt.length,
    attomMedianApePct: median(attomApe) != null ? Math.round((median(attomApe) as number) * 10) / 10 : null,
    attomMeanApePct: mean(attomApe),
    batchMedianApePct: median(batchApe) != null ? Math.round((median(batchApe) as number) * 10) / 10 : null,
    batchMeanApePct: mean(batchApe),
    outliers,
  };

  // ---- 4. Mortgage coverage ----------------------------------------------
  const mortgageFields: Array<[string, (s: ProviderSnapshot) => unknown]> = [
    ["lender", (s) => s.mortgage.lender],
    ["original loan amount", (s) => s.mortgage.loanAmount],
    ["loan date", (s) => s.mortgage.originationDate],
    ["loan type", (s) => s.mortgage.loanType],
    ["loan term", (s) => s.mortgage.termYears],
    ["interest rate", (s) => s.mortgage.interestRate],
    ["current balance (reported)", (s) => s.mortgage.reportedBalance],
    ["LTV", (s) => s.mortgage.ltv],
    ["estimated payment", (s) => s.mortgage.estimatedPayment],
    ["junior liens", (s) => s.mortgage.juniorLienCount],
    ["HELOC / credit line", (s) => (s.mortgage.hasHeloc ? true : null)],
  ];
  const coverage = mortgageFields.map(([field, get]) => {
    let a = 0;
    let b = 0;
    let both = 0;
    let agree = 0;
    let comparable = 0;
    for (const p of derivedPairs) {
      const av = get(p.attom);
      const bv = p.batch ? get(p.batch) : null;
      const hasA = av != null && av !== "";
      const hasB = bv != null && bv !== "";
      if (hasA) a += 1;
      if (hasB) b += 1;
      if (hasA && hasB) {
        both += 1;
        comparable += 1;
        if (typeof av === "number" && typeof bv === "number") {
          const base = Math.abs(av) || 1;
          if (Math.abs(av - bv) / base <= 0.05) agree += 1;
        } else if (String(av).toLowerCase().slice(0, 6) === String(bv).toLowerCase().slice(0, 6)) {
          agree += 1;
        }
      }
    }
    return {
      field,
      attom: a,
      batch: b,
      both,
      agree: comparable ? agree : null,
      attomOnly: a - both,
      batchOnly: b - both,
    };
  });

  // ---- 5. Freshness -------------------------------------------------------
  const fresh = { same: 0, batchNewer: 0, attomNewer: 0, onlyOne: 0, disagreements: [] as BenchmarkReport["mortgage"]["freshness"]["disagreements"] };
  for (const p of derivedPairs) {
    const a = p.attom.mortgage.originationDate;
    const b = p.batch?.mortgage.originationDate ?? null;
    if (a && b) {
      const da = a.slice(0, 10);
      const db = b.slice(0, 10);
      if (da === db) fresh.same += 1;
      else {
        if (db > da) fresh.batchNewer += 1;
        else fresh.attomNewer += 1;
        fresh.disagreements.push({
          address: p.address,
          attomDate: da,
          attomLender: p.attom.mortgage.lender,
          attomAmount: p.attom.mortgage.loanAmount,
          batchDate: db,
          batchLender: p.batch?.mortgage.lender ?? null,
          batchAmount: p.batch?.mortgage.loanAmount ?? null,
          batchRate: p.batch?.mortgage.interestRate ?? null,
        });
      }
    } else if (a || b) fresh.onlyOne += 1;
  }

  const liens = {
    attomSecond: derivedPairs.filter((p) => (p.attom.mortgage.juniorLienCount ?? 0) > 0).length,
    batchSecond: derivedPairs.filter((p) => (p.batch?.mortgage.juniorLienCount ?? 0) > 0).length,
    attomHeloc: derivedPairs.filter((p) => p.attom.mortgage.hasHeloc).length,
    batchHeloc: derivedPairs.filter((p) => p.batch?.mortgage.hasHeloc).length,
    attomMultiLien: derivedPairs.filter((p) => (p.attom.mortgage.openLienCount ?? 0) > 1).length,
    batchMultiLien: derivedPairs.filter((p) => (p.batch?.mortgage.openLienCount ?? 0) > 1).length,
  };

  // ---- 6. Refi ------------------------------------------------------------
  const refi = { bothYes: 0, bothNo: 0, attomOnly: 0, batchOnly: 0, agreementPct: 0, disagreements: [] as BenchmarkReport["refi"]["disagreements"] };
  let refiCompared = 0;
  for (const p of derivedPairs) {
    if (!p.dB) continue;
    refiCompared += 1;
    const a = p.dA.decisions.refinance;
    const b = p.dB.decisions.refinance;
    if (a && b) refi.bothYes += 1;
    else if (!a && !b) refi.bothNo += 1;
    else {
      if (a) refi.attomOnly += 1;
      else refi.batchOnly += 1;
      const cause =
        p.dA.value != null && p.dB.value != null && Math.abs(p.dA.value - p.dB.value) / Math.max(1, p.dA.value) > 0.2
          ? "valuation gap over 20%"
          : (p.attom.mortgage.interestRate ?? null) !== (p.batch?.mortgage.interestRate ?? null)
            ? "interest rate available/differs"
            : "loan balance differs";
      refi.disagreements.push({
        address: p.address,
        attom: { value: p.dA.value, balance: p.dA.balance, rate: p.attom.mortgage.interestRate, ltv: p.dA.ltv, signal: p.dA.refiSignal },
        batch: { value: p.dB.value, balance: p.dB.balance, rate: p.batch?.mortgage.interestRate ?? null, ltv: p.dB.ltv, signal: p.dB.refiSignal },
        reason: cause,
      });
    }
  }
  refi.agreementPct = refiCompared ? Math.round(((refi.bothYes + refi.bothNo) / refiCompared) * 1000) / 10 : 0;

  // ---- 7. Equity ----------------------------------------------------------
  const eq = { compared: 0, within5: 0, within10: 0, within20: 0, over20: 0, medianAbsDiff: null as number | null, medianAbsPctDiff: null as number | null, causes: [] as Array<{ key: string; count: number }> };
  const eqDiffs: number[] = [];
  const eqPcts: number[] = [];
  const causeTally = new Map<string, number>();
  for (const p of derivedPairs) {
    if (!p.dB || p.dA.equity == null || p.dB.equity == null) continue;
    eq.compared += 1;
    const diff = Math.abs(p.dB.equity - p.dA.equity);
    const base = Math.abs(p.dA.equity) || 1;
    const pct = (diff / base) * 100;
    eqDiffs.push(diff);
    eqPcts.push(pct);
    if (pct <= 5) eq.within5 += 1;
    else if (pct <= 10) eq.within10 += 1;
    else if (pct <= 20) eq.within20 += 1;
    else eq.over20 += 1;

    if (pct > 5) {
      const valGap = p.dA.value != null && p.dB.value != null ? Math.abs(p.dB.value - p.dA.value) : 0;
      const balGap = p.dA.balance != null && p.dB.balance != null ? Math.abs(p.dB.balance - p.dA.balance) : 0;
      let cause = "other";
      if (valGap >= balGap && valGap > 0) cause = "A. valuation";
      else if (balGap > valGap) {
        cause =
          p.dB.balanceSource === "reported" && p.dA.balanceSource === "amortized"
            ? "C. amortization assumption vs reported balance"
            : "B. mortgage balance";
      }
      causeTally.set(cause, (causeTally.get(cause) ?? 0) + 1);
    }
  }
  eq.medianAbsDiff = median(eqDiffs) != null ? Math.round(median(eqDiffs) as number) : null;
  eq.medianAbsPctDiff = median(eqPcts) != null ? Math.round((median(eqPcts) as number) * 10) / 10 : null;
  eq.causes = [...causeTally.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);

  // ---- 9. Completeness ----------------------------------------------------
  const completenessFields: Array<[string, (s: ProviderSnapshot | null) => boolean]> = [
    ["Property details", (s) => Boolean(s && (s.beds || s.sqft || s.yearBuilt))],
    ["Owner", (s) => Boolean(s?.ownerName)],
    ["Tax", (s) => Boolean(s && (s.taxAmount || s.assessedValue))],
    ["Sales", (s) => Boolean(s?.lastSaleDate || s?.lastSaleAmount)],
    ["Valuation", (s) => Boolean(s?.avmValue)],
    ["Mortgage", (s) => Boolean(s?.mortgage.hasRecord)],
    ["Interest rate", (s) => s?.mortgage.interestRate != null],
    ["Current balance", (s) => s?.mortgage.reportedBalance != null],
    ["Equity inputs", (s) => Boolean(s?.avmValue && s?.mortgage.loanAmount)],
    ["Refi intelligence", (s) => Boolean(s?.mortgage.interestRate != null && s?.avmValue)],
    ["Junior liens", (s) => (s?.mortgage.juniorLienCount ?? 0) > 0 || (s?.mortgage.openLienCount ?? 0) > 1],
  ];
  const total = derivedPairs.length || 1;
  const completeness = completenessFields.map(([field, has]) => {
    const batchPct = Math.round((derivedPairs.filter((p) => has(p.batch)).length / total) * 1000) / 10;
    const attomPct = Math.round((derivedPairs.filter((p) => has(p.attom)).length / total) * 1000) / 10;
    return {
      field,
      batchPct,
      attomPct,
      winner: batchPct === attomPct ? "Tie" : batchPct > attomPct ? "BatchData" : "ATTOM",
    };
  });

  // ---- 11. Business decisions --------------------------------------------
  const perDecision = DECISION_KEYS.map((key) => {
    let agree = 0;
    let compared = 0;
    let attomYes = 0;
    let batchYes = 0;
    for (const p of derivedPairs) {
      if (!p.dB) continue;
      compared += 1;
      const a = p.dA.decisions[key];
      const b = p.dB.decisions[key];
      if (a) attomYes += 1;
      if (b) batchYes += 1;
      if (a === b) agree += 1;
    }
    return {
      key,
      label: DECISION_LABELS[key],
      agree,
      compared,
      agreementPct: compared ? Math.round((agree / compared) * 1000) / 10 : 0,
      attomYes,
      batchYes,
      mortgageDependent: MORTGAGE_DEPENDENT.includes(key),
    };
  });
  const allAgree = perDecision.reduce((s, d) => s + d.agree, 0);
  const allCompared = perDecision.reduce((s, d) => s + d.compared, 0);
  const mdAgree = perDecision.filter((d) => d.mortgageDependent).reduce((s, d) => s + d.agree, 0);
  const mdCompared = perDecision.filter((d) => d.mortgageDependent).reduce((s, d) => s + d.compared, 0);

  // ---- 12. Scorecard ------------------------------------------------------
  const pctScore = (pct: number) => Math.round((pct / 10) * 10) / 10;
  const cov = (field: string, who: "attom" | "batch") => {
    const row = completeness.find((c) => c.field === field);
    return row ? (who === "attom" ? row.attomPct : row.batchPct) : 0;
  };
  const apeScore = (ape: number | null) =>
    ape == null ? 0 : Math.max(0, Math.round((10 - ape / 3) * 10) / 10);

  const scoreRows = [
    {
      category: "Property matching",
      batch: pctScore(((match.exact + match.probable) / total) * 100),
      attom: 10,
      note: "ATTOM is the source of the sample, so it matches by construction.",
    },
    { category: "Property completeness", batch: pctScore(cov("Property details", "batch")), attom: pctScore(cov("Property details", "attom")), note: "beds/sqft/year built present" },
    { category: "Valuation accuracy", batch: apeScore(valuation.batchMedianApePct), attom: apeScore(valuation.attomMedianApePct), note: "median APE vs recorded sale price (limited benchmark)" },
    { category: "Mortgage completeness", batch: pctScore(cov("Mortgage", "batch")), attom: pctScore(cov("Mortgage", "attom")), note: "any open lien identified" },
    { category: "Mortgage freshness", batch: pctScore(fresh.same + fresh.batchNewer > 0 ? ((fresh.same + fresh.batchNewer) / Math.max(1, fresh.same + fresh.batchNewer + fresh.attomNewer)) * 100 : 0), attom: pctScore(fresh.same + fresh.attomNewer > 0 ? ((fresh.same + fresh.attomNewer) / Math.max(1, fresh.same + fresh.batchNewer + fresh.attomNewer)) * 100 : 0), note: "identifies the most recent recorded lien" },
    { category: "Equity intelligence", batch: pctScore(cov("Current balance", "batch")), attom: pctScore(cov("Current balance", "attom")), note: "reported current balance vs modelled" },
    { category: "Sales history", batch: pctScore(cov("Sales", "batch")), attom: pctScore(cov("Sales", "attom")), note: "last sale present" },
    { category: "Tax", batch: pctScore(cov("Tax", "batch")), attom: pctScore(cov("Tax", "attom")), note: "assessment/tax present" },
    {
      category: "API efficiency",
      batch: Math.max(0, Math.round((10 - (api.callsPerProperty - 1) * 5) * 10) / 10),
      attom: api.attom?.callsPerProperty ? Math.max(0, Math.round((10 - (api.attom.callsPerProperty - 1) * 2) * 10) / 10) : 5,
      note: "calls per property (1 = ideal)",
    },
    {
      category: "Reliability",
      batch: pctScore(finals.length ? (successRows.length / finals.length) * 100 : 0),
      attom: api.attom?.successRatePct != null ? pctScore(api.attom.successRatePct) : 5,
      note: "successful HTTP responses",
    },
    { category: "SuCasa actionable intelligence", batch: pctScore(cov("Refi intelligence", "batch")), attom: pctScore(cov("Refi intelligence", "attom")), note: "rate + valuation both present" },
  ];
  const batchTotal = Math.round(scoreRows.reduce((s, r) => s + r.batch, 0) * 10) / 10;
  const attomTotal = Math.round(scoreRows.reduce((s, r) => s + r.attom, 0) * 10) / 10;

  // ---- Per-property table -------------------------------------------------
  const perProperty = derivedPairs.map((p) => {
    const m = matchByProperty.get(p.propertyId);
    return {
      property_id: p.propertyId,
      address: p.address,
      call_success: p.row.success ? "yes" : "no",
      http_status: p.row.http_status ?? null,
      error: p.row.error_message ?? null,
      match_class: m?.match ?? "no_match",
      owner_agree: m?.ownerAgree == null ? "unknown" : m.ownerAgree ? "yes" : "no",
      attom_value: p.attom.avmValue,
      batch_value: p.batch?.avmValue ?? null,
      attom_loan_amount: p.attom.mortgage.loanAmount,
      batch_loan_amount: p.batch?.mortgage.loanAmount ?? null,
      attom_loan_date: p.attom.mortgage.originationDate,
      batch_loan_date: p.batch?.mortgage.originationDate ?? null,
      attom_rate: p.attom.mortgage.interestRate,
      batch_rate: p.batch?.mortgage.interestRate ?? null,
      attom_balance: p.dA.balance,
      batch_balance: p.dB?.balance ?? null,
      attom_equity: p.dA.equity,
      batch_equity: p.dB?.equity ?? null,
      attom_refi: p.dA.decisions.refinance ? "yes" : "no",
      batch_refi: p.dB ? (p.dB.decisions.refinance ? "yes" : "no") : null,
      attom_last_sale: p.attom.lastSaleAmount,
      batch_last_sale: p.batch?.lastSaleAmount ?? null,
    };
  });

  return {
    runId,
    generatedAt: new Date().toISOString(),
    api,
    match,
    fields,
    valuation,
    mortgage: { coverage, freshness: fresh, liens },
    refi,
    equity: eq,
    completeness,
    decisions: {
      perDecision,
      overallAgreementPct: allCompared ? Math.round((allAgree / allCompared) * 1000) / 10 : 0,
      mortgageDependentAgreementPct: mdCompared ? Math.round((mdAgree / mdCompared) * 1000) / 10 : 0,
    },
    scorecard: {
      rows: scoreRows,
      batchTotal,
      attomTotal,
      batchScore100: Math.round((batchTotal / 110) * 1000) / 10,
      attomScore100: Math.round((attomTotal / 110) * 1000) / 10,
    },
    perProperty,
  };
}

export { BENCHMARK_RATE };
