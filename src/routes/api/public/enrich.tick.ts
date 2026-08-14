import { createFileRoute } from "@tanstack/react-router";

// Cron: throttled property-record enrichment pass. Processes a small batch of
// queued clients, cached-first, and halts at the background budget share.
// Auth: apikey header must equal SUPABASE_PUBLISHABLE_KEY (the anon key).
export const Route = createFileRoute("/api/public/enrich/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided = request.headers.get("apikey") ?? "";
        if (!expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        let batchSize = 10;
        try {
          const body = (await request.json()) as { batchSize?: number };
          if (typeof body?.batchSize === "number") {
            batchSize = Math.min(25, Math.max(1, body.batchSize));
          }
        } catch {
          /* empty body is fine */
        }
        const { runEnrichmentTick } = await import("@/lib/enrichment.server");
        const result = await runEnrichmentTick({ batchSize });
        return Response.json(result);
      },
    },
  },
});
