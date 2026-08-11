import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EVENT_TYPES = [
  "value_viewed",
  "value_refreshed",
  "equity_opened",
  "refi_opened",
  "home_score_opened",
  "maintenance_opened",
  "document_uploaded",
  "maintenance_logged",
  "service_request_submitted",
] as const;

/** Fire-and-forget behavioral event from the homeowner dashboard. */
export const logHomeownerActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        eventType: z.enum(EVENT_TYPES),
        context: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("homeowner_activity_events").insert({
      homeowner_id: context.userId,
      event_type: data.eventType,
      context: (data.context ?? {}) as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Explicit seller-intent capture: value request or "thinking of selling". */
export const submitSellerIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        kind: z.enum(["value_request", "selling_interest"]),
        timeframe: z.enum(["now", "3_6_months", "12_months", "curious"]).optional(),
        note: z.string().max(2000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("seller_intent_submissions").insert({
      homeowner_id: context.userId,
      kind: data.kind,
      timeframe: data.timeframe ?? null,
      note: data.note?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** What the homeowner themselves can see about their own recent activity. */
export const getMyActivitySummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: events } = await context.supabase
      .from("homeowner_activity_events")
      .select("event_type, occurred_at")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(200);

    const { data: submissions } = await context.supabase
      .from("seller_intent_submissions")
      .select("kind, timeframe, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    return {
      events: events ?? [],
      submissions: submissions ?? [],
    };
  });
