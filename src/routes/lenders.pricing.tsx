import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowRight } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getAgentAttribution } from "@/lib/agent-funnel";
import { recordPublicAgentEvent } from "@/lib/agent-funnel.functions";
import { useLanguage } from "@/lib/i18n";
import { LENDER_PUBLIC_PLANS } from "@/lib/public-plans";
import { ProfessionalPreview } from "@/components/professional-public";

export const Route = createFileRoute("/lenders/pricing")({
  head: () => ({ meta: [
    { title: "Lender Pricing — SuCasa Discovery and Plans" }, { name: "description", content: "Start with a free 100-client Discovery, continue with a 90-day SuCasa Pilot, or review lender capacity plans." },
    { property: "og:title", content: "SuCasa Pricing for Lenders" }, { property: "og:description", content: "Free Discovery, a clear 90-day pilot, and capacity plans for lending teams." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ], links: [{ rel: "canonical", href: "https://sucasa.com/lenders/pricing" }] }), component: LenderPricing,
});

type TrackAction = "lender_pricing_viewed" | "lender_pricing_discovery_clicked" | "lender_pricing_subscribe_clicked";

function LenderPricing() {
  const { t } = useLanguage();
  const record = useServerFn(recordPublicAgentEvent);
  const track = (action: TrackAction) => void record({ data: { action, ...getAgentAttribution() } });
  useEffect(() => { track("lender_pricing_viewed"); }, []);
  return <div className="min-h-screen bg-background"><SiteHeader /><main>
    <header className="border-b border-border bg-surface-warm"><div className="mx-auto max-w-4xl px-5 py-12 text-center sm:py-16"><p className="text-sm font-semibold text-status-opportunity">{t("pub.lpricing.eyebrow")}</p><h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">{t("pub.lpricing.h1")}</h1><p className="mx-auto mt-4 max-w-2xl text-muted-foreground">{t("pub.lpricing.sub")}</p><Button asChild size="lg" className="mt-7 min-h-12 bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90"><Link to="/lender-start" search={{ source: "lender_pricing_hero" }} onClick={() => track("lender_pricing_discovery_clicked")}>{t("pub.lpricing.cta_discovery")} <ArrowRight /></Link></Button><p className="mt-3 text-sm text-muted-foreground">{t("pub.lpricing.microcopy")}</p><p className="mt-6 text-sm font-semibold">{t("pub.lpricing.flow")}</p></div></header>
    <section className="mx-auto max-w-5xl px-5 py-12 sm:py-16"><div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
      <Step eyebrow={t("pub.lpricing.step1_eyebrow")} title={t("pub.lpricing.step1_title")} price="$0" copy={t("pub.lpricing.step1_copy")} cta={<Button asChild className="w-full bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90"><Link to="/lender-start" search={{ source: "lender_pricing_discovery" }} onClick={() => track("lender_pricing_discovery_clicked")}>{t("pub.lpricing.step1_cta")} <ArrowRight /></Link></Button>} />
      <ArrowDown className="mx-auto h-5 w-5 self-center text-muted-foreground md:-rotate-90" />
      <Step eyebrow={t("pub.lpricing.step2_eyebrow")} title={t("pub.lpricing.step2_title")} price="$447" copy={t("pub.lpricing.step2_copy")} featured />
      <ArrowDown className="mx-auto h-5 w-5 self-center text-muted-foreground md:-rotate-90" />
      <Step eyebrow={t("pub.lpricing.step3_eyebrow")} title={t("pub.lpricing.step3_title")} price="$149/month" copy={t("pub.lpricing.step3_copy")} />
    </div><p className="mt-5 text-center text-xs text-muted-foreground">{t("pub.lpricing.pilot_note")}</p></section>
    <section className="border-y border-border bg-surface py-12"><div className="mx-auto max-w-6xl px-5"><div className="max-w-2xl"><p className="text-sm font-semibold text-status-opportunity">{t("pub.lpricing.other_eyebrow")}</p><h2 className="mt-2 text-3xl font-semibold">{t("pub.lpricing.other_title")}</h2></div><div className="mt-7 grid gap-4 md:grid-cols-2">{LENDER_PUBLIC_PLANS.slice(0, 2).map((plan, index) => <LenderPlan key={plan.key} plan={plan} emphasized={index === 1} track={track} />)}</div><div className="mt-10 rounded-lg border border-border bg-card p-5 sm:p-7"><h3 className="text-xl font-semibold">{t("pub.lpricing.team_title")}</h3><div className="mt-5 grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">{LENDER_PUBLIC_PLANS.slice(2).map((plan) => <div key={plan.key} className="bg-card p-4"><p className="font-semibold">{plan.name}</p><p className="mt-1 text-xl font-semibold">{plan.price}</p><p className="mt-3 text-sm text-muted-foreground">{t("pub.lpricing.profiles", { count: plan.profiles })} · {t("pub.lpricing.collabs", { count: plan.agents })}</p></div>)}</div><Button asChild variant="outline" className="mt-5"><Link to="/lender-start" search={{ source: "lender_pricing_team" }} onClick={() => track("lender_pricing_subscribe_clicked")}>{t("pub.lpricing.team_cta")} <ArrowRight /></Link></Button></div><p className="mt-6 text-sm text-muted-foreground">{t("pub.lpricing.team_note")}</p></div></section>
    <section className="py-12"><div className="mx-auto grid max-w-5xl gap-8 px-5 md:grid-cols-[0.7fr_1fr] md:items-center"><ProfessionalPreview kind="lender" /><div><p className="text-sm font-semibold text-status-opportunity">{t("pub.lpricing.gets_eyebrow")}</p><h2 className="mt-2 text-3xl font-semibold">{t("pub.lpricing.gets_title")}</h2><p className="mt-4 leading-relaxed text-muted-foreground">{t("pub.lpricing.gets_body")}</p></div></div></section>
    <section className="bg-sucasa-navy py-12 text-center text-primary-foreground"><div className="mx-auto max-w-2xl px-5"><h2 className="text-3xl font-semibold">{t("pub.lpricing.final_title")}</h2><Button asChild size="lg" className="mt-6 min-h-12 bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90"><Link to="/lender-start" search={{ source: "lender_pricing_final" }} onClick={() => track("lender_pricing_discovery_clicked")}>{t("pub.lpricing.final_cta")} <ArrowRight /></Link></Button></div></section>
  </main><SiteFooter /></div>;
}
function Step({ eyebrow, title, price, copy, cta, featured }: { eyebrow: string; title: string; price: string; copy: string; cta?: React.ReactNode; featured?: boolean }) { return <article className={`flex flex-col rounded-lg border bg-card p-5 shadow-soft ${featured ? "border-sucasa-orange" : "border-border"}`}><p className="text-xs font-semibold text-status-opportunity">{eyebrow}</p><h2 className="mt-3 text-lg font-semibold">{title}</h2><p className="mt-2 text-3xl font-semibold">{price}</p><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{copy}</p>{cta && <div className="mt-auto pt-6">{cta}</div>}</article>; }
function LenderPlan({ plan, emphasized, track }: { plan: (typeof LENDER_PUBLIC_PLANS)[number]; emphasized: boolean; track: (action: TrackAction) => void }) { const { t } = useLanguage(); return <article className={`rounded-lg border bg-card p-6 shadow-soft ${emphasized ? "border-sucasa-orange" : "border-border"}`}><p className="text-sm font-semibold">{plan.name}</p>{emphasized && <p className="mt-2 text-xs font-semibold text-status-opportunity">{t("pub.lpricing.emphasis")}</p>}<p className="mt-3 text-3xl font-semibold">{plan.price}</p><p className="mt-2 text-sm text-muted-foreground">{t("pub.lpricing.profiles", { count: plan.profiles })}</p><p className="mt-1 text-sm text-muted-foreground">{t("pub.lpricing.collabs", { count: plan.agents })}</p><Button asChild variant={emphasized ? "default" : "outline"} className="mt-6 w-full"><Link to="/lender-start" search={{ source: `lender_pricing_${plan.key}` }} onClick={() => track("lender_pricing_subscribe_clicked")}>{t("pub.lpricing.choose", { name: plan.name })} <ArrowRight /></Link></Button></article>; }
