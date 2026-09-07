import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  ChevronDown,
  HandHeart,
  Inbox,
  Sparkles,
  Clock,
  Users,
  TrendingUp,
  Home,
} from "lucide-react";
import { getLenderWorkspace } from "@/lib/lender-workspace.functions";
import { SectionHeader } from "@/components/ui-kit";
import { LenderContactCard } from "@/components/lender-contact-card";
import { LenderBriefDialog } from "@/components/lender-brief";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Today: the lender's daily operating screen.
 *
 * Order is deliberate — a daily briefing, the day's numbers, homeowners who
 * asked to connect, then the Daily 10 ranked by the existing priority engine.
 * Temperature is a label on the card, never the sort key.
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
  const list = showAll ? queue : daily;

  const themes = Array.from(
    new Set(daily.map((p) => p.reviews[0]?.label).filter(Boolean) as string[]),
  ).slice(0, 3);
  const names = daily
    .slice(0, 3)
    .map((p) => p.name.split(" ")[0])
    .filter(Boolean) as string[];

  return (
    <div className="space-y-8 px-4 pb-10 pt-6 sm:px-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
          {data.org.name}
        </p>
        <h1 className="mt-1 text-[34px] font-semibold leading-none tracking-tight">Today</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </header>

      {/* DAILY BRIEFING — the read of the book, before any list. */}
      <section className="overflow-hidden rounded-[28px] border border-primary/20 bg-primary/[0.06] shadow-soft">
        <div className="p-5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
            <Sparkles className="h-3.5 w-3.5" /> SuCasa&rsquo;s take
          </p>
          <p className="mt-2 text-[17px] font-medium leading-relaxed">{take}</p>

          <dl className="mt-4 space-y-2">
            {themes.length > 0 && <Highlight label="Top themes" value={themes.join(" · ")} />}
            {names.length > 0 && <Highlight label="First up" value={names.join(", ")} />}
            <Highlight
              label="Most time-sensitive"
              value={
                metrics.askedToConnect > 0
                  ? `${metrics.askedToConnect} homeowner${metrics.askedToConnect === 1 ? "" : "s"} asked to connect`
                  : metrics.followUpsDue > 0
                    ? `${metrics.followUpsDue} follow-up${metrics.followUpsDue === 1 ? "" : "s"} due`
                    : "Annual reviews due"
              }
            />
          </dl>
        </div>

        <button
          type="button"
          onClick={() => setWhyOpen((v) => !v)}
          className="flex w-full items-center justify-center gap-1 border-t border-primary/15 py-2.5 text-xs font-semibold text-primary transition active:bg-primary/10"
        >
          Why these {daily.length}?
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition duration-200", whyOpen && "rotate-180")}
          />
        </button>
        {whyOpen && (
          <p className="border-t border-primary/15 px-5 py-3 text-[13px] leading-relaxed text-muted-foreground">
            This list is ranked by how timely a relationship check-in is — homeowners who asked to
            connect come first, then the people your book suggests are most worth a conversation
            today. {counts.hot} hot · {counts.warm} warm · {counts.nurture} nurture. It is not a
            credit, approval or qualification score.
          </p>
        )}
      </section>

      {/* TODAY SUMMARY — one primary KPI, quieter supporting numbers. */}
      <section className="space-y-2">
        <div className="rounded-[28px] border border-attention/35 bg-attention/10 p-5 shadow-soft">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-attention-foreground/80">
            Needs you today
          </p>
          <p className="mt-1 text-[44px] font-semibold leading-none tabular-nums text-attention-foreground">
            {metrics.needsAttentionToday}
          </p>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Homeowners SuCasa recommends you work through today.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Tile
            icon={<HandHeart className="h-4 w-4" />}
            label="Asked to connect"
            value={metrics.askedToConnect}
            tone="attention"
          />
          <Tile
            icon={<Clock className="h-4 w-4" />}
            label="Follow-ups due"
            value={metrics.followUpsDue}
          />
          <Tile
            icon={<TrendingUp className="h-4 w-4" />}
            label="Engaged this month"
            value={metrics.engagedThisMonth}
            tone="growth"
          />
          <Tile
            icon={<Home className="h-4 w-4" />}
            label="Homeowners monitored"
            value={metrics.homeownersMonitored}
          />
        </div>
      </section>

      {/* ASKED TO CONNECT — consumer-initiated, always first. */}
      <section className="space-y-3">
        <SectionHeader title="Homeowners who asked to connect" />
        {askedToConnectList.length === 0 ? (
          <div className="rounded-[28px] bg-secondary/50 px-5 py-8 text-center">
            <Inbox className="mx-auto h-6 w-6 text-muted-foreground/70" />
            <p className="mt-2 text-[15px] font-semibold">No homeowner requests right now</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              You&rsquo;re all caught up here. We&rsquo;ll surface new connection requests as they
              arrive.
            </p>
          </div>
        ) : (
          <>
            <p className="-mt-1 text-[13px] text-muted-foreground">
              These people asked for help themselves. Work these first.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {askedToConnectList.map((r) => (
                <div
                  key={r.clientId}
                  className="rounded-[28px] border border-attention/35 bg-attention/8 p-5 shadow-soft"
                >
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-attention/20 px-2.5 py-1 text-[11px] font-semibold text-attention-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-attention" /> Requested contact
                  </span>
                  <p className="mt-3 text-[22px] font-semibold leading-tight tracking-tight">
                    {r.name}
                  </p>
                  <p className="mt-1 text-[15px] text-muted-foreground">
                    Asked about: {r.askedAbout}
                  </p>
                  {r.note && <p className="mt-1 text-[15px]">{r.note}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Authorized to share:{" "}
                    {r.authorized.length ? r.authorized.join(", ") : "contact only"}
                  </p>
                  <Link
                    to={"/lender/portfolio/$id" as never}
                    params={{ id: r.portfolioId } as never}
                    search={{ client: r.clientId } as never}
                    className="mt-4 inline-flex min-h-[44px] items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition active:scale-95"
                  >
                    Review &amp; contact
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* YOUR DAILY 10 */}
      <section id="work-queue" className="scroll-mt-6 space-y-3">
        <SectionHeader title="Your Daily 10" />
        <p className="-mt-1 text-[13px] text-muted-foreground">
          Ranked by how timely a relationship check-in is — never a credit, approval or
          qualification score.
        </p>

        {list.length === 0 ? (
          <div className="rounded-[28px] bg-secondary/50 px-5 py-10 text-center">
            <CheckCircle2 className="mx-auto h-7 w-7 text-growth" />
            <p className="mt-2 text-[15px] font-semibold">Nothing needs you right now</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Homeowners you have a relationship with show up here when something changes.
            </p>
          </div>
        ) : (
          <>
            <ul className="space-y-3">
              {list.map((p, i) => (
                <LenderContactCard
                  key={p.id}
                  person={p}
                  rank={i + 1}
                  onBrief={() => setBrief({ id: p.id, name: p.name })}
                />
              ))}
            </ul>
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

      {/* SERVICE DELIVERY — aggregate only. */}
      <section className="space-y-2">
        <SectionHeader title="What SuCasa delivered" />
        <p className="-mt-1 text-[13px] text-muted-foreground">
          Sponsored homeowners with no separate relationship are counted here only, never named.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Tile
            icon={<Users className="h-4 w-4" />}
            label="Sponsored, aggregate only"
            value={data.aggregateOnly.sponsoredOnly}
          />
          {Object.entries(data.serviceDelivery)
            .slice(0, 3)
            .map(([k, n]) => (
              <Tile key={k} label={k.replace(/_/g, " ")} value={n as number} />
            ))}
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

function Highlight({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[13px]">
      <dt className="shrink-0 font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </dt>
      <dd className="leading-snug">{value}</dd>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone?: "attention" | "growth";
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-border/60 bg-card px-4 py-3.5 shadow-soft">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <p className="text-[11px] leading-tight capitalize">{label}</p>
      </div>
      <p
        className={cn(
          "mt-1.5 text-[26px] font-semibold leading-none tabular-nums",
          tone === "attention" && "text-attention-foreground",
          tone === "growth" && "text-growth",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function TodaySkeleton() {
  return (
    <div className="space-y-6 px-4 pt-6 sm:px-6">
      <Skeleton className="h-9 w-40 rounded-2xl" />
      <Skeleton className="h-40 w-full rounded-[28px]" />
      <Skeleton className="h-28 w-full rounded-[28px]" />
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-3xl" />
        ))}
      </div>
      {[0, 1].map((i) => (
        <Skeleton key={i} className="h-64 w-full rounded-[28px]" />
      ))}
    </div>
  );
}

export { HandHeart };
