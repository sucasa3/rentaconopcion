import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ChartNoAxesCombined,
  CircleDollarSign,
  Eye,
  House,
  Lightbulb,
  Users,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import {
  ConnectedProductHero,
  ConnectedServicesVisual,
  ProductProofVisual,
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
        <AudienceValue />
        <HowItWorks />
        <ProductProof />
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
      <div className="mx-auto max-w-7xl px-5 pb-16 pt-14 sm:pb-20 sm:pt-20">
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

function AudienceValue() {
  const { t } = useLanguage();
  const items = [
    [House, t("pub.home.value.homeowner_title"), t("pub.home.value.homeowner")],
    [Users, t("pub.home.value.agent_title"), t("pub.home.value.agent")],
    [CircleDollarSign, t("pub.home.value.lender_title"), t("pub.home.value.lender")],
  ] as const;
  return (
    <Section title={t("pub.home.value.title")}>
      <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
        {items.map(([Icon, title, body]) => (
          <article key={title} className="bg-card p-6 sm:p-8">
            <Icon className="h-5 w-5 text-sucasa-orange" />
            <h3 className="mt-7 text-lg font-semibold text-sucasa-navy">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

function HowItWorks() {
  const { t } = useLanguage();
  const items = [
    [Eye, t("pub.home.how.s1_title"), t("pub.home.how.s1_desc")],
    [Lightbulb, t("pub.home.how.s2_title"), t("pub.home.how.s2_desc")],
    [ArrowRight, t("pub.home.how.s3_title"), t("pub.home.how.s3_desc")],
  ] as const;
  return (
    <section id="how-it-works" className="border-y border-border bg-surface-warm px-5 py-16 scroll-mt-20 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-2xl text-4xl font-semibold leading-tight text-sucasa-navy sm:text-5xl">
          {t("pub.home.how.title_a")} <span className="text-muted-foreground">{t("pub.home.how.title_b")}</span>
        </h2>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {items.map(([Icon, title, body], index) => (
            <article key={title} className="border-t border-border pt-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-status-opportunity">0{index + 1}</span>
                <Icon className="h-5 w-5 text-sucasa-navy" />
              </div>
              <h3 className="mt-8 text-lg font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductProof() {
  const { t } = useLanguage();
  const items = [
    ["home", t("pub.home.proof.home_title"), t("pub.home.proof.home")],
    ["agent", t("pub.home.proof.agent_title"), t("pub.home.proof.agent")],
    ["lender", t("pub.home.proof.lender_title"), t("pub.home.proof.lender")],
  ] as const;
  return (
    <Section title={t("pub.home.proof.title")}>
      <div className="mt-12 grid items-start gap-10 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
        {items.map(([kind, title, body]) => (
          <article key={kind} className="min-w-0">
            <div className={kind === "home" ? "" : "lg:pt-14"}><ProductProofVisual kind={kind} /></div>
            <h3 className="mt-6 text-lg font-semibold text-sucasa-navy">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

function ConnectedServices() {
  const { t } = useLanguage();
  return (
    <section className="border-y border-border bg-surface-warm px-5 py-16 sm:py-24">
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
    [t("pub.home.paths.home_title"), t("pub.home.paths.home_body"), t("pub.home.paths.home_cta"), "/onboarding"],
    [t("pub.home.paths.agent_title"), t("pub.home.paths.agent_body"), t("pub.home.paths.agent_cta"), "/agents"],
    [t("pub.home.paths.lender_title"), t("pub.home.paths.lender_body"), t("pub.home.paths.lender_cta"), "/lenders"],
  ] as const;
  return (
    <Section title={t("pub.home.paths.title")}>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {items.map(([title, body, cta, to]) => (
          <article key={title} className="flex min-h-56 flex-col rounded-lg border border-border bg-card p-6 shadow-soft">
            <h3 className="text-xl font-semibold text-sucasa-navy">{title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
            <Button asChild variant="outline" className="mt-auto w-full justify-between rounded-full">
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
    <section className="px-5 pb-20 pt-6 sm:pb-24">
      <div className="mx-auto max-w-6xl rounded-2xl bg-sucasa-navy px-6 py-14 text-center text-primary-foreground shadow-elevated sm:px-12 sm:py-20">
        <ChartNoAxesCombined className="mx-auto h-7 w-7 text-sucasa-orange" />
        <h2 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">{t("pub.home.final.title")}</h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-primary-foreground/75 sm:text-base">{t("pub.home.final.sub")}</p>
        <Button asChild size="lg" className="mt-8 h-12 rounded-full bg-sucasa-orange px-7 text-sucasa-orange-foreground hover:bg-sucasa-orange/90">
          <Link to="/onboarding">{t("pub.home.cta_primary")}<ArrowRight /></Link>
        </Button>
      </div>
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-5 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-3xl text-4xl font-semibold leading-tight text-sucasa-navy sm:text-5xl">{title}</h2>
        {children}
      </div>
    </section>
  );
}