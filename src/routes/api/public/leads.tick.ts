import { createFileRoute } from "@tanstack/react-router";

// Cron: expire stale offers, cascade to next pro, and route new requests.
// Auth: apikey header must equal SUPABASE_PUBLISHABLE_KEY (the anon key).
export const Route = createFileRoute("/api/public/leads/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided = request.headers.get("apikey") ?? "";
        if (!expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { expireStaleOffers } = await import("@/lib/leads.server");
        const result = await expireStaleOffers();
        return Response.json(result);
      },
    },
  },
});
