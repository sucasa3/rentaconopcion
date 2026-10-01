import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { INSPECTION_LIMITS, inspectPdf } from "./inspection-batch";

/**
 * Workstream 4 — agent batch inspection uploads.
 * Every call re-checks workspace membership. Attaching a report additionally
 * requires the homeowner's "Help manage my home" permission for that workspace.
 */

async function agentOrg(supabase: any, userId: string): Promise<{ id: string; isTest: boolean } | null> {
  const { data } = await supabase
    .from("lender_members")
    .select("lender_org_id, lender_orgs!inner(org_type, is_test_account)")
    .eq("user_id", userId)
    .eq("lender_orgs.org_type", "agent")
    .limit(1);
  const r = data?.[0];
  return r ? { id: r.lender_org_id, isTest: !!r.lender_orgs?.is_test_account } : null;
}

async function requireBatch(admin: any, supabase: any, userId: string, batchId: string) {
  const org = await agentOrg(supabase, userId);
  if (!org) throw new Error("forbidden");
  const { data: b } = await admin.from("inspection_batches").select("id, org_id").eq("id", batchId).maybeSingle();
  if (!b || b.org_id !== org.id) throw new Error("forbidden");
  return org;
}

export const createInspectionBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const org = await agentOrg(context.supabase, context.userId);
    if (!org) throw new Error("forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("inspection_batches")
      .insert({ org_id: org.id, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { batchId: data.id as string };
  });

type UploadOutcome = { filename: string; ok: boolean; reason?: string };

export const uploadInspectionFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    if (!(d instanceof FormData)) throw new Error("invalid");
    const batchId = z.string().uuid().parse(d.get("batchId"));
    const file = d.get("file");
    if (!(file instanceof File)) throw new Error("invalid");
    return { batchId, file };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const org = await requireBatch(admin, context.supabase, context.userId, data.batchId);
    const { sha256Hex } = await import("./inspection-batch.server");
    const name = data.file.name.slice(0, 200);
    const lower = name.toLowerCase();

    let entries: { name: string; bytes: Uint8Array }[] = [];
    const out: UploadOutcome[] = [];
    if (lower.endsWith(".zip")) {
      if (data.file.size > INSPECTION_LIMITS.maxZipBytes) return { results: [{ filename: name, ok: false, reason: "too_large" }] };
      const { unzipSync } = await import("fflate");
      let total = 0;
      let count = 0;
      let overflow = false;
      try {
        const files = unzipSync(new Uint8Array(await data.file.arrayBuffer()), {
          filter: (f) => {
            if (f.name.endsWith("/") || f.name.startsWith("__MACOSX") || f.name.split("/").pop()!.startsWith(".")) return false;
            count++;
            total += f.originalSize;
            if (count > INSPECTION_LIMITS.maxZipEntries || total > INSPECTION_LIMITS.maxZipExpandedBytes || f.originalSize > INSPECTION_LIMITS.maxFileBytes) {
              overflow = true;
              return false;
            }
            return true;
          },
        });
        if (overflow) return { results: [{ filename: name, ok: false, reason: "zip_limits" }] };
        for (const [n, b] of Object.entries(files)) {
          const base = n.split("/").pop()!.slice(0, 200);
          if (!base.toLowerCase().endsWith(".pdf")) out.push({ filename: base, ok: false, reason: "unsupported" });
          else entries.push({ name: base, bytes: b });
        }
      } catch {
        return { results: [{ filename: name, ok: false, reason: "malformed_zip" }] };
      }
    } else if (lower.endsWith(".pdf")) {
      if (data.file.size > INSPECTION_LIMITS.maxFileBytes) return { results: [{ filename: name, ok: false, reason: "too_large" }] };
      entries = [{ name, bytes: new Uint8Array(await data.file.arrayBuffer()) }];
    } else {
      return { results: [{ filename: name, ok: false, reason: "unsupported" }] };
    }

    const { count } = await admin.from("inspection_batch_files").select("id", { count: "exact", head: true }).eq("batch_id", data.batchId);
    let used = count ?? 0;
    for (const e of entries) {
      if (used >= INSPECTION_LIMITS.maxFilesPerBatch) {
        out.push({ filename: e.name, ok: false, reason: "batch_full" });
        continue;
      }
      const check = inspectPdf(e.bytes);
      if (!check.ok) {
        out.push({ filename: e.name, ok: false, reason: check.reason });
        continue;
      }
      const hash = await sha256Hex(e.bytes);
      const { data: prior } = await admin
        .from("inspection_batch_files")
        .select("id")
        .eq("org_id", org.id)
        .eq("sha256", hash)
        .order("created_at", { ascending: true })
        .limit(1);
      const id = crypto.randomUUID();
      const path = `${org.id}/${data.batchId}/${id}.pdf`;
      const up = await admin.storage.from("inspection-batches").upload(path, e.bytes, { contentType: "application/pdf" });
      if (up.error) {
        out.push({ filename: e.name, ok: false, reason: "storage" });
        continue;
      }
      await admin.from("inspection_batch_files").insert({
        id,
        batch_id: data.batchId,
        org_id: org.id,
        filename: e.name,
        storage_path: path,
        size_bytes: e.bytes.length,
        sha256: hash,
        page_count: check.pages,
        duplicate_of: prior?.[0]?.id ?? null,
      });
      used++;
      out.push({ filename: e.name, ok: true });
    }
    return { results: out };
  });

