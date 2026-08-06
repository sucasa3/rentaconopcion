import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { listAgentPortfolios } from "@/lib/agent.functions";
import { CampaignsWorkspace } from "@/components/campaigns-workspace";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agent/campaigns")({
  head: () => ({
    meta: [
      { title: "Client Campaigns — SuCasa" },
      { name: "description", content: "Turn on branded client campaigns for your agent portfolios." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentCampaigns,
});

function AgentCampaigns() {
  const portfoliosFn = useServerFn(listAgentPortfolios);
  const { data: mine } = useQuery({ queryKey: ["agent-portfolios"], queryFn: () => portfoliosFn() });

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 px-5 py-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <div>
            <Link
              to="/agent"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Back to portfolios
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Client campaigns</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Personalized, data-driven messages sent to your clients under your brand.
            </p>
          </div>

          <CampaignsWorkspace
            orgs={(mine?.orgs ?? []).map((o: { id: string; name: string }) => ({ id: o.id, name: o.name }))}
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
