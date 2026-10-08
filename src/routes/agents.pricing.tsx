import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check } from "lucide-react";
import { AgentMoveUpPreview, HouseIcon } from "@/components/professional-public";
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

const CAPACITY: Record<string, number> = { free: 100, agent: 250, agent_growth: 1000 };

function houses(total: number) {
  const full = Math.floor(total / 100);
  const part = (total % 100) / 100;
  return [...Array(full).fill(1), ...(part ? [part] : [])] as number[];
}

function AgentPricing() {
  const { t } = useLanguage();
  const record = useServerFn(recordPublicAgentEvent);
  const track = (action: "agent_pricing_viewed" | "agent_pricing_start_clicked" | "agent_pricing_upgrade_clicked") => void record({ data: { action, ...getAgentAttribution() } });
  useEffect(() => { track("agent_pricing_viewed"); }, []);
  return <div className="min-h-screen bg-background"><SiteHeader /><main>
    <header className="border-b border-border bg-surface-warm"><div className="mx-auto max-w-3xl px-5 py-10 text-center sm:py-12"><p className="text-sm font-semibold text-status-opportunity">{t("pub.apricing.eyebrow")}</p><h1 className="mt-3 text-3xl font-semibold leading-tight text-sucasa-navy sm:text-4xl">{t("pub.apricing.h1")}</h1><p className="mx-auto mt-3 max-w-2xl text-muted-foreground">{t("pub.apricing.sub")}</p></div></header>

    <section className="mx-auto max-w-3xl px-5 py-10 sm:py-12">
      <div className="space-y-4">{AGENT_PUBLIC_PLANS.map((plan, index) => {
        const growth = plan.key === "agent_growth";
        const cap = CAPACITY[plan.key];
        const price = plan.price.replace("/month", "");
        return <article key={plan.key} className={`rounded-lg bg-card p-5 shadow-soft ${growth ? "border-2 border-sucasa-navy" : "border border-border"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><h2 className="text-xl font-semibold text-sucasa-navy">{plan.name}</h2>{growth && <p className="text-sm text-muted-foreground">{t("pub.apricing.growth_label")}</p>}</div>
            <p className="whitespace-nowrap text-2xl font-semibold">{price}{index > 0 && <span className="text-sm font-normal text-muted-foreground">{t("pub.apricing.month")}</span>}</p>
          </div>
          <p className="mt-2 text-lg font-semibold tabular-nums">{t("pub.apricing.active", { count: cap.toLocaleString("en-US") })}</p>
          <div aria-hidden="true" className="mt-3 flex flex-wrap gap-2">{houses(cap).map((f, i) => <HouseIcon key={i} fill={f} />)}</div>
          {index === 0 && <p className="mt-3 text-sm text-muted-foreground">{t("pub.apricing.phone_verify")}</p>}
          <Button asChild className="mt-4 min-h-11 w-full sm:w-auto" variant={index === 0 ? "default" : "outline"}><Link to="/agent-start" search={{ source: index === 0 ? "agent_pricing_free" : `agent_pricing_${plan.key}` }} onClick={() => track(index === 0 ? "agent_pricing_start_clicked" : "agent_pricing_upgrade_clicked")}>{index === 0 ? t("pub.apricing.start_free") : index === 1 ? t("pub.apricing.choose250") : t("pub.apricing.choose1000")} <ArrowRight /></Link></Button>
          {index === 0 && <p className="mt-2 text-xs text-muted-foreground">{t("pub.apricing.no_card")}</p>}
        </article>;
      })}</div>
      <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><HouseIcon className="h-5 w-5" />{t("pub.apricing.legend")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t("pub.apricing.includes_free")}</p>

      <div className="mt-8 rounded-lg border border-border bg-card p-5">
        <p className="font-semibold text-sucasa-navy">{t("pub.apricing.every_plan")}</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">{[1, 2, 3, 4, 5].map((i) => <li key={i} className="flex gap-2 text-sm text-muted-foreground"><Check className="mt-0.5 h-4 w-4 shrink-0 text-status-positive" />{t(`pub.aplans.free.f${i}` as TranslationKey)}</li>)}</ul>
        <p className="mt-4 text-xs text-muted-foreground">{t("pub.apricing.more_body")}</p>
      </div>
    </section>

    <section className="border-y border-border bg-surface-warm py-12"><div className="mx-auto grid max-w-5xl gap-8 px-5 md:grid-cols-[1fr_0.9fr] md:items-center"><div><p className="text-sm font-semibold text-status-opportunity">{t("pub.apricing.proof_eyebrow")}</p><h2 className="mt-2 text-3xl font-semibold">{t("pub.apricing.proof_title")}</h2><p className="mt-4 leading-relaxed text-muted-foreground">{t("pub.apricing.proof_body")}</p></div><AgentMoveUpPreview /></div></section>
  </main><SiteFooter /></div>;
}