/** Claims and processes up to 2 queued files. Safe to call repeatedly from any tab. */
export const processInspectionBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const org = await agentOrg(context.supabase, context.userId);
    if (!org) throw new Error("forbidden");
    const { processClaimedFile } = await import("./inspection-batch.server");
    const { extractBatchInspection } = await import("./inspection.server");
    const now = new Date();
    const { data: queued } = await admin
      .from("inspection_batch_files")
      .select("id, status, lease_until, attempts")
      .eq("org_id", org.id)
      .in("status", ["queued", "processing"])
      .order("created_at")
      .limit(6);
    let processed = 0;
    for (const q of queued ?? []) {
      if (processed >= 2) break;
      if (q.status === "processing" && q.lease_until && new Date(q.lease_until) > now) continue;
      const lease = new Date(Date.now() + 3 * 60_000).toISOString();
      // Conditional claim: only one caller wins a file.
      let claim = admin
        .from("inspection_batch_files")
        .update({ status: "processing", lease_until: lease, attempts: q.attempts + 1 })
        .eq("id", q.id)
        .eq("attempts", q.attempts);
      claim = q.status === "queued" ? claim.eq("status", "queued") : claim.eq("status", "processing").lt("lease_until", now.toISOString());
      const { data: won } = await claim.select("*");
      if (!won?.[0]) continue;
      processed++;
      try {
        await processClaimedFile(admin, won[0], org.isTest, extractBatchInspection);
      } catch (e: any) {
        const paused = e?.status === 402 || e?.status === 403;
        const final = paused || won[0].attempts >= INSPECTION_LIMITS.maxAttempts;
        await admin
          .from("inspection_batch_files")
          .update({ status: final ? "failed" : "queued", lease_until: null, error: paused ? "ai_paused" : "processing_failed" })
          .eq("id", q.id);
        if (paused) break;
      }
    }
    return { processed };
  });

export const retryInspectionFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ fileId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const org = await agentOrg(context.supabase, context.userId);
    const { data: f } = await admin.from("inspection_batch_files").select("id, org_id, status").eq("id", data.fileId).maybeSingle();
    if (!org || !f || f.org_id !== org.id) throw new Error("forbidden");
    if (!["failed", "unreadable"].includes(f.status)) return { ok: true };
    await admin.from("inspection_batch_files").update({ status: "queued", attempts: 0, error: null }).eq("id", f.id).in("status", ["failed", "unreadable"]);
    return { ok: true };
  });

export type BatchFileView = {
  id: string;
  filename: string;
  status: string;
  error: string | null;
  pageCount: number | null;
  address: string | null;
  unit: string | null;
  inspectionDate: string | null;
  addressPages: number[];
  findingCount: number;
  matchStatus: string | null;
  proposed: { id: string; name: string | null; address: string } | null;
  candidates: { id: string; name: string | null; address: string }[];
  duplicate: boolean;
  older: boolean;
  attachState: string | null;
  confirmedAt: string | null;
};

