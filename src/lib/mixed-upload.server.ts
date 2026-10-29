/**
 * Mixed-list upload execution (agent + lender). Disabled unless the actor is
 * listed in MIXED_UPLOAD_USER_IDS. Requires the unapplied review migration
 * docs/release-candidates/mixed-upload-migration.sql — never runs provider IO.
 */
import {
  addressKey as plannerAddressKey,
  mixedUploadEnabledFor,
  parseUploadCsv,
  planUpload,
  stagePayload,
  type UploadRole,
} from "./upload-intake";

export const LOOKUP_ESTIMATE_CENTS = 10;

export function mixedUploadEnabled(userId: string): boolean {
  return mixedUploadEnabledFor(userId, process.env.MIXED_UPLOAD_USER_IDS);
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function runMixedUpload(opts: {
  admin: any;
  portfolioId: string;
  actorId: string;
  role: UploadRole;
  csv: string;
}) {
  const { admin, portfolioId, actorId, role, csv } = opts;
  const { rows } = parseUploadCsv(csv);
  const { addressKey: legacyKey } = await import("./agent-discovery");
  const { partitionSuppressed } = await import("./suppression.server");
  const { suppressed } = await partitionSuppressed(admin, rows, (r) => ({
    email: r.email ?? null, street: r.address, zip: r.zip ?? null,
  }));
  const suppressedNums = new Set(suppressed.map((r) => r.rowNumber));

  // Existing identities in this book: live homes + kept contact-only/waiting rows.
  const [{ data: clients }, { data: staged }] = await Promise.all([
    admin.from("lender_portfolio_clients").select("address_line1, city, state, zip, client_email, client_phone")
      .eq("portfolio_id", portfolioId).is("archived_at", null),
    admin.from("upload_staged_rows").select("identity_key")
      .eq("book_id", portfolioId).in("outcome", ["contact_only", "waiting_capacity"]).is("promoted_at", null),
  ]);
  const existing = new Set<string>();
  for (const c of (clients ?? []) as any[]) {
    const k = plannerAddressKey({ address: c.address_line1 ?? "", zip: c.zip, city: c.city, state: c.state });
    if (k) existing.add(k);
    if (c.client_email) existing.add(`email:${String(c.client_email).trim().toLowerCase()}`);
    const p = String(c.client_phone ?? "").replace(/\D/g, "").slice(-10);
    if (p.length === 10) existing.add(`phone:${p}`);
  }
  for (const s of (staged ?? []) as any[]) if (s.identity_key) existing.add(s.identity_key);

  // Saved property records, matched by street + ZIP.
  const zips = [...new Set(rows.map((r) => (r.zip ?? "").slice(0, 5)).filter(Boolean))];
  const cached = new Set<string>();
  for (let i = 0; i < zips.length; i += 200) {
    const { data } = await admin.from("property_intel").select("address_line1, zip, avm, detail")
      .in("zip", zips.slice(i, i + 200));
    for (const p of (data ?? []) as any[]) {
      if (!p.avm && !p.detail) continue;
      const k = plannerAddressKey({ address: String(p.address_line1 ?? "").split(",")[0], zip: p.zip, city: null, state: null });
      if (k) cached.add(k);
    }
  }

  const live = rows.filter((r) => !suppressedNums.has(r.rowNumber));
  // Capacity is advisory here; stage_mixed_upload re-enforces it under an org lock.
  const plan = planUpload({
    role, rows: live, existingKeys: existing, cachedAddressKeys: cached,
    capacityRemaining: Number.MAX_SAFE_INTEGER, approvedLookups: 0, lookupCostCents: LOOKUP_ESTIMATE_CENTS,
  });
  const suppressedResults = rows.filter((r) => suppressedNums.has(r.rowNumber))
    .map((r) => ({ rowNumber: r.rowNumber, outcome: "unusable" as const, key: null, reason: "suppressed" }));
  const allPlan = { ...plan, results: [...plan.results, ...suppressedResults].sort((a, b) => a.rowNumber - b.rowNumber) };
  const payload = stagePayload(allPlan, rows, (r) => legacyKey(r as any), suppressedNums);

  const { data, error } = await admin.rpc("stage_mixed_upload", {
    p_book: portfolioId, p_actor: actorId, p_file_sha256: await sha256(csv), p_flow: role, p_rows: payload,
  });
  if (error) throw new Error(error.message);
  const counts = ((data as any)?.counts ?? {}) as Record<string, number>;
  const needs = counts.added_needs_lookup ?? 0;
  return {
    batchId: (data as any)?.batch_id as string,
    replayed: !!(data as any)?.replayed,
    totalRows: rows.length,
    counts,
    spend: {
      lookupsAwaitingApproval: needs,
      estimatedCents: needs * LOOKUP_ESTIMATE_CENTS,
      approvalRequired: needs > 0,
    },
  };
}

export async function approveMixedUploadSpend(opts: {
  admin: any; batchId: string; actorId: string; maxLookups: number; note?: string;
}) {
  const { data, error } = await opts.admin.rpc("approve_upload_spend", {
    p_batch: opts.batchId, p_actor: opts.actorId, p_max_lookups: opts.maxLookups, p_note: opts.note ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { released: number; paid_lookups: number; cached_reuse: number; grant_id: string | null };
}
