import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ChevronRight, Clock, Wrench, X } from "lucide-react";

import { StatusPill } from "@/components/ui-kit";
import { DiyGuideButton } from "@/components/diy-guide-dialog";
import { useHomeRecord } from "@/hooks/use-home-record";
import { getMyComponentServiceLog } from "@/lib/home-maintenance.functions";
import {
  getHomePlanCloud,
  saveHomePlan,
  setHomePlanItemState,
} from "@/lib/home-plan.functions";
import {
  buildHomePlan,
  formatCostBand,
  type PlanHorizon,
  type PlanItem,
} from "@/lib/home-plan";
import { toCategorySlug } from "@/lib/mock-data";
import { useLanguage, useT } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { hasGuide } from "@/lib/diy-guides";
import { cn } from "@/lib/utils";

const HORIZONS: {
  key: PlanHorizon;
  labelKey: "plan.h90" | "plan.h12" | "plan.h35";
  subKey: "plan.h90.sub" | "plan.h12.sub" | "plan.h35.sub";
}[] = [
  { key: "next90Days", labelKey: "plan.h90", subKey: "plan.h90.sub" },
  { key: "next12Months", labelKey: "plan.h12", subKey: "plan.h12.sub" },
  { key: "next3to5Years", labelKey: "plan.h35", subKey: "plan.h35.sub" },
];

function urgencyTone(urgency: PlanItem["urgency"]) {
  return urgency === "high" ? "attention" : urgency === "medium" ? "info" : "muted";
}

