import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BusinessShell } from "@/components/business-shell";
import { BusinessDashboard } from "@/components/business-dashboard";
import { getBusinessOverview } from "@/lib/business.functions";

export const Route = createFileRoute("/_authenticated/lender/")({
  head: () => ({
    meta: [
      { title: "Lender Dashboard — SuCasa" },
      {
        name: "description",
        content: "Your clients, today's opportunities and live campaigns in one view.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LenderHome,
});

function LenderHome() {
  const overviewFn = useServerFn(getBusinessOverview);
  const { data } = useQuery({
    queryKey: ["business-overview", "lender"],
    queryFn: () => overviewFn({ data: { orgType: "lender" } }),
    staleTime: 60_000,
  });

  return (
    <BusinessShell kind="lender" bookId={data?.books?.[0]?.id ?? null} isManager={data?.isManager}>
      <BusinessDashboard kind="lender" isManager={data?.isManager} />
    </BusinessShell>
  );
}
