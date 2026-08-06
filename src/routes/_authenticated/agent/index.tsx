import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { listAgentPortfolios, seedAgentDemo } from "@/lib/agent.functions";
import { Home, Users, Sparkles, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agent/")({
  head: () => ({
    meta: [
      { title: "Agent Portal — SuCasa" },
      {
        name: "description",
        content: "Move signals, property intelligence, and listing briefs for your sphere.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentHome,
});

function AgentHome() {
  const listFn = useServerFn(listAgentPortfolios);
  const seedFn = useServerFn(seedAgentDemo);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["agent-portfolios"],
    queryFn: () => listFn(),
  });

  const seed = useMutation({
    mutationFn: () => seedFn(),
    onSuccess: (r: any) => {
      toast.success("Demo agency ready");
      qc.invalidateQueries({ queryKey: ["agent-portfolios"] });
      navigate({ to: "/agent/portfolio/$id", params: { id: r.portfolioId } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-growth">
            Agent portal
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Your book of business</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            SuCasa scores every household in your sphere on how likely they are to move — using
            tenure, equity, permit activity, tax pressure and listing history — and drafts the
            opening line for you.
          </p>
          <Link
            to="/agent/campaigns"
            className="mt-4 inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-muted"
          >
            Manage client campaigns
          </Link>
        </div>

        {isLoading && <p className="text-muted-foreground">Loading…</p>}
        {error && (
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="font-medium">No agency access yet</p>
            <p className="mt-1 text-sm text-muted-foreground">{(error as Error).message}</p>
            <button
              onClick={() => seed.mutate()}
              disabled={seed.isPending}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              {seed.isPending ? "Creating…" : "Create demo agency (admin)"}
            </button>
          </div>
        )}

        {data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {data.portfolios.map((p: any) => (
                <Link
                  key={p.id}
                  to="/agent/portfolio/$id"
                  params={{ id: p.id }}
                  className="group rounded-xl border border-border bg-card p-5 transition hover:border-primary/40 hover:shadow-lg"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        {p.client_count} households
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                </Link>
              ))}
            </div>

            {data.portfolios.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-10 text-center">
                <Home className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-medium">No client lists yet</p>
                <button
                  onClick={() => seed.mutate()}
                  disabled={seed.isPending}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" />
                  {seed.isPending ? "Creating…" : "Load sample sphere"}
                </button>
              </div>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
