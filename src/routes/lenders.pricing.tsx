import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Home, User } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getAgentAttribution } from "@/lib/agent-funnel";
import { recordPublicAgentEvent } from "@/lib/agent-funnel.functions";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { LENDER_PUBLIC_PLANS } from "@/lib/public-plans";

export const Route = createFileRoute("/lenders/pricing")({
  head: () => ({ meta: [
    { title: "Lender Pricing — SuCasa Discovery and Plans" }, { name: "description", content: "Compare loan officer seats, agent collaborations and Home Profile capacity across SuCasa lender plans. Start with a free Discovery." },
    { property: "og:title", content: "SuCasa Pricing for Lenders" }, { property: "og:description", content: "Loan officer seats, agent collaborations and Home Profiles — one plan for your team." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ], links: [{ rel: "canonical", href: "https://sucasa.com/lenders/pricing" }] }), component: LenderPricing,
});

type TrackAction = "lender_pricing_viewed" | "lender_pricing_discovery_clicked" | "lender_pricing_subscribe_clicked";
type Plan = (typeof LENDER_PUBLIC_PLANS)[number];
type T = ReturnType<typeof useLanguage>["t"];

const VISUAL_KEYS = ["mlo_growth_v2", "branch", "branch_pro_v2"] as const;
const OTHER_KEYS = ["mlo", "network"] as const;
const byKey = (k: string) => LENDER_PUBLIC_PLANS.find((p) => p.key === k)!;
const num = (s: string) => Number(s.replace(/,/g, ""));
const priceNum = (p: Plan) => p.price.replace("/month", "");
const seatsLabel = (t: T, p: Plan) => (p.seats === 1 ? t("pub.lp2.seats_one") : t("pub.lp2.seats_team", { count: p.seats, others: p.seats - 1 }));

// Signed-in lender managers already have an organization: plan buttons take
// them to their existing Plan & Billing page instead of repeating Discovery.
function useIsLenderManager() {
  const [mgr, setMgr] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: rows } = await supabase.from("lender_members").select("role").eq("user_id", data.user.id);
      setMgr((rows ?? []).some((r: any) => ["owner", "admin", "manager"].includes(r.role)));
    });
  }, []);
  return mgr;
}

function PlanCta({ planKey, label, variant, className, size, track }: { planKey: string; label: string; variant: "default" | "outline"; className: string; size?: "sm"; track: (a: TrackAction) => void }) {
  const mgr = useIsLenderManager();
  return <Button asChild variant={variant} size={size} className={className}>{mgr
    ? <Link to="/lender/billing" search={{ checkout: undefined }} onClick={() => track("lender_pricing_subscribe_clicked")}>{label} <ArrowRight /></Link>
    : <Link to="/lender-start" search={{ source: `lender_pricing_${planKey}` }} onClick={() => track("lender_pricing_subscribe_clicked")}>{label} <ArrowRight /></Link>}</Button>;
}

