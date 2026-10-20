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
    const { withoutHeldClients } = await import("./household-import.server");
    const ids = (await withoutHeldClients(supabaseAdmin, clients ?? [])).map((c) => c.id);
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

/** Owners linked to 2+ homes in a book (multi-property import). RLS-scoped reads. */
export const getBookOwnerGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ portfolioId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { HOUSEHOLD_IMPORT_ENABLED } = await import("./household-import");
    if (!HOUSEHOLD_IMPORT_ENABLED) return { owners: [] as { contactId: string; name: string; homes: { id: string; address: string; role: string }[] }[] };
    const { data: links, error } = await (context.supabase as any)
      .from("client_contact_links")
      .select("contact_id, client_id, role, book_contacts(full_name), lender_portfolio_clients(address_line1, city, state, zip)")
      .eq("book_id", data.portfolioId);
    if (error) throw new Error("Could not load owners.");
    const map = new Map<string, { contactId: string; name: string; homes: { id: string; address: string; role: string }[] }>();
    for (const l of links ?? []) {
      const g = map.get(l.contact_id) ?? { contactId: l.contact_id, name: l.book_contacts?.full_name ?? "", homes: [] };
      const c = l.lender_portfolio_clients ?? {};
      g.homes.push({ id: l.client_id, role: l.role, address: [c.address_line1, c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") });
      map.set(l.contact_id, g);
    }
    return { owners: [...map.values()].filter((g) => g.homes.length > 1).sort((a, b) => a.name.localeCompare(b.name)) };
  });
