import { createFileRoute } from "@tanstack/react-router";

// Cron: daily campaign pass — find due homeowners, generate copy, push to GHL.
// Auth: apikey header must equal SUPABASE_PUBLISHABLE_KEY (the anon key).
export const Route = createFileRoute("/api/public/campaigns/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided = request.headers.get("apikey") ?? "";
        if (!expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        let limit = 100;
        let dryRun = false;
        try {
          const body = (await request.json()) as { limit?: number; dryRun?: boolean };
          if (typeof body?.limit === "number") limit = Math.min(500, Math.max(1, body.limit));
          if (body?.dryRun === true) dryRun = true;
        } catch {
          /* empty body is fine */
        }
        const { runCampaignTick } = await import("@/lib/campaigns-run.server");
        const result = await runCampaignTick({ limit, dryRun });
        return Response.json(result);
      },
    },
  },
});