function LenderPricing() {
  const { t } = useLanguage();
  const record = useServerFn(recordPublicAgentEvent);
  const track = (action: TrackAction) => void record({ data: { action, ...getAgentAttribution() } });
  useEffect(() => { track("lender_pricing_viewed"); }, []);
  return <div className="min-h-screen bg-background"><SiteHeader /><main>
    <header className="border-b border-border bg-surface-warm"><div className="mx-auto max-w-3xl px-5 py-10 text-center sm:py-12">
      <p className="text-sm font-semibold text-status-opportunity">{t("pub.lpricing.eyebrow")}</p>
      <h1 className="mt-3 text-3xl font-semibold leading-tight text-sucasa-navy sm:text-4xl">{t("pub.lp2.h1")}</h1>
      <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">{t("pub.lp2.sub")}</p>
      <Button asChild size="lg" className="mt-6 min-h-12 bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90"><Link to="/lender-start" search={{ source: "lender_pricing_hero" }} onClick={() => track("lender_pricing_discovery_clicked")}>{t("pub.lp2.cta")} <ArrowRight /></Link></Button>
      <p className="mt-3 text-sm text-muted-foreground">{t("pub.lp2.support")}</p>
    </div></header>

    <section className="mx-auto max-w-4xl px-5 py-10 sm:py-12">
      <div className="space-y-4">{VISUAL_KEYS.map((k) => <VisualPlan key={k} plan={byKey(k)} t={t} track={track} />)}</div>
      <p className="mt-4 text-xs text-muted-foreground">{t("pub.lp2.legend")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("pub.lp2.clarify")}</p>

      <h2 className="mt-10 text-lg font-semibold text-sucasa-navy">{t("pub.lp2.other")}</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">{OTHER_KEYS.map((k) => { const p = byKey(k); return <article key={k} className="flex flex-col rounded-lg border border-border bg-card p-5">
        <div className="flex items-baseline justify-between gap-3"><h3 className="font-semibold">{p.name}</h3><p className="font-semibold">{priceNum(p)}<span className="text-sm font-normal text-muted-foreground">{t("pub.lp2.month")}</span></p></div>
        <p className="mt-1 text-xs text-muted-foreground">{t(`pub.lp2.aud.${k}` as TranslationKey)}</p>
        <ul className="mt-3 space-y-1 text-sm text-muted-foreground"><li>{p.seats === 1 ? t("pub.lp2.seats_one") : t("pub.lp2.seats_short", { count: p.seats })}</li><li>{t("pub.lp2.agents", { count: p.agents })}</li><li>{t("pub.lp2.homes", { count: p.profiles })}</li></ul>
        <PlanCta planKey={k} label={t("pub.lp2.choose", { name: p.name })} variant="outline" size="sm" className="mt-4 w-full" track={track} />
      </article>; })}</div>

      <div className="mt-8 rounded-lg border border-surface-warm-border bg-surface-warm p-5">
        <p className="text-sm font-semibold text-sucasa-navy">{t("pub.lp2.pilot_title")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("pub.lp2.pilot")}</p>
      </div>
    </section>
  </main><SiteFooter /></div>;
}

function VisualPlan({ plan, t, track }: { plan: Plan; t: T; track: (a: TrackAction) => void }) {
  const pro = plan.key === "branch_pro_v2";
  const agents = num(plan.agents), homes = Math.round(num(plan.profiles) / 500);
  return <article className={`rounded-lg border bg-card p-5 shadow-soft ${pro ? "border-2 border-sucasa-navy" : "border-border"}`}>
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="text-xl font-semibold text-sucasa-navy">{plan.name}</h3><p className="text-sm text-muted-foreground">{t(`pub.lp2.aud.${plan.key}` as TranslationKey)}</p></div>
      <p className="whitespace-nowrap text-2xl font-semibold">{priceNum(plan)}<span className="text-sm font-normal text-muted-foreground">{t("pub.lp2.month")}</span></p>
    </div>
    <div className="mt-4 space-y-3">
      <Row label={seatsLabel(t, plan)} sr={t("pub.lp2.row.seats")}><Icons n={plan.seats} Icon={User} className="h-6 w-6 text-growth" /></Row>
      <Row label={t("pub.lp2.agents", { count: plan.agents })} sr={t("pub.lp2.row.agents")}><Icons n={agents} Icon={User} className="h-4 w-4 text-intelligence-accent" /></Row>
      <Row label={t("pub.lp2.homes", { count: plan.profiles })} sr={t("pub.lp2.row.homes")}><Icons n={homes} Icon={Home} className="h-4 w-4 text-sucasa-orange" /></Row>
    </div>
    <PlanCta planKey={plan.key} label={t("pub.lp2.choose", { name: plan.name })} variant={pro ? "default" : "outline"} className="mt-5 w-full sm:w-auto" track={track} />
  </article>;
}

function Row({ label, sr, children }: { label: string; sr: string; children: React.ReactNode }) {
  return <div><p className="text-sm font-medium"><span className="sr-only">{sr}: </span>{label}</p><div aria-hidden="true" className="mt-1 flex flex-wrap gap-1">{children}</div></div>;
}

function Icons({ n, Icon, className }: { n: number; Icon: typeof User; className: string }) {
  return <>{Array.from({ length: n }, (_, i) => <Icon key={i} className={`${className} fill-current`} strokeWidth={1.5} />)}</>;
}
