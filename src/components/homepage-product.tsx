import {
  ArrowRight,
  ChartNoAxesCombined,
  FileText,
  House,
  MessageCircleQuestion,
  Snowflake,
  Wrench,
  Zap,
} from "lucide-react";
import heroPhoto from "@/assets/home-hero-photo.jpg.asset.json";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { SERVICE_CATEGORIES } from "@/lib/mock-data";
import { Link } from "@tanstack/react-router";

export function HomeownerShowcase() {
  const { t } = useLanguage();
  return (
    <div className="homeowner-premium home-ecosystem-home mx-auto max-w-4xl overflow-hidden rounded-2xl border border-border bg-background shadow-elevated">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-sucasa-navy">{t("pub.home.showcase.my_home")}</p>
          <p className="text-[10px] text-muted-foreground">{t("pub.home.demo_badge")}</p>
        </div>
        <span className="shrink-0 rounded-full bg-surface-intelligence px-2.5 py-1 text-[9px] font-semibold text-intelligence-accent">{t("pub.home.showcase.organized")}</span>
      </div>
      <HomeProfileMoment />
      <div className="grid gap-3 p-3 sm:grid-cols-[1.2fr_0.8fr] sm:p-5">
        <HomeHealthPreview />
        <HomeCarePreview />
      </div>
      <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-[1fr_1fr_1.35fr] sm:p-5">
        <QuietSummary icon={<FileText />} label={t("pub.home.showcase.documents")} value={t("pub.home.showcase.documents_value")} />
        <QuietSummary icon={<Wrench />} label={t("pub.home.showcase.history")} value={t("pub.home.showcase.history_value")} />
        <div className="grid min-h-20 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-sucasa-navy p-3 text-primary-foreground">
          <div className="min-w-0"><p className="text-sm font-semibold">{t("pub.home.showcase.ask")}</p><p className="mt-1 text-[10px] leading-snug text-primary-foreground/70">{t("pub.home.showcase.ask_body")}</p></div>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-intelligence-accent"><MessageCircleQuestion className="h-4 w-4" /></span>
        </div>
      </div>
      <p className="border-t border-border px-4 py-3 text-center text-[10px] text-muted-foreground">{t("pub.home.demo_all")}</p>
    </div>
  );
}

function HomeProfileMoment() {
  const { t } = useLanguage();
  return (
    <article className="relative overflow-hidden bg-card">
      <div className="relative h-[230px] overflow-hidden sm:h-[340px]">
        <img src={heroPhoto.url} alt={t("pub.home.demo_photo_alt")} className="absolute inset-0 h-full w-full object-cover" width={1920} height={1200} />
        <div className="home-photo-vignette absolute inset-0" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 p-5 pb-14 sm:p-7 sm:pb-16">
          <p className="text-[10px] font-semibold uppercase text-primary-foreground/75">{t("pub.home.demo.home_label")}</p>
          <p className="mt-1 text-2xl font-semibold text-primary-foreground sm:text-3xl">{t("pub.home.demo.address")}</p>
        </div>
      </div>
      <div className="relative -mt-10 mx-3 grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-hero-glass p-3 shadow-soft backdrop-blur-xl sm:mx-5 sm:p-4">
        <Metric label={t("pub.home.demo.value")} value="$482K" icon={<House />} />
        <Metric label={t("pub.home.demo.equity")} value="$186K" icon={<ChartNoAxesCombined />} />
        <Metric label={t("pub.home.demo.score")} value="82" score={82} />
      </div>
      <div className="flex items-center gap-3 px-5 py-4 sm:px-6">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-warm text-status-attention"><Wrench className="h-4 w-4" /></span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("pub.home.demo.care_label")}</p>
          <p className="truncate text-sm font-semibold">{t("pub.home.demo.care_value")}</p>
        </div>
        <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
      </div>
    </article>
  );
}

