import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { BusinessShell } from "@/components/business-shell";
import { Button } from "@/components/ui/button";
import { enrichAgentPortfolio, getAgentPortfolio } from "@/lib/agent.functions";
import { recordAuthenticatedAgentEvent } from "@/lib/agent-funnel.functions";
import {
  AGENT_FREE_PROFILES,
  AGENT_GROUP_BLURB,
  AGENT_GROUP_LABEL,
  AGENT_REVEAL_GROUPS,
  agentRevealHeadline,
  agentRevealSupporting,
  buildAgentReveal,
  type AgentRevealGroup,
} from "@/lib/agent-reveal";

export const Route = createFileRoute("/_authenticated/agent/reveal/$id")({
  head: () => ({
    meta: [
      { title: "Your relationship reveal — SuCasa Agent" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentRevealPage,
});

function AgentRevealPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const getFn = useServerFn(getAgentPortfolio);
  const enrichFn = useServerFn(enrichAgentPortfolio);
  const track = useServerFn(recordAuthenticatedAgentEvent);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const running = useRef(false);
  const tracked = useRef(false);

  const { data, isLoading } = useQuery({
    queryKey: ["agent-portfolio", id, 8],
    queryFn: () => getFn({ data: { id, sellCostPct: 8 } }),
  });

  const analyze = useMutation({
    mutationFn: async () => {
      if (running.current) return;
      running.current = true;
      try {
        for (let i = 0; i < 60; i += 1) {
          const tick: any = await enrichFn({ data: { portfolioId: id, limit: 15 } });
          const total = tick.totalPending + tick.enriched;
          setProgress({ done: Math.max(0, total - tick.remaining), total });
          if (tick.remaining === 0 || (tick.enriched === 0 && tick.failed === 0)) break;
        }
      } finally {
        running.current = false;
        setProgress(null);
        await qc.invalidateQueries({ queryKey: ["agent-portfolio", id, 8] });
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Analysis stopped"),
  });

  const clients = ((data as any)?.clients ?? []) as any[];
  const { items, summary } = buildAgentReveal(clients);

  // Read property records for anything not covered yet, once, on arrival.
  useEffect(() => {
    if (!data || analyze.isPending || running.current) return;
    const uncovered = clients.filter((c) => !c.has_intel).length;
    if (uncovered > 0 && !analyze.isSuccess) analyze.mutate();
  }, [data]);

  useEffect(() => {
    if (!data || tracked.current) return;
    tracked.current = true;
    void track({ data: { action: "agent_reveal_viewed" } });
  }, [data]);

  const busy = isLoading || analyze.isPending || progress !== null;

  return (
    <BusinessShell kind="agent" bookId={id}>
      <div className="mx-auto max-w-3xl space-y-6 pb-14">
        <header>
          <p className="text-sm font-semibold text-status-opportunity">Your relationship reveal</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">
            {busy && !items.length
              ? `We're analyzing your first ${AGENT_FREE_PROFILES} past clients`
              : agentRevealHeadline(summary)}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {busy && !items.length
              ? "Reading the public property record for each home. Nobody is contacted."
              : agentRevealSupporting(summary)}
          </p>
        </header>

        {busy ? (
          <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                {progress
                  ? `${progress.done} of ${progress.total} homes reviewed`
                  : "Getting started"}
              </p>
            </div>
          </section>
        ) : null}

        {items.length ? (
          <section className="grid gap-3 sm:grid-cols-2">
            {AGENT_REVEAL_GROUPS.filter((g) => summary.byGroup[g] > 0).map((g) => (
              <div key={g} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
                <p className="text-2xl font-semibold text-foreground">{summary.byGroup[g]}</p>
                <p className="text-sm font-medium text-foreground">{AGENT_GROUP_LABEL[g]}</p>
                <p className="mt-1 text-xs text-muted-foreground">{AGENT_GROUP_BLURB[g]}</p>
              </div>
            ))}
          </section>
        ) : null}

        {items.length ? (
          <section className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold text-foreground">
                Every relationship we flagged
              </h2>
              <span className="text-xs text-muted-foreground">{items.length} shown, none locked</span>
            </div>
            {items.map((item) => (
              <Link
                key={item.clientId}
                to="/agent/portfolio/$id"
                params={{ id }}
                search={{ client: item.clientId }}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft transition hover:border-primary/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {item.name ?? "Homeowner"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{item.address}</p>
                  <p className="mt-1 text-xs font-medium text-status-opportunity">
                    {AGENT_GROUP_LABEL[item.group as AgentRevealGroup]}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </section>
        ) : null}

        <section className="rounded-3xl border border-surface-intelligence-border bg-surface-intelligence p-6">
          <CheckCircle2 className="h-5 w-5 text-intelligence-accent" />
          <h2 className="mt-3 text-lg font-semibold text-surface-intelligence-foreground">
            All {summary.analyzed || AGENT_FREE_PROFILES} stay in your workspace, free
          </h2>
          <p className="mt-2 text-sm text-surface-intelligence-foreground">
            Your first {AGENT_FREE_PROFILES} Home Profiles are yours to keep. Nothing here is locked
            and nothing expires — SuCasa keeps watching these homes and tells you when something
            changes.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => navigate({ to: "/agent" })}>
              Go to Today <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="bg-transparent"
              onClick={() => {
                void track({ data: { action: "agent_reveal_upgrade_clicked" } });
                navigate({ to: "/pricing" });
              }}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Bring the rest of my database in
            </Button>
          </div>
          <p className="mt-3 text-xs text-surface-intelligence-foreground/80">
            You've activated your first {AGENT_FREE_PROFILES}. Paid plans are for going beyond them —
            more active Home Profiles, larger database monitoring, automation and team features.
          </p>
        </section>
      </div>
    </BusinessShell>
  );
}
