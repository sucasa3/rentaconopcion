import { uploadReverseInput, reverseBatchCeiling, reversePropertyCandidates, withConflictReview } from "./upload-reverse";
import { findPriorReverseSearch } from "./reverse-prior.server";
import { getMixedUploadSummary } from "./mixed-upload.server";
import { isSuppressed } from "./suppression.server";
import { buildReverseInput } from "./batchdata-reverse";
import { dispatchReverseItem } from "./reverse-provider.server";
import { addressKey as legacyAddressKey } from "./agent-discovery";

async function ownedRows(admin: any, actor: string, batchId: string) {
  await getMixedUploadSummary(admin, batchId, actor);
  const { data, error } = await admin.from("upload_staged_rows").select("id, payload, book_id, row_number")
    .eq("batch_id", batchId).eq("outcome", "contact_only");
  if (error) throw new Error("Couldn't read retained contacts.");
  return (data ?? []) as { id: string; payload: any; book_id: string; row_number: number }[];
}

async function bookOrg(admin: any, bookId: string): Promise<string> {
  const { data, error } = await admin.from("lender_portfolios").select("lender_org_id").eq("id", bookId).maybeSingle();
  if (error || !data?.lender_org_id) throw new Error("Couldn't verify previous searches.");
  return data.lender_org_id;
}

export async function reverseUploadSummary(admin: any, actor: string, batchId: string) {
  const rows = await ownedRows(admin, actor, batchId);
  const { data: searches, error } = await admin.from("upload_reverse_searches").select("*").eq("batch_id", batchId).eq("requested_by", actor);
  if (error) throw new Error("Reverse-search storage isn't ready.");
  const ids = (searches ?? []).map((s: any) => s.id);
  const { data: properties, error: propError } = ids.length
    ? await admin.from("upload_reverse_properties").select("*").in("search_id", ids)
    : { data: [], error: null };
  if (propError) throw new Error("Couldn't read property matches.");
  const contacts = [];
  for (const r of rows) {
    const input = uploadReverseInput(r.payload);
    const suppressed = await isSuppressed(admin, r.payload);
    const mine = (searches ?? []).filter((s: any) => s.staged_id === r.id)
      .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));
    const search = mine[mine.length - 1];
    // Searches from the Test Lab AND from any upload (this account or workspace) block a paid repeat.
    let previouslySearched = false;
    if (input.ok && !search) {
      previouslySearched = !!await findPriorReverseSearch(admin, {
        orgId: await bookOrg(admin, r.book_id), actor, phone: input.phone, email: input.email, excludeStagedId: r.id,
      });
    }
    contacts.push({ id: r.id, row: r.row_number, name: r.payload.name ?? "—",
      eligible: input.ok && !suppressed && !search && !previouslySearched,
      reason: suppressed ? "Opted out" : !input.ok ? input.reason : previouslySearched ? "Previously searched — no repeat paid search" : null,
      rerunSearchId: search && mine.length === 1 && search.owner_filter === "owners_only" && search.status === "no_match" && !suppressed ? search.id as string : null,
      searches: mine.map((search: any) => ({ id: search.id, status: search.status, ownerFilter: search.owner_filter as string,
        estimatedCents: search.estimated_cost_cents as number | null, persons: search.persons, error: search.error_message,
        properties: (properties ?? []).filter((p: any) => p.search_id === search.id).map((p: any) => ({
          id: p.id, name: p.payload.name, address: [p.payload.address, p.payload.city, p.payload.state, p.payload.zip].filter(Boolean).join(", "), status: p.status,
        })) })),
    });
  }
  return { contacts, unitMaxCents: 30 };
}

