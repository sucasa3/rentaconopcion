import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const IdSchema = z.object({ id: z.string().uuid() });

/**
 * Returns a short-lived signed URL for a document. The caller must either own
 * the document or have the `admin` role.
 */
export const getDocumentSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: doc, error } = await supabaseAdmin
      .from("home_documents")
      .select("id, user_id, storage_path, original_filename")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Document not found");

    if (doc.user_id !== context.userId) {
      const { data: isAdmin } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (!isAdmin) throw new Error("Forbidden");
    }

    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("home-documents")
      .createSignedUrl(doc.storage_path, 60 * 10);
    if (sErr) throw new Error(sErr.message);

    return {
      url: signed.signedUrl,
      filename: doc.original_filename,
      storagePath: doc.storage_path,
    };
  });
