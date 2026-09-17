import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowRight, Check } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getAgentAttribution } from "@/lib/agent-funnel";
import { recordPublicAgentEvent } from "@/lib/agent-funnel.functions";
import { LENDER_PUBLIC_PLANS } from "@/lib/public-plans";

export const Route = createFileRoute("/lenders/pricing")({
  head: () => ({ meta: [
    { title: "Lender Pricing — SuCasa Discovery and Plans" }, { name: "description", content: "Start with a free 100-client Discovery, continue with a 90-day SuCasa Pilot, or review lender capacity plans." },
    { property: "og:title", content: "SuCasa Pricing for Lenders" }, { property: "og:description", content: "Free Discovery, a clear 90-day pilot, and capacity plans for lending teams." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ], links: [{ rel: "canonical", href: "https://sucasa.com/lenders/pricing" }] }), component: LenderPricing,
});

function LenderPricing() {
  const record = useServerFn(recordPublicAgentEvent);
  const track = (action: "lender_pricing_viewed" | "lender_pricing_discovery_clicked" | "lender_pricing_subscribe_clicked") => void record({ data: { action, ...getAgentAttribution() } });
  useEffect(() => { track("lender_pricing_viewed"); }, []);
  return <div className="min-h-screen bg-background"><SiteHeader /><main>
    <header className="border-b border-border bg-surface-warm"><div className="mx-auto max-w-4xl px-5 py-12 text-center sm:py-16"><p className="text-sm font-semibold text-status-opportunity">SuCasa for lenders</p><h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">See the opportunity first. Then decide.</h1><p className="mx-auto mt-4 max-w-2xl text-muted-foreground">One clear path from a free look inside your book to continuous monitoring.</p></div></header>
    <section className="mx-auto max-w-5xl px-5 py-12 sm:py-16"><div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
      <Step eyebrow="FREE" title="100-client Discovery" price="$0" copy="Upload up to 100 valid, unique properties. See your top opportunities and the factual reasons attached." cta={<Button asChild className="w-full bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90"><Link to="/lender-start" search={{ source: "lender_pricing_discovery" }} onClick={() => track("lender_pricing_discovery_clicked")}>Start Free Discovery <ArrowRight /></Link></Button>} />
      <ArrowDown className="mx-auto h-5 w-5 self-center text-muted-foreground md:-rotate-90" />
      <Step eyebrow="90-DAY PILOT" title="Full MLO Growth experience" price="$447 total" copy="Continuous monitoring for up to 1,000 Home Profiles for 90 days. Available after your Discovery reveal." featured />
      <ArrowDown className="mx-auto h-5 w-5 self-center text-muted-foreground md:-rotate-90" />
      <Step eyebrow="CONTINUE" title="MLO Growth" price="$149/month" copy="Continues after the pilot unless cancelled. Keep the same monitored book and working rhythm." />
    </div><p className="mt-5 text-center text-xs text-muted-foreground">The pilot checkout is offered inside your protected Discovery workspace after results are revealed.</p></section>
    <section className="border-y border-border bg-surface py-12"><div className="mx-auto max-w-6xl px-5"><div className="max-w-2xl"><p className="text-sm font-semibold text-status-opportunity">Need a different size?</p><h2 className="mt-2 text-3xl font-semibold">Other monthly capacity plans</h2></div><div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{LENDER_PUBLIC_PLANS.map((plan) => <article key={plan.key} className="rounded-lg border border-border bg-card p-5"><h3 className="font-semibold">{plan.name}</h3><p className="mt-2 text-2xl font-semibold">{plan.price}</p><p className="mt-2 text-sm text-muted-foreground">{plan.description}</p><ul className="mt-4 space-y-1.5 text-sm text-muted-foreground"><li className="flex gap-2"><Check className="h-4 w-4 text-status-positive" />{plan.profiles} Home Profiles</li><li className="flex gap-2"><Check className="h-4 w-4 text-status-positive" />Up to {plan.agents} agent collaborations</li></ul><Button asChild variant="outline" className="mt-5 w-full"><Link to="/lender-start" search={{ source: `lender_pricing_${plan.key}` }} onClick={() => track("lender_pricing_subscribe_clicked")}>Start or sign in <ArrowRight /></Link></Button></article>)}</div><p className="mt-6 text-sm text-muted-foreground">New lenders begin with Discovery. Signed-in organization managers can complete configured subscriptions from Plan &amp; Billing.</p></div></section>
  </main><SiteFooter /></div>;
}
function Step({ eyebrow, title, price, copy, cta, featured }: { eyebrow: string; title: string; price: string; copy: string; cta?: React.ReactNode; featured?: boolean }) { return <article className={`flex flex-col rounded-lg border bg-card p-5 shadow-soft ${featured ? "border-sucasa-orange" : "border-border"}`}><p className="text-xs font-semibold text-status-opportunity">{eyebrow}</p><h2 className="mt-3 text-lg font-semibold">{title}</h2><p className="mt-2 text-3xl font-semibold">{price}</p><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{copy}</p>{cta && <div className="mt-auto pt-6">{cta}</div>}</article>; }