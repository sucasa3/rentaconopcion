/** Pure Discovery status helpers: distinguishes "nothing qualifies" from "not processed yet" and "failed". */
export type DiscoveryProcessing = { awaiting: number; needsReview: number; done: number };

export function summarizeDiscoveryProcessing(rows: { status: string }[]): DiscoveryProcessing {
  const out = { awaiting: 0, needsReview: 0, done: 0 };
  for (const r of rows) {
    if (r.status === "pending" || r.status === "processing" || r.status === "running") out.awaiting++;
    else if (r.status === "needs_review" || r.status === "failed") out.needsReview++;
    else if (r.status === "done" || r.status === "skipped") out.done++;
  }
  return out;
}

export type EmptyState = "failed" | "processing" | "no_results" | "before_upload";

/** What to say when no findings are shown. Findings that exist are always shown regardless. */
export function discoveryEmptyState(i: { signalsFailed: boolean; awaiting: number; hasRun: boolean; active: number }): EmptyState {
  if (i.signalsFailed) return "failed";
  if (i.awaiting > 0) return "processing";
  return i.hasRun || i.active > 0 ? "no_results" : "before_upload";
}
