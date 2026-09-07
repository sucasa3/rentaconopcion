import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, HandHeart, Sparkles } from "lucide-react";
import { getLenderWorkspace } from "@/lib/lender-workspace.functions";
import { SectionHeader, EmptyState } from "@/components/ui-kit";
import { StatusPill } from "@/components/ui-kit";
import { LenderContactCard } from "@/components/lender-contact-card";
import { LenderBriefDialog } from "@/components/lender-brief";

/**
 * Today: the lender's daily operating screen.
 *
 * Order is deliberate — homeowners who asked to connect, then the Daily 10
 * ranked by the existing priority engine. Temperature is a label on the card,
 * never the sort key.
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

  if (isLoading) return <div className="px-4 py-6 text-sm text-muted-foreground">Loading…</div>;
  if (!data) return null;

  const { metrics, counts, askedToConnectList, daily, dailyTotal, queue, take } = data;
  const list = showAll ? queue : daily;

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          {data.org.name}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Today</h1>
      </header>

      {/* SUCASA'S TAKE — the read of the book, before any list. */}
      <section className="rounded-3xl border border-primary/25 bg-primary/5 p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
          <Sparkles className="h-3.5 w-3.5" /> SuCasa&rsquo;s take
        </p>
        <p className="mt-1.5 text-sm leading-relaxed">{take}</p>
      </section>

      {/* METRICS — operational, not vanity. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Metric label="Needs you today" value={metrics.needsAttentionToday} tone="attention" />
        <Metric label="Asked to connect" value={metrics.askedToConnect} tone="attention" />
        <Metric label="Follow-ups due" value={metrics.followUpsDue} />
        <Metric label="Engaged this month" value={metrics.engagedThisMonth} tone="growth" />
        <Metric label="Homeowners monitored" value={metrics.homeownersMonitored} />
      </div>

      {/* ASKED TO CONNECT — consumer-initiated, always first. */}
      {askedToConnectList.length === 0 ? (
        <p className="rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm text-muted-foreground">
          No homeowner requests waiting.
        </p>
      ) : (
        <section className="space-y-3">
          <SectionHeader title="Homeowners who asked to connect" />
          <p className="-mt-1 text-sm text-muted-foreground">
            These people asked for help themselves. Work these first.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {askedToConnectList.map((r) => (
              <div
                key={r.clientId}
                className="rounded-3xl border border-attention/40 bg-attention/5 p-4 shadow-soft"
              >
                <StatusPill tone="attention">Requested contact</StatusPill>
                <p className="mt-2 text-lg font-semibold">{r.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">Asked about: {r.askedAbout}</p>
                {r.note && <p className="mt-1 text-sm">{r.note}</p>}
                <p className="mt-2 text-xs text-muted-foreground">
                  Authorized to share: {r.authorized.length ? r.authorized.join(", ") : "contact only"}
                </p>
                <Link
                  to={"/lender/portfolio/$id" as never}
                  params={{ id: r.portfolioId } as never}
                  search={{ client: r.clientId } as never}
                  className="mt-3 inline-flex min-h-[44px] items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
                >
                  Review &amp; contact
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* YOUR DAILY 10 */}
      <section id="work-queue" className="scroll-mt-6 space-y-3">
        <SectionHeader title="Your Daily 10" />
        <p className="-mt-1 text-sm text-muted-foreground">
          Ranked by how timely a relationship check-in is — never a credit, approval or
          qualification score. {counts.hot} hot · {counts.warm} warm · {counts.nurture} nurture.
        </p>

        {list.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="mx-auto h-7 w-7" />}
            title="Nothing needs you right now"
            hint="Homeowners you have a relationship with show up here when something changes."
          />
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
                className="min-h-[44px] w-full rounded-full border border-border bg-card text-sm font-semibold"
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
        <p className="-mt-1 text-sm text-muted-foreground">
          Sponsored homeowners with no separate relationship are counted here only, never named.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Sponsored, aggregate only" value={data.aggregateOnly.sponsoredOnly} />
          {Object.entries(data.serviceDelivery)
            .slice(0, 3)
            .map(([k, n]) => (
              <Metric key={k} label={k.replace(/_/g, " ")} value={n as number} />
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

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "attention" | "growth";
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card px-3 py-2.5">
      <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
      <p
        className={
          tone === "attention"
            ? "text-xl font-semibold text-attention"
            : tone === "growth"
              ? "text-xl font-semibold text-growth"
              : "text-xl font-semibold"
        }
      >
        {value}
      </p>
    </div>
  );
}

export { HandHeart };
