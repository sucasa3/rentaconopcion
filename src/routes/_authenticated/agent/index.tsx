import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BusinessShell } from "@/components/business-shell";
import { BusinessDashboard } from "@/components/business-dashboard";
import { AgentContinuationCard } from "@/components/agent-continuation-card";

import { getBusinessOverview } from "@/lib/business.functions";

export const Route = createFileRoute("/_authenticated/agent/")({
  head: () => ({
    meta: [
      { title: "Agent Dashboard — SuCasa" },
      {
        name: "description",
        content: "Your homeowners, today's opportunities and live campaigns in one view.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentHome,
});

function AgentHome() {
  const overviewFn = useServerFn(getBusinessOverview);
  const { data } = useQuery({
    queryKey: ["business-overview", "agent"],
    queryFn: () => overviewFn({ data: { orgType: "agent" } }),
    staleTime: 60_000,
  });

  const orgId = (data as any)?.org?.id ?? (data as any)?.orgs?.[0]?.id ?? null;

  return (
    <BusinessShell kind="agent" bookId={data?.books?.[0]?.id ?? null} isManager={data?.isManager}>
      {orgId && (
        <div className="px-4 pt-4 sm:px-5">
          <AgentContinuationCard orgId={orgId} />
        </div>
      )}
      <BusinessDashboard kind="agent" isManager={data?.isManager} />
    </BusinessShell>
  );
}

