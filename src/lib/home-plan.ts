/**
 * YOUR HOME PLAN — the forward-looking half of the homeowner experience.
 *
 * One deterministic planner turns the Home Record into a living plan:
 * what to do in the next 90 days, the next 12 months, and the next 3–5 years.
 * Pure and client-safe (same pattern as engagement.ts) so the dashboard hero,
 * the plan page, and the assistant all render the exact same plan.
 *
 * Rules, not vibes: component lifespans, seasonal cadence, inspection finding
 * urgency and permit history already live in maintenance-rules.ts and
 * seasonal-tasks.ts — this module aggregates them into horizons and attaches
 * a typical cost band so a homeowner can plan money, not just tasks.
 */

import type { HomeRecord } from "@/lib/home-record";
import { buildSeasonalTasks, type SeasonalLogLike } from "@/lib/seasonal-tasks";

export type PlanHorizon = "next90Days" | "next12Months" | "next3to5Years";

export type PlanItemSource = "component" | "finding" | "seasonal" | "review";

export interface CostBand {
  low: number;
  high: number;
}

export interface PlanItem {
  /** Stable identity per home+item, used for done/dismissed state. */
  key: string;
  title: string;
  why: string;
  horizon: PlanHorizon;
  costBand: CostBand | null;
  urgency: "high" | "medium" | "low";
  /** SuCasa service category used to pre-fill "Take care of it". */
  category: string | null;
  source: PlanItemSource;
  /** For long-horizon replacements, the year we expect the work. */
  targetYear?: number | null;
}

export interface HomePlan {
  next90Days: PlanItem[];
  next12Months: PlanItem[];
  next3to5Years: PlanItem[];
  generatedAt: string;
  sourceHash: string;
}

// ---------------------------------------------------------------------------
// Cost bands — deliberately wide "typical ranges", never quotes.
// ---------------------------------------------------------------------------

export const COST_BANDS: Record<string, CostBand> = {
  roof_replacement: { low: 8000, high: 18000 },
  roof_inspection: { low: 0, high: 300 },
  hvac_replacement: { low: 5000, high: 12000 },
  hvac_service: { low: 75, high: 200 },
  water_heater_replacement: { low: 1200, high: 2500 },
  windows_replacement: { low: 4000, high: 12000 },
  electrical_panel: { low: 1500, high: 4000 },
  siding_paint: { low: 3000, high: 9000 },
  gutters: { low: 100, high: 350 },
  dryer_vent: { low: 75, high: 200 },
  smoke_detectors: { low: 0, high: 150 },
  exterior_caulk: { low: 100, high: 400 },
  hvac_filter: { low: 10, high: 40 },
  water_heater_flush: { low: 75, high: 150 },
  inspection_repair: { low: 150, high: 1500 },
  insurance_review: { low: 0, high: 0 },
  value_review: { low: 0, high: 0 },
};

const COMPONENT_BAND: Record<string, CostBand> = {
  roof: COST_BANDS.roof_replacement!,
  hvac: COST_BANDS.hvac_replacement!,
  water_heater: COST_BANDS.water_heater_replacement!,
  windows: COST_BANDS.windows_replacement!,
  electrical: COST_BANDS.electrical_panel!,
  siding: COST_BANDS.siding_paint!,
};

export function formatCostBand(band: CostBand | null): string | null {
  if (!band) return null;
  if (band.low === 0 && band.high === 0) return "Usually free";
  const fmt = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : `$${n}`;
  if (band.low === 0) return `Under ${fmt(band.high)}`;
  return `${fmt(band.low)}–${fmt(band.high)} typical`;
}

// ---------------------------------------------------------------------------
// Source hash — the plan regenerates only when the record underneath moves.
// ---------------------------------------------------------------------------

