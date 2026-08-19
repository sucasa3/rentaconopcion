import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useHomeIntel } from "@/hooks/use-home-intel";
import {
  getMyComponentServiceLog,
  logComponentService,
} from "@/lib/home-maintenance.functions";
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Clock,
  CheckSquare,
  RotateCw,
  HeartPulse,
} from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { buildMaintenanceTimeline, type TimelineItem } from "@/lib/maintenance-rules";
import { toCategorySlug } from "@/lib/mock-data";
import { buildSeasonalTasks, SEASONAL_PREFIX } from "@/lib/seasonal-tasks";
import { NextStepCard } from "@/components/next-step-card";
import { MarkComponentDoneDialog } from "@/components/mark-component-done-dialog";
import { SectionHero, type HeroChip, type HeroTone } from "@/components/section-hero";
import { listInspectionFindings } from "@/lib/inspection.functions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type Tab = "systems" | "seasonal";

export function HomeCarePanel({
  onGoToDocuments,
}: {
  onGoToDocuments?: () => void;
}) {
  const fetchLog = useServerFn(getMyComponentServiceLog);
  const logService = useServerFn(logComponentService);
  const fetchFindings = useServerFn(listInspectionFindings);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [markItem, setMarkItem] = useState<TimelineItem | null>(null);
  const [tab, setTab] = useState<Tab>("systems");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const { intel: okIntel, isLoading } = useHomeIntel();

  const { data: findings } = useQuery({
    queryKey: ["inspection-findings"],
    queryFn: () => fetchFindings({ data: {} }),
    staleTime: 5 * 60_000,
  });




  const { data: serviceLog } = useQuery({
    queryKey: ["component-service-log"],
    queryFn: () => fetchLog(undefined),
    staleTime: 60_000,
  });

  const seasonal = buildSeasonalTasks(serviceLog ?? []);

  async function completeSeasonal(key: string) {
    setSavingKey(key);
    const res = await logService({
      data: {
        componentKey: `${SEASONAL_PREFIX}${key}`,
        action: "serviced",
        servicedOn: new Date().toISOString().slice(0, 10),
      },
    });
    setSavingKey(null);
    if (res.ok) {
      toast.success("Logged — that lifts your Home Score");
      qc.invalidateQueries({ queryKey: ["component-service-log"] });
    } else {
      toast.error(res.error ?? "Could not save that");
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <p className="text-sm text-muted-foreground">Loading your home care plan…</p>
      </div>
    );
  }

  const ok = okIntel;
  const yearBuilt = ok?.detail?.yearBuilt ?? null;
  const permitEvents = ok?.permits?.events ?? [];
  const hasSystems = !!yearBuilt || permitEvents.length > 0;

  const items: TimelineItem[] = hasSystems
    ? buildMaintenanceTimeline(yearBuilt, permitEvents, new Date(), serviceLog ?? [])
    : [];

  const overdue = items.filter((i) => i.status === "overdue");
  const dueSoon = items.filter((i) => i.status === "due_soon");
  const nextStep = overdue[0] ?? dueSoon[0] ?? null;
  const seasonalDue = seasonal.filter((s) => s.due).length;

  const findingCount = (findings ?? []).length;
  const urgentFindings = (findings ?? []).filter(
    (f: any) => f.urgency === "immediate" || f.urgency === "12_months",
  ).length;

  const chips: HeroChip[] = [];
  if (overdue.length > 0) chips.push({ label: `${overdue.length} overdue`, tone: "urgent" });
  if (dueSoon.length > 0) chips.push({ label: `${dueSoon.length} due soon`, tone: "warn" });
  if (seasonalDue > 0) chips.push({ label: `${seasonalDue} routine task${seasonalDue === 1 ? "" : "s"} due`, tone: "warn" });
  if (chips.length === 0 && hasSystems) chips.push({ label: "Nothing needs attention", tone: "good" });

  const tone: HeroTone = !hasSystems
    ? "setup"
    : overdue.length > 0
      ? "urgent"
      : dueSoon.length > 0 || seasonalDue > 0
        ? "opportunity"
        : "calm";

  const status = !hasSystems
    ? "We don't know enough about your home yet to project anything."
    : nextStep
      ? `Start with your ${nextStep.label.toLowerCase()} — that's the one we'd handle first.`
      : seasonalDue > 0
        ? "Your big systems look fine. A couple of routine tasks are due."
        : "You're up to date. We'll tell you the moment something changes.";

  return (
    <div className="space-y-4">
      <SectionHero
        icon={HeartPulse}
        eyebrow="Home care"
        title="Keep your home healthy"
        subtitle="We estimate when your roof, HVAC, water heater and other systems need attention — and remind you before they fail."
        status={status}
        chips={chips}
        tone={tone}
        actionLabel={!hasSystems ? "Add home details" : nextStep ? "Handle this now" : undefined}
        onAction={
          !hasSystems
            ? () => navigate({ to: "/onboarding" })
            : nextStep
              ? () => setMarkItem(nextStep)
              : undefined
        }
        connectNote={
          findingCount > 0
            ? `Your inspection report added ${findingCount} condition note${findingCount === 1 ? "" : "s"}${
                urgentFindings > 0 ? ` — ${urgentFindings} need attention soon` : ""
              }. Every document you upload makes this plan sharper.`
            : "Documents feed this plan: upload an inspection report and we turn it into real condition notes instead of estimates."
        }
        connectLabel={onGoToDocuments ? "Go to Documents" : undefined}
        onConnect={onGoToDocuments}
      />

      <div className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
        {nextStep && <NextStepCard item={nextStep} onMarkDone={() => setMarkItem(nextStep)} />}

        <div className="inline-flex rounded-full border border-border p-1 text-xs">
          <button
            onClick={() => setTab("systems")}
            className={`rounded-full px-3 py-1.5 font-medium transition ${
              tab === "systems" ? "bg-secondary text-foreground" : "text-muted-foreground"
            }`}
          >
            Big systems{items.length > 0 ? ` (${items.length})` : ""}
          </button>
          <button
            onClick={() => setTab("seasonal")}
            className={`rounded-full px-3 py-1.5 font-medium transition ${
              tab === "seasonal" ? "bg-secondary text-foreground" : "text-muted-foreground"
            }`}
          >
            Routine upkeep{seasonalDue > 0 ? ` (${seasonalDue})` : ""}
          </button>
        </div>

        {tab === "systems" ? (
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Estimated from your home's age
            {permitEvents.length > 0 ? " and the permits on file" : ""} — not from an inspection.
            Marking something done replaces the estimate with the real date.
          </p>
        ) : (
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Small, recurring jobs every home needs. Logging them keeps your Home Score climbing.
          </p>
        )}


      {tab === "systems" ? (
        hasSystems ? (
          <>
            <ul className="mt-3 divide-y divide-border rounded-2xl border border-border">
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
                        <span className="hidden sm:inline">
                          {" "}
                          · Expected end of life {item.expectedYear}
                        </span>
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
                        search={{ category: toCategorySlug(item.category ?? item.label) }}
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
              Estimates use standard component lifespans. Marked something done? Add the year and
              we'll reset the clock — permits aren't always pulled.
            </p>
          </>
        ) : (
          <p className="mt-3 rounded-2xl border border-border p-4 text-sm text-muted-foreground">
            Add your home details so we can project when your roof, HVAC, water heater and other
            systems are due — and suggest your next step.
          </p>
        )
      ) : (
        <>
          <ul className="mt-3 divide-y divide-border rounded-2xl border border-border">
            {seasonal.map((t) => (
              <li key={t.key} className="flex items-start justify-between gap-3 p-3 sm:p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                      t.due ? "bg-accent text-accent-foreground" : "bg-growth/10 text-growth"
                    }`}
                  >
                    {t.due ? <RotateCw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                      {t.hint}{" "}
                      <span className="whitespace-nowrap">
                        · Every {t.everyMonths} mo
                        {t.lastDone ? ` · last done ${t.lastDone}` : " · never logged"}
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  disabled={savingKey === t.key}
                  onClick={() => completeSeasonal(t.key)}
                  className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium hover:bg-secondary disabled:opacity-50"
                >
                  {savingKey === t.key ? "Saving…" : t.due ? "Mark done" : "Log again"}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Routine upkeep counts toward the record-completeness part of your Home Score.
          </p>
        </>
      )}
      </div>

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
