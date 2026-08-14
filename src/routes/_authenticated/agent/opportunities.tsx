import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BusinessShell } from "@/components/business-shell";
import { OpportunitiesBoard } from "@/components/opportunities-board";
import { getBusinessOverview } from "@/lib/business.functions";

export const Route = createFileRoute("/_authenticated/agent/opportunities")({
  head: () => ({
    meta: [
      { title: "Opportunities — SuCasa Agent" },
      { name: "description", content: "Every homeowner in your sphere worth a conversation today." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentOpportunities,
});

function AgentOpportunities() {
  const overviewFn = useServerFn(getBusinessOverview);
  const { data } = useQuery({
    queryKey: ["business-overview", "agent"],
    queryFn: () => overviewFn({ data: { orgType: "agent" } }),
    staleTime: 60_000,
  });
  return (
    <BusinessShell kind="agent" bookId={data?.books?.[0]?.id ?? null}>
      <OpportunitiesBoard kind="agent" />
    </BusinessShell>
  );
}
