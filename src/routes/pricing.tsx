import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "SuCasa Pricing — Plans for Lenders and Agents" },
      {
        name: "description",
        content:
          "Every SuCasa plan includes the full intelligence platform. Choose by the size of your homeowner database and agent network. From $79/month.",
      },
      { property: "og:title", content: "SuCasa Pricing — Plans for Lenders and Agents" },
      {
        property: "og:description",
        content:
          "Full platform on every plan. Pick capacity, not features. 90-day initial commitment, month-to-month after that.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PricingPage,
});

const LENDER_PLANS = [
  { name: "MLO", price: 79, profiles: "250", agents: 3 },
  { name: "MLO Growth", price: 149, profiles: "1,000", agents: 10, popular: true },
  { name: "Branch", price: 499, profiles: "5,000", agents: 25 },
  { name: "Branch Pro", price: 799, profiles: "10,000", agents: 50 },
  { name: "Network", price: 1499, profiles: "25,000", agents: 100 },
];

const AGENT_PLANS = [
  { name: "Agent", price: 49, profiles: "250" },
  { name: "Agent Growth", price: 99, profiles: "1,000" },
];

const INCLUDED = [
  "Home Profiles for every client",
  "Property, tax and sales intelligence",
  "SuCasa Value Engine",
  "Mortgage, lien and equity intelligence",
  "Opportunity detection",
  "Lender action dashboard",
  "AI reasons to reach out",
  "AI outreach suggestions",
  "Homeowner Premium memberships you can sponsor",
  "Agent collaboration network",
  "Agent dashboards",
  "Homeowner dashboards",
  "Bulk homeowner upload",
  "CRM integration",
  "Permit and home-improvement intelligence",
  "Alerts",
  "AI Document Inbox when released",
  "Standard onboarding",
  "Mobile access",
];

function PricingPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          One platform. Choose your size.
        </h1>
        <p className="mt-4 text-muted-foreground">
          Every plan includes the full SuCasa intelligence platform. Choose the plan based on the
          size of your homeowner database and agent network.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          90-day initial commitment. Month-to-month after that.
        </p>
      </header>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">For lenders</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LENDER_PLANS.map((p) => (
            <Card key={p.name} className={p.popular ? "border-primary" : undefined}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  {p.popular && <Badge>Most chosen</Badge>}
                </div>
                <p className="text-3xl font-semibold tabular-nums">
                  ${p.price.toLocaleString()}
                  <span className="text-base font-normal text-muted-foreground">/mo</span>
                </p>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ul className="space-y-1 text-muted-foreground">
                  <li>{p.profiles} Home Profiles</li>
                  <li>Up to {p.agents} agent collaborations</li>
                </ul>
                <Button asChild className="w-full">
                  <Link to="/auth">Get started</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">For agents</h2>
        <p className="text-sm text-muted-foreground">
          Every agent gets a free SuCasa account with 100 Home Profiles, provided by SuCasa — no
          lender relationship needed. These plans are for agents who want more room.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AGENT_PLANS.map((p) => (
            <Card key={p.name}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{p.name}</CardTitle>
                <p className="text-3xl font-semibold tabular-nums">
                  ${p.price}
                  <span className="text-base font-normal text-muted-foreground">/mo</span>
                </p>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ul className="space-y-1 text-muted-foreground">
                  <li>{p.profiles} Home Profiles</li>
                </ul>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/auth">Get started</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-3xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Need more room?</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">+500 Home Profiles</span> — $49/month
          </p>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">+5 Agent Collaborations</span> —
            $29/month (lender plans)
          </p>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Everything in SuCasa is included</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {INCLUDED.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-growth" />
              {f}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
