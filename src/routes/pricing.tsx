import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BriefcaseBusiness, Landmark } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pricing")({
  head: () => ({ meta: [
    { title: "SuCasa Pricing — Choose Agent or Lender Plans" },
    { name: "description", content: "Choose SuCasa pricing for real-estate agents or mortgage lenders." },
    { property: "og:title", content: "SuCasa Pricing" }, { property: "og:description", content: "Choose the SuCasa experience built for your role." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ], links: [{ rel: "canonical", href: "https://sucasa.com/pricing" }] }), component: PricingGateway,
});

function PricingGateway() { return <div className="min-h-screen bg-surface-warm"><SiteHeader /><main className="mx-auto max-w-5xl px-5 py-14 sm:py-20"><header className="mx-auto max-w-2xl text-center"><p className="text-sm font-semibold text-status-opportunity">SuCasa plans</p><h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">Choose your SuCasa experience.</h1><p className="mt-4 text-muted-foreground">Agent and lender plans serve different workflows. Start with your role.</p></header><div className="mt-10 grid gap-5 md:grid-cols-2">
  <RoleCard icon={<BriefcaseBusiness />} title="I’m a real-estate agent" copy="Prioritize homeowner relationships and start with 100 Home Profiles free." to="/agents/pricing" cta="View agent plans" />
  <RoleCard icon={<Landmark />} title="I’m a mortgage lender" copy="Discover opportunities in your existing book, then choose the right monitoring capacity." to="/lenders/pricing" cta="View lender plans" />
</div></main><SiteFooter /></div>; }
function RoleCard({ icon, title, copy, to, cta }: { icon: React.ReactNode; title: string; copy: string; to: "/agents/pricing" | "/lenders/pricing"; cta: string }) { return <article className="rounded-lg border border-border bg-card p-6 shadow-soft sm:p-8"><span className="grid h-11 w-11 place-items-center rounded-md bg-surface-intelligence text-primary">{icon}</span><h2 className="mt-7 text-2xl font-semibold">{title}</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{copy}</p><Button asChild className="mt-7 min-h-11 w-full bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90"><Link to={to}>{cta} <ArrowRight /></Link></Button></article>; }