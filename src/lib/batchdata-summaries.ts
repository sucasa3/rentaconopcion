/**
 * Maps one normalized BatchData property onto the per-class summary shapes the
 * shared property record already stores and reads (AvmSummary, DetailSummary,
 * TaxSummary, SalesSummary, MortgageSummary, PermitsSummary). Each output
 * passes the matching `is*Summary` guard, so downstream readers are
 * provider-agnostic. Pure — no IO.
 */
import type { NormalizedBatchdataProperty } from "./batchdata-normalize";

export interface BatchdataClassSummaries {
  avm: {
    estimate: number | null;
    low: number | null;
    high: number | null;
    confidence: number | null;
    asOf: string | null;
  } | null;
  detail: {
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    lotSqft: number | null;
    yearBuilt: number | null;
    propertyType: string | null;
  };
  tax: {
    assessedTotal: number | null;
    marketTotal: number | null;
    taxAmount: number | null;
    taxYear: number | null;
  };
  sales: {
    lastSale: { date: string | null; amount: number | null; docType: string | null } | null;
    priorSales: Array<{ date: string | null; amount: number | null; docType: string | null }>;
    tenureYears: number | null;
  };
  mortgage: Record<string, unknown> & { hasRecord: boolean };
  permits: {
    events: Array<{ date: string | null; type: string | null; description: string | null; value: number | null; status: string | null }>;
    totalValue: number | null;
    lastPermitDate: string | null;
  };
  owner: NormalizedBatchdataProperty["ownership"];
}

export function batchdataToSummaries(
  n: NormalizedBatchdataProperty,
  now: Date = new Date(),
): BatchdataClassSummaries {
  const v = n.valuation;
  const m = n.mortgage;
  const lastDate = n.sales.lastSaleDate;
  const tenureYears = lastDate
    ? Math.max(0, Math.round((now.getTime() - new Date(lastDate).getTime()) / (365.25 * 86_400_000)))
    : null;
  const singleLien = (m.openLienCount ?? m.liens.length) === 1;

  return {
    avm:
      v.estimate != null
        ? { estimate: v.estimate, low: v.low, high: v.high, confidence: v.confidence, asOf: v.asOf }
        : null,
    detail: {
      beds: n.property.beds,
      baths: n.property.baths,
      sqft: n.property.sqft,
      lotSqft: n.property.lotSqft,
      yearBuilt: n.property.yearBuilt,
      propertyType: n.property.propertyType,
    },
    tax: {
      assessedTotal: v.assessedValue,
      marketTotal: v.marketValue,
      taxAmount: v.taxAmount,
      taxYear: v.taxYear,
    },
    sales: {
      lastSale:
        lastDate || n.sales.lastSaleAmount != null
          ? { date: lastDate, amount: n.sales.lastSaleAmount, docType: null }
          : null,
      priorSales: n.sales.priorSales,
      tenureYears,
    },
    mortgage: {
      hasRecord: m.hasRecord,
      loanAmount: m.loanAmount,
      lender: m.lender,
      originationDate: m.originationDate,
      interestRate: m.interestRate,
      loanType: m.loanType,
      termYears: m.termYears,
      termMonths: m.termYears != null ? m.termYears * 12 : null,
      openLienCount: m.openLienCount,
      totalOpenLienBalance: m.totalOpenLienBalance,
      currentBalance: m.currentBalance,
      lienStatus: m.lienStatus,
      ltv: m.ltv,
      liens: m.liens.map((l, i) => ({
        balance: singleLien ? m.currentBalance : null,
        lender: l.lender,
        position: i + 1,
      })),
      history: m.history.map((h) => ({
        lender: h.lender,
        amount: h.amount,
        recordingDate: h.recordingDate,
        loanType: h.loanType,
      })),
    },
    permits: {
      events: n.permits.events,
      totalValue: n.permits.totalValue,
      lastPermitDate: n.permits.lastPermitDate,
    },
    owner: n.ownership,
  };
}