export const listInspectionBatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const org = await agentOrg(context.supabase, context.userId);
    if (!org) return { allowed: false as const, files: [] as BatchFileView[], limits: INSPECTION_LIMITS };
    // RLS: members read their own workspace's files only.
    const { data: files } = await (context.supabase as any)
      .from("inspection_batch_files")
      .select("*")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false })
      .limit(200);
    const ids = Array.from(new Set((files ?? []).flatMap((f: any) => [f.proposed_client_id, ...(f.candidate_client_ids ?? [])]).filter(Boolean)));
    const { data: clients } = ids.length
      ? await (context.supabase as any).from("lender_portfolio_clients").select("id, client_name, address_line1, city, state, zip").in("id", ids)
      : { data: [] };
    const cmap = new Map<string, any>((clients ?? []).map((c: any) => [c.id, c]));
    const view = (id: string | null) => {
      const c = id ? cmap.get(id) : null;
      return c ? { id: c.id, name: c.client_name, address: [c.address_line1, c.city, c.state, c.zip].filter(Boolean).join(", ") } : null;
    };
    return {
      allowed: true as const,
      limits: INSPECTION_LIMITS,
      files: (files ?? []).map(
        (f: any): BatchFileView => ({
          id: f.id,
          filename: f.filename,
          status: f.status,
          error: f.error,
          pageCount: f.page_count,
          address: f.extracted_address,
          unit: f.extracted_unit,
          inspectionDate: f.extracted_date,
          addressPages: f.address_pages ?? [],
          findingCount: Array.isArray(f.findings) ? f.findings.length : 0,
          matchStatus: f.match_status,
          proposed: view(f.proposed_client_id),
          candidates: (f.candidate_client_ids ?? []).map(view).filter(Boolean),
          duplicate: !!f.duplicate_of,
          older: !!f.older_than_records,
          attachState: f.attach_state,
          confirmedAt: f.confirmed_at,
        }),
      ),
    };
  });

/** Agent-only list of active clients for manual assignment of an unmatched/uncertain report. */
export const listAssignableClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ q: z.string().max(80) }).parse(i))
  .handler(async ({ data, context }) => {
    const org = await agentOrg(context.supabase, context.userId);
    if (!org) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { activeOrgClients } = await import("./inspection-batch.server");
    const q = data.q.trim().toLowerCase();
    return (await activeOrgClients(supabaseAdmin, org.id))
      .filter((c) => !q || `${c.address_line1} ${c.city ?? ""} ${c.zip ?? ""}`.toLowerCase().includes(q))
      .slice(0, 20)
      .map((c) => ({ id: c.id, name: c.client_name, address: [c.address_line1, c.city, c.state, c.zip].filter(Boolean).join(", ") }));
  });

export type ConfirmOutcome = { fileId: string; result: "attached" | "pending_permission" | "no_homeowner" | "needs_review" | "duplicate" | "not_ready" | "forbidden" };

/**
 * Confirm reports. Bulk mode accepts only exact, non-duplicate matches; a
 * report with an explicit clientId (individual review) may target any active
 * client in this workspace. Repeated confirmation is idempotent.
 */