export async function approveReverseUpload(opts: {
  admin: any; actor: string; batchId: string; selectedIds: string[]; maxLookups: number; maxCostCents: number;
  apiKey?: string; monthCap: number;
  /** Server/test dependency only; never accepted from RPC input. */
  fetcher?: typeof fetch;
}) {
  const ids = [...new Set(opts.selectedIds)];
  const ceiling = reverseBatchCeiling(ids.length);
  if (ids.length !== opts.selectedIds.length || ceiling.maxLookups !== opts.maxLookups || ceiling.maxCostCents !== opts.maxCostCents) {
    throw new Error("The selected contacts or confirmed ceiling changed. Review again.");
  }
  if (!opts.apiKey) throw new Error("Reverse search isn't configured.");
  const rows = await ownedRows(opts.admin, opts.actor, opts.batchId);
  const items = [];
  for (const id of ids) {
    const row = rows.find((r) => r.id === id);
    if (!row) throw new Error("Contact isn't in this upload.");
    const input = uploadReverseInput(row.payload);
    if (!input.ok) throw new Error(input.reason);
    if (await isSuppressed(opts.admin, row.payload)) throw new Error("An opted-out contact was selected. Nothing sent.");
    if (await findPriorReverseSearch(opts.admin, { orgId: await bookOrg(opts.admin, row.book_id), actor: opts.actor,
      phone: input.phone, email: input.email, excludeStagedId: id })) {
      throw new Error("A selected contact was already searched. Nothing sent; no repeat paid search.");
    }
    items.push({ stagedId: id, phone: input.phone ?? null, email: input.email ?? null });
  }
  const { data: reserved, error } = await opts.admin.rpc("reserve_upload_reverse", {
    p_batch: opts.batchId, p_actor: opts.actor, p_items: items, p_max_lookups: opts.maxLookups,
    p_max_cost_cents: opts.maxCostCents, p_month_cap: opts.monthCap,
  });
  if (error) throw new Error("Couldn't reserve this reverse-search batch. Nothing sent.");
  let sent = 0;
  for (const id of (reserved?.dispatchIds ?? []) as string[]) {
    const { data: search, error: loadError } = await opts.admin.from("upload_reverse_searches").select("*").eq("id", id).single();
    if (loadError || !search) throw new Error("Reserved search couldn't be loaded. Held; do not retry.");
    const row = rows.find((r) => r.id === search.staged_id);
    if (!row) throw new Error("Retained contact missing. Held; do not retry.");
    // Fail closed if a suppression arrives between approval and dispatch.
    if (await isSuppressed(opts.admin, row.payload)) {
      await opts.admin.from("upload_reverse_searches").update({ status: "suppressed", estimated_cost_cents: 0 }).eq("id", id);
      continue;
    }
    const input = buildReverseInput({ phone: search.input_phone, email: search.input_email, requestId: id });
    if (!input.ok) throw new Error("Reserved input isn't valid. Held.");
    // Atomic reserved → pending fence: even a repeated request cannot dispatch this twice.
    const { data: claimed, error: claimError } = await opts.admin.from("upload_reverse_searches")
      .update({ status: "pending", dispatched_at: new Date().toISOString() }).eq("id", id).eq("status", "reserved").select("id");
    if (claimError) throw new Error("Couldn't record dispatch. Nothing sent; held.");
    if (!claimed?.length) continue;
    const result = await dispatchAndSave(opts.admin, { id, apiKey: opts.apiKey, input, name: row.payload.name, fetcher: opts.fetcher });
    sent++;
    if (result.uncertain) break; // No subsequent batch calls after an uncertain outcome.
  }
  return { sent, maxCostCents: reserved.maxCostCents as number };
}

/** Dispatch one claimed search, save the outcome, and stage only provider-flagged owner properties for review. */
async function dispatchAndSave(admin: any, o: { id: string; apiKey: string; input: { phone?: string; email?: string }; name: string | null; fetcher?: typeof fetch }) {
  const result = withConflictReview(await dispatchReverseItem({ apiKey: o.apiKey, requestId: o.id, phone: o.input.phone, email: o.input.email, name: o.name, fetcher: o.fetcher }), { phone: o.input.phone, email: o.input.email });
  const { error: saveError } = await admin.from("upload_reverse_searches").update({
    status: result.status, persons: result.persons, estimated_cost_cents: result.estimatedCostCents,
    error_message: result.errorMessage ?? result.reviewReason, provider_request_id: result.providerRequestId,
  }).eq("id", o.id);
  if (saveError) throw new Error("Search sent, but result couldn't be saved. Held; do not retry.");
  const candidates = reversePropertyCandidates(result.persons).map((p) => ({
    search_id: o.id, person_index: p.personIndex, property_key: p.key,
    payload: { ...p, name: o.name, address_key: legacyAddressKey(p), conflict: result.conflict, ownership: "provider_flag_unverified" }, status: "needs_review",
  }));
  if (candidates.length) {
    const { error: candidateError } = await admin.from("upload_reverse_properties").upsert(candidates, { onConflict: "search_id,property_key", ignoreDuplicates: true });
    if (candidateError) throw new Error("Match saved, but review details couldn't be saved. Do not retry search.");
  }
  return result;
}

