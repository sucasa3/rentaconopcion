/**
 * Light recurring home-care tasks — the things a lifespan timeline doesn't cover.
 * Completions are stored in the same home_component_service_log table using a
 * `seasonal:<key>` component key, so they never collide with system lifespans.
 */

export const SEASONAL_PREFIX = "seasonal:";

export type SeasonalTaskRule = {
  key: string;
  label: string;
  hint: string;
  everyMonths: number;
  category: string;
};

export const SEASONAL_TASKS: SeasonalTaskRule[] = [
  {
    key: "hvac_filter",
    label: "Replace HVAC filter",
    hint: "Keeps airflow strong and cuts strain on the system.",
    everyMonths: 3,
    category: "HVAC",
  },
  {
    key: "gutters",
    label: "Clean gutters & downspouts",
    hint: "Prevents overflow that damages roof edges and foundations.",
    everyMonths: 6,
    category: "Roofing",
  },
  {
    key: "water_heater_flush",
    label: "Flush the water heater",
    hint: "Clears sediment so the tank lasts closer to its full life.",
    everyMonths: 12,
    category: "Plumbing",
  },
  {
    key: "dryer_vent",
    label: "Clear the dryer vent",
    hint: "A blocked vent is a common and preventable fire risk.",
    everyMonths: 12,
    category: "Handyman",
  },
  {
    key: "smoke_detectors",
    label: "Test smoke & CO detectors",
    hint: "Swap batteries and confirm every alarm sounds.",
    everyMonths: 6,
    category: "Electrical",
  },
  {
    key: "exterior_caulk",
    label: "Check exterior caulk & seals",
    hint: "Sealing gaps around windows and doors lowers energy loss.",
    everyMonths: 12,
    category: "Exterior",
  },
];

export type SeasonalTaskState = SeasonalTaskRule & {
  lastDone: string | null;
  monthsSince: number | null;
  due: boolean;
};

export type SeasonalLogLike = {
  componentKey: string;
  servicedOn?: string | null;
  createdAt?: string | null;
};

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

export function buildSeasonalTasks(
  log: SeasonalLogLike[] = [],
  now: Date = new Date(),
): SeasonalTaskState[] {
  return SEASONAL_TASKS.map((rule) => {
    const entries = log
      .filter((l) => l.componentKey === `${SEASONAL_PREFIX}${rule.key}`)
      .map((l) => l.servicedOn ?? l.createdAt ?? null)
      .filter((d): d is string => !!d)
      .sort((a, b) => b.localeCompare(a));

    const lastDone = entries[0] ?? null;
    const monthsSince = lastDone ? monthsBetween(new Date(lastDone), now) : null;
    return {
      ...rule,
      lastDone,
      monthsSince,
      due: monthsSince == null || monthsSince >= rule.everyMonths,
    };
  }).sort((a, b) => Number(b.due) - Number(a.due));
}
