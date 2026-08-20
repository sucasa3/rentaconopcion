import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Users,
  UserCheck,
  Sparkles,
  Megaphone,
  Flame,
  TrendingUp,
  Wallet,
  Home,
  CalendarClock,
  Plus,
  Wrench,

  ArrowRight,
} from "lucide-react";
import { getBusinessOverview } from "@/lib/business.functions";
import { categoryLabel } from "@/lib/opportunities";
import { StatCard, SignalCard, SectionHeader, StatusPill, EmptyState } from "@/components/ui-kit";

export function categoryIcon(category: string) {
  switch (category) {
    case "refinance_review":
      return <Wallet className="h-5 w-5" />;
    case "equity":
    case "heloc":
      return <TrendingUp className="h-5 w-5" />;
    case "move_up":
    case "market_timing":
      return <Home className="h-5 w-5" />;
    case "home_condition":
      return <Wrench className="h-5 w-5" />;
    default:
      return <Flame className="h-5 w-5" />;
  }
}

const ACTION_BY_CATEGORY: Record<string, string> = {
  refinance_review: "Send a rate check.",
  equity: "Send a home equity update.",
  heloc: "Offer a line-of-credit conversation.",
  move_up: "Share what their home could sell for.",
  investment: "Start an investment conversation.",
  mortgage_review: "Offer an annual financing review.",
  home_condition: "Offer help lining up the work.",
  market_timing: "Reach out while they're weighing a move.",
};


export function BusinessDashboard({ kind }: { kind: "agent" | "lender" }) {
  const overviewFn = useServerFn(getBusinessOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["business-overview", kind],
    queryFn: () => overviewFn({ data: { orgType: kind } }),
    staleTime: 60_000,
  });

  const base = kind === "agent" ? "/agent" : "/lender";
  const book = data?.books?.[0] ?? null;
  const orgName = data?.orgs?.[0]?.name ?? (kind === "agent" ? "Your agency" : "Your team");

  if (isLoading) {
    return <div className="p-5 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!data || data.orgs.length === 0) {
    return (
      <div className="p-5">
        <EmptyState
          icon={<Users className="mx-auto h-8 w-8" />}
          title={kind === "agent" ? "No agency access yet" : "No team access yet"}
          hint="Ask your administrator to add you, or start a demo book."
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">{orgName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {kind === "agent" ? "Your business" : "Your book"}
          </h1>
        </div>
        {book && (
          <Link
            to={
              (kind === "agent"
                ? "/agent/add-client/$id"
                : "/lender/portfolio/$id/import") as never
            }
            params={{ id: book.id } as never}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft"
          >
            <Plus className="h-4 w-4" /> Add homeowner
          </Link>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Homeowners"
          value={data.counts.people}
          icon={<Users className="h-4 w-4" />}
          to={book ? `${base}/portfolio/$id` : undefined}
          params={book ? { id: book.id } : undefined}
        />
        <StatCard
          label="Activated"
          value={data.counts.activated}
          tone="growth"
          icon={<UserCheck className="h-4 w-4" />}
          to={book ? `${base}/portfolio/$id` : undefined}
          params={book ? { id: book.id } : undefined}
          search={book ? { status: "activated" } : undefined}
        />
        <StatCard
          label="Opportunities"
          value={data.counts.opportunities}
          tone="attention"
          icon={<Sparkles className="h-4 w-4" />}
          to={`${base}/opportunities`}
        />
        <StatCard
          label="Campaigns"
          value={data.counts.campaigns}
          tone="info"
          icon={<Megaphone className="h-4 w-4" />}
          to={`${base}/campaigns`}
        />
      </div>


      <section className="space-y-3">
        <SectionHeader title="Today" />
        {data.today.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="mx-auto h-7 w-7" />}
            title="Nothing needs you right now"
            hint="We'll surface homeowners the moment something changes."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.today.map((t: any, i: number) => (
              <SignalCard
                key={`${t.kind}-${t.clientId}-${i}`}
                icon={
                  t.kind === "activated" ? (
                    <UserCheck className="h-5 w-5" />
                  ) : (
                    categoryIcon(t.category)
                  )
                }
                name={t.name}
                signal={t.line}
                pill={
                  t.kind === "activated" ? (
                    <StatusPill tone="growth">Activated</StatusPill>
                  ) : (
                    <StatusPill tone="attention">{categoryLabel(t.category)}</StatusPill>
                  )
                }
                actionLabel="View homeowner"
                to={t.portfolioId ? (`${base}/portfolio/$id` as never) : undefined}
                params={t.portfolioId ? { id: t.portfolioId } : undefined}
                search={
                  t.portfolioId && t.clientId ? ({ client: t.clientId } as never) : undefined
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Opportunities"
          action={
            <Link
              to={`${base}/opportunities` as never}
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
            >
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
        {data.opportunities.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="mx-auto h-7 w-7" />}
            title="No open opportunities"
            hint="Add homeowners and SuCasa will start finding them."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.opportunities.slice(0, 6).map((o: any) => (
              <SignalCard
                key={o.id}
                icon={categoryIcon(o.category)}
                name={o.clientName}
                signal={o.reason ?? categoryLabel(o.category)}
                action={ACTION_BY_CATEGORY[o.category]}
                pill={
                  <StatusPill tone={o.strength === "strong" ? "attention" : "muted"}>
                    {categoryLabel(o.category)}
                  </StatusPill>
                }
                actionLabel="View homeowner"
                to={o.portfolioId ? (`${base}/portfolio/$id` as never) : undefined}
                params={o.portfolioId ? { id: o.portfolioId } : undefined}
                search={
                  o.portfolioId && o.clientId ? ({ client: o.clientId } as never) : undefined
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Marketing"
          action={
            <Link
              to={`${base}/campaigns` as never}
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
            >
              Manage <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
        {data.campaigns.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="mx-auto h-7 w-7" />}
            title="No campaigns running"
            hint="Turn one on and SuCasa keeps in touch for you."
            action={
              <Link
                to={`${base}/campaigns` as never}
                className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Start a campaign
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.campaigns.map((c: any) => (
              <div key={c.id} className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{c.name}</p>
                  <StatusPill tone="growth">Live</StatusPill>
                </div>
                <div className="mt-3 flex gap-5 text-sm">
                  <div>
                    <p className="text-xl font-semibold tabular-nums">{c.sent}</p>
                    <p className="text-xs text-muted-foreground">Sent</p>
                  </div>
                  <div>
                    <p className="text-xl font-semibold tabular-nums">{c.queued}</p>
                    <p className="text-xs text-muted-foreground">Queued</p>
                  </div>
                </div>
                <Link
                  to={`${base}/campaigns` as never}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-2xl bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground"
                >
                  View campaign
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {data.books.length > 1 && (
        <section className="space-y-3">
          <SectionHeader title="Books" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.books.map((b: any) => (
              <Link
                key={b.id}
                to={`${base}/portfolio/$id` as never}
                params={{ id: b.id } as never}
                className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft"
              >
                <p className="font-semibold">{b.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{b.clientCount} homeowners</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
