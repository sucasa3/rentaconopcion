import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Upload results for the uploader's own mixed upload. Off unless the caller is allow-listed. */
export const getUploadResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ batchId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const m = await import("./mixed-upload.server");
    if (!m.mixedUploadEnabled(context.userId)) throw new Error("This upload option isn't available yet.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return m.getMixedUploadSummary(supabaseAdmin, data.batchId, context.userId);
  });

/**
 * Batch spending approval for a mixed upload. The confirmed lookup count and dollar ceiling are
 * both re-checked server-side (here and in approve_upload_spend). Saved-record reuse is free.
 */
export const approveUploadSpend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      batchId: z.string().uuid(),
      maxLookups: z.number().int().min(0).max(500),
      maxCostCents: z.number().int().min(0).max(5000),
      note: z.string().max(300).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const m = await import("./mixed-upload.server");
    if (!m.mixedUploadEnabled(context.userId)) throw new Error("This upload option isn't available yet.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return m.approveMixedUploadSpend({
      admin: supabaseAdmin, batchId: data.batchId, actorId: context.userId,
      maxLookups: data.maxLookups, maxCostCents: data.maxCostCents, note: data.note,
    });
  });
