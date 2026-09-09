import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  ChevronDown,
  HandHeart,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { getLenderWorkspace } from "@/lib/lender-workspace.functions";
import { SectionHeader } from "@/components/ui-kit";
import { LenderContactCard } from "@/components/lender-contact-card";
import { LenderBriefDialog } from "@/components/lender-brief";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Daily Intelligence — the lender's daily operating screen.
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

  const headline = quiet
    ? `Your book is quiet today. Nothing needs immediate attention — SuCasa is still monitoring ${monitored.toLocaleString()} homeowner${monitored === 1 ? "" : "s"} for you.`
    : `SuCasa reviewed ${monitored.toLocaleString()} homeowner${monitored === 1 ? "" : "s"} and found ${daily.length} relationship${daily.length === 1 ? "" : "s"} worth your attention today.`;

  const supporting = [
    metrics.askedToConnect > 0 &&
      `${metrics.askedToConnect} homeowner${metrics.askedToConnect === 1 ? "" : "s"} asked to connect`,
    metrics.followUpsDue > 0 &&
      `${metrics.followUpsDue} follow-up${metrics.followUpsDue === 1 ? "" : "s"} ${metrics.followUpsDue === 1 ? "is" : "are"} due`,
    (metrics.relationshipsWithSignals ?? 0) > 0 &&
      `${metrics.relationshipsWithSignals} relationship${metrics.relationshipsWithSignals === 1 ? "" : "s"} showed meaningful signals`,
    `${monitored.toLocaleString()} homeowner${monitored === 1 ? "" : "s"} remain monitored`,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-10 px-4 pb-12 pt-7 sm:px-6">
      {/* GREETING */}
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
          {data.org.name} · Daily Intelligence
        </p>
        <h1 className="mt-2 text-[32px] font-semibold leading-[1.1] tracking-tight sm:text-[38px]">
          {greeting}
          {firstName ? `, ${firstName}` : ""}.
          <span className="block text-muted-foreground">
            {quiet ? "Your book is steady." : "Your book moved."}
          </span>
        </h1>
        <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-muted-foreground">
          {headline}
        </p>
      </header>

      {/* DAILY INTELLIGENCE SUMMARY */}
      <section
        className={cn(
          "overflow-hidden rounded-[30px] border shadow-soft",
          quiet ? "border-growth/25 bg-growth/[0.06]" : "border-attention/30 bg-attention/[0.08]",
        )}
      >
        <div className="p-6">
          {quiet ? (
            <>
              <p className="flex items-center gap-2 text-[17px] font-semibold text-growth">
                <CheckCircle2 className="h-5 w-5" /> Your book is in good shape today
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                Nothing requires immediate attention. SuCasa is monitoring{" "}
                {monitored.toLocaleString()} homeowner{monitored === 1 ? "" : "s"} and will surface
                the next meaningful relationship moment.
              </p>
            </>
          ) : (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-attention-foreground/80">
                Deserves your attention today
              </p>
              <p className="mt-1 flex items-baseline gap-3 text-attention-foreground">
                <span className="text-[56px] font-semibold leading-none tabular-nums">
                  {metrics.needsAttentionToday}
                </span>
                <span className="text-[15px] font-medium">
                  relationship{metrics.needsAttentionToday === 1 ? "" : "s"}
                </span>
              </p>
            </>
          )}

          <ul className="mt-5 space-y-1.5 border-t border-border/40 pt-4">
            {supporting.map((line) => (
              <li key={line} className="flex gap-2 text-[14px] text-muted-foreground">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                {line}
              </li>
            ))}
          </ul>

          {handled > 0 && (
            <p className="mt-4 flex items-center gap-1.5 text-[14px] font-semibold text-growth">
              <CheckCircle2 className="h-4 w-4" /> {handled} relationship
              {handled === 1 ? "" : "s"} handled today
            </p>
          )}
        </div>
      </section>

      {/* SUCASA DAILY READ */}
      {!quiet && (
        <section className="overflow-hidden rounded-[30px] border border-surface-intelligence-border bg-surface-intelligence">
          <div className="p-6">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-surface-intelligence-foreground">
              <Sparkles className="h-3.5 w-3.5" /> SuCasa daily read
            </p>
            <p className="mt-2.5 text-[17px] font-medium leading-relaxed">{take}</p>

            <dl className="mt-5 space-y-3 border-t border-surface-intelligence-border pt-4">
              {spotlight && <Read label="Start here" value={spotlight.name} strong />}
              {spotlight && <Read label="Why" value={spotlight.whyToday} />}
              {metrics.followUpsDue > 0 && (
                <Read
                  label="Then"
                  value={`${metrics.followUpsDue} follow-up${metrics.followUpsDue === 1 ? "" : "s"} ${metrics.followUpsDue === 1 ? "is" : "are"} due`}
                />
              )}
            </dl>
          </div>

          <button
            type="button"
            onClick={() => setWhyOpen((v) => !v)}
            className="flex w-full items-center justify-center gap-1 border-t border-surface-intelligence-border py-3 text-xs font-semibold text-surface-intelligence-foreground transition active:bg-primary/10"
          >
            Why these {daily.length}?
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition duration-200", whyOpen && "rotate-180")}
            />
          </button>
          {whyOpen && (
            <p className="border-t border-surface-intelligence-border px-6 py-4 text-[13px] leading-relaxed text-text-secondary">
              This list is ranked by how timely a relationship check-in is — homeowners who asked to
              connect come first, then the people your book suggests are most worth a conversation
              today. {counts.hot} hot · {counts.warm} warm · {counts.nurture} nurture. It is not a
              credit, approval or qualification score.
            </p>
          )}
        </section>
      )}

      {/* START HERE */}
      {spotlight && (
        <section className="space-y-3">
          <SectionHeader title="Start here" />
          <p className="-mt-1 text-[13px] text-muted-foreground">
            SuCasa selected this one relationship to begin with today.
          </p>
          <ul>
            <LenderContactCard
              key={spotlight.id}
              person={spotlight}
              rank={1}
              spotlight
              onBrief={() => setBrief({ id: spotlight.id, name: spotlight.name })}
            />
          </ul>
        </section>
      )}

      {/* ASKED TO CONNECT */}
      {requests.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title="Homeowners who asked to connect" />
          <p className="-mt-1 text-[13px] text-muted-foreground">
            These people asked for help themselves. Work these first.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {requests.map((r) => (
              <div
                key={r.clientId}
                className="rounded-[28px] border border-status-attention/30 bg-status-attention/[0.07] p-5"
              >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-attention/20 px-2.5 py-1 text-[11px] font-semibold text-attention-foreground">
                  <HandHeart className="h-3.5 w-3.5" /> Requested contact
                </span>
                <p className="mt-3 text-[22px] font-semibold leading-tight tracking-tight">
                  {r.name}
                </p>
                <p className="mt-1 text-[15px] text-muted-foreground">Asked about: {r.askedAbout}</p>
                {r.note && <p className="mt-1 text-[15px]">{r.note}</p>}
                <p className="mt-2 text-xs text-muted-foreground">
                  Authorized to share:{" "}
                  {r.authorized.length ? r.authorized.join(", ") : "contact only"}
                </p>
                <Link
                  to={"/lender/portfolio/$id" as never}
                  params={{ id: r.portfolioId } as never}
                  search={{ client: r.clientId } as never}
                  className="mt-4 inline-flex min-h-[44px] items-center rounded-full bg-action-primary px-5 text-sm font-semibold text-action-primary-foreground transition active:scale-95"
                >
                  Review &amp; contact
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TODAY'S RELATIONSHIPS */}
      <section id="work-queue" className="scroll-mt-6 space-y-3">
        <SectionHeader title="Today's relationships" />
        <div className="-mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
          <span>
            {daily.length} relationship{daily.length === 1 ? "" : "s"} currently recommended
          </span>
          {handled > 0 && (
            <span className="font-semibold text-growth">
              {handled} handled today
            </span>
          )}
        </div>

        {quiet ? (
          <div className="rounded-[28px] bg-secondary/50 px-5 py-10 text-center">
            <CheckCircle2 className="mx-auto h-7 w-7 text-growth" />
            <p className="mt-2 text-[16px] font-semibold">You&rsquo;re caught up</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              SuCasa will keep watching your book and bring the right relationships back when
              something changes or a follow-up becomes due.
            </p>
          </div>
        ) : (
          <>
            {rest.length > 0 && (
              <ul className="space-y-3">
                {rest.map((p, i) => (
                  <LenderContactCard
                    key={p.id}
                    person={p}
                    rank={i + 2}
                    onBrief={() => setBrief({ id: p.id, name: p.name })}
                  />
                ))}
              </ul>
            )}
            {dailyTotal > daily.length && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="min-h-[46px] w-full rounded-full border border-border bg-card text-sm font-semibold transition active:scale-[0.99]"
              >
                {showAll ? "Show today's 10" : `View more (${dailyTotal - daily.length} waiting)`}
              </button>
            )}
          </>
        )}
      </section>

      {/* SUCASA WORKING FOR YOU — aggregate only. */}
      <section className="space-y-3">
        <SectionHeader title="SuCasa working for you" />
        <div className="rounded-[30px] border border-border-subtle bg-card p-6">
          <dl className="space-y-3">
            <Stat label="Homeowners monitored" value={monitored} />
            <Stat label="Signals detected" value={metrics.changesDetected} />
            <Stat label="Review opportunities surfaced" value={metrics.reviewOpportunities} />
            <Stat label="Homeowners engaged this month" value={metrics.engagedThisMonth} />
            <Stat label="Follow-ups organized" value={metrics.followUpsDue} />
            {Object.entries(data.serviceDelivery)
              .slice(0, 3)
              .map(([k, n]) => (
                <Stat key={k} label={k.replace(/_/g, " ")} value={n as number} capitalize />
              ))}
            <Stat
              label="Sponsored homeowners, counted only"
              value={data.aggregateOnly.sponsoredOnly}
            />
          </dl>
          <p className="mt-5 flex gap-2 border-t border-border/50 pt-4 text-xs leading-relaxed text-muted-foreground">
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

function Read({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </dt>
      <dd className={cn("mt-0.5 leading-snug", strong ? "text-[17px] font-semibold" : "text-[14px]")}>
        {value}
      </dd>
    </div>
  );
}

function Stat({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: number;
  capitalize?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={cn("text-[14px] text-muted-foreground", capitalize && "capitalize")}>
        {label}
      </dt>
      <dd className="text-[19px] font-semibold tabular-nums">{value.toLocaleString()}</dd>
    </div>
  );
}

function TodaySkeleton() {
  return (
    <div className="space-y-6 px-4 pt-7 sm:px-6">
      <Skeleton className="h-10 w-56 rounded-2xl" />
      <Skeleton className="h-40 w-full rounded-[30px]" />
      <Skeleton className="h-48 w-full rounded-[30px]" />
      {[0, 1].map((i) => (
        <Skeleton key={i} className="h-56 w-full rounded-[28px]" />
      ))}
    </div>
  );
}
