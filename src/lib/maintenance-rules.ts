/**
 * Shared component-lifespan rules.
 *
 * Used by the homeowner maintenance timeline and by the agent "Recommendations
 * due" feed so both surfaces compute identical projections from the same
 * property-record inputs (year built + permit history).
 */

export type PermitLike = {
  date: string | null;
  type?: string | null;
  description?: string | null;
  value?: number | null;
  status?: string | null;
};

export type LifespanRule = {
  key: string;
  label: string;
  years: number;
  permitMatch: RegExp;
  category: string;
};

export const LIFESPANS: LifespanRule[] = [
  { key: "roof", label: "Roof", years: 25, permitMatch: /roof/i, category: "Roofing" },
  {
    key: "hvac",
    label: "HVAC system",
    years: 15,
    permitMatch: /hvac|furnace|a\/?c\b|heating|cooling|mechanical/i,
    category: "HVAC",
  },
  {
    key: "water_heater",
    label: "Water heater",
    years: 10,
    permitMatch: /water heater|hot water/i,
    category: "Plumbing",
  },
  { key: "windows", label: "Windows", years: 25, permitMatch: /window/i, category: "Windows" },
  {
    key: "electrical",
    label: "Electrical panel",
    years: 30,
    permitMatch: /electric|panel|service upgrade/i,
    category: "Electrical",
  },
  {
    key: "siding",
    label: "Exterior siding/paint",
    years: 12,
    permitMatch: /siding|stucco|paint/i,
    category: "Exterior",
  },
];

export type TimelineItem = {
  key: string;
  label: string;
  category: string;
  installedYear: number;
  expectedYear: number;
  yearsLeft: number;
  source: "permit" | "year_built" | "logged";
  status: "overdue" | "due_soon" | "healthy";
  logId?: string | null;
  loggedDetail?: string | null;
};

/** Homeowner-entered service records, keyed by component. */
export type ServiceLogLike = {
  id?: string;
  componentKey: string;
  action?: "replaced" | "serviced" | string;
  installedYear?: number | null;
  servicedOn?: string | null;
  brand?: string | null;
  model?: string | null;
  warrantyYears?: number | null;
};

export function classifyLifespan(yearsLeft: number): TimelineItem["status"] {
  if (yearsLeft < 0) return "overdue";
  if (yearsLeft <= 2) return "due_soon";
  return "healthy";
}

/** Project every tracked component off year built + permits that reset the clock. */
export function buildMaintenanceTimeline(
  yearBuilt: number | null,
  permitEvents: PermitLike[],
  now: Date = new Date(),
  serviceLog: ServiceLogLike[] = [],
): TimelineItem[] {
  const nowYear = now.getFullYear();
  return LIFESPANS.map((cfg) => {
    const haystack = (p: PermitLike) => `${p.description ?? ""} ${p.type ?? ""}`;
    const match = permitEvents
      .filter((p) => cfg.permitMatch.test(haystack(p)))
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];

    // A homeowner-logged replacement/service is the most authoritative signal.
    const logged = serviceLog
      .filter((l) => l.componentKey === cfg.key)
      .map((l) => ({
        ...l,
        year:
          l.installedYear ?? (l.servicedOn ? new Date(l.servicedOn).getFullYear() : null),
      }))
      .filter((l) => l.year != null)
      .sort((a, b) => (b.year as number) - (a.year as number))[0];

    const permitYear = match?.date ? new Date(match.date).getFullYear() : null;
    const installedYear =
      logged?.year ?? permitYear ?? (yearBuilt ?? nowYear - 20);
    const source: TimelineItem["source"] = logged
      ? "logged"
      : match
        ? "permit"
        : "year_built";
    const expectedYear = installedYear + cfg.years;
    const yearsLeft = expectedYear - nowYear;
    return {
      key: cfg.key,
      label: cfg.label,
      category: cfg.category,
      installedYear,
      expectedYear,
      yearsLeft,
      source,
      status: classifyLifespan(yearsLeft),
      logId: logged?.id ?? null,
      loggedDetail: logged
        ? [logged.brand, logged.model].filter(Boolean).join(" ") || null
        : null,
    };
  }).sort((a, b) => a.yearsLeft - b.yearsLeft);
}


export type HomeNeed = {
  id: string;
  source: "inspection" | "property_records" | "recent_permit";
  system: string;
  urgency: "high" | "medium" | "low";
  condition: string | null;
  recommended_action: string;
  recommended_category: string | null;
  created_at: string | null;
};

/** Overdue / due-soon components turned into agent-facing recommendations. */
export function needsFromTimeline(items: TimelineItem[], clientId: string): HomeNeed[] {
  return items
    .filter((i) => i.status === "overdue" || i.status === "due_soon")
    .map((i) => ({
      id: `${clientId}:${i.key}`,
      source: "property_records" as const,
      system: i.label,
      urgency: i.status === "overdue" ? ("high" as const) : ("medium" as const),
      condition: i.status === "overdue" ? "Past expected life" : "Nearing end of life",
      recommended_action:
        i.status === "overdue"
          ? `${i.label} ${i.source === "permit" ? `installed ${i.installedYear} (permit)` : `estimated from year built ${i.installedYear}`}, past its ${
              i.expectedYear - i.installedYear
            }-year life — worth a ${i.category.toLowerCase()} check.`
          : `${i.label} reaches end of expected life around ${i.expectedYear} — good time to plan ${i.category.toLowerCase()} work.`,
      recommended_category: i.category,
      created_at: null,
    }));
}

const IMPROVEMENT_MATCH = /addition|remodel|renovat|kitchen|bath|pool|deck|finish/i;

/** Permits pulled recently — a pre-listing "recently improved" signal. */
export function recentImprovementNeeds(
  permitEvents: PermitLike[],
  clientId: string,
  monthsBack = 18,
  now: Date = new Date(),
): HomeNeed[] {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - monthsBack);
  return permitEvents
    .filter((p) => {
      if (!p.date) return false;
      if (new Date(p.date) < cutoff) return false;
      return IMPROVEMENT_MATCH.test(`${p.description ?? ""} ${p.type ?? ""}`);
    })
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 2)
    .map((p, idx) => ({
      id: `${clientId}:permit:${idx}`,
      source: "recent_permit" as const,
      system: "Recent improvement",
      urgency: "low" as const,
      condition: p.status ?? null,
      recommended_action: `${(p.description ?? p.type ?? "Permit").trim()}${
        p.value ? ` (~$${Math.round(p.value).toLocaleString()})` : ""
      } pulled ${p.date?.slice(0, 7)} — worth a value-add conversation.`,
      recommended_category: null,
      created_at: p.date,
    }));
}
