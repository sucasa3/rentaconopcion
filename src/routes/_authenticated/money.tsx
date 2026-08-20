import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { HomeownerShell } from "@/components/homeowner-shell";
import { HomeIntelPanel } from "@/components/home-intel-panel";
import { EquityMortgagePanel } from "@/components/equity-mortgage-panel";
import { HomeSignalsPanel } from "@/components/home-signals-panel";
import { SellerIntentCard } from "@/components/seller-intent-card";
import { useHomeRecord } from "@/hooks/use-home-record";

export const Route = createFileRoute("/_authenticated/money")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Value & equity — SuCasa" },
      {
        name: "description",
        content: "What your home is worth, how much equity you hold, and what that makes possible.",
      },
      { property: "og:title", content: "Value & equity — SuCasa" },
      {
        property: "og:description",
        content: "What your home is worth, how much equity you hold, and what that makes possible.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MoneyPage,
});

function MoneyPage() {
  const navigate = useNavigate();
  const { record, report, isLoading } = useHomeRecord();

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

          {!isLoading && record && report && (
            <HomeSignalsPanel
              signals={report.signals}
              record={record}
              onGoToTab={(t) => {
                if (t === "care") navigate({ to: "/home-care" });
                else if (t === "documents") navigate({ to: "/documents" });
                else window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          )}

          <HomeIntelPanel />
          <EquityMortgagePanel />

          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
            <h2 className="text-base font-semibold">Home Intelligence Report</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your monthly deep-dive on value, equity, and improvement ROI.
            </p>
            <Link
              to="/report"
              className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-full gradient-growth px-4 py-2.5 text-sm font-semibold text-white"
            >
              View report <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <SellerIntentCard />
        </div>
      </main>
    </HomeownerShell>
  );
}
