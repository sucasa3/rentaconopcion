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
        const providedKey = request.headers.get("apikey") ?? "";
        const providedSecret = request.headers.get("x-cron-secret") ?? "";

        if (!apikey || !providedSecret) return new Response("Unauthorized", { status: 401 });
        if (!safeEqual(providedKey, apikey)) return new Response("Unauthorized", { status: 401 });

        // The schedule's own token, plus an operator secret as a manual fallback.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin
          .from("cron_tokens")
          .select("token")
          .eq("job_key", "rates_tick")
          .maybeSingle();

        const accepted = [row?.token, process.env["MARKET_RATE_CRON_SECRET"]].filter(
          (v): v is string => !!v,
        );
        if (!accepted.some((t) => safeEqual(providedSecret, t))) {
          return new Response("Unauthorized", { status: 401 });
        }


        const { refreshMarketRate } = await import("@/lib/market-rate.server");
        const result = await refreshMarketRate();
        return Response.json(result, { status: result.status === "rejected" ? 502 : 200 });
      },
    },
  },
});
