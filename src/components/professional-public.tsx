import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useLanguage, type TranslationKey } from "@/lib/i18n";

export type PreviewKind = "agent" | "lender";

export function ProfessionalPreview({ kind }: { kind: PreviewKind }) {
  const { t } = useLanguage();
  const person = kind === "agent" ? "Jordan Lee" : "Riley Ortega";
  const initials = kind === "agent" ? "JL" : "RO";
  const behind = kind === "agent" ? ["Morgan Chen", "Avery Brooks"] : ["Cameron Diaz", "Taylor Morgan"];
  return (
    <div className="professional-preview relative mx-auto w-full max-w-[470px] pb-7 pt-3 md:mx-0 md:justify-self-end">
      <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold text-muted-foreground">
        <span>{t(`pub.preview.${kind}.label`)}</span>
        <span className="rounded-full border border-border bg-card px-2 py-1">{t("pub.preview.demo_badge")}</span>
      </div>
      <div aria-hidden="true" className="absolute inset-x-8 bottom-1 top-20 rotate-2 rounded-lg border border-border bg-card/80 shadow-soft" />
      <div aria-hidden="true" className="absolute inset-x-4 bottom-4 top-14 -rotate-1 rounded-lg border border-border bg-surface-warm shadow-soft" />
      <article className="professional-priority-card relative overflow-hidden rounded-lg border border-border bg-card shadow-elevated">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-sucasa-navy px-4 py-3 text-primary-foreground sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-primary-foreground/65">{t("pub.preview.priority")}</p>
            <p className="mt-1 truncate text-base font-semibold">{t("pub.preview.start_here")}</p>
          </div>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-foreground/10 text-xs font-semibold">{initials}</span>
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-[10px] font-semibold text-status-opportunity">{t("pub.preview.who")}</p>
          <h2 className="mt-1 text-xl font-semibold">{person}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("pub.preview.fictional")}</p>
          {kind === "lender" && (
            <div className="professional-reveal mt-4 rounded-md border border-border bg-surface-warm p-3">
              <p className="text-[10px] font-semibold text-muted-foreground">{t("pub.preview.property_context")}</p>
              <p className="mt-1 text-sm font-medium">{t("pub.preview.lender.context")}</p>
            </div>
          )}
          <div className="professional-reveal mt-4 border-l-2 border-sucasa-orange pl-3 [animation-delay:120ms]">
            <p className="text-[10px] font-semibold text-muted-foreground">{t("pub.preview.why_now")}</p>
            <p className="mt-1 text-sm leading-relaxed">{t(`pub.preview.${kind}.why`)}</p>
          </div>
          <div className="professional-reveal mt-4 rounded-md bg-surface-intelligence p-3 [animation-delay:240ms]">
            <p className="text-[10px] font-semibold text-surface-intelligence-foreground">{t("pub.preview.what_to_say")}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(`pub.preview.${kind}.opener`)}</p>
          </div>
          <div className="professional-reveal mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 [animation-delay:360ms]">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-muted-foreground">{t("pub.preview.what_next")}</p>
              <p className="mt-1 truncate text-sm font-semibold">{t(`pub.preview.${kind}.next`)}</p>
            </div>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sucasa-orange text-sucasa-orange-foreground"><ArrowRight className="h-4 w-4" /></span>
          </div>
        </div>
      </article>
      <div className="relative mt-3 flex justify-center gap-2 text-[10px] text-muted-foreground">
        {behind.map((name, index) => <span key={name} className="rounded-full border border-border bg-card px-3 py-1.5 shadow-soft">{String(index + 2).padStart(2, "0")} · {name}</span>)}
      </div>
      <p className="relative mt-3 text-center text-[11px] text-muted-foreground">{t("pub.preview.all_fictional")}</p>
    </div>
  );
}

export function FourAnswers({ audience }: { audience: PreviewKind }) {
  const { t } = useLanguage();
  const keyPairs: [TranslationKey, TranslationKey][] =
    audience === "agent"
      ? [
          ["pub.four.agent1_title", "pub.four.agent1_desc"],
          ["pub.four.agent2_title", "pub.four.agent2_desc"],
          ["pub.four.agent3_title", "pub.four.agent3_desc"],
          ["pub.four.agent4_title", "pub.four.agent4_desc"],
        ]
      : [
          ["pub.four.lender1_title", "pub.four.lender1_desc"],
          ["pub.four.lender2_title", "pub.four.lender2_desc"],
          ["pub.four.lender3_title", "pub.four.lender3_desc"],
          ["pub.four.lender4_title", "pub.four.lender4_desc"],
        ];
  const items: [string, string][] = keyPairs.map(([titleKey, descKey]) => [t(titleKey), t(descKey)]);
  return (
    <section className="border-y border-border bg-background py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-5">
        <p className="text-sm font-semibold text-status-opportunity">{t("pub.four.eyebrow")}</p>
        <h2 className="mt-2 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">{t(audience === "agent" ? "pub.four.title_agent" : "pub.four.title_lender")}</h2>
        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {items.map(([title, copy], index) => (
            <article key={title} className="bg-card p-5">
              <span className="text-xs font-semibold text-status-opportunity">0{index + 1}</span>
              <h3 className="mt-6 text-sm font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TrustStatement({ kind }: { kind: PreviewKind }) {
  const { t } = useLanguage();
  return (
    <section className="bg-surface-warm py-9 sm:py-10">
      <div className="mx-auto grid max-w-6xl gap-4 px-5 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-8">
        <ShieldCheck className="h-7 w-7 text-status-positive" />
        <div>
          <h2 className="text-2xl font-semibold">{t(kind === "agent" ? "pub.trust.agent_title" : "pub.trust.lender_title")}</h2>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">{t(kind === "agent" ? "pub.trust.agent_body" : "pub.trust.lender_body")}</p>
          {kind === "lender" && <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">{t("pub.trust.lender_extra")}</p>}
        </div>
      </div>
    </section>
  );
}

export function PlanCard({ name, price, description, features, featured, footer }: { name: string; price: string; description: string; features: string[]; featured?: boolean; footer: ReactNode }) {
  return (
    <article className={cn("flex h-full flex-col rounded-lg border bg-card p-5 shadow-soft", featured ? "border-sucasa-orange" : "border-border")}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0"><h2 className="text-lg font-semibold">{name}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
      </div>
      <p className="mt-6 text-3xl font-semibold tabular-nums">{price}</p>
      <ul className="mt-5 space-y-2">
        {features.map((feature) => <li key={feature} className="flex gap-2 text-sm text-muted-foreground"><Check className="mt-0.5 h-4 w-4 shrink-0 text-status-positive" />{feature}</li>)}
      </ul>
      <div className="mt-auto pt-6">{footer}</div>
    </article>
  );
}
