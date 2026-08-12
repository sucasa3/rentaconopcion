import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { HomeHero } from "@/components/home-hero/HomeHero";
import { HOME_HERO, type HomeHeroData } from "@/lib/home-hero-data";
import { useHomeScore } from "@/hooks/use-home-score";

import { type RecentRequest } from "@/lib/mock-data";
import { LogExternalServiceDialog } from "@/components/log-external-service-dialog";
import { OnboardingWalkthrough } from "@/components/onboarding-walkthrough";
import { GuidedOnboarding } from "@/components/guided-onboarding";
import { readOnboarding } from "@/lib/onboarding";
import { HomeIntelPanel } from "@/components/home-intel-panel";
import { CompleteAddressCard } from "@/components/complete-address-card";
import { EquityMortgagePanel } from "@/components/equity-mortgage-panel";
import { HomeCarePanel } from "@/components/home-care-panel";
import { DocumentsCard } from "@/components/documents-card";
import { InspectionFindingsPanel } from "@/components/inspection-findings-panel";
import { RecommendedProsCard } from "@/components/recommended-pros-card";
import { HomeAssistantCard } from "@/components/home-assistant-card";
import { SellerIntentCard } from "@/components/seller-intent-card";
import { useLogOnMount } from "@/hooks/use-activity-log";
import { NextStepHero } from "@/components/next-step-hero";
import { pickNextStep, profileCompleteness } from "@/lib/next-step";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getMyComponentServiceLog } from "@/lib/home-maintenance.functions";
import { listInspectionFindings } from "@/lib/inspection.functions";
import { listHomeDocuments } from "@/lib/home-documents.functions";

import { getMyHomeIntel } from "@/lib/property-intel.functions";
import { listMyRequests } from "@/lib/service-requests.functions";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Plus, PenLine } from "lucide-react";


