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
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Lender Today — the lender's daily command center.
 *
 * Presentation only. Ranking, access classification, permissions, outcomes and
 * compliance all come from the existing gated workspace read. Nothing here
 * derives a score, widens visibility or names a sponsored-only homeowner.
 */
export function LenderToday() {
  const t = useT();
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
  const greeting = t(hour < 12 ? "biz.greet.morning" : hour < 18 ? "biz.greet.afternoon" : "biz.greet.evening");

  return (
    <div className="professional-detail space-y-6 bg-background px-4 pb-12 pt-4 sm:px-6 sm:pt-6">
      {/* DAILY READ — compact briefing band */}
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
          {data.org.name} · {t("biz.lt.daily_read")}
        </p>
        <h1 className="mt-1.5 text-[26px] font-semibold leading-[1.15] tracking-tight sm:text-[30px]">
          {greeting}
          {firstName ? `, ${firstName}` : ""}.{" "}
          <span className="text-text-secondary">
            {quiet ? t("biz.lt.steady") : t("biz.lt.moved")}
          </span>
        </h1>

        <div className="mt-3 overflow-hidden rounded-xl border border-surface-intelligence-border bg-surface-intelligence">
          <div className="px-4 py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-surface-intelligence-foreground">
              <Sparkles className="h-3.5 w-3.5" /> {t("biz.lt.sucasa_daily")}
            </p>
            <p className="mt-1.5 text-[14px] font-medium leading-relaxed">{take}</p>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-surface-intelligence-border border-t border-surface-intelligence-border">
            <DailyMetric label={t("biz.at.need_attention")} value={metrics.needsAttentionToday} />
            <DailyMetric label={t("biz.lt.reviews_due")} value={metrics.followUpsDue} />
            <DailyMetric label={t("biz.at.monitored")} value={monitored} />
          </dl>
          {!quiet && (
            <>
              <button
                type="button"
                onClick={() => setWhyOpen((v) => !v)}
                aria-expanded={whyOpen}
                className="flex w-full items-center justify-center gap-1 border-t border-surface-intelligence-border py-2 text-[11px] font-semibold text-surface-intelligence-foreground"
              >
                {t("biz.lt.why_these", { count: daily.length })}
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform", whyOpen && "rotate-180")}
                />
              </button>
              {whyOpen && (
                <p className="border-t border-surface-intelligence-border px-4 py-3 text-[12px] leading-relaxed text-text-secondary">
                  {t("biz.lt.why_body", {
                    hot: counts.hot,
                    warm: counts.warm,
                    nurture: counts.nurture,
                  })}
                </p>
              )}
            </>
          )}
        </div>

        {handled > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-status-positive">
            <CheckCircle2 className="h-4 w-4" />{" "}
            {t(handled === 1 ? "biz.at.handled_one" : "biz.at.handled_many", { count: handled })}
          </p>
        )}
      </header>

      {/* START HERE */}
      {spotlight ? (
        <section className="space-y-2.5">
          <SectionHeader title={t("biz.at.start_here")} />
          <LenderSpotlightCard
            person={spotlight}
            onBrief={() => setBrief({ id: spotlight.id, name: spotlight.name })}
          />
        </section>
      ) : (
        <div className="rounded-xl border border-surface-warm-border bg-surface-warm p-6 text-center">
          <CheckCircle2 className="mx-auto h-7 w-7 text-status-positive" />
          <p className="mt-2 font-semibold">{t("biz.lt.good_shape")}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
            {t(monitored === 1 ? "biz.lt.good_shape_body_one" : "biz.lt.good_shape_body_many", {
              count: monitored.toLocaleString(),
            })}
          </p>
        </div>
      )}

      {/* ASKED TO CONNECT — existing precedence and authorization disclosure */}
      {requests.length > 0 && (
        <section className="space-y-2.5">
          <SectionHeader title={t("biz.lt.asked")} />
          <ul className="space-y-2.5">
            {requests.map((r) => (
              <li
                key={r.clientId}
                className="rounded-xl border border-status-attention/30 bg-surface-warm p-3.5"
              >
                <p className="flex items-center gap-1.5 text-xs font-semibold text-status-attention">
                  <HandHeart className="h-3.5 w-3.5" /> {t("biz.lt.requested")}
                </p>
                <p className="mt-1 text-[17px] font-semibold leading-tight">{r.name}</p>
                <p className="mt-0.5 text-[13px] text-text-secondary">
                  {t("biz.lt.asked_about", { topic: r.askedAbout })}
                </p>
                {r.note && <p className="mt-0.5 text-[13px]">{r.note}</p>}
                <p className="mt-1 text-[12px] text-text-secondary">
                  {t("biz.lt.authorized", {
                    items: r.authorized.length ? r.authorized.join(", ") : t("biz.lt.contact_only"),
                  })}
                </p>
                <Link
                  to={"/lender/portfolio/$id" as never}
                  params={{ id: r.portfolioId } as never}
                  search={{ client: r.clientId } as never}
                  className="mt-2.5 inline-flex min-h-[38px] items-center rounded-md border border-border px-3 text-sm font-semibold text-primary"
                >
                  {t("biz.lt.review_contact")}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* THE QUEUE */}
      <section id="work-queue" className="scroll-mt-6 space-y-2.5">
        <SectionHeader title={t("biz.at.next_rel")} />
        {quiet ? (
          <div className="rounded-xl border border-border bg-card px-5 py-8 text-center">
            <CheckCircle2 className="mx-auto h-7 w-7 text-status-positive" />
            <p className="mt-2 text-[16px] font-semibold">{t("biz.lt.caught_up")}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
              {t("biz.lt.caught_body")}
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
                {t("biz.lt.only_one")}
              </p>
            )}
            {dailyTotal > daily.length && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="min-h-[44px] w-full rounded-md border border-border bg-card text-sm font-semibold text-primary"
              >
                {showAll ? t("biz.lt.show_today") : t("biz.lt.view_more", { count: dailyTotal - daily.length })}
              </button>
            )}
          </>
        )}
      </section>

      {/* SUCASA WORKING FOR YOU — aggregate only. */}
      <section className="space-y-2.5">
        <SectionHeader title={t("biz.at.working")} />
        <div className="rounded-xl border border-border bg-card p-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
            <Stat label={t("biz.at.m_monitored")} value={monitored} />
            <Stat label={t("biz.lt.s_signals")} value={metrics.changesDetected} />
            <Stat label={t("biz.lt.s_review_opps")} value={metrics.reviewOpportunities} />
            <Stat label={t("biz.lt.s_engaged")} value={metrics.engagedThisMonth} />
            <Stat label={t("biz.lt.s_followups")} value={metrics.followUpsDue} />
            <Stat label={t("biz.lt.s_sponsored")} value={data.aggregateOnly.sponsoredOnly} />
          </dl>
          <p className="mt-3 flex gap-2 border-t border-border pt-3 text-xs leading-relaxed text-text-secondary">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("biz.lt.sponsored_note")}
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
