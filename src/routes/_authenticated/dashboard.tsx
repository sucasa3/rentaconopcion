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
  const lateCount = timeline.filter((t) => t.status === "overdue").length;
  const soonCount = timeline.filter((t) => t.status === "due_soon").length;
  const topItem = timeline.find((t) => t.status === "overdue") ??
    timeline.find((t) => t.status === "due_soon") ??
    null;

  const careHeadline =
    timeline.length === 0
      ? "Let's start"
      : lateCount > 0
        ? `${lateCount} late`
        : soonCount > 0
          ? `${soonCount} coming up`
          : "All good";
  const careSentence =
    timeline.length === 0
      ? "Tell us a little about your home and we'll build your to-do list."
      : topItem
        ? `Start with your ${topItem.label.toLowerCase()}.`
        : "Nothing needs you today. We'll tell you when that changes.";
  const careTone = lateCount > 0 ? "urgent" : soonCount > 0 ? "opportunity" : "calm";

  const docCount = (docs ?? []).length;
  const findingCount = (findings ?? []).length;
  const hasInspection = (docs ?? []).some((d: any) => d.kind === "inspection");
  const docsSentence = !hasInspection
    ? "Add your inspection report and we'll turn it into a to-do list."
    : findingCount > 0
      ? `We read your inspection report and found ${findingCount} thing${findingCount === 1 ? "" : "s"} to watch.`
      : "Your paperwork is saved and searchable.";

  const equityPct = okIntel?.equity?.equityPct ?? null;
  const moneySentence = okIntel?.equity
    ? `You hold ${money(okIntel.equity.equityDollars)} in equity${
        equityPct != null ? ` — ${Math.round(equityPct * 100)}% of your home` : ""
      }.`
    : hasAddress
      ? "We're still matching your home to public records."
      : "Add your address and we'll pull your value and equity.";

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
                Welcome back
              </p>
              <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
                {firstName ?? "Your home"}
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
                <Plus className="h-4 w-4" /> Request
              </Link>
            </div>
          </div>

          {needsAddress ? <CompleteAddressCard /> : null}

          <HomeHero data={heroData} scoreDetail={homeScore} scorePending={!homeScore} />

          <SummaryCard
            icon={<HeartPulse className="h-5 w-5" />}
            label="Home care"
            headline={careHeadline}
            sentence={careSentence}
            tone={careTone}
            emphasis
            to="/home-care"
            actionLabel="Open home care"
          />

          <SummaryCard
            icon={<FileText className="h-5 w-5" />}
            label="Documents"
            headline={docCount > 0 ? `${docCount} saved` : "None yet"}
            sentence={docsSentence}
            tone={hasInspection ? "calm" : "brand"}
            to="/documents"
            actionLabel={hasInspection ? "Open documents" : "Add a document"}
          />

          <SummaryCard
            icon={<TrendingUp className="h-5 w-5" />}
            label="Value & equity"
            headline={money(okIntel?.value.value ?? null)}
            sentence={moneySentence}
            tone={okIntel?.equity?.refiSignal ? "opportunity" : "calm"}
            to="/money"
            actionLabel="See the numbers"
          />

          <SummaryCard
            icon={<Sparkles className="h-5 w-5" />}
            label="Home Assistant"
            sentence="Ask anything about your home — we answer using your own records."
            tone="brand"
            to="/assistant"
            actionLabel="Ask a question"
          />

          <div className="pt-1 text-center">
            <OnboardingWalkthrough triggerLabel="Take the tour" />
          </div>
        </div>
      </main>
    </HomeownerShell>
  );
}
