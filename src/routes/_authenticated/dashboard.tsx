import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronRight,
  CircleHelp,
  FileText,
  HeartPulse,
  History,
  MessageCircleQuestion,
  ShieldCheck,
  Sparkles,
  UserRound,
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
import { getMyHomeTeamSummary } from "@/lib/professional-invitations.functions";
import type { HomeTeamMemberSummary } from "@/lib/home-team-summary";
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
  const fetchHomeTeam = useServerFn(getMyHomeTeamSummary);
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
  const { data: homeTeam } = useQuery({
    queryKey: ["home-team-summary"],
    queryFn: () => fetchHomeTeam(),
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
  const docList = docs ?? [];
  const findingList = findings ?? [];
  const needsAddress =
    rawIntel &&
    !rawIntel.ok &&
    (rawIntel.error === "incomplete_address" || rawIntel.error === "No address on profile");
  const topPlanItem = planSummary?.top ?? null;

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
  const previewTeam = developmentHomeTeamPreview();

  return (
    <HomeownerShell
      premium
      moreContent={
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
      }
    >
      <main className="px-2.5 pb-24 pt-2 sm:px-6 sm:py-7">
        <div className="mx-auto max-w-5xl space-y-2.5 sm:space-y-5">
          <HomeHero data={heroData} />
          {needsAddress ? <CompleteAddressCard /> : null}

          <HomeHealth score={homeScore} updatedAt={scoreFreshness} systems={visibleSystems} />

          <CareCard
            topPlanItem={topPlanItem}
            planCount={planSummary?.next90Days ?? 0}
            documentCount={docList.length}
            historyCount={(serviceLog ?? []).length}
          />

          <HomeTeamCard team={previewTeam ?? homeTeam ?? { agent: null, lender: null }} />

          <section className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-2xl border border-surface-intelligence-border bg-surface-intelligence p-3 shadow-soft sm:gap-6 sm:p-5">
            <div className="relative min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-sucasa-navy sm:text-base"><Sparkles className="h-4 w-4 shrink-0 text-sucasa-orange" /> Ask SuCasa</p>
              <p className="mt-0.5 text-xs leading-snug text-text-secondary sm:text-sm">Get answers grounded in your home records.</p>
            </div>
            <Button asChild className="relative min-h-11 shrink-0 rounded-xl bg-action-primary px-3 text-action-primary-foreground sm:px-4">
              <Link to="/assistant" search={{ topic: undefined }}><MessageCircleQuestion className="h-4 w-4" /><span className="hidden min-[390px]:inline">Ask about your home</span><span className="min-[390px]:hidden">Ask</span></Link>
            </Button>
          </section>

        </div>
      </main>
    </HomeownerShell>
  );
}

function latestDate(values: Array<string | null | undefined>) {
  const dates = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  if (!dates[0]) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(dates[0]);
}

/** Development-only presentation fixtures. They never write relationship data or ship as canonical records. */
function developmentHomeTeamPreview(): { agent: HomeTeamMemberSummary | null; lender: HomeTeamMemberSummary | null } | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const state = new URLSearchParams(window.location.search).get("teamPreview");
  const agent: HomeTeamMemberSummary = {
    relationshipId: "preview-agent",
    professionalId: "preview-agent",
    displayName: "Alex M.",
    organizationName: null,
    role: "agent",
    state: "confirmed",
  };
  const lender: HomeTeamMemberSummary = {
    relationshipId: "preview-lender",
    professionalId: "preview-lender",
    displayName: "Jordan T.",
    organizationName: null,
    role: "lender",
    state: state === "pending" ? "pending" : "confirmed",
  };
  if (state === "confirmed") return { agent, lender };
  if (state === "one") return { agent, lender: null };
  if (state === "pending") return { agent: null, lender };
  return null;
}

