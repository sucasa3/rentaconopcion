import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { GhlSyncPanel } from "@/components/ghl-sync-panel";
import { FelloPanel } from "@/components/fello-panel";
import { AdminLeadsPanel } from "@/components/admin-leads-panel";
import { ProSeedPanel } from "@/components/pro-seed-panel";
import { AttomSpendPanel } from "@/components/attom-spend-panel";
import { AdminLenderPanel } from "@/components/admin-lender-panel";
import { AdminProfilesPanel } from "@/components/admin-profiles-panel";
import { AdminPartnerPanel } from "@/components/admin-partner-panel";
import { AdminCampaignPanel } from "@/components/admin-campaign-panel";
import { ADMIN_HOMEOWNERS, ADMIN_PROS } from "@/lib/mock-data";
import { Building2, Users, Wrench, DollarSign } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — SuCasa" },
      { name: "description", content: "Manage homeowners, professionals, service requests, and key metrics." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

function Admin() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 px-5 py-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Admin</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Operations dashboard</h1>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric icon={Users} label="Homeowners" value="1,284" delta="+42 wk" />
            <Metric icon={Wrench} label="Active pros" value="187" delta="+9 wk" />
            <Metric icon={Building2} label="Requests (30d)" value="642" delta="+18%" />
            <Metric icon={DollarSign} label="MRR" value="$27.9k" delta="+11%" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Homeowners">
              <Table
                head={["Name","City","Requests","Joined"]}
                rows={ADMIN_HOMEOWNERS.map(h => [h.name, h.city, String(h.requests), h.joined])}
              />
            </Panel>
            <Panel title="Professionals">
              <Table
                head={["Name","Plan","Claimed","Rating"]}
                rows={ADMIN_PROS.map(p => [p.name, p.plan, String(p.claimed), `★ ${p.rating}`])}
              />
            </Panel>
          </div>

          <AdminProfilesPanel />

          <AttomSpendPanel />

          <AdminLenderPanel />

          <AdminCampaignPanel />

          <AdminLeadsPanel />

          

          <AdminPartnerPanel />

          <ProSeedPanel />

          <GhlSyncPanel />

          <FelloPanel />



        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Metric({ icon: Icon, label, value, delta }: { icon: typeof Users; label: string; value: string; delta: string }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
        <span className="rounded-full bg-growth/10 px-2 py-0.5 text-[10px] font-medium text-growth">{delta}</span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}
function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>{head.map(h => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((c, j) => <td key={j} className={`px-3 py-3 ${j === 0 ? "font-medium" : "text-muted-foreground"}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
