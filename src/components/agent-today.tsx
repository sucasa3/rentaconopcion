import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Sparkles,
  Upload,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { IntelligenceSurface, OpportunityDot } from "@/components/intelligence-surface";
import { getBusinessOverview } from "@/lib/business.functions";
import { getMyBusinessTasks } from "@/lib/tasks.functions";
import { getActionQueue, logOutcome } from "@/lib/nba.functions";
import { OUTCOME_STAGES, TEMPERATURE_META, outcomeLabel, type OutcomeStage } from "@/lib/next-best-action";
import {
  buildDailyRead,
  firstName,
  firstRunMode,
  handledToday,
  intelligenceLines,
  nextMovePrompt,
  outcomeAcknowledgement,
} from "@/lib/agent-daily";
import { ActionQueue } from "@/components/action-queue";
import { ChannelActions } from "@/components/channel-actions";
import { CopilotSearch } from "@/components/copilot-search";
import { SectionHeader } from "@/components/ui-kit";

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
      toast.success(outcomeAcknowledgement(done?.name ?? "", outcomeLabel(v.stage, "agent")), {
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
  const read = buildDailyRead(items.slice(cursor));
  const handled = handledToday(queue?.recentOutcomes ?? []);
  const monitored = clientCount;
  const engagedCount = queue?.counts?.engaged ?? 0;
  const lines = intelligenceLines({
    monitored,
    engaged: engagedCount,
    worthAttention: items.length,
    tasksDue,
  });
  const quiet = items.length === 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-9 bg-surface-base px-4 pb-12 pt-6 sm:px-6">
      <header className="-mx-4 rounded-b-[28px] border-b border-surface-warm-border bg-surface-warm px-4 pb-6 pt-1 sm:-mx-6 sm:px-6">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          <OpportunityDot /> Daily Intelligence
        </p>
        <h1 className="mt-2 text-[30px] font-semibold leading-[1.12] tracking-tight sm:text-[36px]">
          {greeting}.
          <span className="block text-text-secondary">
            {quiet ? "Your book is steady today." : "Your relationships are moving."}
          </span>
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-text-secondary">
          {quiet
            ? `Nothing needs immediate attention. SuCasa is monitoring ${monitored.toLocaleString()} homeowner${monitored === 1 ? "" : "s"} and will surface the next useful moment.`
            : `SuCasa is monitoring ${monitored.toLocaleString()} homeowner${monitored === 1 ? "" : "s"} and found ${items.length} relationship${items.length === 1 ? "" : "s"} worth your attention today.`}
        </p>
        <ul className="mt-4 space-y-1.5">
          {lines.map((l) => (
            <li key={l} className="flex gap-2 text-[13.5px] text-text-secondary">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-text-secondary/50" />
              {l}
            </li>
          ))}
        </ul>
        {handled > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-[14px] font-semibold text-status-positive">
            <CheckCircle2 className="h-4 w-4" /> {handled} relationship
            {handled === 1 ? "" : "s"} handled today
          </p>
        )}
      </header>

      {mode === "aha" && best && (
        <IntelligenceSurface compact className="animate-in fade-in slide-in-from-top-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-surface-intelligence-foreground">
            <Sparkles className="h-4 w-4" /> SuCasa found someone worth your attention
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Here's {firstName(best.name)} — why now, what we noticed, and a way to open the
            conversation.
          </p>
          <button
            type="button"
            onClick={dismissFirstRun}
            className="mt-2 text-sm font-semibold text-primary"
          >
            Got it
          </button>
        </IntelligenceSurface>
      )}


      {handledNote && (
        <div className="animate-in fade-in rounded-3xl border border-status-positive/25 bg-status-positive/[0.06] p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-status-positive">
            <CheckCircle2 className="h-4 w-4" /> {handledNote.name} is handled for today
          </p>
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">
            Your touch was recorded. SuCasa keeps monitoring the relationship and will surface it
            again when another meaningful moment develops. {handledNote.next}
          </p>
        </div>
      )}

      {best ? (
        <section className="space-y-2.5">
          <SectionHeader title="Start here" />
          {/* The read sits beside the card it describes; both render the same
              canonical narrative, so the numbers and copy cannot diverge. */}
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start">
            <BestMove
              item={best}
              onOutcome={(stage, note) =>
                outcome.mutate({ opportunityId: best.opportunityId, stage, note })
              }
              pending={outcome.isPending}
            />
            <IntelligenceSurface label="SuCasa daily read" className="lg:sticky lg:top-4">
              <p className="text-[15px] font-medium leading-relaxed">{read.sentence}</p>
              <dl className="mt-4 space-y-3 border-t border-surface-intelligence-border pt-4">
                {read.startHere && <Read label="Start here" value={read.startHere} strong />}
                {read.why && <Read label="Why" value={read.why} />}
                {read.beUsefulBy && <Read label="Be useful by" value={read.beUsefulBy} />}
              </dl>
              {read.signals.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-surface-intelligence-border pt-4">
                  {read.signals.map((s) => (
                    <span
                      key={s}
                      className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-text-secondary"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </IntelligenceSurface>
          </div>
        </section>
      ) : (

        <div className="rounded-3xl border border-surface-warm-border bg-surface-warm p-6 text-center">
          <CheckCircle2 className="mx-auto h-7 w-7 text-status-positive" />
          <p className="mt-2 font-semibold">Your relationships are in good shape today</p>
          <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
            Nothing needs immediate attention. SuCasa is still monitoring{" "}
            {monitored.toLocaleString()} homeowner{monitored === 1 ? "" : "s"} and will surface the
            next useful moment.
          </p>
        </div>
      )}

      {upNext.length > 0 && (
        <section className="space-y-2.5">
          <SectionHeader title="Next relationships" />
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
            View all relationships worth attention <ArrowRight className="h-4 w-4" />
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

/** A single label/value line in the daily read. */
function Read({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </dt>
      <dd className={strong ? "mt-0.5 text-[17px] font-semibold" : "mt-0.5 text-[14px] leading-snug"}>
        {value}
      </dd>
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
  return (
    <li className="rounded-3xl border border-border-subtle bg-card p-4">
      <button type="button" onClick={onFocus} className="w-full text-left">
        <p className="flex items-center gap-1.5 text-xs text-text-secondary">
          <OpportunityDot /> #{rank} · {item.categoryLabel}
        </p>
        <p className="mt-1 truncate text-[17px] font-semibold tracking-tight">{item.name}</p>
        <p className="mt-0.5 text-sm leading-snug text-text-secondary">{item.why}</p>
        <p className="mt-2 text-sm font-medium">Suggested: {item.headline}</p>
      </button>
      <div className="mt-3">
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
              className="inline-flex min-h-[38px] items-center rounded-full border border-border-subtle px-4 text-sm font-semibold"
            >
              View homeowner
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
  const meta = TEMPERATURE_META[item.temperature];
  const n = item.narrative;
  // The canonical narrative decides the opener. A cached draft is only used
  // when the server has already validated it against the same fact snapshot.
  const opener = n?.openerSeed || item.draftBody?.trim() || item.headline;

  return (
    <section className="animate-in fade-in overflow-hidden rounded-[28px] border border-border-subtle bg-card shadow-elevated">
      {/* 3px brand line — the only large-format orange on the page. */}
      <div className="h-[3px] w-full bg-sucasa-orange" aria-hidden />
      <div className="border-b border-border-subtle bg-surface-warm px-5 py-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-status-opportunity">
          <OpportunityDot /> {item.categoryLabel}
        </p>
        <h2 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight">{item.name}</h2>
        <p className={cn("mt-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em]", meta.text)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} aria-hidden />
          {meta.label}
        </p>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Why now
          </p>
          <p className="mt-1 text-sm font-medium leading-relaxed text-primary">{item.why}</p>
          {n?.whyItMatters && (
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">{n.whyItMatters}</p>
          )}
          {item.engagementLine && (
            <p className="mt-1 text-sm font-medium text-primary">{item.engagementLine}</p>
          )}
        </div>

        {n?.supportingSignals?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {n.supportingSignals.map((s) => (
              <span
                key={s}
                className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-text-secondary"
              >
                {s}
              </span>
            ))}
          </div>
        ) : null}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            How to be useful
          </p>
          <p className="mt-1 text-sm font-medium leading-relaxed">{n?.howToBeUseful ?? item.ask}</p>
          {n?.cta && <p className="mt-0.5 text-sm leading-relaxed text-text-secondary">{n.cta}</p>}
        </div>

        {n?.secondarySignals?.length ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Also worth knowing
            </p>
            {n.secondarySignals.map((s) => (
              <p key={s} className="mt-1 text-sm leading-relaxed text-text-secondary">
                {s}
              </p>
            ))}
          </div>
        ) : null}


        {opener && (
          <IntelligenceSurface label="Suggested opener" compact>
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
              View homeowner
            </Link>
          )}
        </ChannelActions>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
          <span className="text-xs text-muted-foreground">What happened?</span>
          {OUTCOME_STAGES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => onOutcome(s)}
              className="rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-muted-foreground transition active:scale-95 disabled:opacity-50"
            >
              {outcomeLabel(s, "agent")}
            </button>
          ))}
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
      </div>
    </section>
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
  const tiles = [
    { label: "Homeowners monitored", value: people },
    { label: "Home Profiles Activated", value: activated },
    { label: "Relationships worth attention", value: worthAttention },
    { label: "Homeowners engaged recently", value: engaged },
    // Open opportunity records, not signals and not guaranteed transactions.
    { label: "Opportunities developing", value: opportunities },
    { label: "Follow-ups due", value: tasksDue },
  ];
  return (
    <section className="space-y-2.5">
      <SectionHeader title="SuCasa working for you" />
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
        Home Profiles Activated: homeowners who have activated their SuCasa Home Profile.
        Opportunities are homeowner moments worth a conversation, not confirmed transactions.
      </p>
      <div className="flex flex-wrap gap-3 pt-1 text-sm font-semibold text-primary">
        <Link to="/agent/opportunities" className="inline-flex items-center gap-1">
          What else is developing <ArrowRight className="h-4 w-4" />
        </Link>
        <Link to="/agent/tasks" className="inline-flex items-center gap-1">
          All my tasks <ArrowRight className="h-4 w-4" />
        </Link>
        {bookId && (
          <Link
            to="/agent/portfolio/$id"
            params={{ id: bookId }}
            className="inline-flex items-center gap-1"
          >
            My book <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </section>
  );
}

function EmptyBook({ bookId }: { bookId: string | null }) {
  const steps = [
    "Add your homeowners",
    "SuCasa builds their Home Profiles",
    "SuCasa looks for useful homeowner moments and potential opportunities",
    "You get told who may be worth contacting, and why",
  ];
  return (
    <div className="px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-md text-center">
        <Sparkles className="mx-auto h-8 w-8 text-primary" />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Let's make your database smarter.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Bring in the people you've already worked with. SuCasa takes it from there.
        </p>
        {bookId && (
          <div className="mt-6 flex flex-col gap-2.5">
            <Link
              to="/agent/add-client/$id"
              params={{ id: bookId }}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-soft"
            >
              <Upload className="h-4 w-4" /> Import my database
            </Link>
            <Link
              to="/agent/add-client/$id"
              params={{ id: bookId }}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-border text-sm font-semibold"
            >
              <UserPlus className="h-4 w-4" /> Add one homeowner
            </Link>
          </div>
        )}
        <ol className="mt-8 space-y-3 text-left">
          {steps.map((s, i) => (
            <li key={s} className="flex gap-3 text-sm">
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
  const steps = [
    "Organizing homeowners",
    "Building Home Profiles",
    "Looking for useful signals",
    "Preparing today's recommendations",
  ];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => (s + 1) % steps.length), 1600);
    return () => window.clearInterval(id);
  }, [steps.length]);

  return (
    <div className="px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">SuCasa is preparing your book.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We're going through your {count.toLocaleString()} homeowners. This page updates on its
          own.
        </p>
        <ul className="mt-6 space-y-3">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-3 text-sm">
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