export function computePlanSourceHash(record: HomeRecord): string {
  const parts: (string | number | null)[] = [
    record.property.addressNormalized ?? record.property.address,
    record.property.yearBuilt,
    record.physical.timeline
      .map((t) => `${t.key}:${t.installedYear}:${t.status}`)
      .join("|"),
    record.physical.findings
      .map((f) => `${f.system}:${f.urgency}`)
      .join("|"),
    record.physical.serviceLogCount,
    record.physical.documentCount,
    record.behavior.openRequests,
  ];
  const raw = parts.join("::");
  // Tiny stable hash — no crypto needed, this is a change detector.
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = (Math.imul(h, 31) + raw.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------------------
// The planner
// ---------------------------------------------------------------------------

const MAX_PER_HORIZON = 6;

const SEASONAL_BAND: Record<string, CostBand> = {
  hvac_filter: COST_BANDS.hvac_filter!,
  gutters: COST_BANDS.gutters!,
  water_heater_flush: COST_BANDS.water_heater_flush!,
  dryer_vent: COST_BANDS.dryer_vent!,
  smoke_co_detectors: COST_BANDS.smoke_detectors!,
  exterior_caulk: COST_BANDS.exterior_caulk!,
};

export function buildHomePlan(
  record: HomeRecord,
  now: Date = new Date(),
  serviceLog: SeasonalLogLike[] = [],
): HomePlan {
  const nowYear = now.getFullYear();
  const items: PlanItem[] = [];

  // 1. Components — the lifespan timeline already knows installed/expected years.
  for (const comp of record.physical.timeline) {
    if (comp.status === "overdue") {
      items.push({
        key: `component:${comp.key}`,
        title: `${comp.label} — past its expected life`,
        why:
          comp.source === "permit"
            ? `Installed around ${comp.installedYear} (permit on file) — a ${comp.category.toLowerCase()} check now avoids a bigger bill later.`
            : `Estimated from the year your home was built (${comp.installedYear}) — worth a ${comp.category.toLowerCase()} inspection.`,
        horizon: "next90Days",
        costBand: COST_BANDS.roof_inspection && comp.key === "roof"
          ? COST_BANDS.roof_inspection
          : COMPONENT_BAND[comp.key] ?? null,
        urgency: "high",
        category: comp.category,
        source: "component",
        targetYear: comp.expectedYear,
      });
    } else if (comp.status === "due_soon") {
      items.push({
        key: `component:${comp.key}`,
        title: `${comp.label} — plan for ${comp.expectedYear}`,
        why: `Reaches the end of its expected life around ${comp.expectedYear}. Planning now means choosing the pro, not rushing to one.`,
        horizon: "next12Months",
        costBand: COMPONENT_BAND[comp.key] ?? null,
        urgency: "medium",
        category: comp.category,
        source: "component",
        targetYear: comp.expectedYear,
      });
    } else if (comp.expectedYear - nowYear <= 5) {
      items.push({
        key: `component:${comp.key}`,
        title: `${comp.label} — likely around ${comp.expectedYear}`,
        why: `Expected replacement window is ${comp.expectedYear}. Knowing the year lets you budget early instead of financing a surprise.`,
        horizon: "next3to5Years",
        costBand: COMPONENT_BAND[comp.key] ?? null,
        urgency: "low",
        category: comp.category,
        source: "component",
        targetYear: comp.expectedYear,
      });
    }
  }

  // 2. Seasonal tasks that are due — the small stuff that protects the big stuff.
  for (const task of buildSeasonalTasks(serviceLog, now)) {
    if (!task.due) continue;
    items.push({
      key: `seasonal:${task.key}`,
      title: task.label,
      why:
        task.lastDone == null
          ? `Never logged — ${task.hint}`
          : `Last done ${task.monthsSince ?? "?"} months ago; this one works best every ${task.everyMonths} months.`,
      horizon: "next90Days",
      costBand: SEASONAL_BAND[task.key] ?? null,
      urgency: "medium",
      category: task.category,
      source: "seasonal",
    });
  }

  // 3. Inspection findings — real condition data beats estimates.
  for (const f of record.physical.findings) {
    const urgency = (f.urgency ?? "").toLowerCase();
    if (urgency !== "high" && urgency !== "medium") continue;
    items.push({
      key: `finding:${f.system}:${f.recommended_action ?? ""}`.slice(0, 120),
      title: f.recommended_action ?? `${f.system} needs attention`,
      why:
        urgency === "high"
          ? "Flagged as high priority in your inspection report — this is the kind of thing that gets more expensive when it waits."
          : "From your inspection report — not urgent, but worth scheduling this year.",
      horizon: urgency === "high" ? "next90Days" : "next12Months",
      costBand: COST_BANDS.inspection_repair ?? null,
      urgency: urgency === "high" ? "high" : "medium",
      category: null,
      source: "finding",
    });
  }

  // 4. Standing reviews — the once-a-year look at the money side.
  if (record.financial.value.value != null) {
    items.push({
      key: "review:value",
      title: "Review your home's value and equity",
      why: "Values move. A quick yearly check keeps your plan — and your options — based on today's numbers.",
      horizon: "next12Months",
      costBand: COST_BANDS.value_review ?? null,
      urgency: "low",
      category: null,
      source: "review",
    });
  }

  // Sort inside horizons: urgency first, then cheapest-typical first.
  const urgencyRank = { high: 0, medium: 1, low: 2 } as const;
  const sortItems = (list: PlanItem[]) =>
    list
      .sort(
        (a, b) =>
          urgencyRank[a.urgency] - urgencyRank[b.urgency] ||
          (a.costBand?.low ?? 0) - (b.costBand?.low ?? 0),
      )
      .slice(0, MAX_PER_HORIZON);

  const dedup = new Map<string, PlanItem>();
  for (const item of items) if (!dedup.has(item.key)) dedup.set(item.key, item);
  const all = [...dedup.values()];

  return {
    next90Days: sortItems(all.filter((i) => i.horizon === "next90Days")),
    next12Months: sortItems(all.filter((i) => i.horizon === "next12Months")),
    next3to5Years: sortItems(all.filter((i) => i.horizon === "next3to5Years")),
    generatedAt: now.toISOString(),
    sourceHash: computePlanSourceHash(record),
  };
}

/** Flatten with state applied — done/dismissed items drop out. */
export function visibleItems(
  plan: HomePlan,
  state: Record<string, "done" | "dismissed">,
): Record<PlanHorizon, PlanItem[]> {
  const keep = (i: PlanItem) => !state[i.key];
  return {
    next90Days: plan.next90Days.filter(keep),
    next12Months: plan.next12Months.filter(keep),
    next3to5Years: plan.next3to5Years.filter(keep),
  };
}

export function planCounts(plan: HomePlan, state: Record<string, "done" | "dismissed"> = {}) {
  const v = visibleItems(plan, state);
  return {
    next90Days: v.next90Days.length,
    next12Months: v.next12Months.length,
    next3to5Years: v.next3to5Years.length,
    total: v.next90Days.length + v.next12Months.length + v.next3to5Years.length,
    top: v.next90Days[0] ?? v.next12Months[0] ?? null,
  };
}
