import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ChevronRight } from "lucide-react";
import { FourAnswers, ProfessionalPreview, TrustStatement } from "@/components/professional-public";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getAgentAttribution } from "@/lib/agent-funnel";
import { recordPublicAgentEvent } from "@/lib/agent-funnel.functions";

export const Route = createFileRoute("/agents/")({
  head: () => ({ meta: [
    { title: "SuCasa for Agents — Your Relationships, Prioritized" },
    { name: "description", content: "Know who deserves attention, why now, what to say, and what to do next. Start with 100 Home Profiles free." },
    { property: "og:title", content: "SuCasa for Agents — Your Relationships, Prioritized" },
    { property: "og:description", content: "Turn your existing homeowner relationships into a clear daily priority list." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "index,follow" },
  ], links: [{ rel: "canonical", href: "https://sucasa.com/agents" }] }),
  component: AgentsLandingPage,
});

type Action = "agent_start_clicked" | "agent_pricing_clicked" | "agent_deck_viewed" | "agent_signin_clicked";

function AgentsLandingPage() {
  const record = useServerFn(recordPublicAgentEvent);
  const track = (action: Action) => void record({ data: { action, ...getAgentAttribution() } });
  useEffect(() => { void record({ data: { action: "agent_landing_view", ...getAgentAttribution() } }); }, [record]);
  return <div className="min-h-screen overflow-x-hidden bg-background text-foreground"><SiteHeader /><main>
    <section className="border-b border-border bg-surface-warm">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 pb-10 pt-9 md:grid-cols-[minmax(0,1fr)_minmax(360px,0.82fr)] md:items-center md:pb-14 md:pt-14">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-status-opportunity">SuCasa for real-estate agents</p>
          <h1 className="mt-3 max-w-3xl text-[2.5rem] font-semibold leading-[1.04] sm:text-5xl lg:text-6xl">You already have the relationships. Know who to focus on next.</h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">SuCasa turns the homeowners already in your database into a prioritized plan—who deserves attention, why now, what you could say, and what to do next.</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="min-h-12 bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90"><Link to="/agent-start" search={{ source: "agents_hero" }} onClick={() => track("agent_start_clicked")}>Get 100 Home Profiles Free <ArrowRight /></Link></Button>
            <Button asChild size="lg" variant="outline" className="min-h-12"><Link to="/agents/pricing" onClick={() => track("agent_pricing_clicked")}>View pricing</Link></Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">Free permanently for your first 100 Home Profiles. No credit card required.</p>
          <Link to="/agent-start" search={{ source: "agents_signin" }} onClick={() => track("agent_signin_clicked")} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary">Already use SuCasa? Sign in <ChevronRight className="h-4 w-4" /></Link>
        </div>
        <ProfessionalPreview kind="agent" />
      </div>
    </section>
    <FourAnswers audience="agent" />
    <TrustStatement kind="agent" />
    <section className="bg-sucasa-navy py-12 text-primary-foreground sm:py-16"><div className="mx-auto grid max-w-6xl gap-6 px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div><p className="text-sm font-semibold text-sucasa-orange">Your first 100 Home Profiles are on SuCasa.</p><h2 className="mt-2 text-3xl font-semibold sm:text-4xl">See what is already hiding inside the relationships you’ve earned.</h2><p className="mt-3 max-w-2xl text-primary-foreground/70">100 Home Profiles free. No credit card required.</p></div>
      <div className="flex flex-col gap-3 sm:flex-row"><Button asChild size="lg" className="min-h-12 bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90"><Link to="/agents/pricing" onClick={() => track("agent_pricing_clicked")}>See Agent Plans <ArrowRight /></Link></Button><Button asChild size="lg" variant="outline" className="min-h-12 border-primary-foreground/25 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"><Link to="/agent-start" search={{ source: "agents_final" }} onClick={() => track("agent_start_clicked")}>Start free</Link></Button></div>
    </div></section>
  </main><SiteFooter /></div>;
}