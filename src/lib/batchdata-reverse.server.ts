/**
 * BatchData Reverse Skip Trace — Phase 1 server orchestration.
 *
 * Guardrails (all server-side, none bypassable from the browser):
 *   - Separate credential: BATCHDATA_REVERSE_API_KEY only; the property-lookup
 *     key (BATCHDATA_API_KEY) is never touched here.
 *   - Workspace-scoped: the caller must be a member of the organization that
 *     owns the contact's book (or an admin).
 *   - Owner-only is hard-coded on every request (see batchdata-reverse.ts).
 *   - Cache-first: a fresh usable result for the same contact + inputs is
 *     returned without a new paid call.
 *   - Duplicate guard: an in-flight lookup for the same contact is reused.
 *   - Monthly spending cap enforced BEFORE dispatch; uncertain billing
 *     outcomes are never auto-retried.
 *   - Durable record: the lookup row is written BEFORE the provider call, so
 *     a crash never leaves an unrecorded paid request.
 *   - No logs contain credentials or raw personal data.
 *
 * Server-only.
 */

import {
  buildReverseInput,
  buildReverseRequestBody,
  classifyReverseItem,
  estimateReverseCostCents,
  findReusableLookup,
  isInFlight,
  reverseSpendDecision,
  REVERSE_MAX_ITEM_COST_CENTS,
  REVERSE_WALLET_START_CENTS,
  type ReverseLookupRowLike,
} from "./batchdata-reverse";

const REVERSE_URL = "https://api.batchdata.com/api/v3/property/reverse-skip-trace";

/** Monthly testing cap in cents. Conservative default; override via env. */
export function reverseMonthlyCapCents(): number {
  const raw = Number(process.env["BATCHDATA_REVERSE_MONTHLY_CAP_CENTS"]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1_000; // $10 default
}

/** Org ids the user belongs to (agent and lender workspaces share this model). */
async function memberOrgIds(supabaseAdmin: any, userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("lender_members")
    .select("lender_org_id")
    .eq("user_id", userId)
    .is("suspended_at", null);
  return (data ?? []).map((m: any) => m.lender_org_id).filter(Boolean);
}

async function isAdmin(supabaseAdmin: any, userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" });
  return Boolean(data);
}

/** Contacts in the caller's own workspaces that have a phone or email. */
export async function listReverseContacts(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const orgIds = await memberOrgIds(supabaseAdmin, userId);
  if (!orgIds.length) return { contacts: [], orgCount: 0 };

  const { data: books } = await supabaseAdmin
    .from("lender_portfolios")
    .select("id, name, lender_org_id")
    .in("lender_org_id", orgIds);
  const bookById = new Map((books ?? []).map((b: any) => [b.id, b]));
  const bookIds = [...bookById.keys()];
  if (!bookIds.length) return { contacts: [], orgCount: orgIds.length };

  const { data: clients } = await supabaseAdmin
    .from("lender_portfolio_clients")
    .select("id, portfolio_id, client_name, client_phone, client_email, address_line1, city, state, zip")
    .in("portfolio_id", bookIds)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const contacts = (clients ?? [])
    .filter((c: any) => (c.client_phone ?? "").trim() || (c.client_email ?? "").trim())
    .map((c: any) => ({
      id: c.id,
      name: c.client_name,
      phone: c.client_phone,
      email: c.client_email,
      address: [c.address_line1, c.city, [c.state, c.zip].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", "),
      bookName: (bookById.get(c.portfolio_id) as any)?.name ?? null,
      orgId: (bookById.get(c.portfolio_id) as any)?.lender_org_id ?? null,
    }));
  return { contacts, orgCount: orgIds.length };
}

/** Estimated month-to-date reverse usage, in cents. Never shown as verified. */
export async function reverseUsageThisMonth(supabaseAdmin: any): Promise<{
  usedCents: number;
  capCents: number;
  lookups: number;
  walletStartCents: number;
}> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data } = await supabaseAdmin
    .from("batchdata_reverse_lookups")
    .select("estimated_cost_cents")
    .gte("created_at", monthStart.toISOString());
  const usedCents = (data ?? []).reduce((sum: number, r: any) => sum + (r.estimated_cost_cents ?? 0), 0);
  return {
    usedCents,
    capCents: reverseMonthlyCapCents(),
    lookups: (data ?? []).length,
    walletStartCents: REVERSE_WALLET_START_CENTS,
  };
}

export type RunReverseResult =
  | { outcome: "ok"; lookupId: string; cached: boolean; status: string }
  | { outcome: "blocked"; reason: string };

