import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Sparkles,
  Upload,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { IntelligenceSurface, OpportunityDot } from "@/components/intelligence-surface";
import { getBusinessOverview } from "@/lib/business.functions";
import { getMyBusinessTasks } from "@/lib/tasks.functions";
import { getActionQueue, logOutcome } from "@/lib/nba.functions";
import { OUTCOME_STAGES, TEMPERATURE_META, type OutcomeStage } from "@/lib/next-best-action";
import {
  firstName,
  firstRunMode,
  handledToday,
  nextMovePrompt,
  outcomeAcknowledgement,
} from "@/lib/agent-daily";
import { ActionQueue } from "@/components/action-queue";
import { ChannelActions } from "@/components/channel-actions";
import { CopilotSearch } from "@/components/copilot-search";
import { SectionHeader } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

type QueueItem = Awaited<ReturnType<typeof getActionQueue>>["items"][number];

const SEEN_KEY = "sucasa.agent.firstrun.v1";

/**
 * The agent's daily command center.
 *
 * Who deserves my attention → why now → what SuCasa suggests → what to say →
 * act → what happened → who's next. Ranking, permissions and outcome logic all
 * come from the existing engines; this screen only presents them.
 */
export function AgentToday() {
  const t = useT();
  const qc = useQueryClient();

  const overviewFn = useServerFn(getBusinessOverview);
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ["business-overview", "agent"],
    queryFn: () => overviewFn({ data: { orgType: "agent" } }),
    staleTime: 60_000,
  });

  const queueFn = useServerFn(getActionQueue);
  const { data: queue, isLoading: queueLoading } = useQuery({
    queryKey: ["action-queue", "agent"],
    queryFn: () => queueFn({ data: { audience: "agent", limit: 25 } }),
    staleTime: 30_000,
  });

  const tasksFn = useServerFn(getMyBusinessTasks);
  const { data: tasks } = useQuery({
    queryKey: ["business-tasks", "agent"],
    queryFn: () => tasksFn({ data: { orgType: "agent" } }),
    staleTime: 30_000,
  });

  const [cursor, setCursor] = useState(0);
  const [handledNote, setHandledNote] = useState<{ name: string; next: string } | null>(null);
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    try {
      setSeen(window.localStorage.getItem(SEEN_KEY) === "1");
    } catch {
      setSeen(true);
    }
  }, []);
  const dismissFirstRun = () => {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode — the tour simply shows again */
    }
    setSeen(true);
  };

  const items = useMemo(() => queue?.items ?? [], [queue]);
  const book = overview?.books?.[0] ?? null;
  const clientCount = overview?.counts?.people ?? 0;
  const tasksDue = tasks?.openCount ?? 0;

  const outcomeFn = useServerFn(logOutcome);
  const outcome = useMutation({
    mutationFn: (v: { opportunityId: string; stage: OutcomeStage; note?: string }) =>
      outcomeFn({ data: { audience: "agent", ...v } }),
    onSuccess: (_r, v) => {
      const done = items.find((i) => i.opportunityId === v.opportunityId);
      const next = items[cursor + 1] ?? null;
      const labelKey = (
        v.stage === "appointment" || v.stage === "application" || v.stage === "closed"
          ? `biz.outcome.${v.stage}.agent`
          : `biz.outcome.${v.stage}`
      ) as Parameters<typeof t>[0];
      toast.success(outcomeAcknowledgement(done?.name ?? "", t(labelKey)), {
        description: nextMovePrompt(next?.name ?? null),
      });
      setHandledNote({
        name: firstName(done?.name ?? ""),
        next: nextMovePrompt(next?.name ?? null),
      });
      setCursor((c) => Math.min(c + 1, Math.max(items.length - 1, 0)));
      qc.invalidateQueries({ queryKey: ["action-queue", "agent"] });
      qc.invalidateQueries({ queryKey: ["business-tasks", "agent"] });
      qc.invalidateQueries({ queryKey: ["business-funnel", "agent"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (overviewLoading || queueLoading) return <TodaySkeleton />;

  // No homeowners yet — the intelligent import state, never a zeroed dashboard.
  if (clientCount === 0) {
    return <EmptyBook bookId={book?.id ?? null} />;
  }

  const mode = firstRunMode({
    seen,
    clientCount,
    queueCount: items.length,
    enrichmentPending: (overview?.counts?.opportunities ?? 0) === 0,
  });

  if (mode === "preparing") {
    return <PreparingBook count={clientCount} />;
  }

  const best = items[cursor] ?? null;
  const upNext = items.slice(cursor + 1, cursor + 6);
  const handled = handledToday(queue?.recentOutcomes ?? []);
  const monitored = clientCount;
  const engagedCount = queue?.counts?.engaged ?? 0;
  const quiet = items.length === 0;
  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? "biz.greet.morning" : hour < 18 ? "biz.greet.afternoon" : "biz.greet.evening");

  return (
    <div className="professional-detail space-y-6 bg-background px-4 pb-12 pt-4 sm:px-6 sm:pt-6">
      <header className="-mx-4 border-b border-border bg-surface-warm px-4 pb-4 pt-1 sm:-mx-6 sm:px-6">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          <OpportunityDot /> {t("biz.at.daily_intel")}
        </p>
        <h1 className="mt-1.5 text-[27px] font-semibold leading-[1.12] tracking-tight sm:text-[34px]">
          {greeting}.
          <span className="block text-text-secondary">
            {quiet ? t("biz.at.steady") : t("biz.at.moving")}
          </span>
        </h1>
        <dl className="mt-3 grid max-w-xl grid-cols-3 divide-x divide-border">
          <DailyMetric value={items.length} label={t("biz.at.need_attention")} />
          <DailyMetric value={tasksDue} label={t("biz.at.followups")} />
          <DailyMetric value={monitored} label={t("biz.at.monitored")} />
        </dl>
        {handled > 0 && (
          <p className="mt-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-status-positive">
            <CheckCircle2 className="h-4 w-4" />{" "}
            {t(handled === 1 ? "biz.at.handled_one" : "biz.at.handled_many", { count: handled })}
          </p>
        )}
      </header>

      {mode === "aha" && best && (
        <div className="-mt-2 flex items-center justify-between gap-3 text-xs text-text-secondary">
          <span>{t("biz.at.found")}</span>
          <Button variant="ghost" size="sm" onClick={dismissFirstRun} className="shrink-0 text-primary">
            {t("biz.at.got_it")}
          </Button>
        </div>
      )}


      {handledNote && (
        <div className="animate-in fade-in rounded-xl border border-status-positive/25 bg-status-positive/[0.06] p-3.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-status-positive">
            <CheckCircle2 className="h-4 w-4" /> {t("biz.at.handled_note", { name: handledNote.name })}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">
            {t("biz.at.handled_body")} {handledNote.next}
          </p>
        </div>
      )}

      {best ? (
        <section className="space-y-2.5">
          <SectionHeader title={t("biz.at.start_here")} />
          <BestMove
            item={best}
            onOutcome={(stage, note) =>
              outcome.mutate({ opportunityId: best.opportunityId, stage, note })
            }
            pending={outcome.isPending}
          />
        </section>
      ) : (

        <div className="rounded-3xl border border-surface-warm-border bg-surface-warm p-6 text-center">
          <CheckCircle2 className="mx-auto h-7 w-7 text-status-positive" />
          <p className="mt-2 font-semibold">{t("biz.at.good_shape")}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
            {t(monitored === 1 ? "biz.at.good_shape_body_one" : "biz.at.good_shape_body_many", {
              count: monitored.toLocaleString(),
            })}
          </p>
        </div>
      )}

      {upNext.length > 0 && (
        <section className="space-y-2.5">
          <SectionHeader title={t("biz.at.next_rel")} />
          <ul className="space-y-2.5">
            {upNext.map((item, i) => (
              <NextRelationship
                key={item.opportunityId}
                item={item}
                rank={i + 2}
                onFocus={() => setCursor(cursor + 1 + i)}
                onAct={(channel) =>
                  outcome.mutate({
                    opportunityId: item.opportunityId,
                    stage: "attempted",
                    note:
                      channel === "call"
                        ? "Tapped call"
                        : channel === "text"
                          ? "Tapped text"
                          : "Tapped email",
                  })
                }
              />
            ))}
          </ul>
          <Link
            to="/agent/opportunities"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
          >
            {t("biz.at.view_all")} <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      )}

      {book && (
        <CopilotSearch
          portfolioId={book.id}
          detailPath={(r) => ({
            to: "/agent/portfolio/$id",
            params: { id: r.portfolio_id },
            search: { client: r.id },
          })}
        />
      )}

      <MetricStrip
        people={clientCount}
        activated={overview?.counts?.activated ?? 0}
        opportunities={overview?.counts?.opportunities ?? 0}
        engaged={engagedCount}
        worthAttention={items.length}
        tasksDue={tasksDue}
        bookId={book?.id ?? null}
      />
    </div>
  );
}


/**
 * A lighter row for the relationships after Start Here: who, why now, the
 * suggested play and the channels the server already permitted.
 */
function NextRelationship({
  item,
  rank,
  onFocus,
  onAct,
}: {
  item: QueueItem;
  rank: number;
  onFocus: () => void;
  onAct: (channel: "call" | "text" | "email") => void;
}) {
  const t = useT();
  return (
    <li className="rounded-xl border border-border bg-card p-3.5 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-primary">
          {rank}
        </span>
        <button type="button" onClick={onFocus} className="min-w-0 flex-1 text-left">
          <p className="truncate text-[16px] font-semibold leading-tight">{item.name}</p>
          <p className="mt-0.5 text-xs font-medium text-status-opportunity">{item.categoryLabel}</p>
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-text-secondary">{item.why}</p>
        </button>
      </div>
      <div className="mt-2.5 border-t border-border pt-2.5">
        <ChannelActions
          options={item.channels ?? []}
          phone={item.phone}
          email={item.email}
          size="sm"
          onAct={onAct}
          emailHref={`mailto:${item.email ?? ""}?subject=${encodeURIComponent(
            item.draftSubject ?? "",
          )}&body=${encodeURIComponent(item.draftBody ?? "")}`}
        >
          {item.portfolioId && (
            <Link
              to="/agent/portfolio/$id"
              params={{ id: item.portfolioId }}
              search={{ client: item.clientId } as never}
              className="inline-flex min-h-[38px] items-center rounded-md border border-border px-3 text-sm font-semibold text-primary"
            >
              {t("biz.at.view_homeowner")}
            </Link>
          )}
        </ChannelActions>
      </div>
    </li>
  );
}

/** The single highest-priority homeowner, with everything needed to act. */
function BestMove({
  item,
  onOutcome,
  pending,
}: {
  item: QueueItem;
  onOutcome: (stage: OutcomeStage, note?: string) => void;
  pending: boolean;
}) {
  const t = useT();
  const [showOutcomes, setShowOutcomes] = useState(false);
  const meta = TEMPERATURE_META[item.temperature];
  const n = item.narrative;
  const supportingFacts = [...(n?.supportingSignals ?? []), ...(n?.secondarySignals ?? [])].slice(0, 3);
  // The canonical narrative decides the opener. A cached draft is only used
  // when the server has already validated it against the same fact snapshot.
  const opener = n?.openerSeed || item.draftBody?.trim() || item.headline;

  return (
    <section className="animate-in fade-in overflow-hidden rounded-xl border border-border bg-card shadow-elevated">
      {/* 3px brand line — the only large-format orange on the page. */}
      <div className="h-[3px] w-full bg-sucasa-orange" aria-hidden />
      <div className="bg-surface-warm px-5 py-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-status-opportunity">
          <OpportunityDot /> {item.categoryLabel}
        </p>
        <h2 className="mt-1 text-[25px] font-semibold leading-tight tracking-tight">{item.name}</h2>
        <p className={cn("mt-1 flex items-center gap-1.5 text-[11px] font-medium", meta.text)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} aria-hidden />
          {t(`biz.temp.${item.temperature}` as const)}
        </p>
        {supportingFacts.length ? (
          <p className="mt-2 text-[13px] leading-snug text-text-secondary">
            {supportingFacts.join(" · ")}
          </p>
        ) : null}
      </div>

      <div className="space-y-3.5 px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {t("biz.at.why_now")}
          </p>
          <p className="mt-1 text-sm font-medium leading-relaxed text-primary">
            {n?.whyItMatters ?? item.why}
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {t("biz.at.next_step")}
          </p>
          <p className="mt-1 text-sm font-medium leading-relaxed">{n?.howToBeUseful ?? item.ask}</p>
        </div>


        {opener && (
          <IntelligenceSurface label={t("biz.at.opener")} compact>
            <p className="text-sm leading-relaxed">{opener}</p>
          </IntelligenceSurface>
        )}

        <ChannelActions
          options={item.channels ?? []}
          phone={item.phone}
          email={item.email}
          onAct={(channel) =>
            onOutcome(
              "attempted",
              channel === "call" ? "Tapped call" : channel === "text" ? "Tapped text" : "Tapped email",
            )
          }
          emailHref={`mailto:${item.email ?? ""}?subject=${encodeURIComponent(
            item.draftSubject ?? "",
          )}&body=${encodeURIComponent(item.draftBody ?? "")}`}
        >
          {item.portfolioId && (
            <Link
              to="/agent/portfolio/$id"
              params={{ id: item.portfolioId }}
              search={{ client: item.clientId } as never}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border-subtle px-5 text-sm font-semibold"
            >
              {t("biz.at.view_homeowner")}
            </Link>
          )}
        </ChannelActions>

        <div className="border-t border-border pt-2.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowOutcomes((v) => !v)}
            aria-expanded={showOutcomes}
            className="px-0 text-text-secondary hover:bg-transparent hover:text-primary"
          >
            {t("biz.at.log_outcome")}
            {pending ? <Loader2 className="animate-spin" /> : <ChevronDown className={cn("transition-transform", showOutcomes && "rotate-180")} />}
          </Button>
          {showOutcomes && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {OUTCOME_STAGES.map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => onOutcome(s)}
                  className="rounded-full text-text-secondary shadow-none"
                >
                  {t(
                    (s === "appointment" || s === "application" || s === "closed"
                      ? `biz.outcome.${s}.agent`
                      : `biz.outcome.${s}`) as Parameters<typeof t>[0],
                  )}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function DailyMetric({ value, label }: { value: number; label: string }) {
  return (
    <div className="px-3 first:pl-0 last:pr-0">
      <dd className="text-lg font-semibold leading-none text-primary">{value.toLocaleString()}</dd>
      <dt className="mt-1 text-[11px] leading-tight text-text-secondary">{label}</dt>
    </div>
  );
}

/**
 * Proof that SuCasa is working between logins. Each tile is an existing real
 * metric; signal, opportunity and relationship counts stay labelled apart.
 */
function MetricStrip({
  people,
  activated,
  opportunities,
  engaged,
  worthAttention,
  tasksDue,
  bookId,
}: {
  people: number;
  activated: number;
  opportunities: number;
  engaged: number;
  worthAttention: number;
  tasksDue: number;
  bookId: string | null;
}) {
  const t = useT();
  const tiles = [
    { label: t("biz.at.m_monitored"), value: people },
    { label: t("biz.at.m_activated"), value: activated },
    { label: t("biz.at.m_worth"), value: worthAttention },
    { label: t("biz.at.m_engaged"), value: engaged },
    // Open opportunity records, not signals and not guaranteed transactions.
    { label: t("biz.at.m_opps"), value: opportunities },
    { label: t("biz.at.followups"), value: tasksDue },
  ];
  return (
    <section className="space-y-2.5">
      <SectionHeader title={t("biz.at.working")} />
      <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="min-w-[9.5rem] shrink-0 snap-start rounded-2xl border border-border/60 bg-card px-3.5 py-3"
          >
            <p className="text-lg font-semibold leading-none">{t.value.toLocaleString()}</p>
            <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{t.label}</p>
          </div>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("biz.at.footnote")}
      </p>
      <div className="flex flex-wrap gap-3 pt-1 text-sm font-semibold text-primary">
        <Link to="/agent/opportunities" className="inline-flex items-center gap-1">
          {t("biz.at.what_else")} <ArrowRight className="h-4 w-4" />
        </Link>
        <Link to="/agent/tasks" className="inline-flex items-center gap-1">
          {t("biz.at.all_tasks")} <ArrowRight className="h-4 w-4" />
        </Link>
        {bookId && (
          <Link
            to="/agent/portfolio/$id"
            params={{ id: bookId }}
            className="inline-flex items-center gap-1"
          >
            {t("biz.at.my_book")} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </section>
  );
}

function EmptyBook({ bookId }: { bookId: string | null }) {
  const t = useT();
  const steps = [
    t("biz.at.empty_s1"),
    t("biz.at.empty_s2"),
    t("biz.at.empty_s3"),
    t("biz.at.empty_s4"),
  ];
  return (
    <div className="px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-md text-center">
        <Sparkles className="mx-auto h-8 w-8 text-primary" />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {t("biz.at.empty_title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("biz.at.empty_body")}
        </p>
        {bookId && (
          <div className="mt-6 flex flex-col gap-2.5">
            <Link
              to="/agent/add-client/$id"
              params={{ id: bookId }}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-soft"
            >
              <Upload className="h-4 w-4" /> {t("biz.at.empty_import")}
            </Link>
            <Link
              to="/agent/add-client/$id"
              params={{ id: bookId }}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-border text-sm font-semibold"
            >
              <UserPlus className="h-4 w-4" /> {t("biz.at.empty_add")}
            </Link>
          </div>
        )}
        <ol className="mt-8 space-y-3 text-left">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                {i + 1}
              </span>
              <span className="text-muted-foreground">{s}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function PreparingBook({ count }: { count: number }) {
  const t = useT();
  const steps = [
    t("biz.at.prep_s1"),
    t("biz.at.prep_s2"),
    t("biz.at.prep_s3"),
    t("biz.at.prep_s4"),
  ];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => (s + 1) % steps.length), 1600);
    return () => window.clearInterval(id);
  }, [steps.length]);

  return (
    <div className="px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">{t("biz.at.prep_title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("biz.at.prep_body", { count: count.toLocaleString() })}
        </p>
        <ul className="mt-6 space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-3 text-sm">
              {i < step ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
              ) : i === step ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
              ) : (
                <span className="h-5 w-5 shrink-0 rounded-full border border-border" />
              )}
              <span className={i <= step ? "" : "text-muted-foreground"}>{s}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function TodaySkeleton() {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6">
      <div className="h-7 w-2/3 animate-pulse rounded-full bg-secondary" />
      <div className="h-4 w-1/2 animate-pulse rounded-full bg-secondary" />
      <div className="h-64 animate-pulse rounded-[28px] bg-secondary" />
      <div className="h-16 animate-pulse rounded-2xl bg-secondary" />
      <div className="h-16 animate-pulse rounded-2xl bg-secondary" />
    </div>
  );
}
