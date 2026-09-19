import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  ChartNoAxesCombined,
  CheckCircle2,
  CircleDollarSign,
  House,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import heroPhoto from "@/assets/home-hero-photo.jpg.asset.json";
import { useLanguage } from "@/lib/i18n";

export function ConnectedProductHero() {
  const { t } = useLanguage();

  return (
    <div className="home-ecosystem relative mx-auto mt-12 max-w-6xl pb-8 pt-10 sm:mt-16 sm:pt-16 lg:pb-14">
      <div className="home-ecosystem-line absolute left-1/2 top-0 hidden h-[92%] w-[82%] -translate-x-1/2 lg:block" aria-hidden />
      <SignalChip className="left-[7%] top-2" icon={<ChartNoAxesCombined />} label={t("pub.home.signal.value")} />
      <SignalChip className="right-[8%] top-5" icon={<CalendarClock />} label={t("pub.home.signal.review")} />
      <SignalChip className="bottom-3 left-[4%] hidden sm:flex" icon={<Wrench />} label={t("pub.home.signal.care")} />
      <SignalChip className="bottom-0 right-[3%] hidden sm:flex" icon={<Sparkles />} label={t("pub.home.signal.opportunity")} />

      <div className="relative grid items-center gap-4 lg:grid-cols-[0.72fr_1.35fr_0.72fr] lg:gap-0">
        <AgentMoment />
        <HomeProfileMoment />
        <LenderMoment />
      </div>
      <p className="relative mt-5 text-center text-[11px] font-medium text-muted-foreground">
        {t("pub.home.demo_all")}
      </p>
    </div>
  );
}

function SignalChip({ className, icon, label }: { className: string; icon: React.ReactNode; label: string }) {
  return (
    <span className={`home-signal absolute z-20 hidden items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 text-[11px] font-semibold text-sucasa-navy shadow-soft backdrop-blur sm:flex ${className}`}>
      <span className="text-sucasa-orange [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
      {label}
    </span>
  );
}

function HomeProfileMoment() {
  const { t } = useLanguage();
  return (
    <article className="home-ecosystem-home relative z-10 order-1 overflow-hidden rounded-2xl border border-border bg-card shadow-elevated lg:order-2 lg:scale-[1.03]">
      <div className="relative h-[240px] overflow-hidden sm:h-[320px] lg:h-[360px]">
        <img src={heroPhoto.url} alt={t("pub.home.demo_photo_alt")} className="absolute inset-0 h-full w-full object-cover" width={1920} height={1200} />
        <div className="home-photo-vignette absolute inset-0" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 p-5 pb-14 sm:p-7 sm:pb-16">
          <p className="text-[10px] font-semibold uppercase text-primary-foreground/75">{t("pub.home.demo.home_label")}</p>
          <p className="mt-1 text-2xl font-semibold text-primary-foreground sm:text-3xl">{t("pub.home.demo.address")}</p>
        </div>
        <span className="absolute right-3 top-3 rounded-full border border-primary-foreground/25 bg-card/90 px-2.5 py-1 text-[9px] font-semibold text-sucasa-navy backdrop-blur">
          {t("pub.home.demo_badge")}
        </span>
      </div>
      <div className="relative -mt-10 mx-3 grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-hero-glass p-3 shadow-soft backdrop-blur-xl sm:mx-5 sm:p-4">
        <Metric label={t("pub.home.demo.value")} value="$482K" icon={<House />} />
        <Metric label={t("pub.home.demo.equity")} value="$186K" icon={<ChartNoAxesCombined />} />
        <Metric label={t("pub.home.demo.score")} value="82" icon={<ShieldCheck />} />
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

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="min-w-0 px-2 text-center">
      <span className="mx-auto hidden text-intelligence-accent sm:block [&_svg]:mx-auto [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      <p className="mt-1 truncate text-[8px] font-bold uppercase text-intelligence-accent sm:text-[9px]">{label}</p>
      <p className="mt-0.5 text-base font-bold tabular-nums text-sucasa-navy sm:text-xl">{value}</p>
    </div>
  );
}

