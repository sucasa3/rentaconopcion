import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BusinessShell } from "@/components/business-shell";
import { AgentToday } from "@/components/agent-today";
import { AgentContinuationCard } from "@/components/agent-continuation-card";

import { getBusinessOverview } from "@/lib/business.functions";

export const Route = createFileRoute("/_authenticated/agent/")({
  head: () => ({
    meta: [
      { title: "Today — SuCasa for agents" },
      {
        name: "description",
        content:
          "Who deserves your attention today, why now, and what to say — from your own book of homeowners.",
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
      <AgentToday />
    </BusinessShell>
  );
}

