/**
 * THE HOME RECORD — storage layer of the SuCasa model.
 *
 * One canonical object per physical home, assembled from every sensor we have
 * (property records, inspections, service logs, homeowner behavior, requests).
 * Homeowner, agent and lender surfaces all read this shape so a home can never
 * mean one thing on one screen and something else on another.
 *
 * Pure and client-safe: assembled from data the caller already loaded.
 */

import {
  buildMaintenanceTimeline,
  type PermitLike,
  type ServiceLogLike,
  type TimelineItem,
} from "@/lib/maintenance-rules";
import { resolveHomeValue, type ResolvedHomeValue, type ValueStatus } from "@/lib/home-value";
import { estimateRefiSavings, type RefiSavings } from "@/lib/refi";

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export type HomeProperty = {
  addressNormalized: string | null;
  address: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  lastSalePrice: number | null;
  lastSaleDate: string | null;
};

export type HomeFinancial = {
  value: ResolvedHomeValue;
  valueStatus: ValueStatus;
  assessedTotal: number | null;
  taxAmount: number | null;
  loanBalance: number | null;
  rate: number | null;
  equityDollars: number | null;
  equityPct: number | null;
  cashOutHeadroom: number | null;
  refiSignal: string | null;
  refi: RefiSavings | null;
};

export type HomePhysical = {
  timeline: TimelineItem[];
  overdue: TimelineItem[];
  dueSoon: TimelineItem[];
  findings: { system?: string | null; urgency?: string | null; recommended_action?: string | null }[];
  openFindings: number;
  permits: PermitLike[];
  documentCount: number;
  serviceLogCount: number;
};

export type HomeBehavior = {
  openRequests: number;
  totalRequests: number;
  valueChecks30d: number;
  equityChecks30d: number;
  sellingIntent: string | null;
  lastActivityAt: string | null;
};

export type SectionKey = "property" | "financial" | "physical" | "behavior";

export type SectionCompleteness = {
  key: SectionKey;
  label: string;
  pct: number;
  missing: string[];
};

export type HomeRecord = {
  homeownerId: string | null;
  property: HomeProperty;
  financial: HomeFinancial;
  physical: HomePhysical;
  behavior: HomeBehavior;
  /** Which record classes are being served from cache right now. */
  staleClasses: string[];
  completeness: { pct: number; sections: SectionCompleteness[] };
  asOf: string;
};

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export type HomeRecordInput = {
  homeownerId?: string | null;
  address?: string | null;
  addressNormalized?: string | null;
  /** Extracted property-record classes (already normalized by valuation layer). */
  avm?: { estimate?: number | null; low?: number | null; high?: number | null } | null;
  detail?: { beds?: number | null; baths?: number | null; sqft?: number | null; yearBuilt?: number | null } | null;
  tax?: { marketTotal?: number | null; assessedTotal?: number | null; taxAmount?: number | null } | null;
  sales?: { lastSalePrice?: number | null; lastSaleDate?: string | null } | null;
  mortgage?: { rate?: number | null } | null;
  equity?: {
    estimatedValue?: number | null;
    loanBalance?: number | null;
    equityDollars?: number | null;
    equityPct?: number | null;
    cashOutHeadroom?: number | null;
    refiSignal?: string | null;
    rate?: number | null;
  } | null;
  permits?: PermitLike[];
  valueStatus?: ValueStatus;
  staleClasses?: string[];
  findings?: HomePhysical["findings"];
  serviceLog?: ServiceLogLike[];
  documentCount?: number;
  openRequests?: number;
  totalRequests?: number;
  valueChecks30d?: number;
  equityChecks30d?: number;
  sellingIntent?: string | null;
  lastActivityAt?: string | null;
  now?: Date;
};

function pctOf(checks: { ok: boolean; label: string }[]): { pct: number; missing: string[] } {
  const done = checks.filter((c) => c.ok).length;
  return {
    pct: checks.length === 0 ? 0 : Math.round((done / checks.length) * 100),
    missing: checks.filter((c) => !c.ok).map((c) => c.label),
  };
}

