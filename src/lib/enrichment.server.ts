/**
 * Background property-record enrichment worker.
 *
 * Drains `property_enrichment_queue` in small batches with hard guardrails so
 * we can never burn the monthly records allowance:
 *
 *   - Cached-first: a client whose address already has fresh records for every
 *     needed class is completed without a single outbound call.
 *   - Class-level: only the classes actually missing/expired are requested.
 *   - Address hygiene: unusable addresses are parked as `needs_review` instead
 *     of being retried forever.
 *   - Budget envelope: background work stops at its own share of the monthly
 *     allowance, leaving headroom for on-demand user requests.
 *
 * Server-only. Callers: the cron route `/api/public/enrich/tick` and the
 * admin/manual server functions in `enrichment.functions.ts`.
 */

import { ATTOM_TTL_DAYS, normalizeAddress, type AttomEndpoint } from "./attom.server";
import { persistPortfolioOpportunities } from "./opportunities.server";
import { verifyAddress } from "./geocode.server";

/** Share of the monthly allowance background work is allowed to consume. */
export const BACKGROUND_BUDGET_PCT = 70;

/**
 * Core records we want for every client in a book, cheapest-identity-first.
 * Mortgage is included only when the provider has confirmed entitlement (see
 * `attom_endpoint_health`). Assessor/tax, owner and sale history are
 * conditional — pulled only when a specific fact can't be filled without them.
 */
export const DEFAULT_CLASSES: AttomEndpoint[] = ["detail", "avm", "permits", "mortgage"];

/** Record classes currently switched on for our account. */
async function enabledClasses(supabaseAdmin: any): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from("attom_endpoint_health")
    .select("endpoint, enabled");
  const off = new Set((data ?? []).filter((r: any) => !r.enabled).map((r: any) => r.endpoint));
  return new Set(Object.keys(ATTOM_TTL_DAYS).filter((c) => !off.has(c)));
}

/** Rows stuck mid-flight (worker died / timed out) go back on the queue. */
async function reapStuck(supabaseAdmin: any): Promise<void> {
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  await supabaseAdmin
    .from("property_enrichment_queue")
    .update({ status: "pending", started_at: null })
    .eq("status", "running")
    .lt("started_at", cutoff);
}

const MAX_ATTEMPTS = 2;


export interface EnrichTickResult {
  processed: number;
  completed: number;
  cachedOnly: number;
  needsReview: number;
  retried: number;
  spentCalls: number;
  paused: null | "cache_only" | "background_cap" | "empty_queue";
  portfoliosRecomputed: number;
}

function fullAddress(c: {
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}): string {
  return [c.address_line1, c.city, [c.state, c.zip].filter(Boolean).join(" ")]
    .filter((p) => p && String(p).trim())
    .join(", ");
}

/** A street line alone can never be matched — don't spend a lookup on it. */
function addressUsable(c: {
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}): boolean {
  if (!c.address_line1 || !c.address_line1.trim()) return false;
  return Boolean((c.city && c.state) || c.zip);
}

function ttlOk(fetchedAt: string | null | undefined, cls: AttomEndpoint): boolean {
  if (!fetchedAt) return false;
  return Date.now() - new Date(fetchedAt).getTime() < ATTOM_TTL_DAYS[cls] * 86_400_000;
}

/** Which of the wanted classes are missing or expired for this address. */
async function missingClasses(
  supabaseAdmin: any,
  address: string,
  wanted: AttomEndpoint[],
): Promise<{ missing: AttomEndpoint[]; hasRow: boolean }> {
  const normalized = normalizeAddress(address);
  const { data: row } = await supabaseAdmin
    .from("property_intel")
    .select("*")
    .eq("address_normalized", normalized)
    .maybeSingle();
  if (!row) return { missing: [...wanted], hasRow: false };

  const missing = wanted.filter(
    (cls) => !row[cls] || !ttlOk(row[`${cls}_fetched_at`] as string | null, cls),
  );
  return { missing, hasRow: true };
}

/**
 * Bump activated / recently-active clients to the front of the queue.
 * Activated = linked homeowner account. Active = homeowner activity in 30d.
 */
async function reprioritize(supabaseAdmin: any): Promise<void> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: events } = await supabaseAdmin
    .from("homeowner_activity_events")
    .select("homeowner_id")
    .gte("occurred_at", since)
    .limit(2000);
  const activeIds = [...new Set((events ?? []).map((e: any) => e.homeowner_id))].filter(Boolean);
  if (!activeIds.length) return;

  const { data: clients } = await supabaseAdmin
    .from("lender_portfolio_clients")
    .select("id")
    .in("homeowner_id", activeIds.slice(0, 500));
  const ids = (clients ?? []).map((c: any) => c.id);
  if (!ids.length) return;

  await supabaseAdmin
    .from("property_enrichment_queue")
    .update({ priority: 5 })
    .in("portfolio_client_id", ids)
    .eq("status", "pending")
    .gt("priority", 5);
}