/**
 * One explicitly approved re-search of an owner-only "no match" with the
 * all-persons filter. The original result is kept; the RPC allows it once.
 */
export async function approveReverseRerun(opts: {
  admin: any; actor: string; searchId: string; maxCostCents: number; apiKey?: string; monthCap: number; fetcher?: typeof fetch;
}) {
  if (opts.maxCostCents !== 30) throw new Error("The confirmed ceiling changed. Review again.");
  if (!opts.apiKey) throw new Error("Reverse search isn't configured.");
  const { data: original, error } = await opts.admin.from("upload_reverse_searches").select("*").eq("id", opts.searchId).maybeSingle();
  if (error || !original || original.requested_by !== opts.actor) throw new Error("Search not found.");
  const rows = await ownedRows(opts.admin, opts.actor, original.batch_id);
  const row = rows.find((r) => r.id === original.staged_id);
  if (!row) throw new Error("Retained contact missing. Nothing sent.");
  if (await isSuppressed(opts.admin, row.payload)) throw new Error("This contact opted out. Nothing sent.");
  const { data: id, error: reserveError } = await opts.admin.rpc("reserve_upload_reverse_rerun", {
    p_search: opts.searchId, p_actor: opts.actor, p_max_cost_cents: opts.maxCostCents, p_month_cap: opts.monthCap,
  });
  if (reserveError || !id) throw new Error("Couldn't reserve this search. Nothing sent.");
  const input = buildReverseInput({ phone: original.input_phone, email: original.input_email, requestId: id });
  if (!input.ok) throw new Error("Reserved input isn't valid. Held.");
  const { data: claimed, error: claimError } = await opts.admin.from("upload_reverse_searches")
    .update({ status: "pending", dispatched_at: new Date().toISOString() }).eq("id", id).eq("status", "reserved").select("id");
  if (claimError || !claimed?.length) throw new Error("Couldn't record dispatch. Nothing sent; held.");
  const result = await dispatchAndSave(opts.admin, { id, apiKey: opts.apiKey, input, name: row.payload.name, fetcher: opts.fetcher });
  return { status: result.status, maxCostCents: 30 };
}

export async function confirmReverseUploadProperty(admin: any, actor: string, propertyId: string) {
  const { data: property, error } = await admin.from("upload_reverse_properties").select("search_id,payload").eq("id", propertyId).maybeSingle();
  if (error || !property) throw new Error("Match not found.");
  const { data: search } = await admin.from("upload_reverse_searches").select("batch_id,requested_by,input_email,input_phone,status").eq("id", property.search_id).maybeSingle();
  if (!search || search.requested_by !== actor) throw new Error("Match not found.");
  if (search.status !== "matched" && search.status !== "needs_review") throw new Error("This result can't be confirmed. It remains held.");
  await ownedRows(admin, actor, search.batch_id);
  if (await isSuppressed(admin, { email: search.input_email, phone: search.input_phone, street: property.payload.address, zip: property.payload.zip })) {
    throw new Error("This contact opted out. Match remains held.");
  }
  const { data, error: confirmError } = await admin.rpc("confirm_upload_reverse_property", { p_property: propertyId, p_actor: actor });
  if (confirmError) throw new Error("Couldn't confirm this match. It remains held.");
  return data as { status: string; cached?: boolean };
}