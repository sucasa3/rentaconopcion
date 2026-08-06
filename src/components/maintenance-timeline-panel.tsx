import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getMyHomeIntel } from "@/lib/property-intel.functions";
import { getMyComponentServiceLog } from "@/lib/home-maintenance.functions";
import { Wrench, AlertTriangle, CheckCircle2, Clock, CheckSquare, TrendingUp } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  buildMaintenanceTimeline,
  type TimelineItem,
} from "@/lib/maintenance-rules";
import { NextStepCard } from "@/components/next-step-card";
import { MarkComponentDoneDialog } from "@/components/mark-component-done-dialog";

export function MaintenanceTimelinePanel() {
  const fetchIntel = useServerFn(getMyHomeIntel);
  const fetchLog = useServerFn(getMyComponentServiceLog);
  const [markItem, setMarkItem] = useState<TimelineItem | null>(null);

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

  const { data: serviceLog } = useQuery({
    queryKey: ["component-service-log"],
    queryFn: () => fetchLog(undefined),
    staleTime: 60_000,
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
  if (!yearBuilt && permitEvents.length === 0) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <h2 className="text-base font-semibold">Maintenance timeline</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add your home details so we can project when your roof, HVAC, water heater and other
          systems are due — and suggest your next step.
        </p>
      </div>
    );
  }

  const items: TimelineItem[] = buildMaintenanceTimeline(
    yearBuilt,
    permitEvents,
    new Date(),
    serviceLog ?? [],
  );

  const overdue = items.filter((i) => i.status === "overdue");
  const dueSoon = items.filter((i) => i.status === "due_soon");
  const nextStep = overdue[0] ?? dueSoon[0] ?? null;


  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Maintenance timeline</h2>
          <p className="text-xs text-muted-foreground">
            Projected from home age
            {permitEvents.length > 0 ? " and permits on file" : ""}.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 text-[11px]">
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

      <div className="mt-3 flex items-start gap-2 rounded-2xl border border-border bg-secondary/50 p-3">
        <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-growth" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Every item you fix or log lifts your Home Score.</span>{" "}
          Take care of something overdue, or tell us the year a system was replaced, and we recalculate
          right away — the more we know, the more accurate your score and recommendations get.
        </p>
      </div>

      {nextStep && <NextStepCard item={nextStep} onMarkDone={() => setMarkItem(nextStep)} />}

      <ul className="mt-4 divide-y divide-border rounded-2xl border border-border">
        {items.map((item) => (
          <li key={item.key} className="p-3 sm:p-4">
            <div className="flex items-start gap-3">
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
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2">
                  <p className="truncate text-sm font-medium">{item.label}</p>
                  <p
                    className={`shrink-0 text-xs font-medium ${
                      item.status === "overdue" ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {item.status === "overdue"
                      ? `${Math.abs(item.yearsLeft)} yr overdue`
                      : `~${item.yearsLeft} yr left`}
                  </p>
                </div>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  {item.source === "logged"
                    ? `You logged ${item.installedYear}${item.loggedDetail ? ` · ${item.loggedDetail}` : ""}`
                    : item.source === "permit"
                      ? `Installed ${item.installedYear} (permit)`
                      : `Est. from year built ${item.installedYear}`}
                  <span className="hidden sm:inline"> · Expected end of life {item.expectedYear}</span>
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-12">
              <button
                onClick={() => setMarkItem(item)}
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium hover:bg-secondary"
              >
                <CheckSquare className="h-3 w-3" />
                {item.source === "logged" ? "Update" : "Mark done"}
              </button>
              {(item.status === "overdue" || item.status === "due_soon") && (
                <Link
                  to="/request"
                  className="rounded-full border border-border px-3 py-1.5 text-[11px] font-medium hover:bg-secondary"
                >
                  Get quotes
                </Link>
              )}
            </div>
          </li>

        ))}
      </ul>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Estimates use standard component lifespans. Marked something done? Add the year and we'll
        reset the clock — permits aren't always pulled.
      </p>


      {markItem && (
        <MarkComponentDoneDialog
          item={markItem}
          open={!!markItem}
          onOpenChange={(o) => !o && setMarkItem(null)}
        />
      )}
    </div>

  );
}
