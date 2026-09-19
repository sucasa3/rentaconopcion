import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ChartNoAxesCombined,
  Eye,
  Lightbulb,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import {
  ConnectedProductHero,
  ConnectedServicesVisual,
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
        <HowItWorks />
        <ConnectedServices />
        <AudiencePaths />
        <FinalAction />
      </main>
      <SiteFooter />
    </div>
  );
}

function Hero() {
  const { t } = useLanguage();
  return (
    <section className="relative border-b border-border bg-surface-warm">
      <div className="mx-auto max-w-7xl px-5 pb-12 pt-12 sm:pb-16 sm:pt-20">
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
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 w-full rounded-full px-7 shadow-elevated sm:w-auto">
              <Link to="/onboarding">{t("pub.home.cta_primary")} <ArrowRight /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 w-full rounded-full px-7 sm:w-auto">
              <a href="#how-it-works">{t("pub.home.cta_secondary")}</a>
            </Button>
          </div>
        </div>
        <ConnectedProductHero />
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t } = useLanguage();
  const items = [
    [Eye, t("pub.home.how.s1_label"), t("pub.home.how.s1_title"), t("pub.home.how.s1_desc")],
    [Lightbulb, t("pub.home.how.s2_label"), t("pub.home.how.s2_title"), t("pub.home.how.s2_desc")],
    [ArrowRight, t("pub.home.how.s3_label"), t("pub.home.how.s3_title"), t("pub.home.how.s3_desc")],
  ] as const;
  return (
    <section id="how-it-works" className="border-b border-border bg-background px-5 py-14 scroll-mt-20 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-2xl text-4xl font-semibold leading-tight text-sucasa-navy sm:text-5xl">{t("pub.home.how.title")}</h2>
        <div className="mt-8 grid gap-5 md:mt-10 md:grid-cols-3 md:gap-8">
          {items.map(([Icon, label, title, body], index) => (
            <article key={title} className="border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-status-opportunity">0{index + 1} — {label}</span>
                <Icon className="h-5 w-5 text-sucasa-navy" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-sucasa-navy">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ConnectedServices() {
  const { t } = useLanguage();
  return (
    <section className="border-b border-border bg-surface-warm px-5 py-14 sm:py-20">
      <div className="mx-auto max-w-5xl text-center">
        <h2 className="text-4xl font-semibold leading-tight text-sucasa-navy sm:text-5xl">{t("pub.home.connected.title")}</h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{t("pub.home.connected.body")}</p>
        <ConnectedServicesVisual />
      </div>
    </section>
  );
}

function AudiencePaths() {
  const { t } = useLanguage();
  const items = [
    [t("pub.home.paths.home_title"), t("pub.home.paths.home_body"), t("pub.home.paths.home_cta"), "/onboarding", true],
    [t("pub.home.paths.agent_title"), t("pub.home.paths.agent_body"), t("pub.home.paths.agent_cta"), "/agents", false],
    [t("pub.home.paths.lender_title"), t("pub.home.paths.lender_body"), t("pub.home.paths.lender_cta"), "/lenders", false],
  ] as const;
  return (
    <Section title={t("pub.home.paths.title")} subtitle={t("pub.home.paths.subtitle")}>
      <div className="mt-8 grid gap-4 md:mt-10 md:grid-cols-[1.12fr_0.94fr_0.94fr]">
        {items.map(([title, body, cta, to, primary]) => (
          <article key={title} className={`flex min-h-52 flex-col rounded-xl border bg-card p-6 shadow-soft ${primary ? "border-sucasa-orange md:-translate-y-2 md:shadow-elevated" : "border-border"}`}>
            <p className={`text-xs font-semibold uppercase ${primary ? "text-status-opportunity" : "text-muted-foreground"}`}>{title}</p>
            <h3 className="mt-5 text-xl font-semibold leading-snug text-sucasa-navy">{body}</h3>
            <Button asChild variant={primary ? "default" : "outline"} className="mt-auto w-full justify-between rounded-full">
              <Link to={to}>{cta}<ArrowRight /></Link>
            </Button>
          </article>
        ))}
      </div>
    </Section>
  );
}

function FinalAction() {
  const { t } = useLanguage();
  return (
    <section className="px-5 pb-16 pt-2 sm:pb-20 sm:pt-4">
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

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="px-5 py-14 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-3xl text-4xl font-semibold leading-tight text-sucasa-navy sm:text-5xl">{title}</h2>
        {subtitle && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}