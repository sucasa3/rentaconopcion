import { createFileRoute } from "@tanstack/react-router";

// Public cron endpoint: drains up to 25 GHL sync jobs per call.
// Auth: apikey header must equal SUPABASE_PUBLISHABLE_KEY (the anon key),
// matching the /api/public/leads/tick cron pattern.
export const Route = createFileRoute("/api/public/ghl/drain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided = request.headers.get("apikey") ?? "";
        if (!expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { drainGhlQueue } = await import("@/lib/ghl.functions");
        const result = await drainGhlQueue({ data: { limit: 25 } });
        return Response.json(result);
      },
    },
  },
});

