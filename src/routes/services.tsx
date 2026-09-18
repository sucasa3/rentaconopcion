import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { SERVICE_CATEGORIES } from "@/lib/mock-data";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "Home Services — SuCasa" },
      { name: "description", content: "Browse trusted home service categories: HVAC, plumbing, roofing, electrical, painting, landscaping, restoration, and handyman." },
      { property: "og:title", content: "Home Services — SuCasa" },
      { property: "og:description", content: "Request a trusted pro in seconds." },
    ],
  }),
  component: Services,
});

function svcKey(slug: string, field: "name" | "desc"): TranslationKey {
  return `pub.svc.${slug.replace(/-/g, "_")}.${field}` as TranslationKey;
}

function Services() {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 px-5 py-12 md:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("pub.services.eyebrow")}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">{t("pub.services.title")}</h1>
            <p className="mt-3 text-muted-foreground">{t("pub.services.sub")}</p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICE_CATEGORIES.map(c => (
              <div key={c.slug} className="group rounded-3xl border border-border bg-card p-6 shadow-soft transition hover:shadow-elevated">
                <div className="flex items-center justify-between">
                  <span className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${c.color} text-white`}>
                    <c.icon className="h-5 w-5" />
                  </span>
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-secondary-foreground">
                    {t("pub.svc.avg_response", { time: c.avgResponse.replace(/\s*avg response\s*$/i, "") })}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{t(svcKey(c.slug, "name"))}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t(svcKey(c.slug, "desc"))}</p>
                <Link to="/request" search={{ category: c.slug }} className="mt-5 inline-flex items-center justify-center gap-2 rounded-full gradient-brand px-5 py-2.5 text-sm font-semibold text-white shadow-soft">
                  {t("pub.services.request")} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
