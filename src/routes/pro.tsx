import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { ProAccountPanel } from "@/components/pro-account-panel";

export const Route = createFileRoute("/pro")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Pro Dashboard — SuCasa" },
      { name: "description", content: "Join SuCasa as a pro, manage your membership, opportunities and claims." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProDashboard,
});

function ProDashboard() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 px-5 py-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Pro dashboard</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Opportunities</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Leads route to you round-robin. You have <span className="font-semibold text-foreground">25 minutes</span> to claim before the lead auto-reassigns to the next pro.
            </p>
          </div>
          <ProAccountPanel />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

