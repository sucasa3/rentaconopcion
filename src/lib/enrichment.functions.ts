import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPortfolioOrg } from "./opportunities.server";

/** Queue every client in a book for a cached-first records pass. */
export const queuePortfolioEnrichment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ portfolioId: z.string().uuid(), retryFailed: z.boolean().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPortfolioOrg(context.supabase, data.portfolioId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: clients } = await supabaseAdmin
      .from("lender_portfolio_clients")
      .select("id")
      .eq("portfolio_id", data.portfolioId);
    const ids = (clients ?? []).map((c) => c.id);
    if (!ids.length) return { queued: 0 };

    const rows = ids.map((id) => ({
      portfolio_client_id: id,
      portfolio_id: data.portfolioId,
      priority: 10,
    }));
    await supabaseAdmin
      .from("property_enrichment_queue")
      .upsert(rows, { onConflict: "portfolio_client_id", ignoreDuplicates: true });

    if (data.retryFailed) {
      await supabaseAdmin
        .from("property_enrichment_queue")
        .update({
          status: "pending",
          attempts: 0,
          last_error: null,
          next_attempt_at: new Date().toISOString(),
        })
        .eq("portfolio_id", data.portfolioId)
        .in("status", ["failed", "needs_review"]);
    }

    return { queued: ids.length };
  });

/** Coverage + queue health for a book the caller's org owns. */
export const getEnrichmentCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ portfolioId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPortfolioOrg(context.supabase, data.portfolioId);
    const { portfolioCoverage } = await import("./enrichment.server");
    return portfolioCoverage(context.supabase, data.portfolioId);
  });

/** Manually advance the queue by one small batch (org members + admins). */
export const runEnrichmentBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ portfolioId: z.string().uuid(), batchSize: z.number().min(1).max(25).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPortfolioOrg(context.supabase, data.portfolioId);
    const { runEnrichmentTick } = await import("./enrichment.server");
    return runEnrichmentTick({ batchSize: data.batchSize ?? 10 });
  });