export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your Home Dashboard — SuCasa" },
      { name: "description", content: "Track your home value, maintenance tasks, service requests, and trusted professionals." },
      { property: "og:title", content: "Your Home Dashboard — SuCasa" },
      { property: "og:description", content: "Track your home value, maintenance tasks, service requests, and trusted professionals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  useLogOnMount("value_viewed");
  const [logOpen, setLogOpen] = useState(false);
  const [tab, setTab] = useState<"home" | "care" | "documents">("home");
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [requests, setRequests] = useState<RecentRequest[]>([]);

  const listReqFn = useServerFn(listMyRequests);
  const { data: dbRequests } = useQuery({
    queryKey: ["my-requests"],
    queryFn: () => listReqFn(),
  });
  useEffect(() => {
    if (!dbRequests) return;
    setRequests(
      dbRequests.map((r: any) => ({
        id: r.id,
        category: r.category,
        status: r.status,
        when: new Date(r.created_at).toLocaleDateString(),
        source: r.source === "external" ? "external" : "sucasa",
        vendorName: r.vendor_name ?? undefined,
        amountCents: r.amount_cents ?? undefined,
      })),
    );
  }, [dbRequests]);

  // Fetch profile (for name + address fallback) and property intel
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

  const fetchIntel = useServerFn(getMyHomeIntel);
  const { data: intel } = useQuery({
    queryKey: ["home-intel-hero"],
    queryFn: () =>
      fetchIntel({
        data: {
          classes: ["avm", "detail", "tax", "sales", "mortgage"],
          revenueSource: "dashboard_hero",
        },
      }),
    staleTime: 5 * 60_000,
  });

  const okIntel = intel?.ok ? intel : null;
  const heroValue: number = okIntel?.avm?.estimate || HOME_HERO.value;
  const heroEquity: number =
    okIntel?.equity?.equityDollars ??
    (okIntel?.avm?.estimate
      ? Math.round(okIntel.avm.estimate * HOME_HERO.equityPct)
      : HOME_HERO.equity);
  const heroEquityPct: number =
    okIntel?.equity?.equityPct ??
    (heroValue ? heroEquity / heroValue : HOME_HERO.equityPct);

  const { score: homeScore, timeline, isLoading: scoreLoading } = useHomeScore(
    !!profileAddr || !!okIntel?.address,
  );

  // Supporting signals for the "next step" hero (same query keys as the panels,
  // so nothing is fetched twice).
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
  const nextStep = pickNextStep({
    hasAddress,
    hasDocuments: (docs ?? []).length > 0,
    hasLogs: (serviceLog ?? []).length > 0,
    timeline,
    openFindings: (findings ?? []).filter(
      (f: any) => f.urgency === "high" || f.urgency === "medium",
    ).length,
    refiSignal: (okIntel as any)?.equity?.refiSignal ?? null,
    monthlySavings: (okIntel as any)?.equity?.refiMonthlySavings ?? null,
    openRequests: requests.filter((r) => r.status !== "Completed").length,
  });
  const completeness = profileCompleteness({
    hasAddress,
    hasName: !!firstName,
    hasPhone,
    hasDocuments: (docs ?? []).length > 0,
    hasLogs: (serviceLog ?? []).length > 0,
  });

  // Personalized default tab from the guided onboarding focus.
  const [appliedFocus, setAppliedFocus] = useState(false);
  useEffect(() => {
    if (appliedFocus || userId === undefined) return;
    const saved = readOnboarding("homeowner", userId);
    if (saved && ["home", "care", "documents"].includes(saved.focus)) {
      setTab(saved.focus as typeof tab);
    }
    setAppliedFocus(true);
  }, [appliedFocus, userId]);

  const heroData: HomeHeroData = {
    ...HOME_HERO,
    address: okIntel?.address || profileAddr || HOME_HERO.address,
    value: heroValue,
    equity: heroEquity,
    equityPct: heroEquityPct,
    homeScore: homeScore?.score ?? HOME_HERO.homeScore,
    zones: homeScore?.zones ?? HOME_HERO.zones,
  };


  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 px-5 py-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Welcome back</p>
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
                  refiSignal: !!(okIntel as any)?.equity?.refiSignal,
                  documentCount: (docs ?? []).length,
                  completeness: completeness.pct,
                }}
                onFocusChange={(f) => setTab(f as typeof tab)}
              />
              <OnboardingWalkthrough triggerLabel="Take the tour" />
              <Link to="/request" className="inline-flex items-center gap-1.5 rounded-full gradient-brand px-4 py-2.5 text-sm font-semibold text-white shadow-soft">
                <Plus className="h-4 w-4" /> Request
              </Link>
            </div>
          </div>

          {intel && !intel.ok && intel.error === "incomplete_address" ? (
            <CompleteAddressCard />
          ) : null}

          <HomeHero
            data={heroData}
            scoreDetail={homeScore}
            scorePending={scoreLoading || !homeScore}
          />

          <NextStepHero
            step={nextStep}
            completeness={completeness}
            onGoToTab={(t) => {
              setTab(t);
              document
                .getElementById("dash-tabs")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />

          <div id="dash-tabs" className="scroll-mt-20">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="home">Home</TabsTrigger>
                <TabsTrigger value="care">Care</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
              </TabsList>

              {/* -------------------------------------------------- Home */}
              <TabsContent value="home" className="mt-4 space-y-6">
                <HomeIntelPanel />
                <EquityMortgagePanel />

                <div className="grid gap-4 lg:grid-cols-3">
                  <HomeAssistantCard />

                  <Card className="lg:col-span-2">
                    <CardHeader
                      title="Recent service requests"
                      action={
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setLogOpen(true)}
                            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                          >
                            <PenLine className="h-3 w-3" /> Log outside service
                          </button>
                          <Link to="/request" className="text-xs font-medium text-primary">New request</Link>
                        </div>
                      }
                    />
                    <div className="mt-4 divide-y divide-border rounded-2xl border border-border">
                      {requests.length === 0 ? (
                        <p className="p-4 text-xs text-muted-foreground">
                          No requests yet. Start one from your next step above, or log work you had done elsewhere.
                        </p>
                      ) : (
                        requests.map(r => (
                          <Link
                            key={r.id}
                            to="/requests/$id"
                            params={{ id: r.id }}
                            className="flex items-center justify-between gap-3 p-4 transition hover:bg-secondary/60"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {r.category} <span className="text-muted-foreground">· {r.id.slice(0, 8)}</span>
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {r.vendorName ? `${r.vendorName} · ` : ""}{r.when}
                                {typeof r.amountCents === "number" ? ` · $${(r.amountCents / 100).toLocaleString()}` : ""}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {r.source === "external" && (
                                <span className="rounded-full border border-border bg-secondary px-2 py-1 text-[10px] font-medium text-muted-foreground">External</span>
                              )}
                              <StatusPill status={r.status} />
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Track work done outside SuCasa to build your full home history.
                    </p>
                  </Card>

                  <Card className="lg:col-span-3">
                    <CardHeader title="Home Intelligence Report" />
                    <p className="mt-2 text-sm text-muted-foreground">Your monthly deep-dive on value, equity, and improvement ROI.</p>
                    <Link to="/report" className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-full gradient-growth px-4 py-2.5 text-sm font-semibold text-white sm:w-auto">
                      View report <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Card>
                </div>

                <SellerIntentCard />
              </TabsContent>

              {/* -------------------------------------------------- Care */}
              <TabsContent value="care" className="mt-4 space-y-6">
                <HomeCarePanel />
                <RecommendedProsCard />
              </TabsContent>

              {/* --------------------------------------------- Documents */}
              <TabsContent value="documents" className="mt-4 space-y-6">
                <DocumentsCard />
                <InspectionFindingsPanel />
              </TabsContent>
            </Tabs>
          </div>

          <LogExternalServiceDialog
            open={logOpen}
            onOpenChange={setLogOpen}
            onLogged={(row) => {
              setRequests((prev) => [
                {
                  id: row.id,
                  category: row.category,
                  status: row.status,
                  when: "Just now",
                  source: "external",
                  vendorName: row.vendorName ?? undefined,
                  amountCents: row.amountCents ?? undefined,
                },
                ...prev,
              ]);
            }}
          />

        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-border bg-card p-6 shadow-soft ${className}`}>{children}</div>;
}
function CardHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {action}
    </div>
  );
}
function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Matched: "bg-primary/10 text-primary",
    "In Progress": "bg-accent text-accent-foreground",
    Completed: "bg-growth/15 text-growth",
  };
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${map[status] ?? "bg-secondary text-secondary-foreground"}`}>{status}</span>;
}
