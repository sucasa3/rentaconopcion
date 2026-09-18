import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { SERVICE_CATEGORIES } from "@/lib/mock-data";
import { HomeHero } from "@/components/home-hero/HomeHero";
import { HOME_HERO } from "@/lib/home-hero-data";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { ArrowRight, ShieldCheck, TrendingUp, Sparkles, CheckCircle2, Star, FileText, Wallet, Bell } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SuCasa — Own Your Home With Confidence" },
      { name: "description", content: "Manage your home, track its value, stay organized, and connect with trusted professionals—all in one place." },
      { property: "og:title", content: "SuCasa — Own Your Home With Confidence" },
      { property: "og:description", content: "The trusted operating system for homeownership." },
    ],
  }),
  component: Home,
});

/** Maps a service-category slug to its translation-key prefix (dashes → underscores). */
function svcKey(slug: string, field: "name" | "desc"): TranslationKey {
  return `pub.svc.${slug.replace(/-/g, "_")}.${field}` as TranslationKey;
}

/** "2h avg response" → translated label keeping the time value. */
function responseLabel(t: (k: TranslationKey, v?: Record<string, string | number>) => string, raw: string) {
  const time = raw.replace(/\s*avg response\s*$/i, "");
  return t("pub.svc.avg_response", { time });
}

function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Benefits />
        <ServicesGrid />
        <ProNetwork />
        <IntelligencePreview />
        <Testimonials />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}

function Hero() {
  const { t } = useLanguage();
  return (
    <section className="gradient-hero relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-5 pb-20 pt-16 sm:pt-24 md:pb-28">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-growth" /> {t("pub.home.badge")}
          </span>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
            {t("pub.home.h1_a")} <span className="bg-gradient-to-r from-primary to-growth bg-clip-text text-transparent">{t("pub.home.h1_b")}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            {t("pub.home.sub")}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/onboarding" className="inline-flex w-full items-center justify-center gap-2 rounded-full gradient-brand px-6 py-3.5 text-sm font-semibold text-white shadow-elevated sm:w-auto">
              {t("pub.home.cta_primary")} <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/services" className="inline-flex w-full items-center justify-center rounded-full border border-border bg-background/80 px-6 py-3.5 text-sm font-semibold text-foreground backdrop-blur sm:w-auto">
              {t("pub.home.cta_secondary")}
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> {t("pub.home.trust_vetted")}</span>
            <span className="inline-flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-growth" /> {t("pub.home.trust_value")}</span>
            <span className="inline-flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-primary" /> {t("pub.home.trust_rating")}</span>
          </div>
        </div>

        <div className="mx-auto mt-14 max-w-5xl">
          <HomeHero data={HOME_HERO} />
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t } = useLanguage();
  const steps = [
    { n: "01", title: t("pub.home.how.s1_title"), desc: t("pub.home.how.s1_desc"), icon: FileText, tone: "growth" as const },
    { n: "02", title: t("pub.home.how.s2_title"), desc: t("pub.home.how.s2_desc"), icon: ShieldCheck, tone: "primary" as const },
    { n: "03", title: t("pub.home.how.s3_title"), desc: t("pub.home.how.s3_desc"), icon: TrendingUp, tone: "growth" as const },
  ];
  return (
    <section className="px-5 py-16 md:py-20">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-growth">{t("pub.home.how.eyebrow")}</p>
        <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("pub.home.how.title_a")} <span className="text-muted-foreground">{t("pub.home.how.title_b")}</span>
        </h2>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <div
              key={s.n}
              className="animate-fade-in relative"
              style={{ animationDelay: `${i * 90}ms`, animationFillMode: "backwards" }}
            >
              {i === 0 && (
                <div className="pointer-events-none absolute -inset-0.5 rounded-[1.85rem] gradient-growth opacity-25 blur-[2px]" aria-hidden />
              )}
              <div className="relative flex h-full items-start gap-4 rounded-3xl bg-primary p-5 shadow-elevated transition-transform duration-300 hover:-translate-y-1 sm:p-6">
                <div
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1 ${
                    s.tone === "growth"
                      ? "bg-growth/15 text-growth ring-growth/30"
                      : "bg-white/10 text-white ring-white/25"
                  }`}
                >
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-primary-foreground/50">{s.n}</p>
                  <h3 className="mt-1 text-base font-semibold text-primary-foreground sm:text-lg">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-primary-foreground/65">{s.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Benefits() {
  const { t } = useLanguage();
  const items = [
    { icon: Wallet, title: t("pub.home.benefits.b1_title"), desc: t("pub.home.benefits.b1_desc"), tone: "growth" as const },
    { icon: ShieldCheck, title: t("pub.home.benefits.b2_title"), desc: t("pub.home.benefits.b2_desc"), tone: "primary" as const },
    { icon: TrendingUp, title: t("pub.home.benefits.b3_title"), desc: t("pub.home.benefits.b3_desc"), tone: "growth" as const },
    { icon: Bell, title: t("pub.home.benefits.b4_title"), desc: t("pub.home.benefits.b4_desc"), tone: "primary" as const },
  ];
  return (
    <section className="px-5 py-16 md:py-20">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">{t("pub.home.benefits.eyebrow")}</p>
        <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("pub.home.benefits.title_a")} <span className="text-muted-foreground">{t("pub.home.benefits.title_b")}</span>
        </h2>

        <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {items.map((i, idx) => (
            <div
              key={i.title}
              className="animate-fade-in flex flex-col items-start rounded-3xl border border-border bg-card p-5 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated sm:p-6"
              style={{ animationDelay: `${idx * 80}ms`, animationFillMode: "backwards" }}
            >
              <span
                className={`grid h-11 w-11 place-items-center rounded-full ${
                  i.tone === "growth" ? "bg-accent text-growth" : "bg-secondary text-primary"
                }`}
              >
                <i.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold leading-snug">{i.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{i.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <Link
            to="/onboarding"
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-sm font-semibold text-primary-foreground shadow-elevated transition-transform duration-200 active:scale-[0.98] sm:w-auto sm:min-w-[280px]"
          >
            {t("pub.home.benefits.cta")} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}


function ServicesGrid() {
  const { t } = useLanguage();
  return (
    <Section eyebrow={t("pub.home.services.eyebrow")} title={t("pub.home.services.title")}>
      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {SERVICE_CATEGORIES.map(c => (
          <Link key={c.slug} to="/request" search={{ category: c.slug }} className="group rounded-2xl border border-border bg-card p-4 transition hover:shadow-elevated">
            <span className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${c.color} text-white`}>
              <c.icon className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold">{t(svcKey(c.slug, "name"))}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{responseLabel(t, c.avgResponse)}</p>
          </Link>
        ))}
      </div>
      <div className="mt-8 text-center">
        <Link to="/services" className="inline-flex items-center gap-1 text-sm font-medium text-primary">{t("pub.home.services.see_all")} <ArrowRight className="h-4 w-4" /></Link>
      </div>
    </Section>
  );
}