function HomeHealth({ score, updatedAt, systems }: { score: HomeScoreResult | null; updatedAt: string | null; systems: Array<{ key: string; label: string; status: TimelineItem["status"]; detail: string }> }) {
  const value = score?.score ?? 0;
  const circumference = 2 * Math.PI * 48;
  const limitedRecords = score?.breakdown.some(
    (item) => item.key === "components" && (item.detail.includes(" 0 tracked") || item.detail.includes("All 0 tracked")),
  );
  const ringTone = limitedRecords
    ? "text-status-nurture"
    : score?.band === "risk"
      ? "text-status-risk"
      : score?.band === "attention"
        ? "text-status-attention"
        : "text-status-positive";
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card p-3 shadow-soft transition-shadow hover:shadow-elevated sm:p-5">
      <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border pb-2">
        <div className="flex min-w-0 items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-intelligence"><HeartPulse className="h-4 w-4 text-intelligence-accent" /></span><h2 className="truncate text-base font-semibold text-sucasa-navy sm:text-lg">Home Health</h2></div>
        <Dialog>
          <DialogTrigger asChild>
             <Button variant="ghost" size="sm" className="min-h-11 shrink-0 px-0 text-[9px] text-action-primary hover:bg-transparent sm:px-1 sm:text-xs"><span className="sm:hidden">What affects?</span><span className="hidden sm:inline">What affects this?</span></Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Your Home Score</DialogTitle></DialogHeader>
            <p className="text-sm leading-relaxed text-muted-foreground">
              The score is based on the information SuCasa currently has, including maintenance history, inspection findings and available home records.
            </p>
            <div className="rounded-lg bg-secondary p-3 text-sm">
              Missing records mean <strong>we do not know yet</strong>. They are kept separate from evidence that something may need attention.
            </div>
            {score && (
              <ul className="space-y-3">
                {score.breakdown.map((item) => (
                  <li key={item.key} className="flex gap-3 text-sm">
                    <span className="font-semibold tabular-nums">{item.earned}/{item.max}</span>
                    <span><strong>{item.label}</strong><span className="block text-muted-foreground">{item.detail}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid gap-3 pt-3 sm:grid-cols-[minmax(220px,0.85fr)_minmax(0,1.6fr)] sm:gap-5">
        <div className="flex min-w-0 items-center gap-3 rounded-xl bg-surface-intelligence p-3 sm:gap-4 sm:p-4">
        <div className="relative grid h-[76px] w-[76px] shrink-0 place-items-center sm:h-24 sm:w-24">
          <svg viewBox="0 0 112 112" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="56" cy="56" r="48" fill="none" stroke="currentColor" strokeWidth="7" className="text-secondary" />
            {score && (
              <circle cx="56" cy="56" r="48" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value / 100)} className={`home-score-ring ${ringTone}`} />
            )}
          </svg>
          <span className="text-xl font-semibold tabular-nums text-sucasa-navy sm:text-3xl">{score ? value : "—"}</span>
        </div>
        <div className="min-w-0 text-left">
          <p className="text-[10px] font-medium uppercase text-intelligence-accent">Home Score</p>
          <p className="mt-1 text-xs font-semibold leading-tight text-sucasa-navy sm:text-base">{limitedRecords ? "Limited records" : score?.bandLabel ?? "Not enough information"}</p>
          {updatedAt && <p className="mt-0.5 text-[9px] text-muted-foreground sm:text-xs">Updated {updatedAt}</p>}
        </div>
        </div>
      {systems.length ? (
        <div className="divide-y divide-border sm:grid sm:grid-cols-2 sm:gap-x-4 sm:divide-y-0">
          {systems.map((system) => (
            <div key={system.key} className="border-l-2 border-border py-2 pl-2.5 sm:border-b sm:py-2.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5">
                <span className="truncate text-[11px] font-medium sm:text-sm">{system.label}</span>
                <span
                  className={`flex shrink-0 items-center gap-1 text-[9px] font-semibold leading-none sm:text-xs ${system.status === "overdue" ? "text-status-risk" : system.status === "due_soon" ? "text-status-attention" : "text-status-positive"}`}
                  aria-label={`${system.label}: ${system.status === "overdue" ? "May be due" : system.status === "due_soon" ? "Review soon" : "Good"}`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${system.status === "overdue" ? "bg-status-risk" : system.status === "due_soon" ? "bg-status-attention" : "bg-status-positive"}`} aria-hidden />
                  <span>{system.status === "overdue" ? "May be due" : system.status === "due_soon" ? "Review soon" : "Good"}</span>
                </span>
              </div>
              <p className="mt-1 hidden text-xs text-muted-foreground sm:block">{system.detail}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl bg-secondary p-3">
          <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-[10px] leading-snug text-muted-foreground sm:text-sm">No system records yet. SuCasa will not guess.</p>
        </div>
      )}
      </div>
    </section>
  );
}

function CareCard({ topPlanItem, planCount, documentCount, historyCount }: { topPlanItem: { title: string; why: string } | null; planCount: number; documentCount: number; historyCount: number }) {
  return (
    <section className="rounded-2xl border border-surface-warm-border bg-surface-warm p-3 shadow-soft sm:p-5">
      <p className="text-base font-semibold text-sucasa-navy sm:text-lg">Home Care</p>
      <Tabs defaultValue="todo" className="mt-0.5">
        <TabsList className="grid h-11 w-full grid-cols-3 bg-transparent p-0"><TabsTrigger value="todo" className="h-11 rounded-none border-b-2 border-transparent px-1 shadow-none data-[state=active]:border-sucasa-orange data-[state=active]:bg-transparent data-[state=active]:text-status-opportunity data-[state=active]:shadow-none">To do</TabsTrigger><TabsTrigger value="documents" className="h-11 rounded-none border-b-2 border-transparent px-1 shadow-none data-[state=active]:border-sucasa-orange data-[state=active]:bg-transparent data-[state=active]:text-status-opportunity data-[state=active]:shadow-none">Documents</TabsTrigger><TabsTrigger value="history" className="h-11 rounded-none border-b-2 border-transparent px-1 shadow-none data-[state=active]:border-sucasa-orange data-[state=active]:bg-transparent data-[state=active]:text-status-opportunity data-[state=active]:shadow-none">History</TabsTrigger></TabsList>
        <TabsContent value="todo" className="mt-1.5">
          {topPlanItem ? <PreviewRow icon={<HeartPulse className="h-4 w-4" />} title={topPlanItem.title} detail={topPlanItem.why} to="/home-care" /> : <EmptyPreview text="Nothing is due from the records currently available." to="/home-care" />}
          {planCount > 1 && <p className="mt-1.5 text-[10px] text-muted-foreground sm:text-xs">{planCount - 1} more items in your care plan</p>}
        </TabsContent>
        <TabsContent value="documents" className="mt-3"><PreviewRow icon={<FileText className="h-4 w-4" />} title={`${documentCount} saved document${documentCount === 1 ? "" : "s"}`} detail="Inspections, reports and home records" to="/documents" /></TabsContent>
        <TabsContent value="history" className="mt-3"><PreviewRow icon={<History className="h-4 w-4" />} title={`${historyCount} service record${historyCount === 1 ? "" : "s"}`} detail="Your home’s maintenance history" to="/timeline" /></TabsContent>
      </Tabs>
    </section>
  );
}

function HomeTeamCard({ team }: { team: { agent: HomeTeamMemberSummary | null; lender: HomeTeamMemberSummary | null } }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-3 shadow-soft sm:p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="flex min-w-0 items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-home-team-avatar"><ShieldCheck className="h-4 w-4 text-sucasa-orange" /></span><p className="truncate text-base font-semibold text-sucasa-navy sm:text-lg">Home Team</p></div>
        <Button asChild variant="ghost" size="sm" className="min-h-11 shrink-0 px-1 text-action-primary"><Link to="/home-team" aria-label="Manage Home Team"><ChevronRight className="h-4 w-4" /></Link></Button>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-2 sm:gap-3">
        <TeamMemberCard member={team.agent} role="agent" />
        <TeamMemberCard member={team.lender} role="lender" />
      </div>
    </section>
  );
}

function TeamMemberCard({ member, role }: { member: HomeTeamMemberSummary | null; role: "agent" | "lender" }) {
  const roleLabel = role === "agent" ? "agent" : "lender";
  const initials = member?.displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <Link
      to="/home-team"
      className="grid min-h-14 min-w-0 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-border bg-card p-2 transition-colors hover:bg-secondary sm:min-h-16 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:p-3"
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-home-team-avatar text-xs font-semibold text-action-primary sm:h-10 sm:w-10 sm:text-sm">
        {member ? initials : <UserRound className="h-5 w-5" />}
      </div>
      {member ? (
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground sm:text-base">{member.displayName}</p>
          <p className="truncate text-[10px] text-muted-foreground sm:text-xs">
            {member.state === "confirmed" ? `Your ${roleLabel}` : "Pending confirmation"}
          </p>
        </div>
      ) : (
        <div className="min-w-0"><p className="truncate text-xs font-semibold text-foreground sm:text-base">Add {role === "agent" ? "an" : "a"} {roleLabel}</p><p className="text-[10px] text-muted-foreground sm:text-xs">Not connected</p></div>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function PreviewRow({ icon, title, detail, to }: { icon: ReactNode; title: string; detail: string; to: "/home-care" | "/documents" | "/timeline" }) {
  return <Link to={to} className="flex min-h-11 items-center gap-2.5 rounded-xl bg-card px-3 py-2"><span className="shrink-0 text-sucasa-orange">{icon}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold sm:text-sm">{title}</span><span className="block truncate text-[10px] text-muted-foreground sm:text-sm">{detail}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /></Link>;
}

function EmptyPreview({ text, to }: { text: string; to: "/home-care" }) {
  return <Link to={to} className="flex min-h-11 items-center gap-3 rounded-xl bg-card px-3 py-3 text-xs text-muted-foreground sm:text-sm"><ShieldCheck className="h-4 w-4 text-status-nurture" /><span className="flex-1">{text}</span><ChevronRight className="h-4 w-4" /></Link>;
}