export function HomePlanSection() {
  const t = useT();
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  const [profileAddr, setProfileAddr] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("address, city, state, zip")
        .eq("id", u.user.id)
        .maybeSingle();
      if (p?.address) {
        setProfileAddr([p.address, p.city, p.state, p.zip].filter(Boolean).join(", "));
      }
    })();
  }, []);

  const { record } = useHomeRecord(profileAddr);

  const fetchLog = useServerFn(getMyComponentServiceLog);
  const { data: serviceLog } = useQuery({
    queryKey: ["component-service-log"],
    queryFn: () => fetchLog(undefined),
    staleTime: 60_000,
  });

  const fetchCloud = useServerFn(getHomePlanCloud);
  const { data: cloud } = useQuery({
    queryKey: ["home-plan-cloud"],
    queryFn: () => fetchCloud(undefined),
    staleTime: 60_000,
  });

  const plan = useMemo(
    () => (record ? buildHomePlan(record, new Date(), serviceLog ?? []) : null),
    [record, serviceLog],
  );

  const save = useServerFn(saveHomePlan);
  useEffect(() => {
    if (!plan || !record) return;
    if (cloud && cloud.sourceHash === plan.sourceHash && cloud.aiWhy) return;
    const all = [...plan.next90Days, ...plan.next12Months, ...plan.next3to5Years];
    if (all.length === 0) return;
    save({
      data: {
        sourceHash: plan.sourceHash,
        language,
        homeCity: record.property.address ?? null,
        yearBuilt: record.property.yearBuilt ?? null,
        items: all,
      },
    })
      .then(() => queryClient.invalidateQueries({ queryKey: ["home-plan-cloud"] }))
      .catch(() => {});
  }, [plan, record, cloud, language, save, queryClient]);

  const setState = useServerFn(setHomePlanItemState);
  const [localState, setLocalState] = useState<Record<string, "done" | "dismissed">>({});
  const state = { ...(cloud?.state ?? {}), ...localState };

  const act = (itemKey: string, s: "done" | "dismissed" | null) => {
    setLocalState((prev) => {
      const next = { ...prev };
      if (s === null) delete next[itemKey];
      else next[itemKey] = s;
      return next;
    });
    setState({ data: { itemKey, state: s } })
      .then(() => {
        if (s === "done") {
          toast.success(t("plan.done_toast"), { description: t("plan.done_toast_sub") });
        }
        return queryClient.invalidateQueries({ queryKey: ["home-plan-cloud"] });
      })
      .catch(() => {
        setLocalState((prev) => {
          const next = { ...prev };
          delete next[itemKey];
          return next;
        });
      });
  };

  const aiWhy = cloud?.aiWhy ?? {};

  const visible = plan
    ? {
        next90Days: plan.next90Days.filter((i) => !state[i.key]),
        next12Months: plan.next12Months.filter((i) => !state[i.key]),
        next3to5Years: plan.next3to5Years.filter((i) => !state[i.key]),
      }
    : null;

  const [expanded, setExpanded] = useState<Record<PlanHorizon, boolean>>({
    next90Days: true,
    next12Months: true,
    next3to5Years: false,
  });

  if (!visible) {
    return (
      <div className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  const totalCount =
    visible.next90Days.length + visible.next12Months.length + visible.next3to5Years.length;

  if (totalCount === 0) {
    return (
      <div className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Clock className="h-5 w-5 text-primary" />
          {t("plan.coming.label")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("plan.hero.none")}</p>
      </div>
    );
  }

  const renderItem = (item: PlanItem) => {
    const cost = formatCostBand(item.costBand);
    const slug = toCategorySlug(item.category ?? undefined);
    const why = aiWhy[item.key] ?? item.why;
    const showDiy = hasGuide(item.key);
    return (
      <div
        key={item.key}
        className="rounded-2xl border border-border bg-card p-4 shadow-soft"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-surface text-primary">
            <Wrench className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold leading-snug">{item.title}</p>
              <StatusPill tone={urgencyTone(item.urgency)}>
                {item.urgency === "high" ? "Soon" : item.urgency === "medium" ? "This year" : "Later"}
              </StatusPill>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{why}</p>
            {cost && (
              <p className="mt-2 text-xs font-semibold text-muted-foreground">
                <span className="uppercase tracking-wider">{t("plan.cost_label")}:</span>{" "}
                <span className="text-foreground">{cost}</span>
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {slug ? (
            <Link
              to="/request"
              search={{ category: slug, description: item.title } as never}
              className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft transition active:scale-[0.99]"
            >
              {t("plan.take_care")}
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-full bg-secondary px-4 text-sm font-semibold text-secondary-foreground">
              {item.category ?? t("plan.take_care")}
            </span>
          )}
          {showDiy && (
            <DiyGuideButton
              target={{ key: item.key, label: item.title, category: item.category }}
              variant="outline"
            />
          )}
          <button
            type="button"
            onClick={() => act(item.key, "done")}
            aria-label={t("plan.done")}
            className="grid h-10 w-10 place-items-center rounded-full border border-status-positive/40 bg-status-positive/10 text-status-positive transition active:scale-95"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => act(item.key, "dismissed")}
            aria-label={t("plan.dismiss")}
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-background text-muted-foreground transition active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Clock className="h-5 w-5 text-primary" />
        {t("plan.coming.label")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("plan.coming.sub")}</p>

      <div className="mt-4 space-y-4">
        {HORIZONS.map((h) => {
          const items = visible[h.key];
          const isExpanded = expanded[h.key];
          return (
            <div key={h.key} className="rounded-2xl border border-border bg-card overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setExpanded((prev) => ({ ...prev, [h.key]: !prev[h.key] }))
                }
                className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-secondary/50 transition"
                aria-expanded={isExpanded}
              >
                <div>
                  <h3 className="font-semibold">{t(h.labelKey)}</h3>
                  <p className="text-xs text-muted-foreground">{t(h.subKey)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {items.length}
                  </span>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      isExpanded && "rotate-90",
                    )}
                  />
                </div>
              </button>
              {isExpanded && (
                <div className="border-t border-border px-4 pb-4 pt-2">
                  {items.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">{t("plan.empty")}</p>
                  ) : (
                    <div className="space-y-3">{items.map(renderItem)}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
