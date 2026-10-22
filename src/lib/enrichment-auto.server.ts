/**
 * Automatic enrichment for one manually added homeowner.
 *
 * An agent adding a single homeowner by hand should see property intelligence
 * appear without an operator releasing anything. This module is the ONLY
 * automatic grant-creating path, and it is deliberately narrow:
 *
 *   - one queue job, one self-expiring release grant, at most ONE paid
 *     provider dispatch — the grant machinery (per-grant cap, one dispatch
 *     per address, book scoping) does the enforcing;
 *   - cache-first: an address with fresh records completes without a call;
 *   - stopped by the same monthly budget envelope as the background worker
 *     (cache-only mode / soft cap → the job stays queued, no grant);
 *   - a per-book monthly ceiling on automatic grants, so a scripted add loop
 *     cannot drain the allowance;
 *   - bulk uploads never come through here — they stay on the explicitly
 *     approved release path.
 *
 * Server-only.
 */

import { backgroundSpend, runEnrichmentTick } from "./enrichment.server";

export type AutoEnrichStatus = "enriched" | "cached" | "no_match" | "queued" | "failed";

/** Automatic grants one book may create in a calendar month. */
export const AUTO_GRANT_MONTHLY_CAP = 50;

export async function autoEnrichNewClient(
  supabaseAdmin: any,
  opts: { clientId: string; portfolioId: string; actorUserId: string },
): Promise<{ status: AutoEnrichStatus; jobId: string | null }> {
  // 1. Queue the job (idempotent per client — a re-add reuses the row).
  const { data: existing } = await supabaseAdmin
    .from("property_enrichment_queue")
    .select("id, status, last_result")
    .eq("portfolio_client_id", opts.clientId)
    .maybeSingle();

  let jobId: string | null = existing?.id ?? null;
  if (!jobId) {
    const { data: job, error } = await supabaseAdmin
      .from("property_enrichment_queue")
      .insert({
        portfolio_client_id: opts.clientId,
        portfolio_id: opts.portfolioId,
        priority: 1,
      })
      .select("id")
      .single();
    if (error) return { status: "queued", jobId: null };
    jobId = job.id as string;
  } else if (existing.status === "done") {
    // Already enriched previously — nothing to do, no call.
    return { status: existing.last_result === "cache" ? "cached" : "enriched", jobId };
  }

  // 2. Budget envelope: cache-only mode or soft cap reached → stay queued.
  const spend = await backgroundSpend(supabaseAdmin);
  if (spend.cacheOnly || spend.used >= spend.allowed) {
    return { status: "queued", jobId };
  }

  // 3. Per-book monthly ceiling on automatic grants.
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count: grantsThisMonth } = await supabaseAdmin
    .from("enrichment_release_grants")
    .select("id", { count: "exact", head: true })
    .eq("portfolio_id", opts.portfolioId)
    .like("approved_by", "auto:manual-add:%")
    .gte("created_at", monthStart.toISOString());
  if ((grantsThisMonth ?? 0) >= AUTO_GRANT_MONTHLY_CAP) {
    return { status: "queued", jobId };
  }

  // 4. One self-expiring grant, one dispatch max, this book and job only.
  const { error: grantError } = await supabaseAdmin.from("enrichment_release_grants").insert({
    portfolio_id: opts.portfolioId,
    job_ids: [jobId],
    max_dispatches: 1,
    approved_by: `auto:manual-add:${opts.actorUserId}`,
    approval_note: "Automatic enrichment of one manually added homeowner (cache-first, one lookup max).",
    expires_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
  });
  if (grantError) return { status: "queued", jobId };

  // 5. Run the worker until this job resolves (it may claim other books'
  //    already-authorized grants first — their spend stays their own).
  for (let i = 0; i < 3; i += 1) {
    const { data: j } = await supabaseAdmin
      .from("property_enrichment_queue")
      .select("status, last_result")
      .eq("id", jobId)
      .maybeSingle();
    if (!j || (j.status !== "pending" && j.status !== "running")) {
      return { status: mapResult(j?.status, j?.last_result), jobId };
    }
    try {
      await runEnrichmentTick({ batchSize: 1 });
    } catch {
      return { status: "queued", jobId };
    }
  }

  const { data: finalJob } = await supabaseAdmin
    .from("property_enrichment_queue")
    .select("status, last_result")
    .eq("id", jobId)
    .maybeSingle();
  return { status: mapResult(finalJob?.status, finalJob?.last_result), jobId };
}

function mapResult(status: string | null | undefined, lastResult: string | null | undefined): AutoEnrichStatus {
  if (status === "done") {
    return lastResult === "cache" || lastResult === "cache_partial" || lastResult === "shared_profile"
      ? "cached"
      : "enriched";
  }
  if (status === "needs_review") return "no_match";
  if (status === "failed") return "failed";
  return "queued";
}
