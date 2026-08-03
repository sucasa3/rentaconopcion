import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const IdSchema = z.object({ documentId: z.string().uuid() });

/**
 * Runs the inspection-report AI extraction pipeline for a single home_documents row.
 * Caller must own the document OR be an admin.
 */
export const extractInspectionReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { extractFindingsFromFile } = await import("./inspection.server");

    const { data: doc, error: dErr } = await supabaseAdmin
      .from("home_documents")
      .select("id, user_id, kind, storage_path, original_filename")
      .eq("id", data.documentId)
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!doc) throw new Error("Document not found");

    if (doc.user_id !== context.userId) {
      const { data: isAdmin } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (!isAdmin) throw new Error("Forbidden");
    }

    if (doc.kind !== "inspection") {
      await supabaseAdmin
        .from("home_documents")
        .update({ extraction_status: "not_applicable" })
        .eq("id", doc.id);
      return { ok: true, findings: 0, status: "not_applicable" };
    }

    await supabaseAdmin
      .from("home_documents")
      .update({ extraction_status: "processing", extraction_error: null })
      .eq("id", doc.id);

    try {
      const { data: file, error: fErr } = await supabaseAdmin.storage
        .from("home-documents")
        .download(doc.storage_path);
      if (fErr) throw new Error(fErr.message);
      if (!file) throw new Error("Empty file");

      const buf = new Uint8Array(await file.arrayBuffer());
      const mime = (file as any).type || guessMime(doc.original_filename || doc.storage_path);

      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("language")
        .eq("id", doc.user_id)
        .maybeSingle();

      const findings = await extractFindingsFromFile(
        buf,
        mime,
        doc.original_filename || "inspection.pdf",
        prof?.language === "es" ? "es" : "en",
      );

      // Replace existing findings for this document
      await supabaseAdmin.from("home_inspection_findings").delete().eq("document_id", doc.id);
      if (findings.length > 0) {
        const rows = findings.map((f) => ({
          document_id: doc.id,
          user_id: doc.user_id,
          system: f.system,
          condition: f.condition,
          remaining_life_years: f.remaining_life_years,
          urgency: f.urgency,
          defects: f.defects,
          recommended_action: f.recommended_action,
          recommended_category: f.recommended_category,
          source_excerpt: f.source_excerpt,
        }));
        const { error: iErr } = await supabaseAdmin.from("home_inspection_findings").insert(rows);
        if (iErr) throw new Error(iErr.message);
      }

      await supabaseAdmin
        .from("home_documents")
        .update({
          extraction_status: "ready",
          extraction_error: null,
          extracted_at: new Date().toISOString(),
        })
        .eq("id", doc.id);

      return { ok: true, findings: findings.length, status: "ready" };
    } catch (e: any) {
      await supabaseAdmin
        .from("home_documents")
        .update({
          extraction_status: "failed",
          extraction_error: String(e?.message ?? e).slice(0, 500),
        })
        .eq("id", doc.id);
      throw e;
    }
  });

/**
 * Lists inspection findings for the current user (or for a specified user
 * if the caller is an admin).
 */
const ListSchema = z.object({ userId: z.string().uuid().optional() }).optional();
export const listInspectionFindings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ListSchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let targetUser = context.userId;

    if (data?.userId && data.userId !== context.userId) {
      const { data: isAdmin } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (!isAdmin) throw new Error("Forbidden");
      targetUser = data.userId;
    }

    const { data: rows, error } = await supabaseAdmin
      .from("home_inspection_findings")
      .select("*")
      .eq("user_id", targetUser)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

function guessMime(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".webp")) return "image/webp";
  return "application/pdf";
}
