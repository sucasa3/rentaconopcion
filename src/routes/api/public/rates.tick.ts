import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

// Cron: refresh the stored market benchmark (Freddie Mac PMMS 30-year fixed).
// Two locks, both required: the project apikey (same as the other tick jobs)
// and a dedicated cron secret. The refresh itself is throttled and idempotent —
// one stored row per survey date — so no caller can move the benchmark.
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const Route = createFileRoute("/api/public/rates/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        const cronSecret = process.env["MARKET_RATE_CRON_SECRET"];
        const providedKey = request.headers.get("apikey") ?? "";
        const providedSecret = request.headers.get("x-cron-secret") ?? "";

        if (!apikey || !cronSecret) return new Response("Not configured", { status: 503 });
        if (!safeEqual(providedKey, apikey) || !safeEqual(providedSecret, cronSecret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { refreshMarketRate } = await import("@/lib/market-rate.server");
        const result = await refreshMarketRate();
        return Response.json(result, { status: result.status === "rejected" ? 502 : 200 });
      },
    },
  },
});
