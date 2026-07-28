import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RecordSchema = z.object({
  kind: z.enum(["inspection", "insurance", "warranty", "deed", "other"]),
  storagePath: z.string().min(1).max(500),
  originalFilename: z.string().max(300).optional().nullable(),
  sizeBytes: z.number().int().min(0).max(50_000_000).optional().nullable(),
});

export const recordHomeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RecordSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("home_documents")
      .insert({
        user_id: context.userId,
        kind: data.kind,
        storage_path: data.storagePath,
        original_filename: data.originalFilename ?? null,
        size_bytes: data.sizeBytes ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listHomeDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("home_documents")
      .select("id, kind, storage_path, original_filename, size_bytes, created_at, extraction_status, extraction_error, extracted_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteHomeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Fetch to get storage path and enforce ownership via RLS
    const { data: row, error: fetchErr } = await context.supabase
      .from("home_documents")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!row) return { ok: true };

    await context.supabase.storage.from("home-documents").remove([row.storage_path]);
    const { error } = await context.supabase.from("home_documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
