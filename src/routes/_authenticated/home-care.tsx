import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { HomeownerShell } from "@/components/homeowner-shell";
import { HomeCarePanel } from "@/components/home-care-panel";
import { RecommendedProsCard } from "@/components/recommended-pros-card";
import { RecentRequestsCard } from "@/components/recent-requests-card";

export const Route = createFileRoute("/_authenticated/home-care")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Home care — SuCasa" },
      {
        name: "description",
        content: "Your home's systems, what needs attention now, and who can help.",
      },
      { property: "og:title", content: "Home care — SuCasa" },
      {
        property: "og:description",
        content: "Your home's systems, what needs attention now, and who can help.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HomeCarePage,
});

function HomeCarePage() {
  return (
    <HomeownerShell>
      <main className="px-4 py-6 sm:px-5 sm:py-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to your home
          </Link>

          <HomeCarePanel onGoToDocuments={() => navigate({ to: "/documents" })} />
          <RecommendedProsCard />
          <RecentRequestsCard />
        </div>
      </main>
    </HomeownerShell>
  );
}
