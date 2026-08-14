import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, PlayCircle, RefreshCw, ListPlus } from "lucide-react";
import { toast } from "sonner";
import {
  getEnrichmentCoverage,
  queuePortfolioEnrichment,
  runEnrichmentBatch,
} from "@/lib/enrichment.functions";

/**
 * Background records queue at a glance: how many homes are covered, how many
 * are waiting, and how many need an address fix. Pulls run automatically in
 * small batches; the buttons here just let a partner nudge their own book.
 */
export function EnrichmentQueueStrip({ portfolioId }: { portfolioId: string }) {
  const coverageFn = useServerFn(getEnrichmentCoverage);
  const queueFn = useServerFn(queuePortfolioEnrichment);
  const runFn = useServerFn(runEnrichmentBatch);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<null | "queue" | "run">(null);

  const { data } = useQuery({
    queryKey: ["enrichment-coverage", portfolioId],
    queryFn: () => coverageFn({ data: { portfolioId } }),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["enrichment-coverage", portfolioId] });
    await queryClient.invalidateQueries({ queryKey: ["agent-coverage", portfolioId] });
  }

  async function handleQueue() {
    setBusy("queue");
    try {
      const res = await queueFn({ data: { portfolioId, retryFailed: true } });
      toast.success(`${res.queued} ${res.queued === 1 ? "home" : "homes"} queued for a records pass`);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleRun() {
    setBusy("run");
    try {
      const res = await runFn({ data: { portfolioId, batchSize: 10 } });
      if (res.paused === "cache_only" || res.paused === "background_cap") {
        toast.info("Background pulls are paused for this month — cached records are still served.");
      } else if (res.paused === "empty_queue") {
        toast.info("Nothing waiting in the queue.");
      } else {
        toast.success(
          `${res.completed} updated (${res.cachedOnly} from cache)${res.needsReview ? ` · ${res.needsReview} need review` : ""}`,
        );
      }
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const total = data?.total ?? 0;
  const covered = data?.covered ?? 0;
  const pct = total ? Math.round((covered / total) * 100) : 0;

  return (
    <div className="mb-3 rounded-xl border border-border bg-secondary/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold">Records queue</p>
          <p className="text-[11px] text-muted-foreground">
            {covered}/{total} homes have records ({pct}%)
            {data?.queued ? ` · ${data.queued} waiting` : ""}
            {data?.needsReview ? ` · ${data.needsReview} need an address fix` : ""}
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={handleQueue}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-50"
          >
            {busy === "queue" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ListPlus className="h-3 w-3" />
            )}
            Queue all
          </button>
          <button
            onClick={handleRun}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-50"
          >
            {busy === "run" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <PlayCircle className="h-3 w-3" />
            )}
            Run a batch
          </button>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1.5 text-[11px] text-muted-foreground"
            aria-label="Refresh queue status"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>

      {data?.reviewList?.length ? (
        <ul className="mt-2 space-y-1 border-t border-border pt-2">
          {data.reviewList.slice(0, 4).map((r) => (
            <li key={r.id} className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">{r.name ?? "Client"}</span>{" "}
              — {r.reason ?? "Needs review"}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
