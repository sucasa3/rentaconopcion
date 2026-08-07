import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPortfolio } from "@/lib/lender.functions";
import { CampaignsWorkspace } from "@/components/campaigns-workspace";

export const Route = createFileRoute("/_authenticated/lender/portfolio/$id/campaigns")({
  component: PortfolioCampaigns,
});

function PortfolioCampaigns() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getPortfolio);
  const { data } = useQuery({
    queryKey: ["lender-portfolio", id, 6.25],
    queryFn: () => getFn({ data: { id, benchmarkRate: 6.25 } }),
  });

  const orgs = data?.portfolio.orgId
    ? [{ id: data.portfolio.orgId, name: data.portfolio.orgName }]
    : [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Personalized, data-driven messages sent to the clients in this book under your brand.
      </p>
      {orgs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading campaigns…</p>
      ) : (
        <CampaignsWorkspace orgs={orgs} />
      )}
    </div>
  );
}
