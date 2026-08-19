import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Gift, Sparkles, TrendingUp, Users } from "lucide-react";
import { getAgentCredits, requestAgentPlan } from "@/lib/credits.functions";
import { AGENT_PLANS, CREDIT_RULES, computeSuCasaScore } from "@/lib/credits";
import { ScoreRing, SectionHeader, StatCard } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * Capacity is the currency. This card answers three questions at a glance:
 * how many homeowners can I still add, how do I earn more, and what does
 * unlocking more cost.
 */
export function AgentCreditsCard({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const creditsFn = useServerFn(getAgentCredits);
  const requestFn = useServerFn(requestAgentPlan);

  const { data, isLoading } = useQuery({
    queryKey: ["agent-credits", orgId],
    queryFn: () => creditsFn({ data: { orgId } }),
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const upgrade = useMutation({
    mutationFn: (planKey: "agent_plus" | "agent_pro") =>
      requestFn({ data: { orgId, planKey } }),
    onSuccess: () => {
      toast.success("We'll be in touch to unlock your extra homeowner connections.");
      void qc.invalidateQueries({ queryKey: ["agent-credits", orgId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not record that request"),
  });

  const score = useMemo(
    () =>
      computeSuCasaScore(
        data?.stats ?? {
          clients: 0,
          activated: 0,
          profilesComplete: 0,
          opportunities: 0,
          engagedLast30d: 0,
        },
      ),
    [data?.stats],
  );

  if (isLoading || !data) {
    return <div className="h-40 animate-pulse rounded-3xl border border-border/70 bg-muted/40" />;
  }

  const b = data.balance;
  const requested = (data.plan as any)?.requested_plan_key as string | null;
  const sponsorCredits = (data.seats ?? []).reduce(
    (n: number, s: any) => n + (s.credits_granted ?? 0),
    0,
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Homeowners left"
          value={b.remaining}
          tone={b.remaining > 0 ? "growth" : "attention"}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Earned this month"
          value={data.month.total}
          tone="info"
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft">
        <div className="flex items-center gap-4">
          <ScoreRing value={score.score} label="SuCasa Score" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{score.headline}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {b.granted} granted{sponsorCredits > 0 ? ` (${sponsorCredits} sponsored)` : ""} ·{" "}
              {b.earned} earned · {b.spent} used
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {score.parts.map((p) => (
            <div key={p.label} className="flex items-center gap-3">
              <span className="w-40 shrink-0 text-xs text-muted-foreground">{p.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-growth"
                  style={{ width: `${Math.round((p.value / p.max) * 100)}%` }}
                />
              </div>
              <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                {p.value}/{p.max}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft">
        <SectionHeader title="Ways to earn credits" />
        <ul className="mt-3 space-y-2.5">
          {CREDIT_RULES.map((r) => (
            <li key={r.kind} className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-6 shrink-0 items-center rounded-full bg-growth/12 px-2 text-xs font-semibold text-growth tabular-nums">
                +{r.credits}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{r.label}</span>
                <span className="block text-xs text-muted-foreground">{r.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <SectionHeader title="Need more homeowners?" />
        {AGENT_PLANS.filter((p) => p.priceMonthly > 0).map((p) => {
          const pending = requested === p.key;
          return (
            <div
              key={p.key}
              className={cn(
                "rounded-3xl border p-4 shadow-soft",
                pending ? "border-growth/50 bg-growth/6" : "border-border/70 bg-card",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{p.headline}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    ${p.priceMonthly}/mo · {p.name}
                  </p>
                </div>
                <Sparkles className="h-4 w-4 shrink-0 text-growth" />
              </div>
              <ul className="mt-3 space-y-1">
                {p.features.map((f) => (
                  <li key={f} className="text-xs text-muted-foreground">
                    · {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={pending || upgrade.isPending}
                onClick={() => upgrade.mutate(p.key as "agent_plus" | "agent_pro")}
                className="mt-3 w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {pending ? "Requested — we'll reach out" : `Unlock ${p.credits} more homeowners`}
              </button>
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft">
        <SectionHeader title="Credit history" />
        <ul className="mt-3 divide-y divide-border/60">
          {(data.history ?? []).slice(0, 12).map((h: any) => (
            <li key={h.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-sm">{h.reason}</span>
              <span
                className={cn(
                  "shrink-0 text-sm font-semibold tabular-nums",
                  h.delta > 0 ? "text-growth" : "text-muted-foreground",
                )}
              >
                {h.delta > 0 ? `+${h.delta}` : h.delta}
              </span>
            </li>
          ))}
          {(data.history ?? []).length === 0 && (
            <li className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Gift className="h-4 w-4" /> Your starting credits will appear here.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
