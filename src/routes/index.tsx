import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ChartNoAxesCombined } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import {
  AgentBenefitVisual,
  HomeownerShowcase,
  LenderBenefitVisual,
  ProviderHelpVisual,
} from "@/components/homepage-product";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SuCasa — Know What Matters Around Your Home" },
      {
        name: "description",
        content: "SuCasa turns changes around the home into clear, useful next steps for homeowners and the professionals they trust.",
      },
      { property: "og:title", content: "SuCasa — Know What Matters Around Your Home" },
      {
        property: "og:description",
        content: "Your home is always changing. SuCasa tells you what matters — and what to do next.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-1 overflow-hidden">
        <Hero />
        <HomeownerProduct />
        <ProviderHelp />
        <ProfessionalBenefits />
        <FinalAction />
      </main>
      <SiteFooter />
    </div>
  );
}

function Hero() {
  const { t } = useLanguage();
  return (
    <section className="relative bg-surface-warm">
      <div className="mx-auto max-w-7xl px-5 pb-10 pt-12 sm:pb-14 sm:pt-20">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-semibold uppercase text-status-opportunity">{t("pub.home.badge")}</p>
          <h1 className="mt-5 text-5xl font-semibold leading-[1.02] text-sucasa-navy sm:text-7xl">
            {t("pub.home.h1_a")} <span className="text-sucasa-orange">{t("pub.home.h1_b")}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-xl font-medium leading-snug text-foreground sm:text-3xl">
            {t("pub.home.hero_sub")}
          </p>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {t("pub.home.sub")}
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 w-full rounded-full px-7 shadow-elevated sm:w-auto">
              <Link to="/onboarding">{t("pub.home.cta_primary")} <ArrowRight /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 w-full rounded-full px-7 sm:w-auto">
              <a href="#my-home-showcase">{t("pub.home.cta_secondary")}</a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeownerProduct() {
  const { t } = useLanguage();
  return (
    <section id="my-home-showcase" className="scroll-mt-20 border-b border-border bg-surface-warm px-5 pb-14 sm:pb-20">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-7 max-w-2xl text-center sm:mb-10">
          <p className="text-xs font-semibold uppercase text-status-opportunity">{t("pub.home.showcase.eyebrow")}</p>
          <h2 className="mt-3 text-4xl font-semibold leading-tight text-sucasa-navy sm:text-5xl">{t("pub.home.showcase.title")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">{t("pub.home.showcase.body")}</p>
        </div>
        <HomeownerShowcase />
      </div>
    </section>
  );
}

function ProviderHelp() {
  const { t } = useLanguage();
  return (
    <section className="border-b border-border bg-background px-5 py-14 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase text-status-opportunity">{t("pub.home.help.eyebrow")}</p>
          <h2 className="mt-3 text-4xl font-semibold leading-tight text-sucasa-navy sm:text-5xl">{t("pub.home.help.title")}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{t("pub.home.help.body")}</p>
        </div>
        <ProviderHelpVisual />
      </div>
    </section>
  );
}

function ProfessionalBenefits() {
  const { t } = useLanguage();
  return (
    <section className="bg-surface-warm px-5 py-14 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase text-status-opportunity">{t("pub.home.pros.eyebrow_new")}</p>
          <h2 className="mt-3 text-4xl font-semibold leading-tight text-sucasa-navy sm:text-5xl">{t("pub.home.pros.title_new")}</h2>
        </div>
        <div className="mt-8 grid gap-5 lg:mt-10 lg:grid-cols-2">
          <article className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-7">
            <p className="text-xs font-semibold uppercase text-status-opportunity">{t("pub.home.paths.agent_title")}</p>
            <h3 className="mt-3 text-2xl font-semibold leading-snug text-sucasa-navy">{t("pub.home.paths.agent_body")}</h3>
            <div className="mt-6"><AgentBenefitVisual /></div>
            <Button asChild className="mt-6 w-full justify-between rounded-full sm:w-auto">
              <Link to="/agents">{t("pub.home.pros.agent_cta")}<ArrowRight /></Link>
            </Button>
          </article>
          <article className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-7">
            <p className="text-xs font-semibold uppercase text-muted-foreground">{t("pub.home.paths.lender_title")}</p>
            <h3 className="mt-3 text-2xl font-semibold leading-snug text-sucasa-navy">{t("pub.home.paths.lender_body")}</h3>
            <div className="mt-6"><LenderBenefitVisual /></div>
            <Button asChild variant="outline" className="mt-6 w-full justify-between rounded-full sm:w-auto">
              <Link to="/lenders">{t("pub.home.pros.lender_cta")}<ArrowRight /></Link>
            </Button>
          </article>
        </div>
        <p className="mt-5 text-center text-[11px] text-muted-foreground">{t("pub.home.demo_all")}</p>
      </div>
    </section>
  );
}

function FinalAction() {
  const { t } = useLanguage();
  return (
    <section className="bg-surface-warm px-5 pb-16 sm:pb-20">
      <div className="mx-auto max-w-6xl rounded-2xl bg-sucasa-navy px-6 py-12 text-center text-primary-foreground shadow-elevated sm:px-12 sm:py-16">
        <ChartNoAxesCombined className="mx-auto h-7 w-7 text-sucasa-orange" />
        <h2 className="mx-auto mt-5 max-w-3xl whitespace-pre-line text-4xl font-semibold leading-tight sm:text-5xl">{t("pub.home.final.title")}</h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-primary-foreground/75 sm:text-base">{t("pub.home.final.sub")}</p>
        <Button asChild size="lg" className="mt-8 h-12 rounded-full bg-sucasa-orange px-7 text-sucasa-orange-foreground hover:bg-sucasa-orange/90">
          <Link to="/onboarding">{t("pub.home.cta_primary")}<ArrowRight /></Link>
        </Button>
      </div>
    </section>
  );
}