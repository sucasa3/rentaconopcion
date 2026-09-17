import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron: hourly Daily Read pass. Each run only emails professionals whose own
 * local time is the morning delivery hour, so one schedule covers every
 * timezone and survives daylight-saving changes.
 *
 * Auth: apikey header must equal SUPABASE_PUBLISHABLE_KEY (the anon key).
 */
export const Route = createFileRoute("/api/public/daily-read/tick")({
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
        let force = false;
        let userIds: string[] | undefined;
        try {
          const body = (await request.json()) as {
            limit?: number;
            dryRun?: boolean;
            force?: boolean;
            userIds?: string[];
          };
          if (typeof body?.limit === "number") limit = Math.min(500, Math.max(1, body.limit));
          if (body?.dryRun === true) dryRun = true;
          if (body?.force === true) force = true;
          if (Array.isArray(body?.userIds)) userIds = body.userIds.filter((u) => typeof u === "string");
        } catch {
          /* empty body is fine */
        }

        const { runDailyReadTick } = await import("@/lib/daily-read.server");
        const result = await runDailyReadTick({ limit, dryRun, force, userIds });
        return Response.json(result);
      },
    },
  },
});
