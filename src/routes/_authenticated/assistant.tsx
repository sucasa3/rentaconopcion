import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { HomeownerShell } from "@/components/homeowner-shell";
import { HomeAssistantCard } from "@/components/home-assistant-card";

export const Route = createFileRoute("/_authenticated/assistant")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Home Assistant — SuCasa" },
      {
        name: "description",
        content: "Ask anything about your home and get answers based on your own records.",
      },
      { property: "og:title", content: "Home Assistant — SuCasa" },
      {
        property: "og:description",
        content: "Ask anything about your home and get answers based on your own records.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AssistantPage,
});

function AssistantPage() {
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

          <HomeAssistantCard />
        </div>
      </main>
    </HomeownerShell>
  );
}
