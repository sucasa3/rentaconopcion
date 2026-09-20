import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronDown, HandHeart, Sparkles, ShieldCheck } from "lucide-react";
import { getLenderWorkspace } from "@/lib/lender-workspace.functions";
import { SectionHeader } from "@/components/ui-kit";
import { LenderSpotlightCard, LenderQueueRow } from "@/components/lender-contact-card";
import { LenderBriefDialog } from "@/components/lender-brief";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Lender Today — the lender's daily command center.
 *
 * Presentation only. Ranking, access classification, permissions, outcomes and
 * compliance all come from the existing gated workspace read. Nothing here
 * derives a score, widens visibility or names a sponsored-only homeowner.
 */
export function LenderToday() {
  const wsFn = useServerFn(getLenderWorkspace);
  const { data, isLoading } = useQuery({
    queryKey: ["lender-workspace"],
    queryFn: () => wsFn({ data: {} }),
    staleTime: 60_000,
  });
  const [brief, setBrief] = useState<{ id: string; name: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);

  if (isLoading) return <TodaySkeleton />;
  if (!data) return null;

  const { metrics, counts, askedToConnectList, daily, dailyTotal, queue, take } = data;
  const firstName = (data as { lender?: { firstName: string | null } }).lender?.firstName ?? null;
  const handled = metrics.relationshipsHandledToday ?? 0;
  const monitored = metrics.homeownersMonitored;

  const spotlight = daily[0] ?? null;
  const rest = showAll ? queue.slice(1) : daily.slice(1);
  const requests = askedToConnectList.filter((r) => r.clientId !== spotlight?.id);
  const quiet = daily.length === 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="professional-detail space-y-6 bg-background px-4 pb-12 pt-4 sm:px-6 sm:pt-6">
      {/* DAILY READ — compact briefing band */}
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
          {data.org.name} · Daily read
        </p>
        <h1 className="mt-1.5 text-[26px] font-semibold leading-[1.15] tracking-tight sm:text-[30px]">
          {greeting}
          {firstName ? `, ${firstName}` : ""}.{" "}
          <span className="text-text-secondary">
            {quiet ? "Your book is steady." : "Your book moved."}
          </span>
        </h1>

        <div className="mt-3 overflow-hidden rounded-xl border border-surface-intelligence-border bg-surface-intelligence">
          <div className="px-4 py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-surface-intelligence-foreground">
              <Sparkles className="h-3.5 w-3.5" /> SuCasa daily read
            </p>
            <p className="mt-1.5 text-[14px] font-medium leading-relaxed">{take}</p>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-surface-intelligence-border border-t border-surface-intelligence-border">
            <DailyMetric label="Need attention" value={metrics.needsAttentionToday} />
            <DailyMetric label="Reviews due" value={metrics.followUpsDue} />
            <DailyMetric label="Monitored" value={monitored} />
          </dl>
          {!quiet && (
            <>
              <button
                type="button"
                onClick={() => setWhyOpen((v) => !v)}
                aria-expanded={whyOpen}
                className="flex w-full items-center justify-center gap-1 border-t border-surface-intelligence-border py-2 text-[11px] font-semibold text-surface-intelligence-foreground"
              >
                Why these {daily.length}?
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform", whyOpen && "rotate-180")}
                />
              </button>
              {whyOpen && (
                <p className="border-t border-surface-intelligence-border px-4 py-3 text-[12px] leading-relaxed text-text-secondary">
                  This list is ranked by how timely a relationship check-in is — homeowners who
                  asked to connect come first, then the people your book suggests are most worth a
                  conversation today. {counts.hot} hot · {counts.warm} warm · {counts.nurture}{" "}
                  nurture. It is not a credit, approval or qualification score.
                </p>
              )}
            </>
          )}
        </div>

        {handled > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-status-positive">
            <CheckCircle2 className="h-4 w-4" /> {handled} relationship
            {handled === 1 ? "" : "s"} handled today
          </p>
        )}
      </header>

      {/* START HERE */}
      {spotlight ? (
        <section className="space-y-2.5">
          <SectionHeader title="Start here" />
          <LenderSpotlightCard
            person={spotlight}
            onBrief={() => setBrief({ id: spotlight.id, name: spotlight.name })}
          />
        </section>
      ) : (
        <div className="rounded-xl border border-surface-warm-border bg-surface-warm p-6 text-center">
          <CheckCircle2 className="mx-auto h-7 w-7 text-status-positive" />
          <p className="mt-2 font-semibold">Your book is in good shape today</p>
          <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
            Nothing needs immediate attention. SuCasa is monitoring {monitored.toLocaleString()}{" "}
            homeowner{monitored === 1 ? "" : "s"} and will surface the next meaningful relationship
            moment.
          </p>
        </div>
      )}

      {/* ASKED TO CONNECT — existing precedence and authorization disclosure */}
      {requests.length > 0 && (
        <section className="space-y-2.5">
          <SectionHeader title="Homeowners who asked to connect" />
          <ul className="space-y-2.5">
            {requests.map((r) => (
              <li
                key={r.clientId}
                className="rounded-xl border border-status-attention/30 bg-surface-warm p-3.5"
              >
                <p className="flex items-center gap-1.5 text-xs font-semibold text-status-attention">
                  <HandHeart className="h-3.5 w-3.5" /> Requested contact
                </p>
                <p className="mt-1 text-[17px] font-semibold leading-tight">{r.name}</p>
                <p className="mt-0.5 text-[13px] text-text-secondary">
                  Asked about: {r.askedAbout}
                </p>
                {r.note && <p className="mt-0.5 text-[13px]">{r.note}</p>}
                <p className="mt-1 text-[12px] text-text-secondary">
                  Authorized to share:{" "}
                  {r.authorized.length ? r.authorized.join(", ") : "contact only"}
                </p>
                <Link
                  to={"/lender/portfolio/$id" as never}
                  params={{ id: r.portfolioId } as never}
                  search={{ client: r.clientId } as never}
                  className="mt-2.5 inline-flex min-h-[38px] items-center rounded-md border border-border px-3 text-sm font-semibold text-primary"
                >
                  Review &amp; contact
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* THE QUEUE */}
      <section id="work-queue" className="scroll-mt-6 space-y-2.5">
        <SectionHeader title="Next relationships" />
        {quiet ? (
          <div className="rounded-xl border border-border bg-card px-5 py-8 text-center">
            <CheckCircle2 className="mx-auto h-7 w-7 text-status-positive" />
            <p className="mt-2 text-[16px] font-semibold">You&rsquo;re caught up</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
              SuCasa will keep watching your book and bring the right relationships back when
              something changes or a review becomes due.
            </p>
          </div>
        ) : (
          <>
            {rest.length > 0 ? (
              <ul className="space-y-2.5">
                {rest.map((p, i) => (
                  <LenderQueueRow
                    key={p.id}
                    person={p}
                    rank={i + 2}
                    onBrief={() => setBrief({ id: p.id, name: p.name })}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-text-secondary">
                Start here is the only relationship recommended right now.
              </p>
            )}
            {dailyTotal > daily.length && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="min-h-[44px] w-full rounded-md border border-border bg-card text-sm font-semibold text-primary"
              >
                {showAll ? "Show today's 10" : `View more (${dailyTotal - daily.length} waiting)`}
              </button>
            )}
          </>
        )}
      </section>

      {/* SUCASA WORKING FOR YOU — aggregate only. */}
      <section className="space-y-2.5">
        <SectionHeader title="SuCasa working for you" />
        <div className="rounded-xl border border-border bg-card p-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
            <Stat label="Homeowners monitored" value={monitored} />
            <Stat label="Signals detected" value={metrics.changesDetected} />
            <Stat label="Review opportunities" value={metrics.reviewOpportunities} />
            <Stat label="Engaged this month" value={metrics.engagedThisMonth} />
            <Stat label="Follow-ups organized" value={metrics.followUpsDue} />
            <Stat label="Sponsored, counted only" value={data.aggregateOnly.sponsoredOnly} />
          </dl>
          <p className="mt-3 flex gap-2 border-t border-border pt-3 text-xs leading-relaxed text-text-secondary">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Sponsored homeowners with no separate relationship are counted here only and never
            named. Sponsorship does not give you access to an individual homeowner&rsquo;s
            information.
          </p>
        </div>
      </section>

      <LenderBriefDialog
        clientId={brief?.id ?? null}
        name={brief?.name ?? null}
        onClose={() => setBrief(null)}
      />
    </div>
  );
}

function DailyMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-3 py-2.5 text-center">
      <dd className="text-lg font-semibold tabular-nums text-primary">{value.toLocaleString()}</dd>
      <dt className="mt-0.5 text-[11px] text-text-secondary">{label}</dt>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dd className="text-[18px] font-semibold tabular-nums">{value.toLocaleString()}</dd>
      <dt className="text-[12px] text-text-secondary">{label}</dt>
    </div>
  );
}

function TodaySkeleton() {
  return (
    <div className="space-y-5 px-4 pt-5 sm:px-6">
      <Skeleton className="h-9 w-56 rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
      {[0, 1].map((i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}
