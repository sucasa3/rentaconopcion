import { uploadReverseInput, reverseBatchCeiling, reversePropertyCandidates } from "./upload-reverse";
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
    const search = (searches ?? []).find((s: any) => s.staged_id === r.id);
    // Never re-search a result from the original Test Lab, including old/uncertain outcomes.
    let previouslySearched = false;
    if (input.ok && !search) {
      const filters = [input.phone ? `input_phone.eq.${input.phone}` : null, input.email ? `input_email.eq.${input.email}` : null].filter(Boolean);
      const { data: prior, error: priorError } = await admin.from("batchdata_reverse_lookups").select("id")
        .eq("requested_by", actor).or(filters.join(",")).limit(1);
      if (priorError) throw new Error("Couldn't verify previous searches.");
      previouslySearched = !!prior?.length;
    }
    contacts.push({ id: r.id, row: r.row_number, name: r.payload.name ?? "—",
      eligible: input.ok && !suppressed && !search && !previouslySearched,
      reason: suppressed ? "Opted out" : !input.ok ? input.reason : previouslySearched ? "Previously searched — no repeat paid search" : null,
      search: search ? { id: search.id, status: search.status, estimatedCents: search.estimated_cost_cents as number | null,
        persons: search.persons, error: search.error_message,
        properties: (properties ?? []).filter((p: any) => p.search_id === search.id).map((p: any) => ({
          id: p.id, name: p.payload.name, address: [p.payload.address, p.payload.city, p.payload.state, p.payload.zip].filter(Boolean).join(", "), status: p.status,
        })) } : null,
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
    const result = await dispatchReverseItem({ apiKey: opts.apiKey, requestId: id, phone: input.phone, email: input.email, name: row.payload.name, fetcher: opts.fetcher });
    sent++;
    const { error: saveError } = await opts.admin.from("upload_reverse_searches").update({
      status: result.status, persons: result.persons, estimated_cost_cents: result.estimatedCostCents,
      error_message: result.errorMessage ?? result.reviewReason, provider_request_id: result.providerRequestId,
    }).eq("id", id);
    if (saveError) throw new Error("Search sent, but result couldn't be saved. Held; do not retry.");
    const candidates = reversePropertyCandidates(result.persons).map((p) => ({
      search_id: id, person_index: p.personIndex, property_key: p.key,
      payload: { ...p, name: row.payload.name, address_key: legacyAddressKey(p) }, status: "needs_review",
    }));
    if (candidates.length) {
      const { error: candidateError } = await opts.admin.from("upload_reverse_properties").upsert(candidates, { onConflict: "search_id,property_key", ignoreDuplicates: true });
      if (candidateError) throw new Error("Match saved, but review details couldn't be saved. Do not retry search.");
    }
    if (result.uncertain) break; // No subsequent batch calls after an uncertain outcome.
  }
  return { sent, maxCostCents: reserved.maxCostCents as number };
}

export async function confirmReverseUploadProperty(admin: any, actor: string, propertyId: string) {
  const { data: property, error } = await admin.from("upload_reverse_properties").select("search_id,payload").eq("id", propertyId).maybeSingle();
  if (error || !property) throw new Error("Match not found.");
  const { data: search } = await admin.from("upload_reverse_searches").select("batch_id,requested_by,input_email,input_phone").eq("id", property.search_id).maybeSingle();
  if (!search || search.requested_by !== actor) throw new Error("Match not found.");
  await ownedRows(admin, actor, search.batch_id);
  if (await isSuppressed(admin, { email: search.input_email, phone: search.input_phone, street: property.payload.address, zip: property.payload.zip })) {
    throw new Error("This contact opted out. Match remains held.");
  }
  const { data, error: confirmError } = await admin.rpc("confirm_upload_reverse_property", { p_property: propertyId, p_actor: actor });
  if (confirmError) throw new Error("Couldn't confirm this match. It remains held.");
  return data as { status: string; cached?: boolean };
}