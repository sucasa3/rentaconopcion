import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Check, Sparkles, X } from "lucide-react";
import { listHomeIntel, updatePredictedAction } from "@/lib/documents-intel.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n";

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
  source_filename?: string | null;
  inspection_date?: string | null;
  source_pages?: number[] | null;
  needs_confirmation?: boolean | null;
  urgency_specified?: boolean | null;
};


const DOT: Record<string, string> = {
  immediate: "bg-destructive",
  "12_months": "bg-status-attention",
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
  const t = useT();
  const update = useServerFn(updatePredictedAction);

  const { data, isLoading } = useQuery({
    queryKey: ["home-predicted-actions"],
    queryFn: () => listHomeIntel() as Promise<{ actions: Action[]; facts: any[] }>,
  });

  const mutate = useMutation({
    mutationFn: (v: { id: string; status: "done" | "dismissed" }) => update({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["home-predicted-actions"] }),
  });

  const open = (data?.actions ?? []).filter((a) => a.status === "open");

  if (isLoading || open.length === 0) return null;

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold">{t("pa.title")}</h2>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        {t("pa.sub")}
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
                  {a.source_filename && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {t("mp.from_report", {
                        file: a.source_filename,
                        date: a.inspection_date ?? "—",
                        pages: a.source_pages?.length ? ` · ${t("mp.page", { pages: a.source_pages.join(", ") })}` : "",
                      })}
                    </p>
                  )}
                  {a.needs_confirmation && (
                    <p className="mt-0.5 text-[11px] font-medium text-status-attention">{t("mp.confirm")}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <Badge variant="secondary">{a.urgency_specified === false ? t("pa.u.none") : t(`pa.u.${a.urgency}`)}</Badge>
                    {cost && <span className="text-muted-foreground">{t("pa.cost", { cost })}</span>}
                    {a.due_by && (
                      <span className="text-muted-foreground">
                        {t("pa.by", { date: new Date(a.due_by).toLocaleDateString(t("pa.locale"), { month: "short", year: "numeric" }) })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {a.service_category && (
                  <Button asChild size="sm" className="h-8">
                    <Link to="/request" search={{ category: a.service_category } as any}>
                      {t("pa.do")}
                    </Link>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => mutate.mutate({ id: a.id, status: "done" })}
                >
                  <Check className="mr-1 h-3.5 w-3.5" /> {t("pa.done")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-muted-foreground"
                  onClick={() => mutate.mutate({ id: a.id, status: "dismissed" })}
                >
                  <X className="mr-1 h-3.5 w-3.5" /> {t("pa.dismiss")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {open.length > limit && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("pa.more", { n: open.length - limit })}
        </p>
      )}
    </section>
  );
}
