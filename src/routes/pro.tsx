import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { ProLeadInbox } from "@/components/pro-lead-inbox";

export const Route = createFileRoute("/pro")({
  head: () => ({
    meta: [
      { title: "Pro Dashboard — SuCasa" },
      { name: "description", content: "Manage opportunities, claims, response times, reviews, and your membership." },
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
          <ProLeadInbox />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
