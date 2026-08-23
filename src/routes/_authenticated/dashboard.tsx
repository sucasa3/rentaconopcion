import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { HeartPulse, FileText, TrendingUp, Sparkles, Plus } from "lucide-react";

import { HomeownerShell } from "@/components/homeowner-shell";
import { HomeHero } from "@/components/home-hero/HomeHero";
import { type HomeHeroView } from "@/lib/home-hero-data";
import { useHomeRecord } from "@/hooks/use-home-record";
import { OnboardingWalkthrough } from "@/components/onboarding-walkthrough";
import { GuidedOnboarding } from "@/components/guided-onboarding";

import { CompleteAddressCard } from "@/components/complete-address-card";
import { SummaryCard } from "@/components/ui-kit";
import { useLogOnMount } from "@/hooks/use-activity-log";
import { profileCompleteness } from "@/lib/next-step";

import { getMyComponentServiceLog } from "@/lib/home-maintenance.functions";
import { listInspectionFindings } from "@/lib/inspection.functions";
import { listHomeDocuments } from "@/lib/home-documents.functions";
import { useHomeIntel } from "@/hooks/use-home-intel";
import { useT } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your Home Dashboard — SuCasa" },
      {
        name: "description",
        content:
          "Track your home value, maintenance tasks, service requests, and trusted professionals.",
      },
      { property: "og:title", content: "Your Home Dashboard — SuCasa" },
      {
        property: "og:description",
        content:
          "Track your home value, maintenance tasks, service requests, and trusted professionals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

function Dashboard() {
  useLogOnMount("value_viewed");
  const navigate = useNavigate();
  const t = useT();

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

  // Supporting reads (same query keys as the sections, so nothing is fetched twice).
  const fetchLog = useServerFn(getMyComponentServiceLog);
  const fetchFindings = useServerFn(listInspectionFindings);
  const fetchDocs = useServerFn(listHomeDocuments);
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

  // ---------------------------------------------------------------- summaries
  const lateCount = timeline.filter((item) => item.status === "overdue").length;
  const soonCount = timeline.filter((item) => item.status === "due_soon").length;
  const topItem = timeline.find((item) => item.status === "overdue") ??
    timeline.find((item) => item.status === "due_soon") ??
    null;

  const careHeadline =
    timeline.length === 0
      ? t("dash.care.start")
      : lateCount > 0
        ? t("dash.care.late", { count: lateCount })
        : soonCount > 0
          ? t("dash.care.coming_up", { count: soonCount })
          : t("dash.care.all_good");
  const careSentence =
    timeline.length === 0
      ? t("dash.care.empty")
      : topItem
        ? t("dash.care.start_with", { item: topItem.label.toLowerCase() })
        : t("dash.care.nothing");
  const careTone = lateCount > 0 ? "urgent" : soonCount > 0 ? "opportunity" : "calm";

  const docCount = (docs ?? []).length;
  const findingCount = (findings ?? []).length;
  const hasInspection = (docs ?? []).some((d: any) => d.kind === "inspection");
  const docsSentence = !hasInspection
    ? t("dash.docs.add_inspection")
    : findingCount > 0
      ? findingCount === 1
        ? t("dash.docs.findings_one")
        : t("dash.docs.findings_many", { count: findingCount })
      : t("dash.docs.saved_searchable");

  const equityPct = okIntel?.equity?.equityPct ?? null;
  const moneySentence = okIntel?.equity
    ? equityPct != null
      ? t("dash.money.equity_line_pct", {
          amount: money(okIntel.equity.equityDollars),
          pct: Math.round(equityPct * 100),
        })
      : t("dash.money.equity_line", { amount: money(okIntel.equity.equityDollars) })
    : hasAddress
      ? t("dash.money.matching")
      : t("dash.money.add_address");

  const needsAddress =
    rawIntel &&
    !rawIntel.ok &&
    (rawIntel.error === "incomplete_address" || rawIntel.error === "No address on profile");

  return (
    <HomeownerShell>
      <main className="px-4 py-6 sm:px-5 sm:py-8">
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                {t("dash.welcome_back")}
              </p>
              <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
                {firstName ?? t("dash.your_home")}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <GuidedOnboarding
                role="homeowner"
                userId={userId}
                signals={{
                  urgentCount: (findings ?? []).filter(
                    (f: any) => f.urgency === "high" || f.urgency === "medium",
                  ).length,
                  refiSignal: !!okIntel?.equity?.refiSignal,
                  documentCount: docCount,
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

          <HomeHero data={heroData} scoreDetail={homeScore} scorePending={!homeScore} />

          <HomeAlerts report={report} />

          <SummaryCard
            icon={<HeartPulse className="h-5 w-5" />}
            label={t("dash.care.label")}
            headline={careHeadline}
            sentence={careSentence}
            tone={careTone}
            emphasis
            to="/home-care"
            actionLabel={t("dash.care.action")}
          />

          <SummaryCard
            icon={<TrendingUp className="h-5 w-5" />}
            label={t("dash.money.label")}
            headline={money(okIntel?.value.value ?? null)}
            sentence={moneySentence}
            tone={okIntel?.equity?.refiSignal ? "opportunity" : "calm"}
            to="/money"
            actionLabel={t("dash.money.action")}
          />

          <SummaryCard
            icon={<Sparkles className="h-5 w-5" />}
            label={t("dash.assistant.label")}
            sentence={t("dash.assistant.sentence")}
            tone="brand"
            to="/assistant"
            actionLabel={t("dash.assistant.action")}
          />

          <SummaryCard
            icon={<FileText className="h-5 w-5" />}
            label={t("dash.docs.label")}
            headline={docCount > 0 ? t("dash.docs.saved", { count: docCount }) : t("common.none_yet")}
            sentence={docsSentence}
            tone={hasInspection ? "calm" : "brand"}
            to="/documents"
            actionLabel={hasInspection ? t("dash.docs.action_open") : t("dash.docs.action_add")}
          />

          <div className="pt-1 text-center">
            <OnboardingWalkthrough triggerLabel={t("dash.take_tour")} />
          </div>
        </div>
      </main>
    </HomeownerShell>
  );
}
