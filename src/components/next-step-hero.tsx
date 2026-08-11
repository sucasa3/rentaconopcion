import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Sparkles,
  TrendingUp,
  CheckCircle2,
} from "lucide-react";
import type { NextStep, Completeness } from "@/lib/next-step";

const TONE: Record<
  NextStep["tone"],
  { ring: string; chip: string; icon: React.ElementType; btn: string }
> = {
  urgent: {
    ring: "border-destructive/40 bg-destructive/5",
    chip: "bg-destructive/10 text-destructive",
    icon: AlertTriangle,
    btn: "bg-destructive text-destructive-foreground hover:opacity-90",
  },
  opportunity: {
    ring: "border-growth/40 bg-growth/5",
    chip: "bg-growth/15 text-growth",
    icon: TrendingUp,
    btn: "gradient-growth text-white hover:opacity-90",
  },
  setup: {
    ring: "border-primary/40 bg-primary/5",
    chip: "bg-primary/10 text-primary",
    icon: Sparkles,
    btn: "gradient-brand text-white hover:opacity-90",
  },
  calm: {
    ring: "border-border bg-card",
    chip: "bg-secondary text-secondary-foreground",
    icon: CheckCircle2,
    btn: "bg-foreground text-background hover:opacity-90",
  },
};

export function NextStepHero({
  step,
  completeness,
  onGoToTab,
}: {
  step: NextStep;
  completeness: Completeness;
  onGoToTab: (tab: "home" | "care" | "documents") => void;
}) {
  const tone = TONE[step.tone];
  const Icon = tone.icon;
  const isInternal = step.to === "/dashboard";

  return (
    <section
      className={`rounded-3xl border p-5 shadow-soft sm:p-6 ${tone.ring}`}
      aria-label="Your next step"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${tone.chip}`}
          >
            <Icon className="h-3 w-3" />
            {step.eyebrow}
          </span>
          <h2 className="mt-2 text-lg font-semibold tracking-tight sm:text-xl">
            {step.title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{step.body}</p>
        </div>

        <div className="shrink-0">
          {isInternal ? (
            <button
              onClick={() => onGoToTab(step.tab ?? "home")}
              className={`inline-flex w-full items-center justify-center gap-1.5 rounded-full px-5 py-3 text-sm font-semibold shadow-soft transition sm:w-auto ${tone.btn}`}
            >
              {step.ctaLabel} <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <Link
              to={step.to}
              search={step.search as never}
              className={`inline-flex w-full items-center justify-center gap-1.5 rounded-full px-5 py-3 text-sm font-semibold shadow-soft transition sm:w-auto ${tone.btn}`}
            >
              {step.ctaLabel} <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>

      {completeness.pct < 100 && (
        <div className="mt-5 rounded-2xl border border-border bg-background/70 px-4 py-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium">
              Your home profile is {completeness.pct}% complete
            </span>
            <span className="truncate text-muted-foreground">
              Next: {completeness.missing[0]}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full gradient-brand transition-all"
              style={{ width: `${completeness.pct}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            The more we know, the sharper your recommendations and Home Score.
          </p>
        </div>
      )}
    </section>
  );
}
