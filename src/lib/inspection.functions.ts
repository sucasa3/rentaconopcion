import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const IdSchema = z.object({ documentId: z.string().uuid() });

/**
 * Runs the document AI pipeline for a single home_documents row.
 *
 * Inspection reports get the dedicated findings extractor; every other kind
 * (insurance, warranty, permit/invoice, deed, other) gets the general
 * document analyst. Both produce predicted actions the homeowner sees in
 * Home Care.
 *
 * Caller must own the document OR be an admin.
 */
export const extractInspectionReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { extractFindingsFromFile } = await import("./inspection.server");
    const { analyzeDocument, actionsFromFindings, MODEL_DOC } = await import("./documents-ai.server");
    const { logAiUsage } = await import("./ai-usage.server");

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
      const language = prof?.language === "es" ? ("es" as const) : ("en" as const);

      let findingCount = 0;
      let actions: Awaited<ReturnType<typeof analyzeDocument>>["actions"] = [];
      let facts: Awaited<ReturnType<typeof analyzeDocument>>["facts"] = [];

      if (doc.kind === "inspection") {
        const findings = await extractFindingsFromFile(
          buf,
          mime,
          doc.original_filename || "inspection.pdf",
          language,
        );
        await logAiUsage({
          userId: doc.user_id,
          feature: "document_inspection",
          model: MODEL_DOC,
          usage: { total: Math.round(buf.length / 3) },
        });

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
        findingCount = findings.length;
        actions = actionsFromFindings(findings);
      } else {
        const analysis = await analyzeDocument({
          fileBytes: buf,
          mimeType: mime,
          filename: doc.original_filename || "document.pdf",
          declaredKind: doc.kind,
          language,
        });
        await logAiUsage({
          userId: doc.user_id,
          feature: `document_${doc.kind}`,
          model: MODEL_DOC,
          usage: analysis.usage,
        });
        facts = analysis.facts;
        actions = analysis.actions;

        // If the model disagrees with the homeowner's label, trust the model.
        if (analysis.kind !== doc.kind && analysis.kind !== "other") {
          await supabaseAdmin
            .from("home_documents")
            .update({ kind: analysis.kind })
            .eq("id", doc.id);
        }
      }

      // Replace this document's facts.
      await supabaseAdmin.from("home_document_facts").delete().eq("document_id", doc.id);
      if (facts.length > 0) {
        await supabaseAdmin.from("home_document_facts").insert(
          facts.map((f) => ({
            document_id: doc.id,
            user_id: doc.user_id,
            doc_kind: doc.kind,
            label: f.label,
            value: f.value,
            value_date: f.value_date,
            value_cents: f.value_cents,
            system: f.system,
            source_excerpt: f.source_excerpt,
          })),
        );
      }

      // Replace this document's predicted actions (keep ones the homeowner
      // already completed or dismissed under the same key).
      await supabaseAdmin
        .from("home_predicted_actions")
        .delete()
        .eq("document_id", doc.id)
        .eq("status", "open");
      for (const a of actions) {
        await supabaseAdmin.from("home_predicted_actions").upsert(
          {
            user_id: doc.user_id,
            document_id: doc.id,
            action_key: a.action_key,
            title: a.title,
            why: a.why,
            system: a.system,
            service_category: a.service_category,
            urgency: a.urgency,
            due_from: a.due_from,
            due_by: a.due_by,
            est_cost_low_cents: a.est_cost_low_cents,
            est_cost_high_cents: a.est_cost_high_cents,
          },
          { onConflict: "user_id,action_key", ignoreDuplicates: false },
        );
      }

      await supabaseAdmin
        .from("home_documents")
        .update({
          extraction_status: "ready",
          extraction_error: null,
          extracted_at: new Date().toISOString(),
        })
        .eq("id", doc.id);

      return {
        ok: true,
        findings: findingCount,
        facts: facts.length,
        actions: actions.length,
        status: "ready",
      };
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