function AgentMoment() {
  const { t } = useLanguage();
  return (
    <article className="home-ecosystem-side order-2 rounded-xl border border-border bg-card p-4 shadow-elevated lg:order-1 lg:-mr-5 lg:rotate-[-1.5deg]">
      <DemoHeader icon={<BriefcaseBusiness />} title={t("pub.home.demo.agent_title")} />
      <p className="mt-4 text-[10px] font-semibold uppercase text-status-opportunity">{t("pub.home.demo.who")}</p>
      <p className="mt-1 text-lg font-semibold">{t("pub.home.demo.agent_person")}</p>
      <p className="text-[10px] text-muted-foreground">{t("pub.home.demo.fictional_person")}</p>
      <DemoLine label={t("pub.home.demo.why")} value={t("pub.home.demo.agent_why")} />
      <DemoLine label={t("pub.home.demo.say")} value={t("pub.home.demo.agent_say")} intelligence />
      <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-sucasa-navy"><CheckCircle2 className="h-4 w-4 text-status-positive" /> {t("pub.home.demo.agent_next")}</p>
    </article>
  );
}

function LenderMoment() {
  const { t } = useLanguage();
  return (
    <article className="home-ecosystem-side order-3 rounded-xl border border-border bg-card p-4 shadow-elevated lg:-ml-5 lg:rotate-[1.5deg]">
      <DemoHeader icon={<CircleDollarSign />} title={t("pub.home.demo.lender_title")} />
      <p className="mt-4 text-[10px] font-semibold uppercase text-muted-foreground">{t("pub.home.demo.attention")}</p>
      <p className="mt-1 text-3xl font-semibold text-sucasa-navy">3</p>
      <p className="text-xs text-muted-foreground">{t("pub.home.demo.lender_context")}</p>
      <DemoLine label={t("pub.home.demo.why")} value={t("pub.home.demo.lender_why")} />
      <DemoLine label={t("pub.home.demo.next")} value={t("pub.home.demo.lender_next")} intelligence />
    </article>
  );
}

function DemoHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-2 border-b border-border pb-3">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-sucasa-navy text-primary-foreground [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      <div><p className="text-xs font-semibold">{title}</p><p className="text-[9px] text-muted-foreground">{t("pub.home.demo_badge")}</p></div>
    </div>
  );
}

function DemoLine({ label, value, intelligence = false }: { label: string; value: string; intelligence?: boolean }) {
  return (
    <div className={`mt-3 rounded-md p-3 ${intelligence ? "bg-surface-intelligence" : "border-l-2 border-sucasa-orange bg-surface-warm"}`}>
      <p className="text-[9px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-xs leading-relaxed">{value}</p>
    </div>
  );
}

export function ProductProofVisual({ kind }: { kind: "home" | "agent" | "lender" }) {
  if (kind === "home") return <HomeProfileMoment />;
  if (kind === "agent") return <AgentMoment />;
  return <LenderMoment />;
}

export function ConnectedServicesVisual() {
  const { t } = useLanguage();
  const items = [
    [Wrench, t("pub.home.connected.maintenance")],
    [House, t("pub.home.connected.real_estate")],
    [CircleDollarSign, t("pub.home.connected.mortgage")],
    [ShieldCheck, t("pub.home.connected.insurance")],
    [MessageSquareText, t("pub.home.connected.services")],
  ] as const;
  return (
    <div className="relative mx-auto mt-10 max-w-3xl py-4 sm:py-8">
      <div className="absolute inset-x-[15%] top-1/2 h-px bg-border" aria-hidden />
      <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-[repeat(5,minmax(0,1fr))] sm:items-center">
        {items.map(([Icon, label], index) => (
          <div key={label} className={`${index === 2 ? "col-span-2 sm:col-span-1 sm:scale-110" : ""} flex min-h-24 flex-col items-center justify-center rounded-lg border border-border bg-card p-3 text-center shadow-soft`}>
            <span className={`grid h-9 w-9 place-items-center rounded-full ${index === 2 ? "bg-sucasa-navy text-primary-foreground" : "bg-surface-warm text-sucasa-orange"}`}><Icon className="h-4 w-4" /></span>
            <p className="mt-2 text-xs font-semibold">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}