/** Background share of this month's allowance already consumed. */
async function backgroundSpend(
  supabaseAdmin: any,
): Promise<{ used: number; included: number; cacheOnly: boolean; allowed: number }> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { data: budget } = await supabaseAdmin
    .from("attom_monthly_budget")
    .select("tier_calls_included, calls_used, soft_cap_pct, cache_only_mode")
    .eq("month", monthStart.toISOString().slice(0, 10))
    .maybeSingle();

  const included = budget?.tier_calls_included ?? 5000;
  const softCapPct = budget?.soft_cap_pct ?? 80;
  const cacheOnly =
    Boolean(budget?.cache_only_mode) ||
    ((budget?.calls_used ?? 0) / included) * 100 >= softCapPct;

  const { count } = await supabaseAdmin
    .from("attom_call_log")
    .select("id", { count: "exact", head: true })
    .eq("cache_hit", false)
    .like("revenue_source", "background_enrichment%")
    .gte("created_at", monthStart.toISOString());

  const allowed = Math.floor((BACKGROUND_BUDGET_PCT / 100) * included);
  return { used: count ?? 0, included, cacheOnly, allowed };
}

export async function runEnrichmentTick(opts?: {
  batchSize?: number;
}): Promise<EnrichTickResult> {
  const batchSize = Math.min(25, Math.max(1, opts?.batchSize ?? 10));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const out: EnrichTickResult = {
    processed: 0,
    completed: 0,
    cachedOnly: 0,
    needsReview: 0,
    retried: 0,
    spentCalls: 0,
    paused: null,
    portfoliosRecomputed: 0,
  };

  const spend = await backgroundSpend(supabaseAdmin);
  if (spend.cacheOnly) {
    out.paused = "cache_only";
    return out;
  }
  if (spend.used >= spend.allowed) {
    out.paused = "background_cap";
    return out;
  }

  await reprioritize(supabaseAdmin);

  const { data: queue } = await supabaseAdmin
    .from("property_enrichment_queue")
    .select("id, portfolio_client_id, portfolio_id, attempts, requested_classes, priority")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("priority", { ascending: true })
    .order("next_attempt_at", { ascending: true })
    .limit(batchSize);

  if (!queue?.length) {
    out.paused = "empty_queue";
    return out;
  }

  const ids = queue.map((q: any) => q.id);
  await supabaseAdmin
    .from("property_enrichment_queue")
    .update({ status: "running", started_at: new Date().toISOString() })
    .in("id", ids);

  const { data: clients } = await supabaseAdmin
    .from("lender_portfolio_clients")
    .select(
      "id, portfolio_id, address_line1, city, state, zip, loan_amount_at_close_cents, close_date, term_months",
    )
    .in(
      "id",
      queue.map((q: any) => q.portfolio_client_id),
    );
  const clientById = new Map((clients ?? []).map((c: any) => [c.id, c]));

  const { getPropertyIntel, extractMortgage, extractSales } = await import("./valuation.server");
  const touchedPortfolios = new Set<string>();
  let remainingCalls = spend.allowed - spend.used;

  for (const item of queue) {
    out.processed += 1;
    const client = clientById.get(item.portfolio_client_id);
    const now = new Date().toISOString();

    if (!client || !addressUsable(client)) {
      out.needsReview += 1;
      await supabaseAdmin
        .from("property_enrichment_queue")
        .update({
          status: "needs_review",
          last_error: "Address is missing a city/state or ZIP",
          completed_at: now,
        })
        .eq("id", item.id);
      continue;
    }

    const address = fullAddress(client);
    const wanted = ((item.requested_classes as AttomEndpoint[]) ?? DEFAULT_CLASSES).filter(
      (c) => c in ATTOM_TTL_DAYS,
    );
    const { missing } = await missingClasses(supabaseAdmin, address, wanted);

    // Everything we need is already cached — finish without spending anything.
    if (!missing.length) {
      out.completed += 1;
      out.cachedOnly += 1;
      await supabaseAdmin
        .from("property_enrichment_queue")
        .update({ status: "done", last_result: "cache", last_error: null, completed_at: now })
        .eq("id", item.id);
      await supabaseAdmin
        .from("lender_portfolio_clients")
        .update({ last_intel_refreshed_at: now })
        .eq("id", client.id);
      touchedPortfolios.add(client.portfolio_id);
      continue;
    }

    if (remainingCalls <= 0) {
      // Put the row back without counting an attempt against it.
      await supabaseAdmin
        .from("property_enrichment_queue")
        .update({ status: "pending" })
        .eq("id", item.id);
      out.paused = "background_cap";
      break;
    }

    try {
      const intel = await getPropertyIntel(address, {
        classes: missing,
        revenueSource: "background_enrichment",
        // Background valuation refresh runs on a slower clock than on-demand
        // user requests — dormant books don't need a monthly re-buy.
        ttlOverrides: { avm: 90 },
      });
      remainingCalls -= missing.length;
      out.spentCalls += missing.length;

      const resolved = missing.filter((c) => intel.classes[c]);
      const attempts = (item.attempts ?? 0) + 1;

      // Fill in loan facts we don't already hold, from the same pull.
      const m = intel.classes.mortgage ? extractMortgage(intel.classes.mortgage.data) : null;
      let s = intel.classes.sales ? extractSales(intel.classes.sales.data) : null;

      // Sale history is conditional: only buy it when we still can't date the
      // loan from mortgage records or from what the book already holds.
      if (!s && !client.close_date && !m?.originationDate && remainingCalls > 0) {
        const salesIntel = await getPropertyIntel(address, {
          classes: ["sales"],
          revenueSource: "background_enrichment_conditional",
        });
        remainingCalls -= 1;
        out.spentCalls += 1;
        s = salesIntel.classes.sales ? extractSales(salesIntel.classes.sales.data) : null;
      }
      const patch: {
        last_intel_refreshed_at: string;
        loan_amount_at_close_cents?: number;
        close_date?: string;
        term_months?: number;
      } = { last_intel_refreshed_at: now };
      if (client.loan_amount_at_close_cents == null && m?.loanAmount) {
        patch.loan_amount_at_close_cents = Math.round(m.loanAmount * 100);
      }
      const closeDate = m?.originationDate ?? s?.lastSale?.date ?? null;

      if (!client.close_date && closeDate) {
        patch.close_date = closeDate;
      }
      if (client.term_months == null && m?.termMonths) patch.term_months = m.termMonths;
      await supabaseAdmin.from("lender_portfolio_clients").update(patch).eq("id", client.id);
      touchedPortfolios.add(client.portfolio_id);

      if (resolved.length > 0) {
        out.completed += 1;
        await supabaseAdmin
          .from("property_enrichment_queue")
          .update({
            status: "done",
            attempts,
            last_result: `fetched:${resolved.join(",")}`,
            last_error: null,
            completed_at: now,
          })
          .eq("id", item.id);
      } else {
        const firstError = Object.values(intel.errors)[0] ?? "No records returned";
        const done = attempts >= MAX_ATTEMPTS;
        if (done) out.needsReview += 1;
        else out.retried += 1;
        await supabaseAdmin
          .from("property_enrichment_queue")
          .update({
            status: done ? "needs_review" : "pending",
            attempts,
            last_error: String(firstError).slice(0, 300),
            next_attempt_at: new Date(Date.now() + attempts * 6 * 3600_000).toISOString(),
            completed_at: done ? now : null,
          })
          .eq("id", item.id);
      }
    } catch (err) {
      const attempts = (item.attempts ?? 0) + 1;
      const done = attempts >= MAX_ATTEMPTS;
      if (done) out.needsReview += 1;
      else out.retried += 1;
      await supabaseAdmin
        .from("property_enrichment_queue")
        .update({
          status: done ? "failed" : "pending",
          attempts,
          last_error: (err instanceof Error ? err.message : String(err)).slice(0, 300),
          next_attempt_at: new Date(Date.now() + attempts * 6 * 3600_000).toISOString(),
          completed_at: done ? now : null,
        })
        .eq("id", item.id);
    }
  }

  // Recompute opportunities for every book we touched so the dashboards have
  // something to show as soon as the data lands.
  for (const portfolioId of touchedPortfolios) {
    try {
      const { data: p } = await supabaseAdmin
        .from("lender_portfolios")
        .select("lender_org_id")
        .eq("id", portfolioId)
        .maybeSingle();
      if (!p?.lender_org_id) continue;
      await persistPortfolioOpportunities(supabaseAdmin, portfolioId, p.lender_org_id);
      out.portfoliosRecomputed += 1;
    } catch {
      /* a failed recompute must not fail the tick */
    }
  }

  return out;
}

