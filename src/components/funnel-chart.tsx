import type { ReactNode } from "react";
import { Funnel, FunnelChart, LabelList, ResponsiveContainer, Tooltip, Cell } from "recharts";
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

const stages = [
  { key: "homeowners", label: "Homeowners", color: "var(--primary)" },
  { key: "opportunities", label: "Opportunities", color: "var(--info)" },
  { key: "contacted", label: "Contacted", color: "var(--attention)" },
  { key: "engaged", label: "Engaged", color: "var(--growth)" },
  { key: "conversations", label: "Conversations", color: "var(--growth)" },
  { key: "appointments", label: "Appointments", color: "var(--growth)" },
  { key: "applications", label: "Applications", color: "var(--growth)" },
  { key: "closed", label: "Closed", color: "var(--growth)" },
] as const;

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
  if (!data) {
    return (
      <div className="rounded-3xl border border-dashed border-border p-8 text-center">
        <p className="font-semibold">No funnel data yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Activity will appear as soon as outreach and outcomes are logged.
        </p>
      </div>
    );
  }

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
        <MetricCard label="Closed value" value={formatCents(closedValue)} tone="growth" />
        <MetricCard
          label="SuCasa cost"
          value={formatCents(costCents)}
          tone={costCents > 0 ? "attention" : "default"}
        />
        <MetricCard label="ROI" value={`${roi}%`} tone={roi >= 100 ? "growth" : "default"} />
        <MetricCard label="Closed" value={data.closed} tone="default" />
      </div>

      <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft">
        <p className="mb-2 text-sm font-medium">Pipeline — last {days} days</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <FunnelChart>
              <Tooltip
                contentStyle={{
                  borderRadius: 16,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                }}
              />
              <Funnel dataKey="value" data={chartData} isAnimationActive={false}>
                <LabelList position="inside" fill="#fff" stroke="none" dataKey="name" />
                <LabelList position="right" fill="currentColor" stroke="none" dataKey="value" />
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.fill} />
                ))}
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </div>
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
              {rate > 0 && <p className="text-xs text-muted-foreground">{rate}% of previous</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
