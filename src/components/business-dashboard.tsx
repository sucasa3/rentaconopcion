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
  BarChart3,
} from "lucide-react";
import { getBusinessOverview } from "@/lib/business.functions";
import { getMyBusinessTasks } from "@/lib/tasks.functions";
import { getFunnel } from "@/lib/nba.functions";
import { StatCard, SectionHeader, EmptyState } from "@/components/ui-kit";
import { TaskQueue } from "@/components/tasks-workspace";
import { ActionQueue } from "@/components/action-queue";
import { CopilotSearch } from "@/components/copilot-search";
import { useT } from "@/lib/i18n";

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

export function BusinessDashboard({
  kind,
  isManager = false,
  showQueue = true,
  showHeader = true,
}: {
  kind: "agent" | "lender";
  isManager?: boolean;
  /** Lender pages render their own gated queue and header above this block. */
  showQueue?: boolean;
  showHeader?: boolean;
}) {
  const t = useT();
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
    return <div className="p-5 text-sm text-muted-foreground">{t("biz.tasks.loading")}</div>;
  }

  if (!data || data.orgs.length === 0) {
    return (
      <div className="p-5">
        <EmptyState
          icon={<Users className="mx-auto h-8 w-8" />}
          title={t(kind === "agent" ? "biz.dash.no_access_agent" : "biz.dash.no_access_lender")}
          hint={t("biz.dash.no_access_hint")}
        />
      </div>
    );
  }

  const totalSent = data.campaigns.reduce((n: number, c: any) => n + (c.sent ?? 0), 0);
  const totalQueued = data.campaigns.reduce((n: number, c: any) => n + (c.queued ?? 0), 0);

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6">
      {showHeader && (<>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">{orgName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{t("biz.dash.today")}</h1>
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
            <Plus className="h-4 w-4" /> {t("biz.dash.add_homeowner")}
          </Link>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label={t("biz.dash.st_homeowners")}
          value={data.counts.people}
          icon={<Users className="h-4 w-4" />}
          to={book ? `${base}/portfolio/$id` : undefined}
          params={book ? { id: book.id } : undefined}
        />
        <StatCard
          label={t("biz.dash.st_activated")}
          value={data.counts.activated}
          tone="growth"
          icon={<UserCheck className="h-4 w-4" />}
          to={book ? `${base}/portfolio/$id` : undefined}
          params={book ? { id: book.id } : undefined}
          search={book ? { status: "activated" } : undefined}
        />
        <StatCard
          label={t("biz.dash.st_opportunities")}
          value={data.counts.opportunities}
          tone="attention"
          icon={<Sparkles className="h-4 w-4" />}
          to={base}
          hash="work-queue"
        />
        <StatCard
          label={t("biz.dash.st_campaigns")}
          value={data.counts.campaigns}
          tone="info"
          icon={<Megaphone className="h-4 w-4" />}
          to={`${base}/campaigns`}
        />
        <StatCard
          label={t("biz.dash.st_tasks")}
          value={tasksDue ?? 0}
          tone={tasksDue ? "attention" : "growth"}
          icon={<CheckCircle2 className="h-4 w-4" />}
          to={base}
          hash="work-queue"
        />
      </div>
      </>)}

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


      {showQueue && (
      <section id="work-queue" className="scroll-mt-6 space-y-3">
        <SectionHeader title={t("biz.dash.queue_title")} />
        <p className="-mt-1 text-sm text-muted-foreground">
          {t("biz.dash.queue_hint")}
        </p>
        <ActionQueue kind={kind} />
      </section>
      )}

      {isManager && (
        <section className="space-y-3">
          <SectionHeader
            title={t("biz.dash.pipeline")}
            action={
              <Link
                to={`${base}/funnel` as never}
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
              >
                {t("biz.dash.view_full_report")} <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
          <FunnelPreview kind={kind} />
        </section>
      )}

      <section className="space-y-3">
        <SectionHeader title={t("biz.dash.setup")} />
        <TaskQueue kind={kind} />
      </section>

      <section className="space-y-3">
        <SectionHeader
          title={t("biz.dash.marketing")}
          action={
            <Link
              to={`${base}/campaigns` as never}
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
            >
              {t("biz.dash.manage")} <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
        {data.campaigns.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="mx-auto h-7 w-7" />}
            title={t("biz.dash.no_campaigns_title")}
            hint={t("biz.dash.no_campaigns_hint")}
            action={
              <Link
                to={`${base}/campaigns` as never}
                className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                {t("biz.dash.start_campaign")}
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
                {t(data.campaigns.length === 1 ? "biz.dash.campaigns_active_one" : "biz.dash.campaigns_active_many", { count: data.campaigns.length })}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t("biz.dash.sent_queued", {
                  sent: totalSent.toLocaleString(),
                  queued: totalQueued.toLocaleString(),
                })}
              </p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </Link>
        )}
      </section>

      {data.books.length > 1 && (
        <section className="space-y-3">
          <SectionHeader title={t("biz.dash.books")} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.books.map((b: any) => (
              <Link
                key={b.id}
                to={`${base}/portfolio/$id` as never}
                params={{ id: b.id } as never}
                className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft"
              >
                <p className="font-semibold">{b.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(b.clientCount === 1 ? "biz.dash.book_homeowners_one" : "biz.dash.book_homeowners_many", { count: b.clientCount })}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function FunnelPreview({ kind }: { kind: "agent" | "lender" }) {
  const t = useT();
  const funnelFn = useServerFn(getFunnel);
  const { data, isLoading } = useQuery({
    queryKey: ["business-funnel-preview", kind],
    queryFn: () => funnelFn({ data: { audience: kind, days: 30 } }),
    staleTime: 60_000,
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">{t("biz.dash.funnel_loading")}</div>;
  const f = data?.funnel;
  if (!f) {
    return (
      <EmptyState
        icon={<BarChart3 className="mx-auto h-7 w-7" />}
        title={t("biz.dash.funnel_empty_title")}
        hint={t("biz.dash.funnel_empty_hint")}
      />
    );
  }

  const steps = [
    { label: t("biz.dash.fs_homeowners"), value: f.homeowners ?? 0 },
    { label: t("biz.dash.fs_opportunities"), value: f.opportunities ?? 0 },
    { label: t("biz.dash.fs_contacted"), value: f.contacted ?? 0 },
    { label: t("biz.dash.fs_engaged"), value: f.engaged ?? 0 },
    { label: t("biz.dash.fs_conversations"), value: f.conversations ?? 0 },
    { label: t("biz.dash.fs_appointments"), value: f.appointments ?? 0 },
    { label: t("biz.dash.fs_closed"), value: f.closed ?? 0 },
  ];

  return (
    <Link
      to={`/${kind}/funnel` as never}
      className="block rounded-3xl border border-border/70 bg-card p-4 shadow-soft"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold">30-day pipeline</p>
            <p className="text-sm text-muted-foreground">
              {f.closed ?? 0} closed · {(f.closed_value_cents ?? 0) > 0
                ? `$${((f.closed_value_cents ?? 0) / 100).toLocaleString()}`
                : "no value logged"}
            </p>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
        {steps.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-lg font-semibold leading-tight">{s.value.toLocaleString()}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </Link>
  );
}
