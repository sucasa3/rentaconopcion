import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Check, Sparkles, X } from "lucide-react";
import { listHomeIntel, updatePredictedAction } from "@/lib/documents-intel.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Action = {
  id: string;
  title: string;
  why: string | null;
  service_category: string | null;
  urgency: string;
  due_by: string | null;
  est_cost_low_cents: number | null;
  est_cost_high_cents: number | null;
  status: string;
};

const URGENCY_LABEL: Record<string, string> = {
  immediate: "Do now",
  "12_months": "This year",
  "1_3_years": "Next few years",
  monitor: "Keep an eye on it",
};

const DOT: Record<string, string> = {
  immediate: "bg-destructive",
  "12_months": "bg-amber-500",
  "1_3_years": "bg-primary",
  monitor: "bg-muted-foreground",
};

function costRange(low: number | null, high: number | null): string | null {
  if (low == null && high == null) return null;
  const f = (c: number) => `$${Math.round(c / 100).toLocaleString()}`;
  if (low != null && high != null) return `${f(low)}–${f(high)}`;
  return f((low ?? high) as number);
}

/**
 * "What your documents say you'll need" — the homeowner-facing output of the
 * document AI. Plain language, one line of reasoning, one tap to act.
 */
export function PredictedActionsCard({ limit = 4 }: { limit?: number }) {
  const qc = useQueryClient();
  const update = useServerFn(updatePredictedAction);

  const { data, isLoading } = useQuery({
    queryKey: ["home-intel"],
    queryFn: () => listHomeIntel() as Promise<{ actions: Action[]; facts: any[] }>,
  });

  const mutate = useMutation({
    mutationFn: (v: { id: string; status: "done" | "dismissed" }) => update({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["home-intel"] }),
  });

  const open = (data?.actions ?? []).filter((a) => a.status === "open");

  if (isLoading || open.length === 0) return null;

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold">What your documents say you'll need</h2>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        We read your uploaded reports, policies, warranties and permits, and turned them into a
        plain-English to-do list.
      </p>

      <ul className="space-y-2">
        {open.slice(0, limit).map((a) => {
          const cost = costRange(a.est_cost_low_cents, a.est_cost_high_cents);
          return (
            <li key={a.id} className="rounded-xl border p-3">
              <div className="flex items-start gap-2">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[a.urgency] ?? DOT.monitor}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{a.title}</p>
                  {a.why && <p className="mt-0.5 text-xs text-muted-foreground">{a.why}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <Badge variant="secondary">{URGENCY_LABEL[a.urgency] ?? "Plan ahead"}</Badge>
                    {cost && <span className="text-muted-foreground">Typically {cost}</span>}
                    {a.due_by && (
                      <span className="text-muted-foreground">
                        by {new Date(a.due_by).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {a.service_category && (
                  <Button asChild size="sm" className="h-8">
                    <Link to="/request" search={{ category: a.service_category } as any}>
                      Get this done
                    </Link>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => mutate.mutate({ id: a.id, status: "done" })}
                >
                  <Check className="mr-1 h-3.5 w-3.5" /> Already done
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-muted-foreground"
                  onClick={() => mutate.mutate({ id: a.id, status: "dismissed" })}
                >
                  <X className="mr-1 h-3.5 w-3.5" /> Not for me
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {open.length > limit && (
        <p className="mt-2 text-xs text-muted-foreground">
          +{open.length - limit} more in your home plan.
        </p>
      )}
    </section>
  );
}
