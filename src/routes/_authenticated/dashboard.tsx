import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { HomeHero } from "@/components/home-hero/HomeHero";
import { HOME_HERO, type HomeHeroData } from "@/lib/home-hero-data";
import { useHomeScore } from "@/hooks/use-home-score";

import { MAINTENANCE_TASKS, RECOMMENDED_PROS, type RecentRequest } from "@/lib/mock-data";
import { LogExternalServiceDialog } from "@/components/log-external-service-dialog";
import { OnboardingWalkthrough } from "@/components/onboarding-walkthrough";
import { HomeIntelPanel } from "@/components/home-intel-panel";
import { EquityMortgagePanel } from "@/components/equity-mortgage-panel";
import { MaintenanceTimelinePanel } from "@/components/maintenance-timeline-panel";
import { DocumentsCard } from "@/components/documents-card";
import { InspectionFindingsPanel } from "@/components/inspection-findings-panel";
import { SuggestedServicesPanel } from "@/components/suggested-services-panel";
import { HomeAssistantCard } from "@/components/home-assistant-card";

import { getMyHomeIntel } from "@/lib/property-intel.functions";
import { listMyRequests } from "@/lib/service-requests.functions";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Plus, Sparkles, PenLine } from "lucide-react";

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
  const [logOpen, setLogOpen] = useState(false);
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
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, address, city, state, zip")
        .eq("id", u.user.id)
        .maybeSingle();
      if (p?.address) {
        setProfileAddr([p.address, p.city, p.state, p.zip].filter(Boolean).join(", "));
      }
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

  const { score: homeScore, isLoading: scoreLoading } = useHomeScore(!!profileAddr || !!okIntel?.address);

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
              <OnboardingWalkthrough triggerLabel="Take the tour" />
              <Link to="/request" className="inline-flex items-center gap-1.5 rounded-full gradient-brand px-4 py-2.5 text-sm font-semibold text-white shadow-soft">
                <Plus className="h-4 w-4" /> Request
              </Link>
            </div>
          </div>

          <HomeHero
            data={heroData}
            scoreDetail={homeScore}
            scorePending={scoreLoading || !homeScore}
          />



          <HomeIntelPanel />

          <EquityMortgagePanel />

          <MaintenanceTimelinePanel />

          <SuggestedServicesPanel />

          {/* Grid */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Maintenance */}
            <Card className="lg:col-span-2">
              <CardHeader title="Maintenance checklist" action={<a className="text-xs font-medium text-primary" href="#">View all</a>} />
              <ul className="mt-4 space-y-2">
                {MAINTENANCE_TASKS.map(t => (
                  <li key={t.title} className="flex items-center justify-between rounded-2xl border border-border p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${t.done ? "bg-growth/15 text-growth" : t.overdue ? "bg-destructive/10 text-destructive" : "bg-secondary text-primary"}`}>
                        <Sparkles className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-medium ${t.done ? "line-through opacity-60" : ""}`}>{t.title}</p>
                        <p className="text-xs text-muted-foreground">{t.due}</p>
                      </div>
                    </div>
                    <button className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary">{t.done ? "Done" : "Mark done"}</button>
                  </li>
                ))}
              </ul>
            </Card>

            {/* AI Assistant */}
            <HomeAssistantCard />


            {/* Recent requests */}
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
                {requests.map(r => (
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
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Track work done outside SuCasa to build your full home history.
              </p>
            </Card>

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


            {/* Documents */}
            <DocumentsCard />

            {/* Inspection findings (AI) */}
            <InspectionFindingsPanel />

            {/* Recommended pros */}
            <Card className="lg:col-span-2">
              <CardHeader title="Recommended professionals" action={<Link to="/services" className="text-xs font-medium text-primary">Browse</Link>} />
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {RECOMMENDED_PROS.map(p => (
                  <div key={p.name} className="rounded-2xl border border-border p-4">
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">{p.badge}</span>
                    <p className="mt-3 text-sm font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.category}</p>
                    <p className="mt-2 text-xs">★ {p.rating} · {p.reviews} reviews</p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Intelligence report */}
            <Card>
              <CardHeader title="Home Intelligence Report" />
              <p className="mt-2 text-sm text-muted-foreground">Your monthly deep-dive on value, equity, and improvement ROI.</p>
              <Link to="/report" className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full gradient-growth px-4 py-2.5 text-sm font-semibold text-white">
                View report <ArrowRight className="h-4 w-4" />
              </Link>
            </Card>
          </div>
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
