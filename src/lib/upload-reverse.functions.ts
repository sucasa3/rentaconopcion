import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { uploadReverseEnabled } from "./upload-reverse";

const batch = z.object({ batchId: z.string().uuid() });
export const getUploadReverseResults = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => batch.parse(i)).handler(async ({ data, context }) => {
    if (!uploadReverseEnabled(context.userId, process.env["UPLOAD_REVERSE_ENABLED"], process.env["MIXED_UPLOAD_USER_IDS"])) return { enabled: false as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { reverseUploadSummary } = await import("./upload-reverse.server");
    return { enabled: true as const, ...await reverseUploadSummary(supabaseAdmin, context.userId, data.batchId) };
  });

export const approveUploadReverseSearch = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => batch.extend({ selectedIds: z.array(z.string().uuid()).min(1).max(10),
    maxLookups: z.number().int().min(1).max(10), maxCostCents: z.number().int().min(30).max(300) }).parse(i))
  .handler(async ({ data, context }) => {
    if (!uploadReverseEnabled(context.userId, process.env["UPLOAD_REVERSE_ENABLED"], process.env["MIXED_UPLOAD_USER_IDS"])) throw new Error("Reverse search is disabled.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { approveReverseUpload } = await import("./upload-reverse.server");
    const rawCap = Number(process.env["BATCHDATA_REVERSE_MONTHLY_CAP_CENTS"]);
    return approveReverseUpload({ admin: supabaseAdmin, actor: context.userId, ...data,
      apiKey: process.env["BATCHDATA_REVERSE_API_KEY"], monthCap: Number.isInteger(rawCap) && rawCap > 0 ? rawCap : 1000 });
  });

export const confirmUploadReverseMatch = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ propertyId: z.string().uuid() }).parse(i)).handler(async ({ data, context }) => {
    if (!uploadReverseEnabled(context.userId, process.env["UPLOAD_REVERSE_ENABLED"], process.env["MIXED_UPLOAD_USER_IDS"])) throw new Error("Reverse search is disabled.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { confirmReverseUploadProperty } = await import("./upload-reverse.server");
    return confirmReverseUploadProperty(supabaseAdmin, context.userId, data.propertyId);
  });