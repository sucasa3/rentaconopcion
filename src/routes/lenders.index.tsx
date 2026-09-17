import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ChevronRight } from "lucide-react";
import { FourAnswers, ProfessionalPreview, TrustStatement } from "@/components/professional-public";
import { PilotRequestDialog } from "@/components/pilot-request-dialog";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getAgentAttribution } from "@/lib/agent-funnel";
import { recordPublicAgentEvent } from "@/lib/agent-funnel.functions";

export const Route = createFileRoute("/lenders/")({
  head: () => ({ meta: [
    { title: "SuCasa for Lenders — Opportunity Discovery for Your Book" },
    { name: "description", content: "Discover which relationships in your past-client book deserve attention, why now, and what to do next. Start with 100 clients free." },
    { property: "og:title", content: "SuCasa for Lenders — Opportunity Discovery for Your Book" },
    { property: "og:description", content: "See who in your book deserves attention, the factual reason, and the next conversation." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "index,follow" },
  ], links: [{ rel: "canonical", href: "https://sucasa.com/lenders" }] }), component: LendersLandingPage,
});

type Action = "lender_discovery_cta_clicked" | "lender_pricing_clicked" | "lender_deck_viewed" | "lender_signin_clicked" | "lender_pilot_clicked";

function LendersLandingPage() {
  const record = useServerFn(recordPublicAgentEvent);
  const track = (action: Action) => void record({ data: { action, ...getAgentAttribution() } });
  useEffect(() => { void record({ data: { action: "lender_landing_view", ...getAgentAttribution() } }); }, [record]);
  return <div className="min-h-screen overflow-x-hidden bg-background text-foreground"><SiteHeader /><main>
    <section className="border-b border-border bg-surface-warm"><div className="mx-auto grid max-w-6xl gap-8 px-5 pb-10 pt-9 md:grid-cols-[minmax(0,1fr)_minmax(360px,0.82fr)] md:items-center md:pb-14 md:pt-14">
      <div className="min-w-0"><p className="text-sm font-semibold text-status-opportunity">SuCasa for mortgage lenders</p><h1 className="mt-3 max-w-3xl text-[2.5rem] font-semibold leading-[1.04] sm:text-5xl lg:text-6xl">Your book already has conversations worth finding.</h1><p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">SuCasa reads the property context around your past-client book and shows you who deserves attention, why now, what to say, and what to do next.</p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row"><Button asChild size="lg" className="min-h-12 bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90"><Link to="/lender-start" search={{ source: "lenders_hero" }} onClick={() => track("lender_discovery_cta_clicked")}>Start Free Discovery <ArrowRight /></Link></Button><Button asChild size="lg" variant="outline" className="min-h-12"><Link to="/lenders/pricing" onClick={() => track("lender_pricing_clicked")}>View pricing</Link></Button></div>
        <p className="mt-3 text-sm text-muted-foreground">Analyze up to 100 past clients. No card, contract, or homeowner contact.</p><Link to="/auth" onClick={() => track("lender_signin_clicked")} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary">Already use SuCasa? Sign in <ChevronRight className="h-4 w-4" /></Link>
      </div><ProfessionalPreview kind="lender" />
    </div></section>
    <FourAnswers audience="lender" />
    <TrustStatement kind="lender" />
    <section className="bg-sucasa-navy py-12 text-primary-foreground sm:py-16"><div className="mx-auto grid max-w-6xl gap-6 px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div><p className="text-sm font-semibold text-sucasa-orange">Free Opportunity Discovery</p><h2 className="mt-2 text-3xl font-semibold sm:text-4xl">Look inside your book before you buy.</h2><p className="mt-3 max-w-2xl text-primary-foreground/70">Upload up to 100 valid, unique properties. See the highest-priority opportunities and the reasons attached.</p></div><div className="flex flex-col gap-3 sm:flex-row"><Button asChild size="lg" className="min-h-12 bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90"><Link to="/lender-start" search={{ source: "lenders_final" }} onClick={() => track("lender_discovery_cta_clicked")}>Start Free Discovery <ArrowRight /></Link></Button><Button asChild size="lg" variant="outline" className="min-h-12 border-primary-foreground/25 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"><Link to="/lenders/pricing" onClick={() => track("lender_pricing_clicked")}>Review pricing</Link></Button></div></div></section>
    <section className="border-b border-border bg-background py-6"><div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-5 text-sm text-muted-foreground"><span className="font-semibold text-foreground">Resources</span><Link to="/lenders/deck" onClick={() => track("lender_deck_viewed")} className="hover:text-foreground">Lender presentation</Link><PilotRequestDialog onOpen={() => track("lender_pilot_clicked")}><Button variant="link" className="h-auto p-0 text-sm font-normal text-muted-foreground hover:text-foreground">Talk to us about a team pilot</Button></PilotRequestDialog></div></section>
  </main><SiteFooter /></div>;
}