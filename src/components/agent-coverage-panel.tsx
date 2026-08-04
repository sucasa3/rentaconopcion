import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPortfolioCoverage, retryPortfolioPulls } from "@/lib/agent.functions";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, Loader2, MinusCircle, RefreshCw, XCircle } from "lucide-react";

type Filter = "all" | "complete" | "partial" | "missing" | "no_address";

const STATUS_META: Record<string, { label: string; tone: string }> = {
  complete: { label: "Complete", tone: "bg-growth/15 text-growth border-growth/40" },
  partial: { label: "Partial", tone: "bg-amber-500/10 text-amber-700 border-amber-500/40" },
  missing: { label: "Not pulled", tone: "bg-secondary text-muted-foreground border-border" },
  no_address: { label: "No address", tone: "bg-destructive/10 text-destructive border-destructive/30" },
};

function when(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const rel = days <= 0 ? "today" : days === 1 ? "1d ago" : `${days}d ago`;
  return `${d.toLocaleDateString()} · ${rel}`;
}

function Dot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] ${ok ? "text-growth" : "text-muted-foreground"}`}
      title={`${label}: ${ok ? "present" : "missing"}`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <MinusCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}

export function AgentCoveragePanel({ portfolioId }: { portfolioId: string }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [retrying, setRetrying] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const coverageFn = useServerFn(getPortfolioCoverage);
  const retryFn = useServerFn(retryPortfolioPulls);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["agent-coverage", portfolioId],
    queryFn: () => coverageFn({ data: { portfolioId } }) as any,
    enabled: open,
  });

  async function handleRetry() {
    setRetrying(true);
    setProgress("Retrying pulls…");
    let done = 0;
    let failed = 0;
    try {
      for (let pass = 0; pass < 20; pass += 1) {
        const res: any = await retryFn({ data: { portfolioId, limit: 25 } });
        done += res.retried ?? 0;
        failed += res.failed ?? 0;
        setProgress(`Retried ${done} · ${res.remaining} left`);
        if (!res.remaining || (!res.retried && !res.failed)) break;
      }
      toast.success(`Retried ${done} ${done === 1 ? "home" : "homes"}${failed ? ` · ${failed} failed` : ""}`);
      await queryClient.invalidateQueries({ queryKey: ["agent-coverage", portfolioId] });
      await queryClient.invalidateQueries({ queryKey: ["agent-portfolio", portfolioId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRetrying(false);
      setProgress(null);
    }
  }

  const rows = useMemo(() => {
    const items = (data?.items ?? []) as any[];
    const filtered = filter === "all" ? items : items.filter((i) => i.status === filter);
    const rank: Record<string, number> = { missing: 0, partial: 1, no_address: 2, complete: 3 };
    return [...filtered].sort(
      (a, b) => rank[a.status] - rank[b.status] || String(a.name).localeCompare(String(b.name)),
    );
  }, [data, filter]);

  return (
    <section className="rounded-2xl border border-border bg-card shadow-soft">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Records coverage</h2>
          <p className="text-xs text-muted-foreground">
            Per-home pull status for value, property detail and mortgage — plus last pull time.
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3">
          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Checking coverage…
            </p>
          ) : error ? (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          ) : data ? (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                {(
                  [
                    ["all", `All ${data.counts.total}`],
                    ["complete", `Complete ${data.counts.complete}`],
                    ["partial", `Partial ${data.counts.partial}`],
                    ["missing", `Not pulled ${data.counts.missing}`],
                    ["no_address", `No address ${data.counts.no_address}`],
                  ] as Array<[Filter, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                      filter === key
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:border-primary"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="max-h-[420px] overflow-auto rounded-xl border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-secondary/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Household</th>
                      <th className="px-3 py-2 font-medium">Data present</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Last pull</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-border align-top">
                        <td className="px-3 py-2">
                          <p className="font-medium">{r.name || "Unnamed"}</p>
                          <p className="text-xs text-muted-foreground">{r.address}</p>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            <Dot ok={r.hasValue} label="Value" />
                            <Dot ok={r.hasEquity} label="Equity" />
                            <Dot ok={r.hasMortgage} label="Mortgage" />
                            <Dot ok={r.hasDetail} label="Detail" />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_META[r.status].tone}`}
                          >
                            {r.status === "no_address" ? <XCircle className="h-3 w-3" /> : null}
                            {STATUS_META[r.status].label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {when(r.lastPulledAt)}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                          Nothing in this bucket.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Equity needs both a value and a mortgage record. Homes marked “No address” need a
                street address before records can be pulled.
              </p>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
