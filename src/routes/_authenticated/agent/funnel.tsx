import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, BarChart3, Calendar } from "lucide-react";
import { BusinessShell } from "@/components/business-shell";
import { FunnelView } from "@/components/funnel-chart";
import { EmptyState } from "@/components/ui-kit";
import { getBusinessOverview } from "@/lib/business.functions";
import { getFunnel } from "@/lib/nba.functions";

export const Route = createFileRoute("/_authenticated/agent/funnel")({
  head: () => ({
    meta: [
      { title: "Pipeline & ROI — SuCasa" },
      {
        name: "description",
        content: "Track your homeowner pipeline from opportunity to closing.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentFunnel,
});

const DAY_OPTIONS = [
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "12 months", value: 365 },
];

function AgentFunnel() {
  const [days, setDays] = useState(30);
  const overviewFn = useServerFn(getBusinessOverview);
  const funnelFn = useServerFn(getFunnel);

  const { data: overview } = useQuery({
    queryKey: ["business-overview", "agent"],
    queryFn: () => overviewFn({ data: { orgType: "agent" } }),
    staleTime: 60_000,
  });

  const { data: funnel, isLoading } = useQuery({
    queryKey: ["business-funnel", "agent", days],
    queryFn: () => funnelFn({ data: { audience: "agent", days } }),
    staleTime: 60_000,
  });

  const book = overview?.books?.[0] ?? null;

  if (!funnel?.isManager) {
    return (
    <BusinessShell kind="agent" bookId={book?.id ?? null} isManager={overview?.isManager}>
      <main className="px-4 py-6 sm:px-5 sm:py-8">
          <div className="mx-auto max-w-3xl">
            <Link
              to="/agent"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Back to Today
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Pipeline & ROI
            </h1>
            <div className="mt-6">
              <EmptyState
                icon={<BarChart3 className="mx-auto h-7 w-7" />}
                title="Manager view only"
                hint="Ask your organization owner to share manager access."
              />
            </div>
          </div>
        </main>
      </BusinessShell>
    );
  }

  return (
    <BusinessShell kind="agent" bookId={book?.id ?? null}>
      <main className="px-4 py-6 sm:px-5 sm:py-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Link
                to="/agent"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" /> Back to Today
              </Link>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Pipeline & ROI
              </h1>
            </div>
            <div className="flex items-center gap-1 rounded-2xl border border-border/70 bg-card p-1">
              {DAY_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setDays(o.value)}
                  className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                    days === o.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {o.value === 365 && <Calendar className="h-3.5 w-3.5" />}
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading pipeline…</div>
          ) : (
            <FunnelView data={funnel?.funnel ?? null} costCents={funnel?.costCents ?? 0} days={days} />
          )}
        </div>
      </main>
    </BusinessShell>
  );
}
