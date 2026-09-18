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
import { useLanguage } from "@/lib/i18n";

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
  const { t } = useLanguage();
  const record = useServerFn(recordPublicAgentEvent);
  const track = (action: Action) => void record({ data: { action, ...getAgentAttribution() } });
  useEffect(() => { void record({ data: { action: "lender_landing_view", ...getAgentAttribution() } }); }, [record]);
  return <div className="min-h-screen overflow-x-hidden bg-background text-foreground"><SiteHeader /><main>
    <section className="border-b border-border bg-surface-warm"><div className="mx-auto grid max-w-6xl gap-8 px-5 pb-10 pt-9 md:grid-cols-[minmax(0,1fr)_minmax(360px,0.82fr)] md:items-center md:pb-14 md:pt-14">
      <div className="min-w-0"><p className="text-sm font-semibold text-status-opportunity">{t("pub.lenders.eyebrow")}</p><h1 className="mt-3 max-w-3xl text-[2.5rem] font-semibold leading-[1.04] sm:text-5xl lg:text-6xl">{t("pub.lenders.h1")}</h1><p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">{t("pub.lenders.sub")}</p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row"><Button asChild size="lg" className="min-h-12 bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90"><Link to="/lender-start" search={{ source: "lenders_hero" }} onClick={() => track("lender_discovery_cta_clicked")}>{t("pub.lenders.cta_primary")} <ArrowRight /></Link></Button><Button asChild size="lg" variant="outline" className="min-h-12"><Link to="/lenders/pricing" onClick={() => track("lender_pricing_clicked")}>{t("pub.lenders.cta_pricing")}</Link></Button></div>
        <p className="mt-3 text-sm text-muted-foreground">{t("pub.lenders.microcopy")}</p><Link to="/auth" onClick={() => track("lender_signin_clicked")} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary">{t("pub.lenders.signin")} <ChevronRight className="h-4 w-4" /></Link>
      </div><ProfessionalPreview kind="lender" />
    </div></section>
    <FourAnswers audience="lender" />
    <TrustStatement kind="lender" />
    <section className="bg-sucasa-navy py-12 text-primary-foreground sm:py-16"><div className="mx-auto grid max-w-6xl gap-6 px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div><p className="text-sm font-semibold text-sucasa-orange">{t("pub.lenders.final_eyebrow")}</p><h2 className="mt-2 text-3xl font-semibold sm:text-4xl">{t("pub.lenders.final_title")}</h2><p className="mt-3 max-w-2xl text-primary-foreground/70">{t("pub.lenders.final_sub")}</p></div><div className="flex flex-col gap-3 sm:flex-row"><Button asChild size="lg" className="min-h-12 bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90"><Link to="/lender-start" search={{ source: "lenders_final" }} onClick={() => track("lender_discovery_cta_clicked")}>{t("pub.lenders.cta_primary")} <ArrowRight /></Link></Button><Button asChild size="lg" variant="outline" className="min-h-12 border-primary-foreground/25 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"><Link to="/lenders/pricing" onClick={() => track("lender_pricing_clicked")}>{t("pub.lenders.final_plans")}</Link></Button></div></div></section>
  </main><SiteFooter professionalExtra={<PilotRequestDialog onOpen={() => track("lender_pilot_clicked")}><Button variant="link" className="h-auto justify-start p-0 text-sm font-normal text-muted-foreground hover:text-foreground">{t("pub.lenders.pilot_inquiry")}</Button></PilotRequestDialog>} /></div>;
}
