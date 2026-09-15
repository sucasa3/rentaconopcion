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
import { listValueSnapshots } from "@/lib/home-timeline.functions";
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
  const fetchSnapshots = useServerFn(listValueSnapshots);
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
  const { data: snapshots } = useQuery({
    queryKey: ["value-snapshots"],
    queryFn: () => fetchSnapshots(undefined),
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
  const valueFreshness = latestDate((snapshots ?? []).map((row: any) => row.captured_on));

  return (
    <HomeownerShell premium>
      <main className="px-4 pb-28 pt-3 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-5xl space-y-6 sm:space-y-8">
          <HomeHero data={heroData} />
          {needsAddress ? <CompleteAddressCard /> : null}

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

          <HomeTeamCard team={homeTeam ?? { agent: null, lender: null }} />

          <section className="relative overflow-hidden rounded-3xl border border-surface-intelligence-border bg-surface-intelligence px-5 py-6 shadow-soft sm:flex sm:items-center sm:justify-between sm:gap-6 sm:px-6">
            <div className="relative">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-surface-intelligence-foreground"><Sparkles className="h-4 w-4 text-sucasa-orange" /> Ask SuCasa</p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">What would you like to know about your home?</h2>
              <p className="mt-1 text-sm text-muted-foreground">Get answers grounded in the records SuCasa has for this home.</p>
            </div>
            <Button asChild className="relative mt-5 min-h-11 w-full rounded-xl sm:mt-0 sm:w-auto">
              <Link to="/assistant" search={{ topic: undefined }}><MessageCircleQuestion className="h-4 w-4" /> Ask about your home</Link>
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

function formatMoney(value: number | null, compact = false) {
  if (value == null) return "Not available";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format(value);
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

function ScoreCard({ score, updatedAt }: { score: HomeScoreResult | null; updatedAt: string | null }) {
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
    <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center gap-5">
        <div className="relative grid h-24 w-24 shrink-0 place-items-center">
          <svg viewBox="0 0 112 112" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="56" cy="56" r="48" fill="none" stroke="currentColor" strokeWidth="7" className="text-secondary" />
            {score && (
              <circle cx="56" cy="56" r="48" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value / 100)} className={`home-score-ring ${ringTone}`} />
            )}
          </svg>
          <span className="text-3xl font-semibold tabular-nums">{score ? value : "—"}</span>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Home Score</p>
          <p className="mt-1 text-base font-semibold">{limitedRecords ? "Based on limited records" : score?.bandLabel ?? "Not enough information"}</p>
          {updatedAt && <p className="mt-1 text-xs text-muted-foreground">Updated {updatedAt}</p>}
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="mt-2 h-auto px-0 text-primary hover:bg-transparent">What affects this?</Button>
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
      </div>
    </section>
  );
}

function SystemHealth({ systems }: { systems: Array<{ key: string; label: string; status: TimelineItem["status"]; detail: string }> }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Home systems</p><h2 className="mt-1 text-lg font-semibold">What your records indicate</h2></div>
        <HeartPulse className="h-5 w-5 text-primary" />
      </div>
      {systems.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {systems.map((system) => (
            <div key={system.key} className="rounded-xl border border-border-subtle bg-secondary/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{system.label}</span>
                <span className={system.status === "overdue" ? "text-status-risk" : system.status === "due_soon" ? "text-status-attention" : "text-muted-foreground"}>
                  {system.status === "overdue" ? "May be due" : system.status === "due_soon" ? "Review soon" : "Record found"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{system.detail}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex gap-3 rounded-xl bg-secondary p-4">
          <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No system-specific records are available yet. SuCasa will not guess at your home’s condition.</p>
        </div>
      )}
    </section>
  );
}

function MoneyCard({ value, equity, equityPct, updatedAt }: { value: number | null; equity: number | null; equityPct: number | null; updatedAt: string | null }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Your money</p><h2 className="mt-1 text-xl font-semibold">Value & equity</h2></div>
        <Button asChild variant="ghost" size="sm" className="min-h-11"><Link to="/money">Details <ChevronRight className="h-4 w-4" /></Link></Button>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-surface-intelligence-border bg-surface-intelligence p-4"><p className="text-xs text-surface-intelligence-foreground">Estimated value</p><p className="mt-1 text-xl font-semibold tabular-nums text-sucasa-navy sm:text-2xl">{formatMoney(value, true)}</p></div>
        <div className="rounded-2xl border border-surface-intelligence-border bg-surface-intelligence p-4"><p className="text-xs text-surface-intelligence-foreground">Estimated equity</p><p className="mt-1 text-xl font-semibold tabular-nums text-sucasa-navy sm:text-2xl">{formatMoney(equity, true)}</p>{equityPct != null && <p className="mt-1 text-xs text-muted-foreground">{Math.round(equityPct * 100)}% of value</p>}</div>
      </div>
      {updatedAt && <p className="mt-3 text-xs text-muted-foreground">Value record as of {updatedAt}</p>}
    </section>
  );
}

function CareCard({ topPlanItem, planCount, documentCount, historyCount }: { topPlanItem: { title: string; why: string } | null; planCount: number; documentCount: number; historyCount: number }) {
  return (
    <section className="rounded-3xl border border-surface-warm-border bg-surface-warm p-5 shadow-soft sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Home Care</p>
      <Tabs defaultValue="todo" className="mt-3">
        <TabsList className="grid h-11 w-full grid-cols-3 bg-card/70"><TabsTrigger value="todo" className="h-9 data-[state=active]:text-status-opportunity">To do</TabsTrigger><TabsTrigger value="documents" className="h-9 data-[state=active]:text-status-opportunity">Documents</TabsTrigger><TabsTrigger value="history" className="h-9 data-[state=active]:text-status-opportunity">History</TabsTrigger></TabsList>
        <TabsContent value="todo" className="mt-4">
          {topPlanItem ? <PreviewRow icon={<HeartPulse className="h-4 w-4" />} title={topPlanItem.title} detail={topPlanItem.why} to="/home-care" /> : <EmptyPreview text="Nothing is due from the records currently available." to="/home-care" />}
          {planCount > 1 && <p className="mt-3 text-xs text-muted-foreground">{planCount - 1} more items in your care plan</p>}
        </TabsContent>
        <TabsContent value="documents" className="mt-4"><PreviewRow icon={<FileText className="h-4 w-4" />} title={`${documentCount} saved document${documentCount === 1 ? "" : "s"}`} detail="Inspections, reports and home records" to="/documents" /></TabsContent>
        <TabsContent value="history" className="mt-4"><PreviewRow icon={<History className="h-4 w-4" />} title={`${historyCount} service record${historyCount === 1 ? "" : "s"}`} detail="Your home’s maintenance history" to="/timeline" /></TabsContent>
      </Tabs>
    </section>
  );
}

function HomeTeamCard({ team }: { team: { agent: HomeTeamMemberSummary | null; lender: HomeTeamMemberSummary | null } }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-warm"><ShieldCheck className="h-5 w-5 text-sucasa-orange" /></span>
        <div><p className="text-lg font-semibold">Your Home Team</p><p className="mt-1 text-sm text-muted-foreground">Your relationships and information-sharing choices are managed separately.</p></div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <TeamMemberCard member={team.agent} role="agent" />
        <TeamMemberCard member={team.lender} role="lender" />
      </div>
      <Button asChild variant="ghost" className="mt-3 min-h-11 w-full justify-between px-3 text-primary">
        <Link to="/home-team">Manage Home Team <ChevronRight className="h-4 w-4" /></Link>
      </Button>
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
      className="min-w-0 rounded-2xl border border-border-subtle bg-surface-warm/55 p-3 transition-colors hover:bg-surface-warm sm:p-4"
    >
      <div className="grid h-11 w-11 place-items-center rounded-full bg-card text-sm font-semibold text-status-opportunity ring-1 ring-surface-warm-border">
        {member ? initials : <UserRound className="h-5 w-5" />}
      </div>
      {member ? (
        <>
          <p className="mt-3 truncate text-sm font-semibold text-foreground sm:text-base">{member.displayName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {member.state === "confirmed" ? `Your ${roleLabel}` : "Pending confirmation"}
          </p>
          {member.organizationName && <p className="mt-1 truncate text-xs text-muted-foreground">{member.organizationName}</p>}
        </>
      ) : (
        <>
          <p className="mt-3 text-sm font-semibold text-foreground sm:text-base">Add an {roleLabel}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Not connected</p>
        </>
      )}
    </Link>
  );
}

function PreviewRow({ icon, title, detail, to }: { icon: ReactNode; title: string; detail: string; to: "/home-care" | "/documents" | "/timeline" }) {
  return <Link to={to} className="flex min-h-11 items-center gap-3 rounded-xl bg-card/75 p-4"><span className="text-sucasa-orange">{icon}</span><span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span><span className="block text-sm text-muted-foreground">{detail}</span></span><ChevronRight className="h-4 w-4 text-muted-foreground" /></Link>;
}

function EmptyPreview({ text, to }: { text: string; to: "/home-care" }) {
  return <Link to={to} className="flex min-h-11 items-center gap-3 rounded-xl bg-card/75 p-4 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4 text-status-nurture" /><span className="flex-1">{text}</span><ChevronRight className="h-4 w-4" /></Link>;
}

