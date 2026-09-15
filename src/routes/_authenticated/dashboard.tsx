import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  ChevronRight,
  CircleHelp,
  FileText,
  HeartPulse,
  History,
  MessageCircleQuestion,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

import { HomeownerShell } from "@/components/homeowner-shell";
import { HomeHero } from "@/components/home-hero/HomeHero";
import { type HomeHeroView } from "@/lib/home-hero-data";
import { useHomeRecord } from "@/hooks/use-home-record";
import { GuidedOnboarding } from "@/components/guided-onboarding";

import { CompleteAddressCard } from "@/components/complete-address-card";
import { useValueSnapshot } from "@/hooks/use-value-snapshot";
import { useLogOnMount } from "@/hooks/use-activity-log";
import { profileCompleteness } from "@/lib/next-step";
import { buildHomePlan, planCounts } from "@/lib/home-plan";

import { getMyComponentServiceLog } from "@/lib/home-maintenance.functions";
import { listInspectionFindings } from "@/lib/inspection.functions";
import { listHomeDocuments } from "@/lib/home-documents.functions";
import { listValueSnapshots } from "@/lib/home-timeline.functions";
import { useHomeIntel } from "@/hooks/use-home-intel";
import { useLanguage } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { HomeScoreResult } from "@/lib/home-score";
import type { TimelineItem } from "@/lib/maintenance-rules";

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

  const visibleSystems = timeline
    .filter((item) => ["roof", "hvac", "water_heater", "electrical"].includes(item.key))
    .map((item) => ({
      key: item.key,
      label: item.key === "water_heater" ? "Water Heater" : item.label,
      status: item.status,
      detail:
        item.source === "logged"
          ? "From your service history"
          : item.source === "permit"
            ? "Estimated from permit records"
            : "Estimated from available home records",
    }));

  const scoreFreshness = latestDate([
    ...(serviceLog ?? []).map((row: any) => row.serviced_at),
    ...findingList.map((row: any) => row.updated_at ?? row.created_at),
    ...docList.map((row: any) => row.updated_at ?? row.created_at),
  ]);
  const valueFreshness = latestDate((snapshots ?? []).map((row: any) => row.captured_on));

  return (
    <HomeownerShell premium>
      <main className="px-4 pb-28 pt-3 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-5xl space-y-6 sm:space-y-8">
          {needsAddress ? <CompleteAddressCard /> : null}
          <HomeHero data={heroData} />

          <section className="grid gap-3 sm:grid-cols-[1.05fr_1.95fr]">
            <ScoreCard score={homeScore} updatedAt={scoreFreshness} />
            <SystemHealth systems={visibleSystems} />
          </section>

          <MoneyCard
            value={okIntel?.value.value ?? null}
            equity={okIntel?.equity?.equityDollars ?? null}
            equityPct={okIntel?.equity?.equityPct ?? null}
            updatedAt={valueFreshness}
          />

          <CareCard
            topPlanItem={topPlanItem}
            planCount={planSummary?.next90Days ?? 0}
            documentCount={docList.length}
            historyCount={(serviceLog ?? []).length}
          />

          <HomeTeamCard />

          <section className="rounded-[1.5rem] border border-primary/25 bg-accent px-5 py-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-foreground">Ask SuCasa</p>
              <h2 className="mt-2 text-xl font-semibold">What would you like to know about your home?</h2>
              <p className="mt-1 text-sm text-muted-foreground">Get answers grounded in the records SuCasa has for this home.</p>
            </div>
            <Button asChild className="mt-5 w-full sm:mt-0 sm:w-auto">
              <Link to="/assistant"><MessageCircleQuestion className="h-4 w-4" /> Ask about your home</Link>
            </Button>
          </section>

          <div className="flex justify-center pt-1">
            <GuidedOnboarding
              role="homeowner"
              userId={userId}
              signals={{
                urgentCount: findingList.filter((f: any) => f.urgency === "high" || f.urgency === "medium").length,
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

