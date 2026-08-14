import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, PlayCircle, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  getEnrichmentCoverage,
  queuePortfolioEnrichment,
  runEnrichmentBatch,
} from "@/lib/enrichment.functions";

/**
 * Live status of the automatic records engine for one book.
 *
 * Homes are queued automatically on import and drained continuously in the
 * background; this strip just reports progress and lets a partner nudge or
 * re-queue their own book.
 */
export function EnrichmentQueueStrip({ portfolioId }: { portfolioId: string }) {
  const coverageFn = useServerFn(getEnrichmentCoverage);
  const queueFn = useServerFn(queuePortfolioEnrichment);
  const runFn = useServerFn(runEnrichmentBatch);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<null | "queue" | "run">(null);
  const autoQueued = useRef(false);

  const { data } = useQuery({
    queryKey: ["enrichment-coverage", portfolioId],
    queryFn: () => coverageFn({ data: { portfolioId } }),
    // Poll while the engine still has work in this book.
    refetchInterval: (q) => ((q.state.data as any)?.working ? 5000 : false),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["enrichment-coverage", portfolioId] });
    await queryClient.invalidateQueries({ queryKey: ["agent-coverage", portfolioId] });
  }

  const total = data?.total ?? 0;
  const covered = data?.covered ?? 0;
  const needsReview = data?.needsReview ?? 0;
  const queued = data?.queued ?? 0;
  const untracked = Math.max(0, total - covered - needsReview - queued);
  const pct = data?.pctComplete ?? 0;

  // Homes that were added before the engine existed (or never queued) get
  // enrolled automatically, once per mount.
  useEffect(() => {
    if (!data || autoQueued.current || untracked <= 0) return;
    autoQueued.current = true;
    void (async () => {
      try {
        await queueFn({ data: { portfolioId, retryFailed: false } });
        await refresh();
      } catch {
        /* enrolling is best-effort */
      }
    })();
  }, [data, untracked, portfolioId]);

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
      const res = await runFn({ data: { portfolioId, batchSize: 25 } });
      if (res.paused === "cache_only" || res.paused === "background_cap") {
        toast.info("Background pulls are paused for this month — cached records are still served.");
      } else if (res.paused === "empty_queue") {
        toast.info("Nothing waiting in the queue.");
      } else {
        toast.success(
          `${res.completed} updated (${res.cachedOnly} already on file)${res.needsReview ? ` · ${res.needsReview} need review` : ""}`,
        );
      }
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-3 rounded-xl border border-border bg-secondary/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            {data?.working ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-primary" /> Filling in property
                records…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3 w-3 text-growth" /> Property records up to date
              </>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {covered}/{total} homes have records ({pct}%)
            {queued ? ` · ${queued} in progress` : ""}
            {needsReview ? ` · ${needsReview} need an address fix` : ""}
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={handleQueue}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-50"
          >
            {busy === "queue" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Retry skipped
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
            Speed up
          </button>
        </div>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
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
