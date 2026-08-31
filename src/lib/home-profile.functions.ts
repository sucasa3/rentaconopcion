import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Read the signed-in homeowner's persisted Home Profile (refreshes if stale). */
export const getMyHomeProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadHomeProfile } = await import("@/lib/home-profile.server");
    try {
      return { ok: true as const, profile: await loadHomeProfile(context.supabase, context.userId) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, profile: null };
    }
  });

const RefreshInput = z.object({ forceProvider: z.boolean().optional() }).default({});

/** Rebuild and persist the Home Profile from every source we have. */
export const refreshMyHomeProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RefreshInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { refreshHomeProfile } = await import("@/lib/home-profile.server");
    try {
      const profile = await refreshHomeProfile(context.supabase, context.userId, {
        forceProvider: data.forceProvider ?? false,
      });
      return { ok: true as const, profile };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, profile: null };
    }
  });