function HomeHealthPreview() {
  const { t } = useLanguage();
  const systems = [
    [Snowflake, t("pub.home.showcase.hvac"), t("pub.home.showcase.review_soon"), "text-status-attention", "border-status-attention/55 border-l-status-attention", "bg-status-attention"],
    [House, t("pub.home.showcase.roof"), t("pub.home.showcase.good"), "text-status-positive", "border-status-positive/55 border-l-status-positive", "bg-status-positive"],
    [Zap, t("pub.home.showcase.electrical"), t("pub.home.showcase.good"), "text-status-positive", "border-status-positive/55 border-l-status-positive", "bg-status-positive"],
  ] as const;
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between border-b border-border pb-2"><h3 className="font-bold text-sucasa-navy">{t("pub.home.showcase.health")}</h3><span className="text-xs font-bold text-status-positive">82</span></div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {systems.map(([Icon, label, status, tone, borderTone, dotTone]) => (
          <div key={label} className={`min-w-0 rounded-lg border border-l-2 bg-card p-2.5 shadow-soft ${borderTone}`}>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-intelligence-accent text-primary-foreground shadow-soft"><Icon className="h-4 w-4" /></span>
            <p className="mt-2 truncate text-[10px] font-semibold text-sucasa-navy">{label}</p>
            <p className={`mt-1 flex items-center gap-1 text-[9px] font-semibold ${tone}`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotTone}`} aria-hidden />{status}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HomeCarePreview() {
  const { t } = useLanguage();
  return (
    <section className="rounded-xl border border-t-2 border-border border-t-sucasa-orange bg-card p-4 shadow-soft">
      <p className="font-bold text-sucasa-navy">{t("pub.home.showcase.care")}</p>
      <div className="mt-3 flex items-start gap-3 rounded-lg border border-border bg-card p-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sucasa-orange text-sucasa-orange-foreground shadow-soft"><Wrench className="h-4 w-4" /></span><div className="min-w-0"><p className="text-xs font-semibold text-sucasa-navy">{t("pub.home.demo.care_value")}</p><p className="mt-1 text-[10px] leading-snug text-muted-foreground">{t("pub.home.showcase.care_context")}</p></div></div>
    </section>
  );
}

function QuietSummary({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex min-h-20 items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-soft"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-sucasa-orange shadow-soft [&_svg]:h-4 [&_svg]:w-4">{icon}</span><div className="min-w-0"><p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p><p className="mt-1 text-xs font-semibold text-sucasa-navy">{value}</p></div></div>;
}

function Metric({ label, value, icon, score }: { label: string; value: string; icon?: React.ReactNode; score?: number }) {
  const circumference = 2 * Math.PI * 18;
  return (
    <div className={`min-w-0 px-2 ${score != null ? "flex items-center justify-center gap-1.5 text-left sm:gap-2" : "text-center"}`}>
      {score != null ? (
        <span className="relative grid h-10 w-10 shrink-0 place-items-center sm:h-12 sm:w-12">
          <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="4" className="text-secondary" />
            <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - score / 100)} className="home-score-ring text-status-positive" />
          </svg>
          <span className="text-xs font-bold tabular-nums text-sucasa-navy sm:text-sm">{score}</span>
        </span>
      ) : (
        <span className="mx-auto hidden text-intelligence-accent sm:block [&_svg]:mx-auto [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      )}
      <div className="min-w-0">
        <p className={`${score != null ? "whitespace-normal leading-tight" : "mt-1 truncate"} text-[8px] font-bold uppercase text-intelligence-accent sm:text-[9px]`}>{label}</p>
        {score == null && <p className="mt-0.5 text-base font-bold tabular-nums text-sucasa-navy sm:text-xl">{value}</p>}
      </div>
    </div>
  );
}

export function ProviderHelpVisual() {
  const { t } = useLanguage();
  const categories = SERVICE_CATEGORIES.slice(0, 8);
  const serviceKey = (slug: string, field: "name" | "desc") =>
    `pub.svc.${slug.replace(/-/g, "_")}.${field}` as TranslationKey;
  return (
    <div>
      <div className="mx-auto max-w-3xl text-center">
        <div className="mx-auto flex w-fit max-w-full items-center gap-2 rounded-full border border-status-attention/30 bg-surface-warm px-3 py-2 text-xs font-semibold text-sucasa-navy">
          <Wrench className="h-3.5 w-3.5 shrink-0 text-status-attention" />
          <span className="truncate">{t("pub.home.demo.care_value")}</span>
        </div>
        <ArrowRight className="mx-auto my-3 h-4 w-4 rotate-90 text-sucasa-orange" aria-hidden />
        <p className="text-xs font-semibold uppercase text-status-opportunity">{t("pub.home.help.eyebrow")}</p>
        <h2 className="mt-2 whitespace-pre-line text-[26px] font-semibold leading-[1.15] text-sucasa-navy sm:text-4xl sm:leading-tight">{t("pub.home.help.services_title")}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{t("pub.home.help.services_body")}</p>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {categories.map((category) => {
          const Icon = category.icon;
          return (
            <article key={category.slug} className={`group flex min-w-0 flex-col rounded-xl border bg-card p-3.5 shadow-soft transition-shadow hover:shadow-elevated sm:p-4 ${category.slug === "hvac" ? "border-sucasa-orange" : "border-border"}`}>
              <div className="flex items-start justify-between gap-2">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${category.color} text-primary-foreground`}><Icon className="h-4 w-4" /></span>
                {category.slug === "hvac" && <span className="max-w-28 text-right text-[8px] font-semibold leading-tight text-status-opportunity sm:text-[9px]">{t("pub.home.help.next_step")}</span>}
              </div>
              <h3 className="mt-3 line-clamp-2 min-h-8 text-sm font-semibold leading-tight text-sucasa-navy">{t(serviceKey(category.slug, "name"))}</h3>
              <p className="mt-1 line-clamp-2 min-h-8 text-[10px] leading-relaxed text-muted-foreground">{t(serviceKey(category.slug, "desc"))}</p>
              <Link to="/request" search={{ category: category.slug }} className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {t("pub.services.request")} <ArrowRight className="h-3 w-3" />
              </Link>
            </article>
          );
        })}
      </div>
      <div className="mt-5 text-center">
        <Link to="/services" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {t("pub.home.help.browse_all")} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <p className="mx-auto mt-3 max-w-xl text-[10px] leading-relaxed text-muted-foreground">{t("pub.home.help.partner_disclosure")}</p>
      </div>
    </div>
  );
}