export function assembleHomeRecord(input: HomeRecordInput): HomeRecord {
  const now = input.now ?? new Date();

  const value = resolveHomeValue({ avm: input.avm, tax: input.tax, equity: input.equity });

  const property: HomeProperty = {
    addressNormalized: input.addressNormalized ?? null,
    address: input.address ?? null,
    beds: input.detail?.beds ?? null,
    baths: input.detail?.baths ?? null,
    sqft: input.detail?.sqft ?? null,
    yearBuilt: input.detail?.yearBuilt ?? null,
    lastSalePrice: input.sales?.lastSalePrice ?? null,
    lastSaleDate: input.sales?.lastSaleDate ?? null,
  };

  const rate = input.equity?.rate ?? input.mortgage?.rate ?? null;
  const loanBalance = input.equity?.loanBalance ?? null;

  const financial: HomeFinancial = {
    value,
    valueStatus: input.valueStatus ?? (value.value != null ? "resolved" : "no_coverage"),
    assessedTotal: input.tax?.assessedTotal ?? null,
    taxAmount: input.tax?.taxAmount ?? null,
    loanBalance,
    rate,
    equityDollars: input.equity?.equityDollars ?? null,
    equityPct: input.equity?.equityPct ?? null,
    cashOutHeadroom: input.equity?.cashOutHeadroom ?? null,
    refiSignal: input.equity?.refiSignal ?? null,
    refi: estimateRefiSavings(loanBalance, rate),
  };

  const permits = input.permits ?? [];
  const timeline =
    property.yearBuilt != null || permits.length > 0 || (input.serviceLog ?? []).length > 0
      ? buildMaintenanceTimeline(property.yearBuilt, permits, now, input.serviceLog ?? [])
      : [];

  const findings = input.findings ?? [];
  const physical: HomePhysical = {
    timeline,
    overdue: timeline.filter((t) => t.status === "overdue"),
    dueSoon: timeline.filter((t) => t.status === "due_soon"),
    findings,
    openFindings: findings.filter((f) => {
      const u = (f.urgency ?? "").toLowerCase();
      return u === "high" || u === "medium";
    }).length,
    permits,
    documentCount: input.documentCount ?? 0,
    serviceLogCount: (input.serviceLog ?? []).length,
  };

  const behavior: HomeBehavior = {
    openRequests: input.openRequests ?? 0,
    totalRequests: input.totalRequests ?? 0,
    valueChecks30d: input.valueChecks30d ?? 0,
    equityChecks30d: input.equityChecks30d ?? 0,
    sellingIntent: input.sellingIntent ?? null,
    lastActivityAt: input.lastActivityAt ?? null,
  };

  const sections: SectionCompleteness[] = [
    {
      key: "property",
      label: "Property",
      ...pctOf([
        { ok: !!property.address, label: "Home address" },
        { ok: property.yearBuilt != null, label: "Year built" },
        { ok: property.sqft != null, label: "Size and layout" },
        { ok: property.lastSaleDate != null, label: "Purchase history" },
      ]),
    },
    {
      key: "financial",
      label: "Financial",
      ...pctOf([
        { ok: financial.value.value != null, label: "Estimated value" },
        { ok: financial.loanBalance != null, label: "Loan balance" },
        { ok: financial.equityDollars != null, label: "Equity position" },
        { ok: financial.taxAmount != null, label: "Property taxes" },
      ]),
    },
    {
      key: "physical",
      label: "Condition",
      ...pctOf([
        { ok: physical.timeline.length > 0, label: "System ages" },
        { ok: physical.permits.length > 0, label: "Permit history" },
        { ok: physical.documentCount > 0, label: "Inspection or warranty docs" },
        { ok: physical.serviceLogCount > 0, label: "Service history" },
      ]),
    },
    {
      key: "behavior",
      label: "Intent",
      ...pctOf([
        { ok: behavior.totalRequests > 0, label: "A service request on record" },
        { ok: behavior.sellingIntent != null, label: "Plans for the home" },
        { ok: behavior.lastActivityAt != null, label: "Recent activity" },
      ]),
    },
  ];

  return {
    homeownerId: input.homeownerId ?? null,
    property,
    financial,
    physical,
    behavior,
    staleClasses: input.staleClasses ?? [],
    completeness: {
      pct: Math.round(sections.reduce((s, x) => s + x.pct, 0) / sections.length),
      sections,
    },
    asOf: now.toISOString(),
  };
}
