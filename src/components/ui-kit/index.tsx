import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/** Big number tile used across the business dashboards. */
export function StatCard({
  label,
  value,
  icon,
  tone = "default",
  to,
  params,
  search,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "growth" | "attention" | "info";
  to?: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
}) {
  const toneRing: Record<string, string> = {
    default: "bg-card",
    growth: "bg-growth/8",
    attention: "bg-attention/12",
    info: "bg-info/8",
  };
  const toneText: Record<string, string> = {
    default: "text-foreground",
    growth: "text-growth",
    attention: "text-attention-foreground",
    info: "text-info",
  };
  const body = (
    <div
      className={cn(
        "h-full rounded-3xl border border-border/70 p-4 shadow-soft transition active:scale-[0.99]",
        toneRing[tone],
        to && "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className={cn("text-3xl font-semibold tracking-tight tabular-nums", toneText[tone])}>
          {value}
        </p>
        {to && <ChevronRight className="mb-1 h-4 w-4 shrink-0 text-muted-foreground" />}
      </div>
    </div>
  );
  if (!to) return body;
  return (
    <Link
      to={to}
      params={params as never}
      search={search as never}
      aria-label={`${label}: ${typeof value === "number" || typeof value === "string" ? value : ""}`}
      className="block rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      {body}
    </Link>
  );
}


export function StatusPill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "growth" | "attention" | "info" | "brand";
}) {
  const tones: Record<string, string> = {
    muted: "bg-muted text-muted-foreground",
    growth: "bg-growth/12 text-growth",
    attention: "bg-attention/20 text-attention-foreground",
    info: "bg-info/12 text-info",
    brand: "bg-primary/10 text-primary",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * Homeowner dashboard summary card: one icon, one headline, one plain
 * sentence, one button. Everything else lives behind the button.
 */
export function SummaryCard({
  icon,
  label,
  headline,
  sentence,
  tone = "calm",
  to,
  search,
  actionLabel,
  onAction,
  emphasis = false,
}: {
  icon: ReactNode;
  label: string;
  headline?: ReactNode;
  sentence: string;
  tone?: "calm" | "urgent" | "opportunity" | "brand";
  to?: string;
  search?: Record<string, string>;
  actionLabel: string;
  onAction?: () => void;
  emphasis?: boolean;
}) {
  const tones: Record<string, { edge: string; badge: string; text: string; btn: string }> = {
    calm: {
      edge: "border-border",
      badge: "bg-secondary text-secondary-foreground",
      text: "text-foreground",
      btn: "border border-border bg-background hover:bg-secondary",
    },
    urgent: {
      edge: "border-destructive/40 bg-destructive/5",
      badge: "bg-destructive/10 text-destructive",
      text: "text-destructive",
      btn: "bg-destructive text-destructive-foreground hover:opacity-90",
    },
    opportunity: {
      edge: "border-growth/40 bg-growth/5",
      badge: "bg-growth/15 text-growth",
      text: "text-growth",
      btn: "gradient-growth text-white hover:opacity-90",
    },
    brand: {
      edge: "border-primary/30 bg-primary/5",
      badge: "bg-primary/10 text-primary",
      text: "text-primary",
      btn: "gradient-brand text-white hover:opacity-90",
    },
  };
  const t = tones[tone];

  const button = (
    <span
      className={cn(
        "mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-full px-5 text-sm font-semibold transition active:scale-[0.99]",
        t.btn,
      )}
    >
      {actionLabel}
      <ChevronRight className="h-4 w-4" />
    </span>
  );

  return (
    <section
      className={cn(
        "rounded-3xl border p-5 shadow-soft sm:p-6",
        t.edge,
        emphasis ? "bg-card" : "bg-card",
      )}
      aria-label={label}
    >
      <div className="flex items-start gap-3">
        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", t.badge)}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          {headline != null && (
            <p
              className={cn(
                "mt-0.5 font-semibold tracking-tight tabular-nums",
                emphasis ? "text-3xl" : "text-2xl",
                t.text,
              )}
            >
              {headline}
            </p>
          )}
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{sentence}</p>
        </div>
      </div>

      {to ? (
        <Link to={to} search={search as never} className="block focus:outline-none">
          {button}
        </Link>
      ) : (
        <button type="button" onClick={onAction} className="block w-full text-left">
          {button}
        </button>
      )}
    </section>
  );
}

/**
 * "What to do now" — a single prioritized action card with a short queue of
 * next items. Used at the top of dense list views to surface the most
 * actionable homeowner before the full grid or table.
 */
