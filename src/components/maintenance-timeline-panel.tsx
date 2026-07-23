import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyHomeIntel } from "@/lib/property-intel.functions";
import { Wrench, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Link } from "@tanstack/react-router";

/**
 * Standard component lifespans (years). Used to project the next service due
 * date off of `year_built` + any relevant permit that reset the clock.
 */
const LIFESPANS: Array<{
  key: string;
  label: string;
  years: number;
  permitMatch: RegExp;
  category: string;
}> = [
  { key: "roof", label: "Roof", years: 25, permitMatch: /roof/i, category: "Roofing" },
  { key: "hvac", label: "HVAC system", years: 15, permitMatch: /hvac|furnace|a\/?c|heating|cooling/i, category: "HVAC" },
  { key: "water_heater", label: "Water heater", years: 10, permitMatch: /water heater|hot water/i, category: "Plumbing" },
  { key: "windows", label: "Windows", years: 25, permitMatch: /window/i, category: "Windows" },
  { key: "electrical", label: "Electrical panel", years: 30, permitMatch: /electric|panel|service upgrade/i, category: "Electrical" },
  { key: "siding", label: "Exterior siding/paint", years: 12, permitMatch: /siding|stucco|paint/i, category: "Exterior" },
];

type TimelineItem = {
  key: string;
  label: string;
  category: string;
  installedYear: number;
  expectedYear: number;
  yearsLeft: number;
  source: "permit" | "year_built";
  status: "overdue" | "due_soon" | "healthy";
};

function classify(yearsLeft: number): TimelineItem["status"] {
  if (yearsLeft < 0) return "overdue";
  if (yearsLeft <= 2) return "due_soon";
  return "healthy";
}

export function MaintenanceTimelinePanel() {
  const fetchIntel = useServerFn(getMyHomeIntel);
  const { data, isLoading } = useQuery({
    queryKey: ["home-intel-maintenance"],
    queryFn: () =>
      fetchIntel({
        data: {
          classes: ["detail", "permits"],
          revenueSource: "dashboard_maintenance",
        },
      }),
    staleTime: 30 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <p className="text-sm text-muted-foreground">Loading maintenance timeline…</p>
      </div>
    );
  }
  if (!data?.ok) return null;

  const yearBuilt = data.detail?.yearBuilt ?? null;
  const permitEvents = data.permits?.events ?? [];
  if (!yearBuilt && permitEvents.length === 0) return null;

  const nowYear = new Date().getFullYear();
  const items: TimelineItem[] = LIFESPANS.map((cfg) => {
    // Find most recent permit that matches this system
    const match = permitEvents
      .filter((p) => p.description && cfg.permitMatch.test(p.description))
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];
    const installedYear = match?.date
      ? new Date(match.date).getFullYear()
      : (yearBuilt ?? nowYear - 20);
    const expectedYear = installedYear + cfg.years;
    const yearsLeft = expectedYear - nowYear;
    return {
      key: cfg.key,
      label: cfg.label,
      category: cfg.category,
      installedYear,
      expectedYear,
      yearsLeft,
      source: match ? "permit" : "year_built",
      status: classify(yearsLeft),
    };
  }).sort((a, b) => a.yearsLeft - b.yearsLeft);

  const overdue = items.filter((i) => i.status === "overdue");
  const dueSoon = items.filter((i) => i.status === "due_soon");

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Maintenance timeline</h2>
          <p className="text-xs text-muted-foreground">
            Projected from home age
            {permitEvents.length > 0 ? " and permits on file" : ""}.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          {overdue.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 font-semibold text-destructive">
              <AlertTriangle className="h-3 w-3" /> {overdue.length} overdue
            </span>
          )}
          {dueSoon.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 font-semibold text-accent-foreground">
              <Clock className="h-3 w-3" /> {dueSoon.length} due soon
            </span>
          )}
        </div>
      </div>

      <ul className="mt-4 divide-y divide-border rounded-2xl border border-border">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-3 p-4">
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                item.status === "overdue"
                  ? "bg-destructive/10 text-destructive"
                  : item.status === "due_soon"
                    ? "bg-accent text-accent-foreground"
                    : "bg-growth/10 text-growth"
              }`}
            >
              {item.status === "overdue" ? (
                <AlertTriangle className="h-4 w-4" />
              ) : item.status === "due_soon" ? (
                <Wrench className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{item.label}</p>
                <p className="shrink-0 text-xs text-muted-foreground">
                  {item.status === "overdue"
                    ? `${Math.abs(item.yearsLeft)} yr overdue`
                    : item.status === "due_soon"
                      ? `~${item.yearsLeft} yr left`
                      : `~${item.yearsLeft} yr left`}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {item.source === "permit"
                  ? `Installed ${item.installedYear} (permit)`
                  : `Est. from year built ${item.installedYear}`}{" "}
                · Expected end of life {item.expectedYear}
              </p>
            </div>
            {(item.status === "overdue" || item.status === "due_soon") && (
              <Link
                to="/request"
                className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium hover:bg-secondary"
              >
                Get quotes
              </Link>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Estimates use standard component lifespans. Log a service to reset the clock.
      </p>
    </div>
  );
}
