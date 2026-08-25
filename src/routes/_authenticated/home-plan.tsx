import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  CalendarCheck,
  Check,
  ChevronRight,
  Clock,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";

import { HomeownerShell } from "@/components/homeowner-shell";
import { StatusPill } from "@/components/ui-kit";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/home-plan")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your Home Plan — SuCasa" },
      {
        name: "description",
        content:
          "What your home needs — the next 90 days, the next 12 months, and the next 3–5 years, with typical costs.",
      },
      { property: "og:title", content: "Your Home Plan — SuCasa" },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HomePlanPage,
});

const HORIZONS: { key: PlanHorizon; labelKey: "plan.h90" | "plan.h12" | "plan.h35"; subKey: "plan.h90.sub" | "plan.h12.sub" | "plan.h35.sub" }[] = [
  { key: "next90Days", labelKey: "plan.h90", subKey: "plan.h90.sub" },
  { key: "next12Months", labelKey: "plan.h12", subKey: "plan.h12.sub" },
  { key: "next3to5Years", labelKey: "plan.h35", subKey: "plan.h35.sub" },
];

function urgencyTone(urgency: PlanItem["urgency"]) {
  return urgency === "high" ? "attention" : urgency === "medium" ? "info" : "muted";
}

function HomePlanPage() {
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

  // One deterministic plan drives this page, the dashboard hero and the
  // assistant — state (done/dismissed) hides items without recomputing.
  const plan = useMemo(
    () => (record ? buildHomePlan(record, new Date(), serviceLog ?? []) : null),
    [record, serviceLog],
  );

  // Persist the plan once per source hash; the server returns cached (or
  // freshly written) AI "why" sentences for the items.
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
      .then(() => queryClient.invalidateQueries({ queryKey: ["home-plan-cloud"] }))
      .catch(() => {
        setLocalState((prev) => {
          const next = { ...prev };
          delete next[itemKey];
          return next;
        });
      });
  };

  const aiWhy = cloud?.aiWhy ?? {};

  const renderItem = (item: PlanItem) => {
    const cost = formatCostBand(item.costBand);
    const slug = toCategorySlug(item.category ?? undefined);
    const why = aiWhy[item.key] ?? item.why;
    return (
      <div
        key={item.key}
        className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft"
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
        <div className="mt-3 flex gap-2">
          {slug ? (
            <Link
              to="/request"
              search={{ category: slug, description: item.title } as never}
              className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-full gradient-brand px-4 text-sm font-semibold text-white transition active:scale-[0.99]"
            >
              {t("plan.take_care")}
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-full bg-secondary px-4 text-sm font-semibold text-secondary-foreground">
              {item.category ?? t("plan.take_care")}
            </span>
          )}
          <button
            type="button"
            onClick={() => act(item.key, "done")}
            aria-label={t("plan.done")}
            className="grid h-10 w-10 place-items-center rounded-full border border-growth/40 bg-growth/10 text-growth transition active:scale-95"
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

  const visible = plan
    ? {
        next90Days: plan.next90Days.filter((i) => !state[i.key]),
        next12Months: plan.next12Months.filter((i) => !state[i.key]),
        next3to5Years: plan.next3to5Years.filter((i) => !state[i.key]),
      }
    : null;

  return (
    <HomeownerShell>
      <main className="px-4 py-6 sm:px-5 sm:py-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <div>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> {t("common.back_home")}
            </Link>
            <div className="mt-3 flex items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                <CalendarCheck className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  {t("plan.title")}
                </h1>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {t("plan.subtitle")}
                </p>
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3" /> {t("plan.updated")}
                </p>
              </div>
            </div>
          </div>

          {!visible ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : visible.next90Days.length + visible.next12Months.length + visible.next3to5Years.length ===
            0 ? (
            <div className="rounded-3xl border border-growth/40 bg-growth/5 p-6 text-center shadow-soft">
              <p className="font-semibold text-growth">{t("plan.hero.none")}</p>
            </div>
          ) : (
            HORIZONS.map((h) => (
              <section key={h.key} aria-label={t(h.labelKey)}>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                    <Clock
                      className={cn(
                        "h-4 w-4",
                        h.key === "next90Days" ? "text-attention-foreground" : "text-muted-foreground",
                      )}
                    />
                    {t(h.labelKey)}
                  </h2>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {visible[h.key].length}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{t(h.subKey)}</p>
                <div className="mt-3 space-y-3">
                  {visible[h.key].length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                      {t("plan.empty")}
                    </p>
                  ) : (
                    visible[h.key].map(renderItem)
                  )}
                </div>
              </section>
            ))
          )}
        </div>
      </main>
    </HomeownerShell>
  );
}
