import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Batch spending approval for a mixed upload. Off unless the caller is allow-listed. */
export const approveUploadSpend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ batchId: z.string().uuid(), maxLookups: z.number().int().min(0).max(500), note: z.string().max(300).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const m = await import("./mixed-upload.server");
    if (!m.mixedUploadEnabled(context.userId)) throw new Error("This upload option isn't available yet.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return m.approveMixedUploadSpend({ admin: supabaseAdmin, batchId: data.batchId, actorId: context.userId, maxLookups: data.maxLookups, note: data.note });
  });
