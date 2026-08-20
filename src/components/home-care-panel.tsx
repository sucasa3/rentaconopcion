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
import { useT, type TranslationKey } from "@/lib/i18n";

/** Component/task labels live in the dictionary so the list reads in one language. */
const SYSTEM_KEYS = ["roof", "hvac", "water_heater", "windows", "electrical", "siding"] as const;
const SEASONAL_KEYS = [
  "hvac_filter",
  "gutters",
  "water_heater_flush",
  "dryer_vent",
  "smoke_detectors",
  "exterior_caulk",
] as const;

function systemLabelKey(key: string): TranslationKey | null {
  return (SYSTEM_KEYS as readonly string[]).includes(key)
    ? (`care.system.${key}` as TranslationKey)
    : null;
}
function seasonalKey(key: string, part: "label" | "hint"): TranslationKey | null {
  return (SEASONAL_KEYS as readonly string[]).includes(key)
    ? (`care.seasonal.${key}.${part}` as TranslationKey)
    : null;
}

export function HomeCarePanel({
  onGoToDocuments,
}: {
  onGoToDocuments?: () => void;
}) {
  const t = useT();
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
      toast.success(t("care.toast.logged"));
      qc.invalidateQueries({ queryKey: ["component-service-log"] });
    } else {
      toast.error(res.error ?? t("care.toast.error"));
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <p className="text-sm text-muted-foreground">{t("care.loading")}</p>
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

  const systemRows: CareRow[] = items.map((item) => {
    const labelKey = systemLabelKey(item.key);
    return {
      key: `sys-${item.key}`,
      kind: "system",
      label: labelKey ? t(labelKey) : item.label,
      detail:
        item.status === "overdue"
          ? t("care.detail.overdue", { year: item.installedYear })
          : item.status === "due_soon"
            ? t("care.detail.due_soon", { year: item.installedYear })
            : t("care.detail.ok", { year: item.installedYear }),
      timing:
        item.status === "overdue"
          ? t("care.timing.late")
          : item.status === "due_soon"
            ? t("care.timing.soon")
            : t("care.timing.years_left", { years: item.yearsLeft }),
      status:
        item.status === "overdue" ? "overdue" : item.status === "due_soon" ? "due_soon" : "ok",
      item,
    };
  });

  const routineRows: CareRow[] = seasonal.map((task) => {
    const lk = seasonalKey(task.key, "label");
    const hk = seasonalKey(task.key, "hint");
    const hint = hk ? t(hk) : task.hint;
    return {
      key: `seasonal-${task.key}`,
      kind: "routine",
      label: lk ? t(lk) : task.label,
      detail: task.due
        ? t("care.routine.due", { hint, months: task.everyMonths })
        : task.lastDone
          ? t("care.routine.done_on", { hint, date: task.lastDone })
          : t("care.routine.done_recently", { hint }),
      timing: task.due ? t("care.timing.soon") : t("care.legend.ok"),
      status: task.due ? "due_soon" : "ok",
      taskKey: task.key,
    };
  });

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
    ? t("care.status.setup")
    : lateCount > 0
      ? soonCount > 0
        ? t(lateCount === 1 ? "care.status.late_one_soon" : "care.status.late_many_soon", {
            count: lateCount,
            soon: soonCount,
          })
        : t(lateCount === 1 ? "care.status.late_one" : "care.status.late_many", {
            count: lateCount,
          })
      : soonCount > 0
        ? t(soonCount === 1 ? "care.status.soon_one" : "care.status.soon_many", {
            count: soonCount,
          })
        : t("care.status.all_good");

  const connectNote =
    findingCount > 0
      ? urgentFindings > 0
        ? t(
            findingCount === 1
              ? "care.connect.findings_one_urgent"
              : "care.connect.findings_many_urgent",
            { count: findingCount, urgent: urgentFindings },
          )
        : t(findingCount === 1 ? "care.connect.findings_one" : "care.connect.findings_many", {
            count: findingCount,
          })
      : t("care.connect.none");

  return (
    <div className="space-y-4">
      <SectionHero
        plain
        icon={HeartPulse}
        eyebrow={t("care.hero.eyebrow")}
        title={t("care.hero.title")}
        subtitle={t("care.hero.subtitle")}
        status={status}
        tone={tone}
        actionLabel={
          !hasSystems
            ? t("care.action.add_details")
            : nextStep
              ? t("care.action.start")
              : undefined
        }
        onAction={
          !hasSystems
            ? () => navigate({ to: "/onboarding" })
            : nextStep
              ? () => setMarkItem(nextStep)
              : undefined
        }
        connectNote={connectNote}
        connectLabel={onGoToDocuments ? t("care.connect.label") : undefined}
        onConnect={onGoToDocuments}
      />

      <div className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
        {nextStep && <NextStepCard item={nextStep} onMarkDone={() => setMarkItem(nextStep)} />}

        {rows.length === 0 ? (
          <p className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">
            {t("care.empty")}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive" /> {t("care.legend.late")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-accent-foreground/70" />{" "}
                {t("care.legend.soon")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-growth" /> {t("care.legend.ok")}
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
                        {row.kind === "system" ? t("care.kind.system") : t("care.kind.routine")} ·{" "}
                        {row.timing}
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
                          {row.item.source === "logged"
                            ? t("care.btn.update")
                            : t("care.btn.did_it")}
                        </button>
                        {(row.status === "overdue" || row.status === "due_soon") && (
                          <Link
                            to="/request"
                            search={{
                              category: toCategorySlug(row.item.category ?? row.item.label),
                            }}
                            className="inline-flex min-h-[44px] items-center rounded-full gradient-brand px-4 text-sm font-semibold text-white"
                          >
                            {t("care.btn.get_help")}
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
                          ? t("common.saving")
                          : row.status === "ok"
                            ? t("care.btn.did_again")
                            : t("care.btn.did_it")}
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
                {showAll ? t("care.btn.show_less") : t("care.btn.see_all", { count: rows.length })}
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
