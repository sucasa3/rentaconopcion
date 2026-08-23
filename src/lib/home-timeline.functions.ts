import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Value history for the timeline and the wealth trend. */
export const listValueSnapshots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("home_value_snapshots")
      .select("id, captured_on, value_cents, source, address_normalized")
      .eq("user_id", context.userId)
      .order("captured_on", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const CaptureSchema = z.object({
  value: z.number().min(1).max(500_000_000),
  source: z.string().max(40).optional(),
  addressNormalized: z.string().max(300).nullable().optional(),
});

/**
 * Record today's estimated value once per day. Cheap upsert on an already
 * loaded number — it never triggers a property-record call.
 */
export const captureValueSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CaptureSchema.parse(input))
  .handler(async ({ data, context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: existing } = await context.supabase
      .from("home_value_snapshots")
      .select("id")
      .eq("user_id", context.userId)
      .eq("captured_on", today)
      .maybeSingle();
    if (existing) return { ok: true, created: false };

    const { error } = await context.supabase.from("home_value_snapshots").insert({
      user_id: context.userId,
      captured_on: today,
      value_cents: Math.round(data.value * 100),
      source: data.source ?? "dashboard",
      address_normalized: data.addressNormalized ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true, created: true };
  });
