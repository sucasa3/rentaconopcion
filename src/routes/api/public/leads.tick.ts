import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

// Cron: expire stale offers, cascade to next pro, and route new requests.
// Auth: HMAC-SHA256 over raw body using GHL_WEBHOOK_SECRET, header x-cron-signature.
export const Route = createFileRoute("/api/public/leads/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.GHL_WEBHOOK_SECRET;
        if (!secret) return new Response("Server not configured", { status: 500 });
        const body = await request.text();
        const sig = request.headers.get("x-cron-signature") ?? "";
        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Invalid signature", { status: 401 });
        }
        const { expireStaleOffers } = await import("@/lib/leads.server");
        const result = await expireStaleOffers();
        return Response.json(result);
      },
    },
  },
});