function ProNetwork() {
  const { t } = useLanguage();
  return (
    <Section eyebrow={t("pub.home.pros.eyebrow")} title={t("pub.home.pros.title")}>
      <div className="mt-10 grid gap-6 md:grid-cols-2 md:items-center">
        <div className="rounded-3xl border border-border bg-card p-6">
          <ul className="space-y-3 text-sm">
            {[t("pub.home.pros.b1"), t("pub.home.pros.b2"), t("pub.home.pros.b3"), t("pub.home.pros.b4")].map(txt => (
              <li key={txt} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-growth" />
                <span>{txt}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl gradient-growth p-8 text-white shadow-elevated">
          <p className="text-xs uppercase tracking-wider opacity-80">{t("pub.home.pros.card_eyebrow")}</p>
          <h3 className="mt-2 text-2xl font-semibold">{t("pub.home.pros.card_title")}</h3>
          <p className="mt-2 text-sm opacity-90">{t("pub.home.pros.card_sub")}</p>
          <Link to="/partner" className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-foreground">
            {t("pub.home.pros.card_cta")} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </Section>
  );
}

function IntelligencePreview() {
  const { t } = useLanguage();
  return (
    <Section eyebrow={t("pub.home.intel.eyebrow")} title={t("pub.home.intel.title")}>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl gradient-brand p-6 text-white shadow-elevated">
          <p className="text-xs opacity-80">{t("pub.home.intel.value")}</p>
          <p className="mt-1 text-3xl font-semibold">$482,300</p>
          <p className="mt-1 text-xs opacity-90">{t("pub.home.intel.value_sub")}</p>
        </div>
        <div className="rounded-3xl border border-border bg-card p-6">
          <p className="text-xs text-muted-foreground">{t("pub.home.intel.equity")}</p>
          <p className="mt-1 text-3xl font-semibold text-growth">$186,000</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("pub.home.intel.equity_sub")}</p>
        </div>
        <div className="rounded-3xl border border-border bg-card p-6">
          <p className="text-xs text-muted-foreground">{t("pub.home.intel.roi")}</p>
          <p className="mt-1 text-3xl font-semibold">$14.8k</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("pub.home.intel.roi_sub")}</p>
        </div>
      </div>
    </Section>
  );
}

function Testimonials() {
  const { t } = useLanguage();
  const items = [
    { name: "Sarah K.", quote: t("pub.home.stories.q1") },
    { name: "Marcus D.", quote: t("pub.home.stories.q2") },
    { name: "Elena R.", quote: t("pub.home.stories.q3") },
  ];
  return (
    <Section eyebrow={t("pub.home.stories.eyebrow")} title={t("pub.home.stories.title")}>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {items.map(story => (
          <div key={story.name} className="rounded-3xl border border-border bg-card p-6">
            <div className="flex gap-0.5 text-primary">
              {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="h-4 w-4 fill-current" />)}
            </div>
            <p className="mt-4 text-sm leading-relaxed">“{story.quote}”</p>
            <p className="mt-4 text-xs font-medium text-muted-foreground">— {story.name}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function FinalCta() {
  const { t } = useLanguage();
  return (
    <section className="px-5 pb-20">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[2rem] gradient-brand p-8 text-white shadow-elevated sm:p-12">
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h3 className="text-2xl font-semibold sm:text-3xl">{t("pub.home.final.title")}</h3>
            <p className="mt-2 max-w-xl text-sm opacity-90">{t("pub.home.final.sub")}</p>
          </div>
          <Link to="/onboarding" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-foreground">
            {t("pub.home.cta_primary")} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="px-5 py-16 md:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
        </div>
        {children}
      </div>
    </section>
  );
}
