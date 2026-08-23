import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Alert lifecycle only. The signal engine stays the source of truth for WHAT
 * is worth telling the homeowner; this table remembers what they have already
 * seen or waved away, so a live signal doesn't shout forever.
 */
export const listAlertStates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("homeowner_alerts")
      .select("signal_key, signal_type, title, first_seen_at, read_at, dismissed_at")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const SeenSchema = z.object({
  alerts: z
    .array(
      z.object({
        key: z.string().min(1).max(200),
        type: z.string().min(1).max(60),
        title: z.string().max(300).optional(),
      }),
    )
    .max(30),
});

/** First-seen stamp for anything currently on screen, so "new" is real. */
export const markAlertsSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SeenSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (data.alerts.length === 0) return { ok: true };
    const rows = data.alerts.map((a) => ({
      user_id: context.userId,
      signal_key: a.key,
      signal_type: a.type,
      title: a.title ?? null,
    }));
    const { error } = await context.supabase
      .from("homeowner_alerts")
      .upsert(rows, { onConflict: "user_id,signal_key", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const DismissSchema = z.object({
  key: z.string().min(1).max(200),
  type: z.string().min(1).max(60),
  title: z.string().max(300).optional(),
});

export const dismissAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DismissSchema.parse(input))
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const { error } = await context.supabase.from("homeowner_alerts").upsert(
      {
        user_id: context.userId,
        signal_key: data.key,
        signal_type: data.type,
        title: data.title ?? null,
        read_at: now,
        dismissed_at: now,
      },
      { onConflict: "user_id,signal_key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
