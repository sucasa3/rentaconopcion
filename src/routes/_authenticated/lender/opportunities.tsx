import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BusinessShell } from "@/components/business-shell";
import { OpportunitiesBoard } from "@/components/opportunities-board";
import { getBusinessOverview } from "@/lib/business.functions";

export const Route = createFileRoute("/_authenticated/lender/opportunities")({
  head: () => ({
    meta: [
      { title: "Opportunities — SuCasa Lender" },
      { name: "description", content: "Every client worth a conversation today, in one list." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LenderOpportunities,
});

function LenderOpportunities() {
  const overviewFn = useServerFn(getBusinessOverview);
  const { data } = useQuery({
    queryKey: ["business-overview", "lender"],
    queryFn: () => overviewFn({ data: { orgType: "lender" } }),
    staleTime: 60_000,
  });
  return (
    <BusinessShell kind="lender" bookId={data?.books?.[0]?.id ?? null}>
      <OpportunitiesBoard kind="lender" />
    </BusinessShell>
  );
}