export const confirmInspectionFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ items: z.array(z.object({ fileId: z.string().uuid(), clientId: z.string().uuid().optional() })).min(1).max(25) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { activeOrgClients, attachToHomeowner } = await import("./inspection-batch.server");
    const org = await agentOrg(context.supabase, context.userId);
    if (!org) return { outcomes: data.items.map((i) => ({ fileId: i.fileId, result: "forbidden" })) as ConfirmOutcome[] };
    const clients = await activeOrgClients(admin, org.id);
    const outcomes: ConfirmOutcome[] = [];
    for (const item of data.items) {
      const { data: f } = await admin.from("inspection_batch_files").select("*").eq("id", item.fileId).maybeSingle();
      if (!f || f.org_id !== org.id) { outcomes.push({ fileId: item.fileId, result: "forbidden" }); continue; }
      if (f.attach_state === "attached") { outcomes.push({ fileId: f.id, result: "attached" }); continue; }
      if (f.status !== "ready") { outcomes.push({ fileId: f.id, result: "not_ready" }); continue; }
      if (f.duplicate_of && !item.clientId) { outcomes.push({ fileId: f.id, result: "duplicate" }); continue; }
      const clientId = item.clientId ?? (f.match_status === "exact" ? f.proposed_client_id : null);
      const client = clients.find((c) => c.id === clientId);
      if (!client) { outcomes.push({ fileId: f.id, result: "needs_review" }); continue; }
      await admin
        .from("inspection_batch_files")
        .update({ proposed_client_id: client.id, confirmed_by: context.userId, confirmed_at: f.confirmed_at ?? new Date().toISOString() })
        .eq("id", f.id);
      if (!client.homeowner_id) {
        await admin.from("inspection_batch_files").update({ attach_state: "no_homeowner" }).eq("id", f.id);
        outcomes.push({ fileId: f.id, result: "no_homeowner" });
        continue;
      }
      const { data: allowed } = await admin.rpc("agent_documents_allowed", {
        _actor: context.userId,
        _org_id: org.id,
        _homeowner: client.homeowner_id,
      });
      if (!allowed) {
        await admin.from("inspection_batch_files").update({ attach_state: "pending_permission" }).eq("id", f.id).neq("attach_state", "declined");
        outcomes.push({ fileId: f.id, result: "pending_permission" });
        continue;
      }
      await attachToHomeowner(admin, { ...f, proposed_client_id: client.id }, client.homeowner_id, context.userId);
      outcomes.push({ fileId: f.id, result: "attached" });
    }
    return { outcomes };
  });

/** Agent opens the workspace copy of an original report. */
export const getInspectionFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ fileId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const org = await agentOrg(context.supabase, context.userId);
    const { data: f } = await admin.from("inspection_batch_files").select("org_id, storage_path").eq("id", data.fileId).maybeSingle();
    if (!org || !f || f.org_id !== org.id) throw new Error("forbidden");
    const { data: s } = await admin.storage.from("inspection-batches").createSignedUrl(f.storage_path, 300);
    return { url: s?.signedUrl ?? null };
  });

// ---------------------------------------------------------------------------
// Homeowner side
// ---------------------------------------------------------------------------

/** Reports an agent confirmed for my home that wait on my permission. Metadata only. */
export const listPendingAgentReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: mine } = await admin.from("lender_portfolio_clients").select("id").eq("homeowner_id", context.userId).is("archived_at", null);
    const ids = (mine ?? []).map((m: any) => m.id);
    if (!ids.length) return [];
    const { data: files } = await admin
      .from("inspection_batch_files")
      .select("id, filename, extracted_date, org_id, lender_orgs(name)")
      .in("proposed_client_id", ids)
      .eq("attach_state", "pending_permission");
    return (files ?? []).map((f: any) => ({ id: f.id, filename: f.filename, inspectionDate: f.extracted_date, orgId: f.org_id, orgName: f.lender_orgs?.name ?? "" }));
  });

export const respondToAgentReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ fileId: z.string().uuid(), choice: z.enum(["add_once", "add_and_allow", "decline"]) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { attachToHomeowner } = await import("./inspection-batch.server");
    const { data: f } = await admin.from("inspection_batch_files").select("*").eq("id", data.fileId).maybeSingle();
    if (!f || f.attach_state !== "pending_permission" || !f.proposed_client_id) return { ok: false, error: "not_found" };
    const { data: c } = await admin.from("lender_portfolio_clients").select("homeowner_id, archived_at").eq("id", f.proposed_client_id).maybeSingle();
    if (!c || c.homeowner_id !== context.userId || c.archived_at) return { ok: false, error: "forbidden" };
    if (data.choice === "decline") {
      await admin.from("inspection_batch_files").update({ attach_state: "declined" }).eq("id", f.id);
      return { ok: true };
    }
    if (data.choice === "add_and_allow") {
      const { data: r } = await context.supabase.rpc("set_help_manage_home" as any, { p_org_id: f.org_id, p_enabled: true });
      if (!(r as any)?.ok) return { ok: false, error: (r as any)?.error ?? "error" };
    }
    await attachToHomeowner(admin, f, context.userId, f.confirmed_by ?? context.userId);
    return { ok: true };
  });

