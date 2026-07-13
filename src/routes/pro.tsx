import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { CLAIMED_OPPORTUNITIES, PRO_OPPORTUNITIES } from "@/lib/mock-data";
import { BarChart3, Bell, Clock, Star, Zap } from "lucide-react";

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
        <div className="mx-auto max-w-6xl space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Pro dashboard</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Sunrise HVAC Co.</h1>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={Bell} label="New opportunities" value="12" tint="primary" />
            <Stat icon={Zap} label="Claim rate" value="72%" tint="growth" />
            <Stat icon={Clock} label="Avg. response" value="14 min" tint="primary" />
            <Stat icon={Star} label="Rating" value="4.9" tint="growth" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">New opportunities</h2>
                <span className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-medium text-accent-foreground">Live</span>
              </div>
              <ul className="mt-4 space-y-3">
                {PRO_OPPORTUNITIES.map(o => (
                  <li key={o.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-2xl border border-border p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{o.category} · {o.id}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{o.location} · {o.budget}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{o.timeline} · posted {o.posted}</p>
                    </div>
                    <button className="shrink-0 self-center rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white shadow-soft">
                      Claim
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl gradient-brand p-6 text-white shadow-elevated">
              <div className="flex items-center gap-2 text-xs opacity-80"><BarChart3 className="h-3.5 w-3.5" /> Membership</div>
              <p className="mt-2 text-lg font-semibold">Founding Partner</p>
              <p className="mt-1 text-xs opacity-90">$397/mo · renews Feb 12</p>
              <div className="mt-5 space-y-2 text-sm">
                <div className="flex justify-between"><span className="opacity-80">This month</span><span>$18.4k revenue</span></div>
                <div className="flex justify-between"><span className="opacity-80">Opportunities</span><span>38</span></div>
                <div className="flex justify-between"><span className="opacity-80">Claimed</span><span>27</span></div>
              </div>
              <button className="mt-5 w-full rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-foreground">Manage plan</button>
            </div>

            <div className="rounded-3xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
              <h2 className="text-base font-semibold">Claimed opportunities</h2>
              <div className="mt-4 divide-y divide-border rounded-2xl border border-border">
                {CLAIMED_OPPORTUNITIES.map(c => (
                  <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{c.homeowner} · {c.category}</p>
                      <p className="text-xs text-muted-foreground">{c.id} · {c.value}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[10px] font-medium text-accent-foreground">{c.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
              <h2 className="text-base font-semibold">Recent reviews</h2>
              <ul className="mt-4 space-y-3">
                {[
                  { name: "Maria G.", text: "Same-day fix, fair price. 10/10.", stars: 5 },
                  { name: "Priya S.", text: "Very professional and clean.", stars: 5 },
                ].map(r => (
                  <li key={r.name} className="rounded-2xl border border-border p-4">
                    <div className="flex gap-0.5 text-primary">
                      {Array.from({ length: r.stars }).map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-current" />)}
                    </div>
                    <p className="mt-2 text-sm">“{r.text}”</p>
                    <p className="mt-1 text-xs text-muted-foreground">— {r.name}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Stat({ icon: Icon, label, value, tint }: { icon: typeof Bell; label: string; value: string; tint: "primary" | "growth" }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${tint === "growth" ? "bg-growth/10 text-growth" : "bg-primary/10 text-primary"}`}>
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-3 text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
