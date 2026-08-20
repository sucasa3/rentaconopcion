import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, BookOpen, Star, ShieldCheck, CheckSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getRecommendedPros } from "@/lib/pros.functions";
import type { TimelineItem } from "@/lib/maintenance-rules";
import { useT, type TranslationKey } from "@/lib/i18n";

/** Maintenance category → service request category slug. */
const CATEGORY_SLUG: Record<string, string> = {
  Roofing: "roofing",
  HVAC: "hvac",
  Plumbing: "plumbing",
  Windows: "handyman",
  Electrical: "electrical",
  Exterior: "painting",
};

type Guide = { what: string; steps: string[]; diy: string; cost: string };

/** How many steps each guide has in the dictionary. */
const GUIDE_STEPS: Record<string, number> = {
  roof: 4,
  hvac: 4,
  water_heater: 4,
  windows: 4,
  electrical: 4,
  siding: 4,
};

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

function buildGuide(item: TimelineItem, t: Translate): Guide {
  const stepCount = GUIDE_STEPS[item.key];
  if (!stepCount) {
    return {
      what: t("guide.fallback.what", { label: item.label, year: item.expectedYear }),
      steps: [
        t("guide.fallback.step1"),
        t("guide.fallback.step2"),
        t("guide.fallback.step3"),
      ],
      diy: t("guide.fallback.diy"),
      cost: t("guide.fallback.cost"),
    };
  }
  return {
    what: t(`guide.${item.key}.what` as TranslationKey),
    steps: Array.from({ length: stepCount }, (_, i) =>
      t(`guide.${item.key}.step${i + 1}` as TranslationKey),
    ),
    diy: t(`guide.${item.key}.diy` as TranslationKey),
    cost: t(`guide.${item.key}.cost` as TranslationKey),
  };
}

export function NextStepCard({
  item,
  onMarkDone,
}: {
  item: TimelineItem;
  onMarkDone?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const slug = CATEGORY_SLUG[item.category] ?? "handyman";
  const guide = buildGuide(item, t);
  const systemLabel = GUIDE_STEPS[item.key]
    ? t(`care.system.${item.key}` as TranslationKey)
    : item.label;

  const fetchPros = useServerFn(getRecommendedPros);
  const { data: pros } = useQuery({
    queryKey: ["recommended-pros", item.category],
    queryFn: () => fetchPros({ data: { category: item.category, limit: 2 } }),
    staleTime: 10 * 60_000,
  });
  const pro = pros?.[0];

  return (
    <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
        {t("next.eyebrow")}
      </p>
      <p className="mt-1 text-sm font-semibold">
        {item.status === "overdue"
          ? t("next.overdue", { label: systemLabel, years: Math.abs(item.yearsLeft) })
          : t("next.soon", { label: systemLabel, years: item.yearsLeft })}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{guide.what}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold hover:bg-secondary"
        >
          <BookOpen className="h-3.5 w-3.5" /> {t("next.btn.how")}
        </button>
        <Link
          to="/request"
          search={{ category: slug }}
          className="inline-flex items-center gap-1.5 rounded-full gradient-brand px-3.5 py-2 text-xs font-semibold text-white shadow-soft"
        >
          {t("next.btn.quotes")} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        {onMarkDone && (
          <button
            onClick={onMarkDone}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold hover:bg-secondary"
          >
            <CheckSquare className="h-3.5 w-3.5" /> {t("next.btn.done")}
          </button>
        )}
      </div>


      {pro && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-medium">
              {pro.businessName}
              {pro.isFoundingPartner && (
                <span className="inline-flex items-center gap-1 rounded-full bg-growth/15 px-2 py-0.5 text-[10px] font-semibold text-growth">
                  <ShieldCheck className="h-3 w-3" /> {t("next.pro.founding")}
                </span>
              )}
            </p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {pro.rating != null && (
                <>
                  <Star className="h-3 w-3 fill-current text-amber-500" />
                  {pro.rating} · {t("next.pro.reviews", { count: pro.reviewsCount ?? 0 })} ·{" "}
                </>
              )}
              {pro.serviceArea ?? pro.category}
            </p>
          </div>
          <Link
            to="/request"
            search={{ category: slug }}
            className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold hover:bg-secondary"
          >
            {t("next.pro.request")}
          </Link>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("next.dialog.title", { label: systemLabel })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">{guide.what}</p>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                {t("next.dialog.steps")}
              </p>
              <ol className="mt-1.5 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                {guide.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>
            <div className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">{t("next.dialog.diy")}</span>{" "}
                {guide.diy}
              </p>
              <p className="mt-1">
                <span className="font-semibold text-foreground">{t("next.dialog.cost")}</span>{" "}
                {guide.cost}
              </p>
            </div>
            <Link
              to="/request"
              search={{ category: slug }}
              onClick={() => setOpen(false)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full gradient-brand px-4 py-2.5 text-sm font-semibold text-white shadow-soft"
            >
              {t("next.dialog.cta")} <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="text-[11px] text-muted-foreground">{t("next.dialog.disclaimer")}</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
