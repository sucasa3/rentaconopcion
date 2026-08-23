/**
 * THE HOME TIMELINE — the permanent memory of the house.
 *
 * Pure assembly over things the app has already loaded: purchase history,
 * permits, logged service work, documents, value snapshots and completed
 * service requests. No new fetches, no provider calls — just the story of the
 * home in one chronological list.
 */

import type { HomeRecord } from "@/lib/home-record";

export type TimelineEntryKind =
  | "purchase"
  | "permit"
  | "service"
  | "document"
  | "value"
  | "request"
  | "projection";

export type HomeTimelineEntry = {
  key: string;
  kind: TimelineEntryKind;
  /** ISO date (YYYY-MM-DD) when known, otherwise a year boundary. */
  date: string;
  year: number;
  title: string;
  detail?: string | null;
  amount?: number | null;
  /** Where the entry came from, shown as a small source chip. */
  source: string;
  link?: { to: string; search?: Record<string, string> };
  /** True for future-dated planning entries (expected replacements). */
  future?: boolean;
};

export type TimelineInput = {
  record: HomeRecord | null;
  documents?: { id: string; kind: string; original_filename: string | null; created_at: string }[];
  valueSnapshots?: { id: string; captured_on: string; value_cents: number; source: string }[];
  requests?: {
    id: string;
    category: string;
    status: string;
    created_at: string;
    completed_at?: string | null;
    vendor_name?: string | null;
  }[];
  /** Include projected future milestones (expected replacement years). */
  includeProjections?: boolean;
  now?: Date;
};

const DOC_LABEL: Record<string, string> = {
  inspection: "Inspection report",
  insurance: "Insurance document",
  warranty: "Warranty",
  deed: "Deed",
  other: "Document",
};

function yearOf(date: string): number {
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) ? y : 0;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export function buildHomeTimeline(input: TimelineInput): HomeTimelineEntry[] {
  const { record } = input;
  const now = input.now ?? new Date();
  const entries: HomeTimelineEntry[] = [];

  if (!record) return entries;

  // ---- Purchase ------------------------------------------------------------
  if (record.property.lastSaleDate) {
    entries.push({
      key: "purchase",
      kind: "purchase",
      date: record.property.lastSaleDate,
      year: yearOf(record.property.lastSaleDate),
      title: "Purchased",
      detail: record.property.lastSalePrice ? money(record.property.lastSalePrice) : "Sale on record",
      amount: record.property.lastSalePrice,
      source: "Property records",
    });
  } else if (record.property.yearBuilt) {
    entries.push({
      key: "built",
      kind: "purchase",
      date: `${record.property.yearBuilt}-01-01`,
      year: record.property.yearBuilt,
      title: "Home built",
      detail: `Year built ${record.property.yearBuilt}`,
      source: "Property records",
    });
  }

  // ---- Permits -------------------------------------------------------------
  record.physical.permits.forEach((p, i) => {
    if (!p.date) return;
    entries.push({
      key: `permit:${i}:${p.date}`,
      kind: "permit",
      date: p.date,
      year: yearOf(p.date),
      title: p.type?.trim() || "Permitted work",
      detail: p.description ?? p.status ?? null,
      amount: p.value ?? null,
      source: "Permit record",
    });
  });

  // ---- Logged service work -------------------------------------------------
  for (const item of record.physical.timeline) {
    if (item.source !== "logged") continue;
    const year = item.installedYear;
    entries.push({
      key: `service:${item.key}:${year}`,
      kind: "service",
      date: `${year}-01-01`,
      year,
      title: `${item.label} ${item.loggedDetail ? "" : "updated"}`.trim(),
      detail: item.loggedDetail ?? `Recorded by you — expected to last to ${item.expectedYear}`,
      source: "Your record",
      link: { to: "/home-care" },
    });
  }

  // ---- Documents -----------------------------------------------------------
  for (const d of input.documents ?? []) {
    entries.push({
      key: `doc:${d.id}`,
      kind: "document",
      date: d.created_at.slice(0, 10),
      year: yearOf(d.created_at),
      title: DOC_LABEL[d.kind] ?? "Document",
      detail: d.original_filename,
      source: "Your documents",
      link: { to: "/documents" },
    });
  }

  // ---- Value history -------------------------------------------------------
  const snapshots = [...(input.valueSnapshots ?? [])].sort((a, b) =>
    a.captured_on.localeCompare(b.captured_on),
  );
  // One entry per year — the last reading of each year tells the story cleanly.
  const byYear = new Map<number, (typeof snapshots)[number]>();
  for (const s of snapshots) byYear.set(yearOf(s.captured_on), s);
  for (const [year, s] of byYear) {
    entries.push({
      key: `value:${s.id}`,
      kind: "value",
      date: s.captured_on,
      year,
      title: "Estimated value",
      detail: money(s.value_cents / 100),
      amount: s.value_cents / 100,
      source: "Valuation",
      link: { to: "/money" },
    });
  }

  // ---- Service requests ----------------------------------------------------
  for (const r of input.requests ?? []) {
    const date = (r.completed_at ?? r.created_at).slice(0, 10);
    entries.push({
      key: `request:${r.id}`,
      kind: "request",
      date,
      year: yearOf(date),
      title: `${r.category} — ${r.status}`,
      detail: r.vendor_name ? `Handled by ${r.vendor_name}` : "Service request",
      source: "Service requests",
      link: { to: "/request" },
    });
  }

  // ---- Today ---------------------------------------------------------------
  const todayIso = now.toISOString().slice(0, 10);
  if (record.financial.value.value != null) {
    entries.push({
      key: "today-value",
      kind: "value",
      date: todayIso,
      year: now.getFullYear(),
      title: "Estimated value today",
      detail:
        record.financial.equityDollars != null
          ? `${money(record.financial.value.value)} · ${money(record.financial.equityDollars)} equity`
          : money(record.financial.value.value),
      amount: record.financial.value.value,
      source: record.financial.value.label ?? "Valuation",
      link: { to: "/money" },
    });
  }

  // ---- Projections ---------------------------------------------------------
  if (input.includeProjections !== false) {
    for (const item of record.physical.timeline) {
      if (item.expectedYear < now.getFullYear()) continue;
      entries.push({
        key: `projection:${item.key}`,
        kind: "projection",
        date: `${item.expectedYear}-01-01`,
        year: item.expectedYear,
        title: `${item.label} — typical replacement window`,
        detail: `Installed ${item.installedYear}, ${item.expectedYear - item.installedYear}-year expected life.`,
        source: item.source === "permit" ? "Permit record" : item.source === "logged" ? "Your record" : "Estimated",
        link: { to: "/home-care" },
        future: true,
      });
    }
  }

  entries.sort((a, b) => b.date.localeCompare(a.date));
  return entries;
}

export function groupTimelineByYear(
  entries: HomeTimelineEntry[],
): { year: number; entries: HomeTimelineEntry[] }[] {
  const map = new Map<number, HomeTimelineEntry[]>();
  for (const e of entries) {
    const list = map.get(e.year);
    if (list) list.push(e);
    else map.set(e.year, [e]);
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, list]) => ({ year, entries: list }));
}
