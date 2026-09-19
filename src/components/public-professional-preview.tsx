import {
  ArrowUpRight,
  CalendarCheck2,
  CheckCircle2,
  CircleDollarSign,
  House,
  MessageSquareText,
  Sparkles,
  Users,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";

export function PublicAgentTodayPreview() {
  const { t } = useLanguage();

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-elevated">
      <PreviewHeader title={t("pub.home.demo.agent_title")} />
      <div className="grid gap-2 p-2.5 sm:p-3.5">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-surface-warm p-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-card text-status-opportunity shadow-soft"><Users className="h-4 w-4" /></span>
          <div className="min-w-0"><p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("pub.home.pro_preview.attention")}</p><p className="mt-0.5 text-sm font-semibold text-sucasa-navy">{t("pub.home.pro_preview.agent_count")}</p></div>
          <span className="rounded-full bg-status-opportunity/10 px-2 py-1 text-[10px] font-semibold text-status-opportunity">{t("pub.home.pro_preview.priority")}</span>
        </div>
        <article className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="h-1 bg-sucasa-orange" />
          <div className="p-2.5 sm:p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("pub.home.pro_preview.start_here")}</p><h3 className="mt-1 text-lg font-semibold text-sucasa-navy">Jordan Lee</h3><p className="text-[10px] text-muted-foreground">{t("pub.home.demo.fictional_person")}</p></div>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sucasa-navy text-xs font-semibold text-primary-foreground">JL</span>
            </div>
            <div className="mt-2 border-l-2 border-sucasa-orange pl-3"><p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("pub.home.demo.why")}</p><p className="mt-1 text-sm leading-snug">{t("pub.home.demo.agent_why")}</p></div>
            <div className="mt-2 rounded-lg border border-surface-intelligence-border bg-surface-intelligence p-2.5">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-surface-intelligence-foreground"><Sparkles className="h-3 w-3" />{t("pub.home.demo.say")}</p>
              <p className="mt-1.5 text-xs leading-snug text-foreground">{t("pub.home.demo.agent_say")}</p>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3"><p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-sucasa-navy"><MessageSquareText className="h-4 w-4 shrink-0 text-intelligence-accent" />{t("pub.home.demo.agent_next")}</p><ArrowUpRight className="h-4 w-4 shrink-0 text-primary" /></div>
          </div>
        </article>
      </div>
      <DemoFooter />
    </div>
  );
}

export function PublicLenderTodayPreview() {
  const { t } = useLanguage();

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-elevated">
      <PreviewHeader title={t("pub.home.demo.lender_title")} />
      <div className="grid gap-2 p-2.5 sm:p-3.5">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg border border-surface-intelligence-border bg-surface-intelligence p-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-card text-intelligence-accent shadow-soft"><CircleDollarSign className="h-4 w-4" /></span>
          <div className="min-w-0"><p className="text-[10px] font-semibold uppercase text-surface-intelligence-foreground">{t("pub.home.pro_preview.existing_relationships")}</p><p className="mt-0.5 text-sm font-semibold text-sucasa-navy">{t("pub.home.pro_preview.lender_count")}</p></div>
        </div>
        <article className="rounded-lg border border-border bg-card p-2.5 sm:p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("pub.home.pro_preview.relationship_review")}</p><h3 className="mt-1 text-lg font-semibold text-sucasa-navy">Riley Ortega</h3><p className="text-[10px] text-muted-foreground">{t("pub.home.pro_preview.fictional_client")}</p></div>
            <span className="rounded-full border border-border bg-secondary px-2 py-1 text-[10px] font-semibold text-secondary-foreground">{t("pub.home.pro_preview.review_due")}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ContextTile icon={<House />} label={t("pub.home.pro_preview.home_context")} value={t("pub.home.pro_preview.home_value_changed")} />
            <ContextTile icon={<CalendarCheck2 />} label={t("pub.home.pro_preview.mortgage_context")} value={t("pub.home.pro_preview.annual_review")} />
          </div>
          <div className="mt-2 border-l-2 border-sucasa-orange pl-3"><p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("pub.home.demo.why")}</p><p className="mt-1 text-sm leading-snug">{t("pub.home.demo.lender_why")}</p></div>
          <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-surface-warm p-2.5"><p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-sucasa-navy"><CheckCircle2 className="h-4 w-4 shrink-0 text-status-positive" />{t("pub.home.demo.lender_next")}</p><ArrowUpRight className="h-4 w-4 shrink-0 text-primary" /></div>
        </article>
      </div>
      <DemoFooter />
    </div>
  );
}

function PreviewHeader({ title }: { title: string }) {
  const { t } = useLanguage();
  return <div className="flex items-center justify-between gap-3 border-b border-border bg-sucasa-navy px-4 py-2.5 text-primary-foreground"><p className="font-semibold">{title}</p><span className="rounded-full bg-primary-foreground/10 px-2.5 py-1 text-[9px] font-semibold">{t("pub.home.demo_badge")}</span></div>;
}

function ContextTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="min-w-0 rounded-lg bg-secondary p-2"><span className="text-intelligence-accent [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span><p className="mt-1.5 text-[9px] font-semibold uppercase text-muted-foreground">{label}</p><p className="mt-1 text-[10px] font-semibold leading-snug text-sucasa-navy">{value}</p></div>;
}

function DemoFooter() {
  const { t } = useLanguage();
  return <p className="border-t border-border px-4 py-2 text-center text-[9px] text-muted-foreground">{t("pub.home.demo_all")}</p>;
}
