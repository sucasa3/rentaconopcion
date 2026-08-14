import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
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
        "rounded-3xl border border-border/70 p-4 shadow-soft transition active:scale-[0.99]",
        toneRing[tone],
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p className={cn("mt-2 text-3xl font-semibold tracking-tight tabular-nums", toneText[tone])}>
        {value}
      </p>
    </div>
  );
  if (!to) return body;
  return (
    <Link to={to} params={params as never} search={search as never} className="block">
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
