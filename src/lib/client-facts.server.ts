/**
 * The single sanctioned loader for canonical homeowner facts.
 *
 * Reads only the cached property record (never a provider call) and resolves
 * value / balance / equity through the shared Value Engine + equity resolver,
 * exactly as the opportunity engine does. Every professional surface that
 * needs a number about a home calls this.
 */

import { normalizeAddress } from "@/lib/attom.server";
import {
  computeEquityRibbon,
  extractAvm,
  extractDetail,
  extractMortgage,
  extractPermits,
  extractSales,
  extractTax,
} from "@/lib/valuation.server";
import { emptyClientFacts, type ClientFacts } from "@/lib/client-facts";

export type FactClientRow = {
  id: string;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  close_date?: string | null;
  rate_at_close?: number | null;
};

const INTEL_COLUMNS =
  "address_normalized, address_line1, avm, detail, tax, sales, mortgage, permits, owner";

function fullKey(c: FactClientRow): string {
  const tail = [c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return normalizeAddress([c.address_line1, tail].filter(Boolean).join(", "));
}

function yearsSince(date: string | null | undefined): number | null {
  if (!date) return null;
  const t = Date.parse(date);
  if (Number.isNaN(t)) return null;
  return Math.max(0, (Date.now() - t) / (365.25 * 24 * 3600 * 1000));
}

function taxChange(raw: unknown): number | null {
  const rows: any[] = Array.isArray((raw as any)?.property)
    ? (raw as any).property.map((r: any) => r?.assessment?.tax).filter(Boolean)
    : [];
  const latest = rows[0]?.taxamt ?? null;
  const prev = rows[1]?.taxamt ?? null;
  if (!latest || !prev) return null;
  return Math.round(((latest - prev) / prev) * 1000) / 10;
}

function ownerOccupied(row: any): boolean | null {
  const p = row?.owner?.property?.[0] ?? null;
  const ind: string | null = p?.summary?.absenteeInd ?? null;
  if (ind) return !/absentee/i.test(ind);
  const mailing = p?.address?.mailingAddressOneLine ?? null;
  const site = p?.address?.oneLine ?? null;
  if (typeof mailing === "string" && typeof site === "string" && mailing && site) {
    return normalizeAddress(mailing) === normalizeAddress(site);
  }
  return null;
}

/** Build the canonical snapshot for one cached property record. */
export function factsFromRecord(client: FactClientRow, row: any | null): ClientFacts {
  const base = emptyClientFacts(client.id);
  if (!row) {
    return {
      ...base,
      ratePct: client.rate_at_close ?? null,
      tenureYears: yearsSince(client.close_date),
      lastSaleDate: client.close_date ?? null,
    };
  }

  const avm = extractAvm(row.avm);
  const detail = extractDetail(row.detail);
  const tax = extractTax(row.tax);
  const sales = extractSales(row.sales);
  const mortgage = extractMortgage(row.mortgage);
  const permits = extractPermits(row.permits);
  const ribbon = computeEquityRibbon(avm, mortgage, sales, tax, client.state ?? null);

  const lastSaleDate = sales?.lastSale?.date ?? client.close_date ?? null;

  return {
    clientId: client.id,
    value: ribbon.estimatedValue,
    valueSource: ribbon.valueSource,
    valueConfidence: ribbon.valueConfidence,
    valueMethodology: ribbon.valueMethodology,
    loanBalance: ribbon.loanBalanceEstimate,
    equityDollars: ribbon.equityDollars,
    equityPct: ribbon.equityPct,
    ltvPct: ribbon.equityPct != null ? Math.round((1 - ribbon.equityPct) * 1000) / 10 : null,
    ratePct: mortgage?.interestRate ?? client.rate_at_close ?? null,
    tenureYears: ribbon.tenureYears ?? yearsSince(lastSaleDate),
    lastSaleDate,
    lastSalePrice: sales?.lastSale?.amount ?? null,
    beds: detail?.beds ?? null,
    baths: detail?.baths ?? null,
    sqft: detail?.sqft ?? null,
    yearBuilt: detail?.yearBuilt ?? null,
    propertyType: detail?.propertyType ?? null,
    taxAmount: tax?.taxAmount ?? null,
    assessedTotal: tax?.assessedTotal ?? null,
    taxChangePct: taxChange(row.tax),
    permitCount: permits?.events?.length ?? 0,
    lastPermitDate: permits?.lastPermitDate ?? null,
    permitTotalValue: permits?.totalValue ?? null,
    ownerOccupied: ownerOccupied(row),
    equityActionable: ribbon.equityActionable,
    suppressionReason: ribbon.equitySuppressionReason,
    freeAndClear: ribbon.noMortgageOnRecord,
    multiLien: ribbon.multiLien,
    hasRecord: true,
  };
}

/**
 * Canonical facts for a set of clients, keyed by client id.
 * Batched reads of the cached record only — no provider calls, no cost.
 */
export async function clientFactsFor(
  supabase: any,
  clients: FactClientRow[],
): Promise<Map<string, ClientFacts>> {
  const out = new Map<string, ClientFacts>();
  if (!clients.length) return out;

  const byFull = new Map<string, any>();
  const byLine = new Map<string, any>();
  const fullKeys = [...new Set(clients.map(fullKey))].filter(Boolean);
  const lineKeys = [...new Set(clients.map((c) => (c.address_line1 ?? "").trim()))].filter(Boolean);

  for (let i = 0; i < fullKeys.length; i += 200) {
    const { data } = await supabase
      .from("property_intel")
      .select(INTEL_COLUMNS)
      .in("address_normalized", fullKeys.slice(i, i + 200));
    for (const row of data ?? []) byFull.set(row.address_normalized, row);
  }
  for (let i = 0; i < lineKeys.length; i += 200) {
    const { data } = await supabase
      .from("property_intel")
      .select(INTEL_COLUMNS)
      .in("address_line1", lineKeys.slice(i, i + 200));
    for (const row of data ?? []) {
      const k = normalizeAddress(row.address_line1 ?? "");
      if (k && !byLine.has(k)) byLine.set(k, row);
    }
  }

  for (const c of clients) {
    const row = byFull.get(fullKey(c)) ?? byLine.get(normalizeAddress(c.address_line1 ?? "")) ?? null;
    out.set(c.id, factsFromRecord(c, row));
  }
  return out;
}

/** Canonical facts for a single client. */
export async function clientFactsForOne(
  supabase: any,
  client: FactClientRow,
): Promise<ClientFacts> {
  const map = await clientFactsFor(supabase, [client]);
  return map.get(client.id) ?? emptyClientFacts(client.id);
}
