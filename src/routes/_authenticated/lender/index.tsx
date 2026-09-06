import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BusinessShell } from "@/components/business-shell";
import { BusinessDashboard } from "@/components/business-dashboard";
import { LenderToday } from "@/components/lender-today";
import { LenderBook } from "@/components/lender-book";
import { LenderCommandCenter } from "@/components/lender-command-center";
import { getBusinessOverview } from "@/lib/business.functions";

export const Route = createFileRoute("/_authenticated/lender/")({
  head: () => ({
    meta: [
      { title: "Lender Dashboard — SuCasa" },
      {
        name: "description",
        content:
          "Who to contact today, why now, and what to say — for the homeowners you have a relationship with.",
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
      <LenderToday />
      <LenderBook />
      <LenderCommandCenter />
      <BusinessDashboard kind="lender" isManager={data?.isManager} showQueue={false} showHeader={false} />
    </BusinessShell>
  );
}

