import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  FileText,
  HeartPulse,
  History,
  MessageCircleQuestion,
  Plus,
  Sparkles,
  TrendingUp,
  Wrench,
} from "lucide-react";

import { HomeownerShell } from "@/components/homeowner-shell";
import { HomeHero } from "@/components/home-hero/HomeHero";
import { type HomeHeroView } from "@/lib/home-hero-data";
import { useHomeRecord } from "@/hooks/use-home-record";
import { GuidedOnboarding } from "@/components/guided-onboarding";

import { CompleteAddressCard } from "@/components/complete-address-card";
import { HomeAlerts } from "@/components/home-alerts";
import { useValueSnapshot } from "@/hooks/use-value-snapshot";
import { useLogOnMount } from "@/hooks/use-activity-log";
import { profileCompleteness } from "@/lib/next-step";
import { buildHomePlan, formatCostBand, planCounts } from "@/lib/home-plan";
import {
  greetingKey,
  homeHealth,
  isQuiet,
  recentUpdates,
  smarterInvitations,
  updateDate,
  whatSuCasaSees,
  type HomeFacts,
  type Line,
} from "@/lib/home-today";

import { getMyComponentServiceLog } from "@/lib/home-maintenance.functions";
import { listInspectionFindings } from "@/lib/inspection.functions";
import { listHomeDocuments } from "@/lib/home-documents.functions";
import { listValueSnapshots } from "@/lib/home-timeline.functions";
import { useHomeIntel } from "@/hooks/use-home-intel";
import { useLanguage } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your Home Today — SuCasa" },
      {
        name: "description",
        content:
          "What is happening with your home: value, equity, care plan, documents and history, in one place.",
      },
      { property: "og:title", content: "Your Home Today — SuCasa" },
      {
        property: "og:description",
        content:
          "What is happening with your home: value, equity, care plan, documents and history, in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  useLogOnMount("value_viewed");
  const navigate = useNavigate();
  const { t, language } = useLanguage();

  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [profileAddr, setProfileAddr] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [hasPhone, setHasPhone] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setUserId(null);
        return;
      }
      setUserId(u.user.id);
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, address, city, state, zip, phone")
        .eq("id", u.user.id)
        .maybeSingle();
      if (p?.address) {
        setProfileAddr([p.address, p.city, p.state, p.zip].filter(Boolean).join(", "));
      }
      if (p?.phone) setHasPhone(true);
      const first = (p?.full_name ?? "").trim().split(/\s+/)[0];
      if (first) setFirstName(first);
    })();
  }, []);

  const { intel: okIntel, raw: rawIntel } = useHomeIntel();

  // ONE evaluation of the home record drives the score and every summary below.
  const { record, report } = useHomeRecord(profileAddr);
  const homeScore = report?.score ?? null;
  const timeline = record?.physical.timeline ?? [];

  // Builds the value history the Home History page charts over time.
  useValueSnapshot(okIntel?.value.value ?? null, okIntel?.address ?? profileAddr);

  // Supporting reads (same query keys as the sections, so nothing is fetched twice).
  const fetchLog = useServerFn(getMyComponentServiceLog);
  const fetchFindings = useServerFn(listInspectionFindings);
  const fetchDocs = useServerFn(listHomeDocuments);
  const fetchSnapshots = useServerFn(listValueSnapshots);
  const { data: serviceLog } = useQuery({
    queryKey: ["component-service-log"],
    queryFn: () => fetchLog(undefined),
    staleTime: 60_000,
  });
  const { data: findings } = useQuery({
    queryKey: ["inspection-findings"],
    queryFn: () => fetchFindings({ data: {} }),
    staleTime: 5 * 60_000,
  });
  const { data: docs } = useQuery({
    queryKey: ["home-documents"],
    queryFn: () => fetchDocs(undefined),
    staleTime: 5 * 60_000,
  });
  const { data: snapshots } = useQuery({
    queryKey: ["value-snapshots"],
    queryFn: () => fetchSnapshots(undefined),
    staleTime: 5 * 60_000,
  });

  // The forward-looking half: one plan drives this hero, /home-plan and the
  // assistant's grounding.
  const homePlan = record ? buildHomePlan(record, new Date(), serviceLog ?? []) : null;
  const planSummary = homePlan ? planCounts(homePlan) : null;

  const hasAddress = !!profileAddr || !!okIntel?.address;
  const completeness = profileCompleteness({
    hasAddress,
    hasName: !!firstName,
    hasPhone,
    hasDocuments: (docs ?? []).length > 0,
    hasLogs: (serviceLog ?? []).length > 0,
  });

  // The onboarding "focus" answer now picks a destination, not a tab.
  const goToFocus = (focus: string) => {
    if (focus === "care") navigate({ to: "/home-care" });
    else if (focus === "documents") navigate({ to: "/documents" });
  };

  const heroData: HomeHeroView = {
    address: okIntel?.address || profileAddr || null,
    value: okIntel?.value.value ?? null,
    equity: okIntel?.equity?.equityDollars ?? null,
    equityPct: okIntel?.equity?.equityPct ?? null,
    roi: null,
    homeScore: homeScore?.score ?? null,
    zones: homeScore?.zones ?? null,
  };

  // ---------------------------------------------------------------- the read
  const docList = docs ?? [];
  const findingList = findings ?? [];
  const hasInspection = docList.some((d: any) => d.kind === "inspection");
  const equityPct = okIntel?.equity?.equityPct ?? null;

  const facts: HomeFacts = {
    overdue: timeline.filter((i) => i.status === "overdue").length,
    dueSoon: timeline.filter((i) => i.status === "due_soon").length,
    timelineItems: timeline.length,
    plan90: planSummary?.next90Days ?? 0,
    planTotal: planSummary?.total ?? 0,
    findings: findingList.length,
    hasInspection,
    documents: docList.length,
    equityPct,
  };

  const sees = whatSuCasaSees(facts);
  const health = homeHealth(facts);
  const quiet = isQuiet(facts);
  const updates = recentUpdates({
    documents: docList as any,
    findings: findingList as any,
    snapshots: (snapshots ?? []) as any,
  });
  const invitations = smarterInvitations({
    hasName: !!firstName,
    hasAddress,
    hasPhone,
    hasDocuments: docList.length > 0,
    hasLogs: (serviceLog ?? []).length > 0,
  });

  const line = (l: Line) => t(l.key, l.params as never);

  const needsAddress =
    rawIntel &&
    !rawIntel.ok &&
    (rawIntel.error === "incomplete_address" || rawIntel.error === "No address on profile");

  const topPlanItem = planSummary?.top ?? null;
  const cost = topPlanItem ? formatCostBand(topPlanItem.costBand) : null;

  return (
    <HomeownerShell>
      <main className="px-4 pb-8 pt-3 sm:px-5 sm:py-8">
        <div className="mx-auto max-w-3xl space-y-5 sm:space-y-7">
          {/* ---------------------------------------------------- greeting */}
          <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0 py-1">
              <h1 className="truncate text-[24px] font-semibold leading-tight sm:text-[30px]">
                {t(greetingKey())}{firstName ? `, ${firstName}.` : "."}
              </h1>
              <p className="mt-1 text-[14px] leading-snug text-muted-foreground">
                {t("home.today.summary")}
              </p>
            </div>
            <div className="hidden shrink-0 items-center gap-2 sm:flex">
              <GuidedOnboarding
                role="homeowner"
                userId={userId}
                signals={{
                  urgentCount: findingList.filter(
                    (f: any) => f.urgency === "high" || f.urgency === "medium",
                  ).length,
                  refiSignal: !!okIntel?.equity?.refiSignal,
                  documentCount: docList.length,
                  completeness: completeness.pct,
                }}
                onFocusChange={goToFocus}
              />
              <Link
                to="/request"
                className="inline-flex items-center gap-1.5 rounded-full gradient-brand px-4 py-2.5 text-sm font-semibold text-white shadow-soft"
              >
                <Plus className="h-4 w-4" /> {t("dash.request")}
              </Link>
            </div>
          </div>

          {needsAddress ? <CompleteAddressCard /> : null}

          {/* ------------------------------------------- identity: the home */}
          <HomeHero data={heroData} scoreDetail={homeScore} scorePending={!homeScore} />

          {/* --------------------------------------------- what SuCasa sees */}
          <section className="rounded-2xl border border-primary/15 bg-primary/[0.04] px-4 py-4 sm:px-5">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
              <Sparkles className="h-3.5 w-3.5" /> {t("home.sees.label")}
            </p>
            <ul className="mt-2.5 space-y-1.5">
              {sees.map((s) => (
                <li key={s.key} className="flex gap-2 text-[14px] leading-snug">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                  {line(s)}
                </li>
              ))}
            </ul>

            {updates.length > 0 && (
              <div className="mt-3 border-t border-primary/15 pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {t("home.recent.label")}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {updates.map((u) => (
                    <li
                      key={`${u.line.key}-${u.at}`}
                      className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-muted-foreground"
                    >
                      <span className="text-foreground">{line(u.line)}</span>
                      <span className="text-[12px]">{updateDate(u.at, language)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Missing inspection is invited once in "Make SuCasa smarter" below. */}
          <HomeAlerts report={report} hasInspection />

          {/* ------------------------------------------ coming up / quiet day */}
          {planSummary && planSummary.next90Days > 0 && topPlanItem ? (
            <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-6">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <CalendarCheck className="h-3.5 w-3.5" /> {t("home.coming.label")}
              </p>
              <p className="mt-2 text-[15px] font-medium">
                {planSummary.next90Days === 1
                  ? t("home.coming.count_one")
                  : t("home.coming.count", { count: planSummary.next90Days })}
              </p>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("home.coming.start")}
              </p>
              <p className="mt-1 text-[19px] font-semibold leading-snug">{topPlanItem.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{topPlanItem.why}</p>
              {cost && (
                <p className="mt-2.5 text-sm">
                  <span className="text-muted-foreground">{t("home.coming.cost")}: </span>
                  <span className="font-semibold">{cost}</span>
                </p>
              )}
              <Link
                to="/home-plan"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
              >
                {t("home.coming.cta")} <ArrowRight className="h-4 w-4" />
              </Link>
            </section>
          ) : (
            <section className="rounded-[28px] border border-primary/25 bg-primary/[0.05] p-6 text-center shadow-soft">
              <CheckCircle2 className="mx-auto h-7 w-7 text-primary" />
              <p className="mt-2 text-[17px] font-semibold">{t("home.quiet.headline")}</p>
              <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                {t("home.quiet.sentence")}
              </p>
              <Link
                to="/home-plan"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
              >
                {t("home.coming.cta")} <ArrowRight className="h-4 w-4" />
              </Link>
            </section>
          )}

          {/* ----------------------------------------- compact home profile */}
          <section className="overflow-hidden border-y border-border/70 bg-card sm:rounded-2xl sm:border">
            <p className="px-5 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("home.profile.label")}
            </p>
            <Row
              to="/home-care"
              icon={<HeartPulse className="h-4 w-4" />}
              title={t("home.health.label")}
              sub={line(health.line)}
            />
            <Row
              to="/documents"
              icon={<FileText className="h-4 w-4" />}
              title={t("home.vault.label")}
              sub={
                findingList.length > 0 && hasInspection
                  ? findingList.length === 1
                    ? t("dash.docs.findings_one")
                    : t("dash.docs.findings_many", { count: findingList.length })
                  : docList.length > 0
                    ? t("dash.docs.saved", { count: docList.length })
                    : t("home.vault.sentence")
              }
            />
            <Row
              to="/assistant"
              icon={<MessageCircleQuestion className="h-4 w-4" />}
              title={t("home.ask.label")}
              sub={t("dash.assistant.sentence")}
            />
            <Row
              to="/timeline"
              icon={<History className="h-4 w-4" />}
              title={t("home.story.label")}
              sub={t("timeline.subtitle")}
            />
            <Row
              to="/money"
              icon={<TrendingUp className="h-4 w-4" />}
              title={t("home.value.row")}
              sub={t("home.value.row_sub")}
            />
            <Row
              to="/request"
              icon={<Wrench className="h-4 w-4" />}
              title={t("home.help.label")}
              sub={t("home.help.sentence")}
              last
            />
          </section>

          {/* ------------------------------------------------- completeness */}
          {invitations.length > 0 && (
            <section className="border-l-2 border-primary/40 px-4 py-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t("home.smarter.label")}
              </p>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                {invitations.map((inv) => (
                  <li key={inv.key} className="flex items-center gap-1.5 text-[14px]">
                    <Plus className="h-3.5 w-3.5 shrink-0 text-primary" /> {line(inv)}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] leading-snug text-muted-foreground">{t("home.smarter.why")}</p>
              <Link to="/documents" className="mt-2 inline-flex text-sm font-semibold text-primary">
                {t("dash.docs.action_add")} <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </section>
          )}

          <div className="flex items-center justify-center pt-1 sm:hidden">
            <GuidedOnboarding
              role="homeowner"
              userId={userId}
              signals={{
                urgentCount: findingList.filter(
                  (f: any) => f.urgency === "high" || f.urgency === "medium",
                ).length,
                refiSignal: !!okIntel?.equity?.refiSignal,
                documentCount: docList.length,
                completeness: completeness.pct,
              }}
              onFocusChange={goToFocus}
              triggerLabel={t("home.setup.label")}
              autoOpen={false}
            />
          </div>
        </div>
      </main>
    </HomeownerShell>
  );
}

/** A quiet destination row — deliberately lighter than the cards above it. */
function Row({
  to,
  icon,
  title,
  sub,
  last,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
  last?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-5 py-4 transition-colors hover:bg-secondary/40 ${
        last ? "" : "border-b border-border/60"
      }`}
    >
      <span className="rounded-xl bg-secondary p-2 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{title}</span>
        <span className="block truncate text-[13px] text-muted-foreground">{sub}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

