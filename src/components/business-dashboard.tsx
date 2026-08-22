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
  Plus,
  Wrench,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { getBusinessOverview } from "@/lib/business.functions";
import { getMyBusinessTasks } from "@/lib/tasks.functions";
import { StatCard, SectionHeader, EmptyState } from "@/components/ui-kit";
import { TaskQueue } from "@/components/tasks-workspace";
import { CopilotSearch } from "@/components/copilot-search";

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

export function BusinessDashboard({ kind }: { kind: "agent" | "lender" }) {
  const overviewFn = useServerFn(getBusinessOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["business-overview", kind],
    queryFn: () => overviewFn({ data: { orgType: kind } }),
    staleTime: 60_000,
  });

  const tasksFn = useServerFn(getMyBusinessTasks);
  const { data: tasks } = useQuery({
    queryKey: ["business-tasks", kind],
    queryFn: () => tasksFn({ data: { orgType: kind } }),
    staleTime: 30_000,
  });
  const tasksDue = tasks?.openCount ?? 0;

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

  const totalSent = data.campaigns.reduce((n: number, c: any) => n + (c.sent ?? 0), 0);
  const totalQueued = data.campaigns.reduce((n: number, c: any) => n + (c.queued ?? 0), 0);

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">{orgName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Today</h1>
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
          to={base}
          hash="work-queue"
        />
        <StatCard
          label="Campaigns"
          value={data.counts.campaigns}
          tone="info"
          icon={<Megaphone className="h-4 w-4" />}
          to={`${base}/campaigns`}
        />
        <StatCard
          label="Tasks due"
          value={tasksDue ?? 0}
          tone={tasksDue ? "attention" : "growth"}
          icon={<CheckCircle2 className="h-4 w-4" />}
          to={base}
          hash="work-queue"
        />
      </div>

      {book && (
        <CopilotSearch
          portfolioId={book.id}
          detailPath={(r) => ({
            to: kind === "agent" ? "/agent/portfolio/$id" : "/lender/portfolio/$id",
            params: { id: r.portfolio_id },
            search: { client: r.id },
          })}
        />
      )}


      <section id="work-queue" className="scroll-mt-6 space-y-3">
        <SectionHeader title="Who to contact today" />
        <p className="-mt-1 text-sm text-muted-foreground">
          Ranked by who's most ready to hear from you. Reach out, then tap what happened.
        </p>
        <ActionQueue kind={kind} />
      </section>

      <section className="space-y-3">
        <SectionHeader title="Set-up and reminders" />
        <TaskQueue kind={kind} />
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
          <Link
            to={`${base}/campaigns` as never}
            className="flex items-center justify-between gap-3 rounded-3xl border border-border/70 bg-card p-4 shadow-soft"
          >
            <div className="min-w-0">
              <p className="font-semibold">
                {data.campaigns.length} campaign{data.campaigns.length === 1 ? "" : "s"} keeping in
                touch
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {totalSent.toLocaleString()} sent · {totalQueued.toLocaleString()} queued
              </p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </Link>
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