/** Agent-contributed reports on my home whose extracted changes await my review. */
export const listReportProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as any)
      .from("home_documents")
      .select("id, original_filename, inspection_date, proposed_findings, proposals_status, contributed_by_org, lender_orgs:contributed_by_org(name)")
      .eq("user_id", context.userId)
      .eq("proposals_status", "pending");
    return (data ?? []).map((d: any) => ({
      id: d.id,
      filename: d.original_filename,
      inspectionDate: d.inspection_date,
      orgName: d.lender_orgs?.name ?? null,
      findings: (d.proposed_findings ?? []) as any[],
    }));
  });

/**
 * Homeowner applies (or dismisses) a report's extracted findings. Findings and
 * maintenance actions come from the existing pipeline; stated installed years go
 * through the versioned home-system save and never overwrite newer records.
 */
export const applyReportProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ documentId: z.string().uuid(), apply: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: doc } = await admin.from("home_documents").select("*").eq("id", data.documentId).maybeSingle();
    if (!doc || doc.user_id !== context.userId) return { ok: false, error: "forbidden" };
    // Single-winner transition guards repeated clicks.
    const { data: won } = await admin
      .from("home_documents")
      .update({ proposals_status: data.apply ? "applied" : "dismissed", proposals_applied_at: new Date().toISOString() })
      .eq("id", doc.id)
      .eq("proposals_status", "pending")
      .select("id");
    if (!won?.[0]) return { ok: true, already: true };
    if (!data.apply) return { ok: true };
    const findings = (doc.proposed_findings ?? []) as any[];
    if (findings.length) {
      await admin.from("home_inspection_findings").insert(
        findings.map((f) => ({
          document_id: doc.id,
          user_id: doc.user_id,
          system: f.system,
          condition: f.condition,
          remaining_life_years: f.remaining_life_years,
          urgency: f.urgency,
          defects: f.defects,
          recommended_action: f.recommended_action,
          recommended_category: f.recommended_category,
          source_excerpt: [f.source_excerpt, f.source_pages?.length ? `p. ${f.source_pages.join(", ")}` : null, doc.inspection_date].filter(Boolean).join(" · ").slice(0, 400),
        })),
      );
      const { actionsFromFindings } = await import("./documents-ai.server");
      for (const a of actionsFromFindings(findings)) {
        await admin.from("home_predicted_actions").upsert(
          { user_id: doc.user_id, document_id: doc.id, ...a },
          { onConflict: "user_id,action_key", ignoreDuplicates: true },
        );
      }
    }
    const { applyInstalledYears } = await import("./inspection-batch.server");
    const sys = await applyInstalledYears(context.supabase, admin, context.userId, null, doc);
    await admin.from("home_documents").update({ extraction_status: "ready", extracted_at: new Date().toISOString() }).eq("id", doc.id);
    return { ok: true, ...sys };
  });

/** Agent applies stated system details from an attached report — only under Workstream 3 permission. */
export const agentApplyReportSystems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ fileId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const org = await agentOrg(context.supabase, context.userId);
    const { data: f } = await admin.from("inspection_batch_files").select("org_id, document_id").eq("id", data.fileId).maybeSingle();
    if (!org || !f || f.org_id !== org.id || !f.document_id) return { ok: false, error: "forbidden" };
    const { data: doc } = await admin.from("home_documents").select("*").eq("id", f.document_id).maybeSingle();
    if (!doc) return { ok: false, error: "forbidden" };
    const { data: allowed } = await admin.rpc("agent_home_system_allowed", {
      _actor: context.userId,
      _org_id: org.id,
      _homeowner: doc.user_id,
    });
    if (!allowed) return { ok: false, error: "no_permission" };
    const { applyInstalledYears } = await import("./inspection-batch.server");
    return { ok: true, ...(await applyInstalledYears(context.supabase, admin, doc.user_id, org.id, doc)) };
  });
