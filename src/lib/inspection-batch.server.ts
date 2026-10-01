/**
 * Workstream 4 — server-only helpers. Callers authorize first; these helpers
 * use the service client only for storage copies and cross-table writes.
 */
import { INSPECTION_LIMITS, isOlderThan, matchInspection } from "./inspection-batch";
import { emptyExtraction, normalizeBatchExtraction, type BatchExtraction } from "./inspection.server";

const MOCK_MARKER = "SUCASA-SYNTHETIC-MOCK";

/** Test-only extraction: flagged test workspaces + an embedded synthetic marker. Never calls AI. */
export function mockExtraction(bytes: Uint8Array): BatchExtraction | null {
  const text = new TextDecoder("latin1").decode(bytes);
  const i = text.indexOf(MOCK_MARKER);
  if (i < 0) return null;
  const line = text.slice(i + MOCK_MARKER.length).split(/\r?\n/)[0].trim();
  try {
    const p = JSON.parse(line);
    if (p.unreadable) return emptyExtraction();
    return normalizeBatchExtraction(p);
  } catch {
    return emptyExtraction();
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function activeOrgClients(admin: any, orgId: string) {
  const { data } = await admin
    .from("lender_portfolio_clients")
    .select("id, homeowner_id, client_name, address_line1, city, state, zip, lender_portfolios!inner(lender_org_id)")
    .eq("lender_portfolios.lender_org_id", orgId)
    .is("archived_at", null)
    .limit(5000);
  return (data ?? []) as Array<{ id: string; homeowner_id: string | null; client_name: string | null; address_line1: string; city: string | null; state: string | null; zip: string | null }>;
}

/** Process one claimed file: extract → match → flag duplicates / older reports. */
export async function processClaimedFile(admin: any, file: any, isTestOrg: boolean, extract: (b: Uint8Array, name: string) => Promise<BatchExtraction>) {
  const { data: blob, error } = await admin.storage.from("inspection-batches").download(file.storage_path);
  if (error || !blob) throw new Error("storage_missing");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mocked = isTestOrg ? mockExtraction(bytes) : null;
  const ex = mocked ?? (await extract(bytes, file.filename));
  if (!ex.readable) {
    await admin.from("inspection_batch_files").update({ status: "unreadable", lease_until: null, error: "needs_review" }).eq("id", file.id);
    return;
  }
  const clients = await activeOrgClients(admin, file.org_id);
  const m = matchInspection(ex.address, clients);
  let matchStatus: string = m.status;
  let duplicateOf: string | null = file.duplicate_of ?? null;
  const proposed = m.status === "exact" ? m.candidates[0] : null;
  if (!duplicateOf && proposed && ex.inspection_date) {
    const { data: dup } = await admin
      .from("inspection_batch_files")
      .select("id")
      .eq("org_id", file.org_id)
      .eq("proposed_client_id", proposed)
      .eq("extracted_date", ex.inspection_date)
      .neq("id", file.id)
      .limit(1);
    if (dup?.[0]) duplicateOf = dup[0].id;
  }
  if (duplicateOf) matchStatus = "duplicate";
  let older = false;
  const homeowner = clients.find((c) => c.id === proposed)?.homeowner_id ?? null;
  if (homeowner && ex.inspection_date) {
    const { data: last } = await admin
      .from("home_system_changes")
      .select("created_at")
      .eq("homeowner_user_id", homeowner)
      .order("created_at", { ascending: false })
      .limit(1);
    older = isOlderThan(ex.inspection_date, last?.[0]?.created_at ?? null);
  }
  await admin
    .from("inspection_batch_files")
    .update({
      status: "ready",
      lease_until: null,
      error: null,
      extracted_address: [ex.address.street, ex.address.city, ex.address.state, ex.address.zip].filter(Boolean).join(", ") || null,
      extracted_unit: ex.address.unit,
      extracted_date: ex.inspection_date,
      address_pages: ex.address_pages,
      findings: ex.findings,
      match_status: matchStatus,
      candidate_client_ids: m.candidates,
      proposed_client_id: proposed,
      duplicate_of: duplicateOf,
      older_than_records: older,
    })
    .eq("id", file.id);
}

/**
 * Attach a confirmed report to the homeowner's documents. Idempotent through the
 * unique source_batch_file_id index; never applies findings or system changes.
 */
export async function attachToHomeowner(admin: any, file: any, homeowner: string, confirmedBy: string) {
  const { data: existing } = await admin.from("home_documents").select("id").eq("source_batch_file_id", file.id).maybeSingle();
  let docId = existing?.id as string | undefined;
  if (!docId) {
    const { data: blob, error } = await admin.storage.from("inspection-batches").download(file.storage_path);
    if (error || !blob) throw new Error("storage_missing");
    const path = `${homeowner}/agent-report-${file.id}.pdf`;
    const up = await admin.storage.from("home-documents").upload(path, blob, { upsert: true, contentType: "application/pdf" });
    if (up.error) throw new Error(up.error.message);
    const { data: ins, error: iErr } = await admin
      .from("home_documents")
      .upsert(
        {
          user_id: homeowner,
          kind: "inspection",
          storage_path: path,
          original_filename: file.filename,
          size_bytes: file.size_bytes,
          extraction_status: "awaiting_review",
          contributed_by_org: file.org_id,
          contributed_by_user: confirmedBy,
          source_batch_file_id: file.id,
          inspection_date: file.extracted_date,
          proposed_findings: file.findings ?? [],
          proposals_status: (file.findings ?? []).length ? "pending" : null,
        },
        { onConflict: "source_batch_file_id", ignoreDuplicates: true },
      )
      .select("id");
    if (iErr) throw new Error(iErr.message);
    docId = ins?.[0]?.id;
    if (!docId) {
      const { data: again } = await admin.from("home_documents").select("id").eq("source_batch_file_id", file.id).maybeSingle();
      docId = again?.id;
    }
  }
  await admin.from("inspection_batch_files").update({ attach_state: "attached", document_id: docId }).eq("id", file.id);
  return docId as string;
}

export const SYSTEM_KEYS = ["roof", "hvac", "water_heater", "windows", "electrical", "siding"] as const;

/**
 * Apply supported system details (stated installed years only) through the
 * Workstream 3 versioned RPC. Older reports never overwrite newer records.
 */
export async function applyInstalledYears(
  rpcClient: any,
  admin: any,
  homeowner: string,
  orgId: string | null,
  doc: { inspection_date: string | null; proposed_findings: any[] | null; original_filename: string | null },
  approvedReplace: string[] = [],
  dryRun = false,
) {
  const applied: string[] = [];
  const unchanged: string[] = [];
  const needsApproval: Array<{ key: string; current: number; proposed: number; historyBacked: boolean }> = [];
  const skippedOlder: string[] = [];
  const conflicts: string[] = [];
  for (const f of doc.proposed_findings ?? []) {
    const key = f.system === "exterior" ? null : f.system;
    if (!key || !(SYSTEM_KEYS as readonly string[]).includes(key) || !f.installed_year) continue;
    const { data: last } = await admin
      .from("home_system_changes")
      .select("created_at")
      .eq("homeowner_user_id", homeowner)
      .eq("component_key", key)
      .order("created_at", { ascending: false })
      .limit(1);
    if (!doc.inspection_date || isOlderThan(doc.inspection_date, last?.[0]?.created_at ?? null)) {
      skippedOlder.push(key);
      continue;
    }
    // Populated values (with or without history) have unknown or newer recency:
    // never replace without explicit approval for that system.
    const current = await currentInstalledYear(admin, homeowner, key);
    if (current != null) {
      if (current === f.installed_year) { unchanged.push(key); continue; }
      if (!approvedReplace.includes(key)) {
        needsApproval.push({ key, current, proposed: f.installed_year, historyBacked: !!last?.[0] });
        continue;
      }
    }
    if (dryRun) { applied.push(key); continue; }
    const { data: ver } = await admin
      .from("home_system_versions")
      .select("version")
      .eq("homeowner_user_id", homeowner)
      .eq("component_key", key)
      .maybeSingle();
    const { data: res } = await rpcClient.rpc("save_home_system", {
      p_homeowner: homeowner,
      p_component_key: key,
      p_org_id: orgId as unknown as string,
      p_expected_version: ver?.version ?? 0,
      p_action: "replaced",
      p_installed_year: f.installed_year,
      p_serviced_on: null as unknown as string,
      p_brand: null as unknown as string,
      p_model: null as unknown as string,
      p_warranty_years: null as unknown as number,
      p_provider: null as unknown as string,
      p_notes: `From inspection report ${doc.original_filename ?? ""} (${doc.inspection_date})`.slice(0, 500),
    });
    if ((res as any)?.ok) applied.push(key);
    else conflicts.push(key);
  }
  return { applied, skippedOlder, conflicts, unchanged, needsApproval };
}

/** Latest recorded installed year for a system, from any entry path. */
export async function currentInstalledYear(admin: any, homeowner: string, key: string): Promise<number | null> {
  const { data } = await admin
    .from("home_component_service_log")
    .select("installed_year")
    .eq("user_id", homeowner)
    .eq("component_key", key)
    .not("installed_year", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.installed_year ?? null;
}

export { INSPECTION_LIMITS };
