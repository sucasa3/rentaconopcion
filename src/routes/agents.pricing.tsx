import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight } from "lucide-react";
import { PlanCard, ProfessionalPreview } from "@/components/professional-public";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getAgentAttribution } from "@/lib/agent-funnel";
import { recordPublicAgentEvent } from "@/lib/agent-funnel.functions";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { AGENT_PUBLIC_PLANS } from "@/lib/public-plans";

export const Route = createFileRoute("/agents/pricing")({
  head: () => ({ meta: [
    { title: "Agent Pricing — SuCasa" }, { name: "description", content: "Start with 100 Home Profiles free, or choose more capacity for your real-estate client book." },
    { property: "og:title", content: "SuCasa Pricing for Agents" }, { property: "og:description", content: "100 Home Profiles free, with paid capacity for larger client books." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ], links: [{ rel: "canonical", href: "https://sucasa.com/agents/pricing" }] }), component: AgentPricing,
});

function AgentPricing() {
  const { t } = useLanguage();
  const record = useServerFn(recordPublicAgentEvent);
  const track = (action: "agent_pricing_viewed" | "agent_pricing_start_clicked" | "agent_pricing_upgrade_clicked") => void record({ data: { action, ...getAgentAttribution() } });
  useEffect(() => { track("agent_pricing_viewed"); }, []);
  return <div className="min-h-screen bg-background"><SiteHeader /><main>
    <header className="border-b border-border bg-surface-warm"><div className="mx-auto max-w-4xl px-5 py-12 text-center sm:py-16"><p className="text-sm font-semibold text-status-opportunity">{t("pub.apricing.eyebrow")}</p><h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">{t("pub.apricing.h1")}</h1><p className="mx-auto mt-4 max-w-2xl text-muted-foreground">{t("pub.apricing.sub")}</p></div></header>
    <section className="mx-auto max-w-6xl px-5 py-12 sm:py-16"><div className="grid gap-5 lg:grid-cols-3">{AGENT_PUBLIC_PLANS.map((plan, index) => { const tk = plan.key === "agent_growth" ? "growth" : plan.key; return <PlanCard key={plan.key} name={plan.name} price={plan.price} description={t(`pub.aplans.${tk}.desc` as TranslationKey)} features={plan.features.map((_, i) => t(`pub.aplans.${tk}.f${i + 1}` as TranslationKey))} featured={index === 0} footer={<div><Button asChild className="min-h-11 w-full" variant={index === 0 ? "default" : "outline"}><Link to="/agent-start" search={{ source: index === 0 ? "agent_pricing_free" : `agent_pricing_${plan.key}` }} onClick={() => track(index === 0 ? "agent_pricing_start_clicked" : "agent_pricing_upgrade_clicked")}>{index === 0 ? t("pub.apricing.start_free") : index === 1 ? t("pub.apricing.choose250") : t("pub.apricing.choose1000")} <ArrowRight /></Link></Button>{index === 0 && <p className="mt-2 text-center text-xs text-muted-foreground">{t("pub.apricing.no_card")}</p>}</div>} />; })}</div><div className="mx-auto mt-7 max-w-2xl text-center"><p className="font-semibold">{t("pub.apricing.more_title")}</p><p className="mt-1 text-sm text-muted-foreground">{t("pub.apricing.more_body")}</p></div></section>
    <section className="border-y border-border bg-surface-warm py-12"><div className="mx-auto grid max-w-5xl gap-8 px-5 md:grid-cols-[0.7fr_1fr] md:items-center"><ProfessionalPreview kind="agent" /><div><p className="text-sm font-semibold text-status-opportunity">{t("pub.apricing.proof_eyebrow")}</p><h2 className="mt-2 text-3xl font-semibold">{t("pub.apricing.proof_title")}</h2><p className="mt-4 leading-relaxed text-muted-foreground">{t("pub.apricing.proof_body")}</p></div></div></section>
    <section className="bg-sucasa-navy py-12 text-center text-primary-foreground"><div className="mx-auto max-w-2xl px-5"><h2 className="text-3xl font-semibold">{t("pub.apricing.final_title")}</h2><p className="mt-3 text-primary-foreground/70">{t("pub.apricing.final_sub")}</p><Button asChild size="lg" className="mt-6 min-h-12 bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90"><Link to="/agent-start" search={{ source: "agent_pricing_final" }} onClick={() => track("agent_pricing_start_clicked")}>{t("pub.apricing.final_cta")} <ArrowRight /></Link></Button></div></section>
  </main><SiteFooter /></div>;
}
