import { createFileRoute, Link } from "@tanstack/react-router";
import { BusinessShell } from "@/components/business-shell";
import { LenderNetworkWorkspace } from "@/components/lender-network-workspace";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lender/network")({
  head: () => ({
    meta: [
      { title: "Agent Network — SuCasa" },
      {
        name: "description",
        content:
          "Connected real estate agents, de-identified homeowner opportunities, and introduction requests.",
      },
      { property: "og:title", content: "Agent Network — SuCasa" },
      {
        property: "og:description",
        content: "Connected agents, de-identified opportunities, and introduction requests.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LenderNetwork,
});

function LenderNetwork() {
  return (
    <BusinessShell kind="lender">
      <main className="px-4 py-6 sm:px-5 sm:py-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <Link
              to="/lender"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Back to portfolios
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Agent network
            </h1>
          </div>

          <LenderNetworkWorkspace />
        </div>
      </main>
    </BusinessShell>
  );
}