export function PriorityCard({
  title,
  subtitle,
  primaryAction,
  primaryActionLabel,
  secondaryActions = [],
  tone = "attention",
}: {
  title: string;
  subtitle: string;
  primaryAction: () => void;
  primaryActionLabel: string;
  secondaryActions?: { label: string; onClick: () => void }[];
  tone?: "attention" | "opportunity" | "brand";
}) {
  const tones: Record<string, { edge: string; badge: string; text: string; btn: string }> = {
    attention: {
      edge: "border-attention/40 bg-attention/5",
      badge: "bg-attention/15 text-attention-foreground",
      text: "text-attention-foreground",
      btn: "bg-attention text-attention-foreground hover:opacity-90",
    },
    opportunity: {
      edge: "border-growth/40 bg-growth/5",
      badge: "bg-growth/15 text-growth",
      text: "text-growth",
      btn: "gradient-growth text-white hover:opacity-90",
    },
    brand: {
      edge: "border-primary/30 bg-primary/5",
      badge: "bg-primary/10 text-primary",
      text: "text-primary",
      btn: "gradient-brand text-white hover:opacity-90",
    },
  };
  const t = tones[tone];

  return (
    <section
      className={cn(
        "rounded-3xl border p-5 shadow-soft sm:p-6",
        t.edge,
      )}
      aria-label="What to do now"
    >
      <div className="flex items-start gap-3">
        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", t.badge)}>
          <Zap className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            What to do now
          </p>
          <p className={cn("mt-0.5 text-2xl font-semibold tracking-tight", t.text)}>{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={primaryAction}
        className={cn(
          "mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-full px-5 text-sm font-semibold transition active:scale-[0.99]",
          t.btn,
        )}
      >
        {primaryActionLabel}
        <ChevronRight className="h-4 w-4" />
      </button>

      {secondaryActions.length > 0 && (
        <div className="mt-4 border-t border-border/60 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Next up
          </p>
          <ul className="mt-2 space-y-1">
            {secondaryActions.map((a, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={a.onClick}
                  className="w-full text-left text-sm text-foreground transition hover:text-primary"
                >
                  <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  {a.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** One person, one signal, one action. */
export function SignalCard({
  icon,
  name,
  signal,
  action,
  pill,
  onAction,
  actionLabel = "View",
  to,
  params,
  search,
}: {
  icon: ReactNode;
  name: string;
  signal: string;
  action?: string;
  pill?: ReactNode;
  onAction?: () => void;
  actionLabel?: string;
  to?: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
}) {
  return (
    <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-surface text-primary">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{name}</p>
            {pill}
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{signal}</p>
          {action && <p className="mt-1 text-sm font-medium text-primary">{action}</p>}
        </div>
      </div>
      {(to || onAction) && (
        <div className="mt-3">
          {to ? (
            <Link
              to={to}
              params={params as never}
              search={search as never}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground"
            >
              {actionLabel}
            </Link>
          ) : (
            <button
              onClick={onAction}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground"
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

export function ScoreRing({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className="relative grid h-24 w-24 place-items-center rounded-full"
      style={{
        background: `conic-gradient(var(--growth) ${pct * 3.6}deg, var(--muted) 0deg)`,
      }}
      role="img"
      aria-label={`${label ?? "Score"}: ${pct} out of 100`}
    >
      <div className="grid h-[76px] w-[76px] place-items-center rounded-full bg-card">
        <span className="text-2xl font-semibold tabular-nums">{pct}</span>
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-border p-8 text-center">
      {icon && <div className="mx-auto mb-3 text-muted-foreground">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Compact label/value pair used inside the mobile metric grids. */
function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="truncate text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/**
 * Full-width mobile opportunity card: status pill, name, one hero number and a
 * two-column metric grid. Replaces wide desktop tables below `md`.
 */
export function OpportunityCard({
  pill,
  name,
  subtitle,
  heroLabel,
  heroValue,
  metrics = [],
  signal,
  extra,
  actionLabel = "View opportunity",
  onAction,
  to,
  params,
}: {
  pill?: ReactNode;
  name: string;
  subtitle?: string;
  heroLabel: string;
  heroValue: ReactNode;
  metrics?: { label: string; value: ReactNode }[];
  signal?: ReactNode;
  extra?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  to?: string;
  params?: Record<string, string>;
}) {
  return (
    <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft">
      {pill && <div className="mb-2">{pill}</div>}
      <p className="truncate text-lg font-semibold tracking-tight">{name}</p>
      {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}

      <div className="mt-3 rounded-2xl bg-surface p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {heroLabel}
        </p>
        <p className="text-2xl font-semibold tabular-nums text-growth">{heroValue}</p>
      </div>

      {metrics.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          {metrics.map((m) => (
            <Metric key={m.label} label={m.label} value={m.value} />
          ))}
        </div>
      )}

      {extra && <div className="mt-3">{extra}</div>}
      {signal && <p className="mt-3 line-clamp-2 text-sm text-primary">{signal}</p>}

      {(to || onAction) && (
        <div className="mt-4">
          {to ? (
            <Link
              to={to}
              params={params as never}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
            >
              {actionLabel}
            </Link>
          ) : (
            <button
              onClick={onAction}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Mobile replacement for a spreadsheet row: name, metric grid, status pills. */
export function PersonCard({
  name,
  subtitle,
  metrics = [],
  pills,
  extra,
  actionLabel = "View profile",
  onAction,
  to,
  params,
}: {
  name: string;
  subtitle?: string;
  metrics?: { label: string; value: ReactNode }[];
  pills?: ReactNode;
  extra?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  to?: string;
  params?: Record<string, string>;
}) {
  return (
    <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft">
      <div className="min-w-0">
        <p className="truncate font-semibold">{name}</p>
        {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      {pills && <div className="mt-2 flex flex-wrap items-center gap-1.5">{pills}</div>}

      {metrics.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          {metrics.map((m) => (
            <Metric key={m.label} label={m.label} value={m.value} />
          ))}
        </div>
      )}

      {extra && <div className="mt-3">{extra}</div>}

      {(to || onAction) && (
        <div className="mt-4">
          {to ? (
            <Link
              to={to}
              params={params as never}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground"
            >
              {actionLabel}
            </Link>
          ) : (
            <button
              onClick={onAction}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground"
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