export async function runContactReverseLookup(opts: {
  userId: string;
  clientId: string;
}): Promise<RunReverseResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1. Load the contact and verify the caller's workspace owns it.
  const { data: client } = await supabaseAdmin
    .from("lender_portfolio_clients")
    .select("id, portfolio_id, client_name, client_phone, client_email, address_line1, city, state, zip, archived_at")
    .eq("id", opts.clientId)
    .maybeSingle();
  if (!client || client.archived_at) return { outcome: "blocked", reason: "Contact not found." };

  const { data: book } = await supabaseAdmin
    .from("lender_portfolios")
    .select("id, lender_org_id")
    .eq("id", client.portfolio_id)
    .maybeSingle();
  if (!book) return { outcome: "blocked", reason: "Contact not found." };

  const orgIds = await memberOrgIds(supabaseAdmin, opts.userId);
  if (!orgIds.includes(book.lender_org_id) && !(await isAdmin(supabaseAdmin, opts.userId))) {
    return { outcome: "blocked", reason: "This contact is not in your workspace." };
  }

  // 2. Validate and normalize inputs — no valid input, no call.
  const requestId = `rev_${opts.clientId.slice(0, 8)}_${Date.now().toString(36)}`;
  const input = buildReverseInput({
    phone: client.client_phone,
    email: client.client_email,
    requestId,
  });
  if (!input.ok) {
    const { data: row } = await supabaseAdmin
      .from("batchdata_reverse_lookups")
      .insert({
        org_id: book.lender_org_id,
        portfolio_client_id: client.id,
        requested_by: opts.userId,
        status: "invalid_input",
        error_message: input.reason,
      })
      .select("id")
      .single();
    return { outcome: "ok", lookupId: row?.id ?? "", cached: false, status: "invalid_input" };
  }

  // 3. Existing usable result? Return it — no second paid call.
  const { data: priorRows } = await supabaseAdmin
    .from("batchdata_reverse_lookups")
    .select("id, status, input_phone, input_email, created_at, review_state")
    .eq("portfolio_client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const prior = (priorRows ?? []) as (ReverseLookupRowLike & { id: string })[];

  const inFlight = prior.find((r) => isInFlight(r));
  if (inFlight) {
    return { outcome: "ok", lookupId: inFlight.id, cached: true, status: "pending" };
  }
  const reusable = findReusableLookup(prior, { phone: input.phone, email: input.email });
  if (reusable) {
    return { outcome: "ok", lookupId: (reusable as any).id, cached: true, status: reusable.status };
  }

  // 4. Monthly spending cap, checked BEFORE dispatch.
  const usage = await reverseUsageThisMonth(supabaseAdmin);
  const spend = reverseSpendDecision({ usedCentsThisMonth: usage.usedCents, capCents: usage.capCents });
  if (!spend.allowed) return { outcome: "blocked", reason: spend.reason! };

  // 5. Credential — separate reverse-lookup token, server-side only.
  const apiKey = process.env["BATCHDATA_REVERSE_API_KEY"];
  if (!apiKey) {
    return { outcome: "blocked", reason: "Reverse-lookup credential is not configured yet." };
  }

  // 6. Durable pre-call record: a crash after dispatch still leaves a row.
  const { data: pending, error: insertErr } = await supabaseAdmin
    .from("batchdata_reverse_lookups")
    .insert({
      org_id: book.lender_org_id,
      portfolio_client_id: client.id,
      requested_by: opts.userId,
      input_phone: input.phone ?? null,
      input_email: input.email ?? null,
      status: "pending",
    })
    .select("id")
    .single();
  if (insertErr || !pending) {
    return { outcome: "blocked", reason: "Could not record the lookup. Nothing was sent." };
  }

  // 7. One call, no automatic retry — an uncertain billing outcome is held.
  const body = buildReverseRequestBody({ requestId, phone: input.phone, email: input.email });
  let httpStatus = 0;
  let raw: any = null;
  let fetchError: string | null = null;
  try {
    const res = await fetch(REVERSE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    httpStatus = res.status;
    const text = await res.text();
    try {
      raw = JSON.parse(text);
    } catch {
      raw = null;
    }
    if (!res.ok) fetchError = `HTTP ${res.status}`;
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  const providerRequestId = raw?.result?.meta?.requestId ?? null;

  if (fetchError || !raw?.result?.data?.length) {
    await supabaseAdmin
      .from("batchdata_reverse_lookups")
      .update({
        status: "provider_error",
        http_status: httpStatus || null,
        provider_request_id: providerRequestId,
        error_message: (fetchError ?? "Unexpected provider response").slice(0, 300),
        updated_at: new Date().toISOString(),
      })
      .eq("id", pending.id);
    return { outcome: "ok", lookupId: pending.id, cached: false, status: "provider_error" };
  }

  const item = raw.result.data[0];
  const classified = classifyReverseItem(item, client.client_name);

  await supabaseAdmin
    .from("batchdata_reverse_lookups")
    .update({
      status: classified.status,
      person_count: classified.persons.length,
      persons: classified.persons as any,
      multi_person_flag: classified.multiPerson,
      name_evidence: classified.nameEvidence,
      provider_request_id: providerRequestId,
      http_status: httpStatus,
      error_message: classified.errorMessage ?? classified.reviewReason,
      estimated_cost_cents: estimateReverseCostCents(classified.billableResults),
      billing_basis: "estimated",
      updated_at: new Date().toISOString(),
    })
    .eq("id", pending.id);

  return { outcome: "ok", lookupId: pending.id, cached: false, status: classified.status };
}

/** Lookups for contacts in the caller's workspaces, newest first. */
export async function listReverseLookups(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const orgIds = await memberOrgIds(supabaseAdmin, userId);
  if (!orgIds.length) return { lookups: [], usage: await reverseUsageThisMonth(supabaseAdmin) };

  const { data } = await supabaseAdmin
    .from("batchdata_reverse_lookups")
    .select(
      "id, org_id, portfolio_client_id, input_phone, input_email, status, person_count, persons, multi_person_flag, name_evidence, error_message, estimated_cost_cents, billing_basis, review_state, approved_property, handed_off_at, created_at",
    )
    .in("org_id", orgIds)
    .order("created_at", { ascending: false })
    .limit(50);

  return { lookups: data ?? [], usage: await reverseUsageThisMonth(supabaseAdmin) };
}

export type ApproveResult =
  | { outcome: "handed_off"; queueJobId: string | null; addressUpdated: boolean }
  | { outcome: "blocked"; reason: string };

/**
 * Deliberate handoff of an approved property association to the existing
 * enrichment workflow. Never overwrites an existing address; enqueues a job
 * WITHOUT a release grant, so no paid property lookup can dispatch — that
 * stays behind the existing explicit release process.
 */
export async function approveReverseLookupProperty(opts: {
  userId: string;
  lookupId: string;
  personIndex: number;
}): Promise<ApproveResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: lookup } = await supabaseAdmin
    .from("batchdata_reverse_lookups")
    .select("id, org_id, portfolio_client_id, status, persons, review_state, handed_off_at")
    .eq("id", opts.lookupId)
    .maybeSingle();
  if (!lookup) return { outcome: "blocked", reason: "Lookup not found." };

  const orgIds = await memberOrgIds(supabaseAdmin, opts.userId);
  if (!orgIds.includes(lookup.org_id) && !(await isAdmin(supabaseAdmin, opts.userId))) {
    return { outcome: "blocked", reason: "This lookup is not in your workspace." };
  }
  if (lookup.handed_off_at) return { outcome: "blocked", reason: "Already handed off." };
  if (lookup.status !== "matched" && lookup.status !== "needs_review") {
    return { outcome: "blocked", reason: "Only a matched or reviewed result can be handed off." };
  }

  const persons = (lookup.persons as any[]) ?? [];
  const person = persons[opts.personIndex];
  if (!person) return { outcome: "blocked", reason: "Person not found in this result." };

  const prop = person.property;
  const address = prop?.fullAddress
    ? {
        street: prop.street ?? prop.fullAddress,
        city: prop.city ?? null,
        state: prop.state ?? null,
        zip: prop.zip ?? null,
        full: prop.fullAddress,
      }
    : null;
  if (!address?.street || (!address.city && !address.state && !address.zip)) {
    return { outcome: "blocked", reason: "This association has no usable property address." };
  }

  const { data: client } = await supabaseAdmin
    .from("lender_portfolio_clients")
    .select("id, portfolio_id, address_line1, city, state, zip")
    .eq("id", lookup.portfolio_client_id)
    .maybeSingle();
  if (!client) return { outcome: "blocked", reason: "Contact not found." };

  // Never overwrite an existing address — a conflict stays preserved in the
  // lookup record for a human to reconcile.
  const hasAddress = Boolean(
    client.address_line1?.trim() && ((client.city && client.state) || client.zip),
  );
  let addressUpdated = false;
  if (!hasAddress) {
    const { error } = await supabaseAdmin
      .from("lender_portfolio_clients")
      .update({
        address_line1: address.street,
        city: address.city,
        state: address.state,
        zip: address.zip,
        updated_at: new Date().toISOString(),
      })
      .eq("id", client.id);
    addressUpdated = !error;
  }

  // Enqueue enrichment only — no release grant, so the worker cannot spend.
  const { data: existingJob } = await supabaseAdmin
    .from("property_enrichment_queue")
    .select("id")
    .eq("portfolio_client_id", client.id)
    .maybeSingle();
  let queueJobId: string | null = existingJob?.id ?? null;
  if (!queueJobId) {
    const { data: job } = await supabaseAdmin
      .from("property_enrichment_queue")
      .insert({ portfolio_client_id: client.id, portfolio_id: client.portfolio_id, priority: 1 })
      .select("id")
      .single();
    queueJobId = job?.id ?? null;
  }

  await supabaseAdmin
    .from("batchdata_reverse_lookups")
    .update({
      review_state: "approved",
      approved_property: {
        personIndex: opts.personIndex,
        personName: person.fullName ?? null,
        address,
        addressUpdated,
      } as any,
      handed_off_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", lookup.id);

  return { outcome: "handed_off", queueJobId, addressUpdated };
}
