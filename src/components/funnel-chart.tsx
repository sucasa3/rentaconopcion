import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface FunnelRow {
  homeowners: number;
  opportunities: number;
  contacted: number;
  engaged: number;
  conversations: number;
  appointments: number;
  applications: number;
  closed: number;
  closed_value_cents: number;
}

const STAGE_KEYS = [
  "homeowners",
  "opportunities",
  "contacted",
  "engaged",
  "conversations",
  "appointments",
  "applications",
  "closed",
] as const;

const STAGE_COLORS: Record<(typeof STAGE_KEYS)[number], string> = {
  homeowners: "var(--primary)",
  opportunities: "var(--info)",
  contacted: "var(--attention)",
  engaged: "var(--growth)",
  conversations: "var(--growth)",
  appointments: "var(--growth)",
  applications: "var(--growth)",
  closed: "var(--growth)",
};

function formatCents(cents: number) {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "growth" | "attention";
}) {
  const tones = {
    default: "bg-card text-foreground",
    growth: "bg-growth/8 text-growth",
    attention: "bg-attention/12 text-attention-foreground",
  };
  return (
    <div className={cn("rounded-3xl border border-border/70 p-4 shadow-soft", tones[tone])}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
    </div>
  );
}

export function FunnelView({
  data,
  costCents = 0,
  days = 30,
}: {
  data: FunnelRow | null;
  costCents?: number;
  days?: number;
}) {
  const t = useT();
  if (!data) {
    return (
      <div className="rounded-3xl border border-dashed border-border p-8 text-center">
        <p className="font-semibold">{t("biz.funnel.empty_title")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("biz.funnel.empty_desc")}
        </p>
      </div>
    );
  }

  const stages = STAGE_KEYS.map((key) => ({
    key,
    label: t(`biz.funnel.stage.${key}` as const),
    color: STAGE_COLORS[key],
  }));

  const chartData = stages.map((s) => ({
    name: s.label,
    value: (data as any)[s.key] ?? 0,
    fill: s.color,
  }));

  const closedValue = data.closed_value_cents ?? 0;
  const roi = costCents > 0 ? Math.round((closedValue / costCents) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label={t("biz.funnel.closed_value")} value={formatCents(closedValue)} tone="growth" />
        <MetricCard
          label={t("biz.funnel.sucasa_cost")}
          value={formatCents(costCents)}
          tone={costCents > 0 ? "attention" : "default"}
        />
        <MetricCard label="ROI" value={`${roi}%`} tone={roi >= 100 ? "growth" : "default"} />
        <MetricCard label={t("biz.funnel.stage.closed")} value={data.closed} tone="default" />
      </div>

      <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft">
        <p className="mb-2 text-sm font-medium">{t("biz.funnel.pipeline_title", { days })}</p>
        <ul className="space-y-2">
          {chartData.map((d) => {
            const max = chartData[0].value || 1;
            const pct = d.value > 0 ? Math.max(2, Math.round((d.value / max) * 100)) : 0;
            return (
              <li key={d.name} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2 text-sm sm:grid-cols-[10rem_1fr_auto]">
                <span className="truncate text-muted-foreground">{d.name}</span>
                <span className="h-3 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: d.fill }} />
                </span>
                <span className="w-12 text-right font-semibold tabular-nums">{d.value.toLocaleString()}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stages.slice(1).map((s) => {
          const value = (data as any)[s.key] ?? 0;
          const prev = (data as any)[stages[stages.indexOf(s) - 1].key] ?? 0;
          const rate = prev > 0 ? Math.round((value / prev) * 100) : 0;
          return (
            <div key={s.key} className="rounded-2xl border border-border/70 bg-card p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {s.label}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
              {rate > 0 && <p className="text-xs text-muted-foreground">{t("biz.funnel.of_previous", { rate })}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
