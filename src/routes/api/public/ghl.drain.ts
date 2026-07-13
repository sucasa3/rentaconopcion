import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

// Public cron endpoint: drains up to 25 GHL sync jobs per call.
// Auth: HMAC signature header 'x-cron-signature' over the raw body using GHL_WEBHOOK_SECRET.
export const Route = createFileRoute("/api/public/ghl/drain")({
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

        const { drainGhlQueue } = await import("@/lib/ghl.functions");
        const result = await drainGhlQueue({ data: { limit: 25 } });
        return Response.json(result);
      },
    },
  },
});
