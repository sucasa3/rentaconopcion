/**
 * The one comparison rate behind every savings figure on a lender screen.
 *
 * By default it is the published weekly market average, kept current
 * automatically. A lender can set their own scenario rate instead — that rate
 * is labelled, dated, and after a week we ask them to confirm it rather than
 * quietly quoting an old assumption or silently swapping in another number.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Pencil } from "lucide-react";
import { setScenarioRate, clearScenarioRate } from "@/lib/market-rate.functions";
import { asOfLabel } from "@/lib/market-rate";
import { cn } from "@/lib/utils";

type Summary = {
  benchmark_rate?: number | null;
  benchmark_label?: string | null;
  benchmark_source?: string | null;
  benchmark_as_of?: string | null;
  benchmark_kind?: string | null;
  benchmark_stale?: boolean | null;
  benchmark_market_rate?: number | null;
};

export function ComparisonRate({
  orgId,
  summary,
  className,
}: {
  orgId: string;
  summary: Summary;
  className?: string;
}) {
  const qc = useQueryClient();
  const setFn = useServerFn(setScenarioRate);
  const clearFn = useServerFn(clearScenarioRate);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(summary.benchmark_rate ?? ""));
  const [label, setLabel] = useState(summary.benchmark_label ?? "");

  const refresh = () => qc.invalidateQueries({ queryKey: ["lender-portfolio"] });

  const save = useMutation({
    mutationFn: () =>
      setFn({
        data: { orgId, ratePct: Number(value), label: label.trim() || undefined },
      }),
    onSuccess: () => {
      setEditing(false);
      refresh();
      toast.success("Comparison rate updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save that rate"),
  });

  const reset = useMutation({
    mutationFn: () => clearFn({ data: { orgId } }),
    onSuccess: () => {
      setEditing(false);
      refresh();
      toast.success("Back to the market rate");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not reset the rate"),
  });

  const rate = summary.benchmark_rate;
  const isScenario = summary.benchmark_kind === "lender_scenario";
  const stale = isScenario && !!summary.benchmark_stale;

  if (rate == null) {
    return (
      <p className={cn("text-xs text-attention-foreground", className)}>
        No verified market rate on file — savings comparisons are paused until the weekly rate
        updates.
      </p>
    );
  }

  if (editing) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2 text-xs", className)}>
        <input
          type="number"
          step="0.125"
          min={2}
          max={15}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-20 rounded-full border border-border bg-background px-3 py-1 text-right text-sm"
          aria-label="Your comparison rate"
        />
        <input
          value={label}
          maxLength={40}
          placeholder="Label (e.g. FHA scenario)"
          onChange={(e) => setLabel(e.target.value)}
          className="w-44 rounded-full border border-border bg-background px-3 py-1 text-sm"
          aria-label="Rate label"
        />
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || !Number(value)}
          className="rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground disabled:opacity-50"
        >
          Save
        </button>
        {isScenario && (
          <button
            onClick={() => reset.mutate()}
            disabled={reset.isPending}
            className="rounded-full border border-border px-3 py-1"
          >
            Use market rate
          </button>
        )}
        <button onClick={() => setEditing(false)} className="px-2 py-1 text-muted-foreground">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className={cn("text-xs text-muted-foreground", className)}>
      <button
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 hover:bg-secondary"
      >
        <span className="font-semibold text-foreground">{rate.toFixed(2)}%</span>
        <span>{isScenario ? (summary.benchmark_label ?? "your rate") : "market rate"}</span>
        <Pencil className="h-3 w-3" aria-hidden />
      </button>
      <p className="mt-1">
        {isScenario
          ? `Set by your team ${asOfLabel(summary.benchmark_as_of).replace("as of ", "")}`
          : `${summary.benchmark_source} · ${asOfLabel(summary.benchmark_as_of)}`}
      </p>
      {stale && (
        <p className="mt-1 inline-flex items-center gap-1 font-medium text-attention-foreground">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          Set over a week ago — confirm or update it. Market rate today is{" "}
          {summary.benchmark_market_rate?.toFixed(2)}%.
        </p>
      )}
    </div>
  );
}
