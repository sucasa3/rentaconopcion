import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { useLanguage } from "@/lib/i18n";
import { ArrowRight, Bell, Zap, Star, BarChart3, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/partner")({
  head: () => ({
    meta: [
      { title: "For Professionals — Grow with SuCasa" },
      { name: "description", content: "Grow your business with qualified homeowners. Monthly membership, opportunity notifications, fast claim system, and a performance dashboard." },
      { property: "og:title", content: "Grow Your Business with Qualified Homeowners" },
      { property: "og:description", content: "Join SuCasa as a Founding Partner." },
    ],
  }),
  component: Partner,
});

function Partner() {
  const { t } = useLanguage();
  const features = [
    { icon: Bell, title: t("pub.partner.f1_title"), desc: t("pub.partner.f1_desc") },
    { icon: Zap, title: t("pub.partner.f2_title"), desc: t("pub.partner.f2_desc") },
    { icon: Star, title: t("pub.partner.f3_title"), desc: t("pub.partner.f3_desc") },
    { icon: BarChart3, title: t("pub.partner.f4_title"), desc: t("pub.partner.f4_desc") },
  ];
  const bullets = [t("pub.partner.b1"), t("pub.partner.b2"), t("pub.partner.b3"), t("pub.partner.b4"), t("pub.partner.b5")];
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="gradient-hero">
          <div className="mx-auto max-w-6xl px-5 pb-16 pt-16 md:pb-24 md:pt-24">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("pub.partner.eyebrow")}</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-6xl">
                {t("pub.partner.h1_a")} <span className="bg-gradient-to-r from-primary to-growth bg-clip-text text-transparent">{t("pub.partner.h1_b")}</span>
              </h1>
              <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
                {t("pub.partner.sub")}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link to="/pro" className="inline-flex items-center justify-center gap-2 rounded-full gradient-brand px-6 py-3.5 text-sm font-semibold text-white shadow-elevated">
                  {t("pub.partner.cta_join")} <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/pro" className="inline-flex items-center justify-center rounded-full border border-border bg-background/80 px-6 py-3.5 text-sm font-semibold text-foreground backdrop-blur">
                  {t("pub.partner.cta_dashboard")}
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-16">
          <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2 lg:grid-cols-4">
            {features.map(f => (
              <div key={f.title} className="rounded-3xl border border-border bg-card p-6 shadow-soft">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-primary"><f.icon className="h-5 w-5" /></span>
                <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-5 pb-16">
          <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2">
            <div className="rounded-3xl border border-border bg-card p-8">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">{t("pub.partner.founding_badge")}</span>
                <span className="text-xs text-muted-foreground">{t("pub.partner.spots_left")}</span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold">{t("pub.partner.pricing_title")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{t("pub.partner.pricing_sub")}</p>
              <div className="mt-6 flex items-baseline gap-2">
                <span className="text-5xl font-semibold tracking-tight">$297</span>
                <span className="text-sm text-muted-foreground">{t("pub.partner.per_month")}</span>
                <span className="ml-2 text-xs text-muted-foreground line-through">$397</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t("pub.partner.standard_note")}</p>
              <ul className="mt-6 space-y-3 text-sm">
                {bullets.map(txt => (
                  <li key={txt} className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-growth" /><span>{txt}</span></li>
                ))}
              </ul>
              <Link to="/pro" className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full gradient-brand px-6 py-3.5 text-sm font-semibold text-white shadow-soft">
                {t("pub.partner.claim_cta")}
              </Link>
            </div>

            <div className="rounded-3xl gradient-brand p-8 text-white shadow-elevated">
              <p className="text-xs uppercase tracking-wider opacity-80">{t("pub.partner.preview_eyebrow")}</p>
              <h3 className="mt-2 text-2xl font-semibold">{t("pub.partner.preview_title")}</h3>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <StatCard label={t("pub.partner.stat_opportunities")} value="38" />
                <StatCard label={t("pub.partner.stat_claim_rate")} value="72%" />
                <StatCard label={t("pub.partner.stat_response")} value="14 min" />
                <StatCard label={t("pub.partner.stat_revenue")} value="$18.4k" />
              </div>
              <div className="mt-6 rounded-2xl bg-white/10 p-4 text-sm">
                <p className="opacity-90">{t("pub.partner.quote")}</p>
                <p className="mt-2 text-xs opacity-70">{t("pub.partner.quote_by")}</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
      <p className="text-xs opacity-80">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
