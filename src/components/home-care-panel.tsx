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
import { SectionHero, type HeroTone } from "@/components/section-hero";
import { listInspectionFindings } from "@/lib/inspection.functions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";


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
  const [showAll, setShowAll] = useState(false);
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

  type CareRow = {
    key: string;
    kind: "system" | "routine";
    label: string;
    detail: string;
    timing: string;
    status: "overdue" | "due_soon" | "ok";
    item?: TimelineItem;
    taskKey?: string;
  };

  const systemRows: CareRow[] = items.map((item) => ({
    key: `sys-${item.key}`,
    kind: "system",
    label: item.label,
    detail:
      item.status === "overdue"
        ? `Put in around ${item.installedYear}. That's older than most last, so plan for it.`
        : item.status === "due_soon"
          ? `Put in around ${item.installedYear}. It's getting close to the end of its life.`
          : `Put in around ${item.installedYear}. Looking fine for now.`,
    timing:
      item.status === "overdue"
        ? "Late"
        : item.status === "due_soon"
          ? "Coming up"
          : `About ${item.yearsLeft} years left`,
    status: item.status === "overdue" ? "overdue" : item.status === "due_soon" ? "due_soon" : "ok",
    item,
  }));

  const routineRows: CareRow[] = seasonal.map((t) => ({
    key: `seasonal-${t.key}`,
    kind: "routine",
    label: t.label,
    detail: t.due
      ? `${t.hint} Do this about every ${t.everyMonths} months.`
      : `${t.hint} You did this${t.lastDone ? ` on ${t.lastDone}` : " recently"} — nothing to do yet.`,
    timing: t.due ? "Coming up" : "All good",
    status: t.due ? "due_soon" : "ok",
    taskKey: t.key,
  }));

  const RANK: Record<string, number> = { overdue: 0, due_soon: 1, ok: 2 };
  const rows: CareRow[] = [...systemRows, ...routineRows].sort((a, b) => {
    const r = RANK[a.status] - RANK[b.status];
    if (r !== 0) return r;
    // Within the same urgency, big systems come before routine upkeep.
    return (a.kind === "system" ? 0 : 1) - (b.kind === "system" ? 0 : 1);
  });

  const attentionCount = rows.filter((r) => r.status !== "ok").length;
  // Keep the screen calm: what needs you, plus one healthy item for reassurance.
  const defaultVisible = Math.max(attentionCount + 1, 4);

  const visibleRows = showAll ? rows : rows.slice(0, defaultVisible);
  const hiddenCount = rows.length - visibleRows.length;

  const lateCount = rows.filter((r) => r.status === "overdue").length;
  const soonCount = rows.filter((r) => r.status === "due_soon").length;

  const tone: HeroTone = !hasSystems
    ? "setup"
    : lateCount > 0
      ? "urgent"
      : soonCount > 0
        ? "opportunity"
        : "calm";

  const status = !hasSystems
    ? "Tell us a little about your home and we'll build your to-do list."
    : lateCount > 0
      ? `${lateCount} thing${lateCount === 1 ? " is" : "s are"} late${soonCount > 0 ? `, and ${soonCount} ${soonCount === 1 ? "is" : "are"} coming up` : ""}.`
      : soonCount > 0
        ? `Nothing is late. ${soonCount} thing${soonCount === 1 ? " is" : "s are"} coming up.`
        : "Everything looks good today. We'll tell you when that changes.";

  return (
    <div className="space-y-4">
      <SectionHero
        plain
        icon={HeartPulse}
        eyebrow="Home care"
        title="Take care of this"
        subtitle="The things your home needs, biggest first."
        status={status}
        tone={tone}
        actionLabel={!hasSystems ? "Add home details" : nextStep ? "Start with this one" : undefined}
        onAction={
          !hasSystems
            ? () => navigate({ to: "/onboarding" })
            : nextStep
              ? () => setMarkItem(nextStep)
              : undefined
        }
        connectNote={
          findingCount > 0
            ? `Your inspection report added ${findingCount} note${findingCount === 1 ? "" : "s"} to this list${
                urgentFindings > 0 ? ` — ${urgentFindings} need attention soon` : ""
              }.`
            : "Upload an inspection report and this list gets a lot smarter."
        }
        connectLabel={onGoToDocuments ? "Go to Documents" : undefined}
        onConnect={onGoToDocuments}
      />

      <div className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
        {nextStep && <NextStepCard item={nextStep} onMarkDone={() => setMarkItem(nextStep)} />}

        {rows.length === 0 ? (
          <p className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">
            Add your home details and we'll tell you what needs doing — and when.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive" /> Late
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-accent-foreground/70" /> Coming up
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-growth" /> All good
              </span>
            </div>

            <ul className="mt-3 space-y-2.5">
              {visibleRows.map((row) => (
                <li
                  key={row.key}
                  className={`rounded-2xl border p-4 ${
                    row.status === "overdue"
                      ? "border-destructive/30 bg-destructive/5"
                      : row.status === "due_soon"
                        ? "border-border bg-accent/40"
                        : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${
                        row.status === "overdue"
                          ? "bg-destructive/10 text-destructive"
                          : row.status === "due_soon"
                            ? "bg-background text-foreground"
                            : "bg-growth/10 text-growth"
                      }`}
                    >
                      {row.status === "overdue" ? (
                        <AlertTriangle className="h-6 w-6" />
                      ) : row.status === "due_soon" ? (
                        row.kind === "system" ? (
                          <Wrench className="h-6 w-6" />
                        ) : (
                          <RotateCw className="h-6 w-6" />
                        )
                      ) : (
                        <CheckCircle2 className="h-6 w-6" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                            row.status === "overdue"
                              ? "bg-destructive"
                              : row.status === "due_soon"
                                ? "bg-accent-foreground/70"
                                : "bg-growth"
                          }`}
                          aria-hidden
                        />
                        <p className="truncate text-base font-semibold">{row.label}</p>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {row.detail}
                      </p>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">
                        {row.kind === "system" ? "Big stuff" : "Quick job"} · {row.timing}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {row.kind === "system" && row.item ? (
                      <>
                        <button
                          onClick={() => setMarkItem(row.item!)}
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border bg-background px-4 text-sm font-semibold hover:bg-secondary"
                        >
                          <CheckSquare className="h-4 w-4" />
                          {row.item.source === "logged" ? "Update this" : "I did this"}
                        </button>
                        {(row.status === "overdue" || row.status === "due_soon") && (
                          <Link
                            to="/request"
                            search={{
                              category: toCategorySlug(row.item.category ?? row.item.label),
                            }}
                            className="inline-flex min-h-[44px] items-center rounded-full gradient-brand px-4 text-sm font-semibold text-white"
                          >
                            Get help
                          </Link>
                        )}
                      </>
                    ) : (
                      <button
                        disabled={savingKey === row.taskKey}
                        onClick={() => completeSeasonal(row.taskKey!)}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border bg-background px-4 text-sm font-semibold hover:bg-secondary disabled:opacity-50"
                      >
                        <CheckSquare className="h-4 w-4" />
                        {savingKey === row.taskKey
                          ? "Saving…"
                          : row.status === "ok"
                            ? "Did it again"
                            : "I did this"}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {hiddenCount > 0 && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className="mt-3 min-h-[48px] w-full rounded-2xl border border-border text-sm font-semibold hover:bg-secondary"
              >
                {showAll ? "Show less" : `See everything (${rows.length})`}
              </button>
            )}
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
