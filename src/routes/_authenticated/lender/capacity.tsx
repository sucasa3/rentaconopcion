import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BusinessShell } from "@/components/business-shell";
import { CapacityWorkspace } from "@/components/capacity-workspace";
import { getBusinessOverview } from "@/lib/business.functions";

export const Route = createFileRoute("/_authenticated/lender/capacity")({
  head: () => ({
    meta: [
      { title: "Home Profile capacity — SuCasa" },
      {
        name: "description",
        content:
          "Share your Home Profile pool across your team and sponsored agents, and see what's left.",
      },
      { property: "og:title", content: "Home Profile capacity — SuCasa" },
      {
        property: "og:description",
        content: "Allocate Home Profiles to sponsored agents from one shared pool.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CapacityPage,
});

function CapacityPage() {
  const overviewFn = useServerFn(getBusinessOverview);
  const { data: overview } = useQuery({
    queryKey: ["business-overview", "lender"],
    queryFn: () => overviewFn({ data: { orgType: "lender" } }),
    staleTime: 60_000,
  });
  const orgId = (overview as any)?.org?.id ?? (overview as any)?.orgs?.[0]?.id ?? null;

  return (
    <BusinessShell kind="lender" bookId={null} isManager>
      <main className="px-4 py-6 sm:px-5 sm:py-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Home Profile capacity
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              One shared pool. Keep what you need and give each agent as much as they can use.
            </p>
          </div>
          {orgId ? (
            <CapacityWorkspace orgId={orgId} />
          ) : (
            <p className="text-sm text-muted-foreground">Loading your organization…</p>
          )}
        </div>
      </main>
    </BusinessShell>
  );
}
