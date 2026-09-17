import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight } from "lucide-react";
import { PlanCard } from "@/components/professional-public";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getAgentAttribution } from "@/lib/agent-funnel";
import { recordPublicAgentEvent } from "@/lib/agent-funnel.functions";
import { AGENT_PUBLIC_PLANS } from "@/lib/public-plans";

export const Route = createFileRoute("/agents/pricing")({
  head: () => ({ meta: [
    { title: "Agent Pricing — SuCasa" }, { name: "description", content: "Start with 100 Home Profiles free, or choose more capacity for your real-estate client book." },
    { property: "og:title", content: "SuCasa Pricing for Agents" }, { property: "og:description", content: "100 Home Profiles free, with paid capacity for larger client books." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ], links: [{ rel: "canonical", href: "https://sucasa.com/agents/pricing" }] }), component: AgentPricing,
});

function AgentPricing() {
  const record = useServerFn(recordPublicAgentEvent);
  const track = (action: "agent_pricing_viewed" | "agent_pricing_start_clicked" | "agent_pricing_upgrade_clicked") => void record({ data: { action, ...getAgentAttribution() } });
  useEffect(() => { track("agent_pricing_viewed"); }, []);
  return <div className="min-h-screen bg-background"><SiteHeader /><main>
    <header className="border-b border-border bg-surface-warm"><div className="mx-auto max-w-4xl px-5 py-12 text-center sm:py-16"><p className="text-sm font-semibold text-status-opportunity">SuCasa for agents</p><h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">Start free. Add room when your book needs it.</h1><p className="mx-auto mt-4 max-w-2xl text-muted-foreground">Every plan follows the same daily rhythm: who, why now, what to say, and what to do next.</p></div></header>
    <section className="mx-auto max-w-6xl px-5 py-12 sm:py-16"><div className="grid gap-5 lg:grid-cols-3">{AGENT_PUBLIC_PLANS.map((plan, index) => <PlanCard key={plan.key} name={plan.name} price={plan.price} description={plan.description} features={[...plan.features]} featured={index === 0} footer={<Button asChild className="min-h-11 w-full" variant={index === 0 ? "default" : "outline"}><Link to="/agent-start" search={{ source: index === 0 ? "agent_pricing_free" : `agent_pricing_${plan.key}` }} onClick={() => track(index === 0 ? "agent_pricing_start_clicked" : "agent_pricing_upgrade_clicked")}>{index === 0 ? "Start free" : "Sign in to request upgrade"} <ArrowRight /></Link></Button>} />)}</div><p className="mx-auto mt-7 max-w-2xl text-center text-sm text-muted-foreground">Paid agent capacity is requested from your signed-in workspace. You will not be charged from this public page.</p></section>
    <section className="bg-sucasa-navy py-12 text-center text-primary-foreground"><div className="mx-auto max-w-2xl px-5"><h2 className="text-3xl font-semibold">Your first 100 Home Profiles stay free.</h2><p className="mt-3 text-primary-foreground/70">No lender relationship required. No credit card required.</p><Button asChild size="lg" className="mt-6 min-h-12 bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90"><Link to="/agent-start" search={{ source: "agent_pricing_final" }} onClick={() => track("agent_pricing_start_clicked")}>Get started free <ArrowRight /></Link></Button></div></section>
  </main><SiteFooter /></div>;
}