/** Coverage + queue health for one book. */
export async function portfolioCoverage(
  supabase: any,
  portfolioId: string,
): Promise<{
  total: number;
  covered: number;
  queued: number;
  needsReview: number;
  reviewList: Array<{ id: string; name: string | null; address: string; reason: string | null }>;
}> {
  const { data: clients } = await supabase
    .from("lender_portfolio_clients")
    .select("id, client_name, address_line1, city, state, zip, last_intel_refreshed_at")
    .eq("portfolio_id", portfolioId);
  const rows = clients ?? [];

  const { data: queue } = await supabase
    .from("property_enrichment_queue")
    .select("portfolio_client_id, status, last_error")
    .eq("portfolio_id", portfolioId);

  
  const queued = (queue ?? []).filter((q: any) => q.status === "pending" || q.status === "running")
    .length;
  const flagged = (queue ?? []).filter(
    (q: any) => q.status === "needs_review" || q.status === "failed",
  );

  const covered = rows.filter((r: any) => r.last_intel_refreshed_at != null).length;

  const reviewList = flagged.slice(0, 25).map((q: any) => {
    const c = rows.find((r: any) => r.id === q.portfolio_client_id);
    return {
      id: q.portfolio_client_id as string,
      name: c?.client_name ?? null,
      address: c ? fullAddress(c) : "",
      reason: q.last_error ?? null,
    };
  });

  return {
    total: rows.length,
    covered,
    queued,
    needsReview: flagged.length,
    reviewList,
  };
}
