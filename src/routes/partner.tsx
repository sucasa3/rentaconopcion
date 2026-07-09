import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { ArrowRight, Bell, Zap, Star, BarChart3, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/partner")({
  head: () => ({
    meta: [
      { title: "For Professionals — Grow with SuCasa" },
      { name: "description", content: "Grow your business with qualified homeowners. Monthly membership, opportunity notifications, fast claim system, and a performance dashboard." },
      { property: "og:title", content: "Grow Your Business with Qualified Homeowners" },
      { property: "og:description", content: "Join SuCasa as a Founding Partner." },
    ],
  }),
  component: Partner,
});

function Partner() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="gradient-hero">
          <div className="mx-auto max-w-6xl px-5 pb-16 pt-16 md:pb-24 md:pt-24">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">For professionals</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-6xl">
                Grow Your Business with <span className="bg-gradient-to-r from-primary to-growth bg-clip-text text-transparent">Qualified Homeowners.</span>
              </h1>
              <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
                Stop chasing leads. SuCasa connects you with homeowners who already trust the platform, with a fair claim system and a flat monthly membership.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link to="/pro" className="inline-flex items-center justify-center gap-2 rounded-full gradient-brand px-6 py-3.5 text-sm font-semibold text-white shadow-elevated">
                  Join as a Founding Partner <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/pro" className="inline-flex items-center justify-center rounded-full border border-border bg-background/80 px-6 py-3.5 text-sm font-semibold text-foreground backdrop-blur">
                  See Pro Dashboard
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-16">
          <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Bell, title: "Opportunity notifications", desc: "Get pinged the second a matching request hits your area." },
              { icon: Zap, title: "Fast claim system", desc: "First to claim wins. No bidding wars, no wasted quotes." },
              { icon: Star, title: "Business profile & reviews", desc: "Show off your work, ratings, and verified credentials." },
              { icon: BarChart3, title: "Performance dashboard", desc: "Track claims, response time, revenue, and conversion." },
            ].map(f => (
              <div key={f.title} className="rounded-3xl border border-border bg-card p-6 shadow-soft">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-primary"><f.icon className="h-5 w-5" /></span>
                <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-5 pb-16">
          <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2">
            <div className="rounded-3xl border border-border bg-card p-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Membership</p>
              <h2 className="mt-2 text-2xl font-semibold">Simple monthly pricing</h2>
              <p className="mt-2 text-sm text-muted-foreground">One flat rate. No per-lead fees. No bidding.</p>
              <div className="mt-6 flex items-baseline gap-2">
                <span className="text-5xl font-semibold tracking-tight">$149</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm">
                {["Unlimited opportunity notifications","Founding Partner badge on profile","Priority claim window","Performance dashboard","Homeowner reviews & ratings"].map(t => (
                  <li key={t} className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-growth" /><span>{t}</span></li>
                ))}
              </ul>
              <Link to="/pro" className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full gradient-brand px-6 py-3.5 text-sm font-semibold text-white shadow-soft">
                Join as a Founding Partner
              </Link>
            </div>

            <div className="rounded-3xl gradient-brand p-8 text-white shadow-elevated">
              <p className="text-xs uppercase tracking-wider opacity-80">Performance preview</p>
              <h3 className="mt-2 text-2xl font-semibold">Your business at a glance</h3>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <StatCard label="Opportunities this month" value="38" />
                <StatCard label="Claim rate" value="72%" />
                <StatCard label="Avg. response" value="14 min" />
                <StatCard label="Revenue" value="$18.4k" />
              </div>
              <div className="mt-6 rounded-2xl bg-white/10 p-4 text-sm">
                <p className="opacity-90">“I paid back my membership in my first week.”</p>
                <p className="mt-2 text-xs opacity-70">— Carlos, Sunrise HVAC Co.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
      <p className="text-xs opacity-80">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
