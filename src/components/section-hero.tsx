import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

export type HeroTone = "urgent" | "opportunity" | "setup" | "calm";

const TONE: Record<HeroTone, { ring: string; badge: string; btn: string }> = {
  urgent: {
    ring: "border-destructive/40 bg-destructive/5",
    badge: "bg-destructive/10 text-destructive",
    btn: "bg-destructive text-destructive-foreground hover:opacity-90",
  },
  opportunity: {
    ring: "border-growth/40 bg-growth/5",
    badge: "bg-growth/15 text-growth",
    btn: "gradient-growth text-white hover:opacity-90",
  },
  setup: {
    ring: "border-primary/40 bg-primary/5",
    badge: "bg-primary/10 text-primary",
    btn: "gradient-brand text-white hover:opacity-90",
  },
  calm: {
    ring: "border-border bg-card",
    badge: "bg-secondary text-secondary-foreground",
    btn: "bg-foreground text-background hover:opacity-90",
  },
};

export type HeroChip = {
  label: string;
  tone?: "urgent" | "warn" | "good" | "muted";
};

const CHIP: Record<NonNullable<HeroChip["tone"]>, string> = {
  urgent: "bg-destructive/10 text-destructive",
  warn: "bg-accent text-accent-foreground",
  good: "bg-growth/15 text-growth",
  muted: "bg-secondary text-muted-foreground",
};

/**
 * Plain-language intro block that sits at the top of a dashboard section.
 * Says what the section is for, where it stands right now, and the one
 * thing to do next — so nobody has to infer purpose from a list.
 */
export function SectionHero({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  status,
  chips = [],
  tone = "setup",
  actionLabel,
  onAction,
  connectNote,
  connectLabel,
  onConnect,
  plain = false,
}: {
  icon: LucideIcon;
  eyebrow?: string;
  title: string;
  subtitle: string;
  status?: string;
  chips?: HeroChip[];
  tone?: HeroTone;
  actionLabel?: string;
  onAction?: () => void;
  connectNote?: string;
  connectLabel?: string;
  onConnect?: () => void;
  /** Big, friendly, one-idea-at-a-time layout: no chips, one full-width action. */
  plain?: boolean;
}) {
  const t = TONE[tone];

  if (plain) {
    return (
      <section className={`rounded-3xl border p-5 shadow-soft sm:p-6 ${t.ring}`} aria-label={title}>
        <span className={`grid h-14 w-14 place-items-center rounded-2xl ${t.badge}`}>
          <Icon className="h-7 w-7" />
        </span>
        <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-tight">{title}</h2>
        {status ? (
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">{status}</p>
        ) : (
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">{subtitle}</p>
        )}

        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className={`mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-2xl px-5 py-3.5 text-base font-semibold transition sm:w-auto ${t.btn}`}
          >
            {actionLabel} <ArrowRight className="h-4 w-4" />
          </button>
        ) : null}

        {connectNote ? (
          <p className="mt-4 border-t border-border/60 pt-3 text-sm leading-relaxed text-muted-foreground">
            {connectNote}{" "}
            {connectLabel && onConnect ? (
              <button
                type="button"
                onClick={onConnect}
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                {connectLabel}
              </button>
            ) : null}
          </p>
        ) : null}
      </section>
    );
  }

  return (

    <section className={`rounded-3xl border p-5 shadow-soft sm:p-6 ${t.ring}`} aria-label={title}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${t.badge}`}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {eyebrow}
              </p>
            ) : null}
            <h2 className="mt-0.5 text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>

            {status ? <p className="mt-2 text-sm font-medium">{status}</p> : null}

            {chips.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {chips.map((c) => (
                  <span
                    key={c.label}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${CHIP[c.tone ?? "muted"]}`}
                  >
                    {c.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold transition ${t.btn}`}
          >
            {actionLabel} <ArrowRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {connectNote ? (
        <p className="mt-4 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
          {connectNote}{" "}
          {connectLabel && onConnect ? (
            <button
              type="button"
              onClick={onConnect}
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              {connectLabel}
            </button>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
