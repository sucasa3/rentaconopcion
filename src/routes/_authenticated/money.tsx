import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/lib/i18n";

import { HomeownerShell } from "@/components/homeowner-shell";
import { HomeIntelPanel } from "@/components/home-intel-panel";
import { EquityMortgagePanel } from "@/components/equity-mortgage-panel";
import { SellerIntentCard } from "@/components/seller-intent-card";

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
  const t = useT();
  return (
    <HomeownerShell>
      <main className="px-4 py-6 sm:px-5 sm:py-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> {t("common.back_home")}
          </Link>

          <HomeIntelPanel />
          <EquityMortgagePanel />

          <SellerIntentCard />
        </div>
      </main>
    </HomeownerShell>
  );
}
