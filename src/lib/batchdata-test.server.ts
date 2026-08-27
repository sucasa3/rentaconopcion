/**
 * BatchData TEST harness — server-only, fully isolated from production.
 *
 * Nothing in this file writes to `property_intel`, `attom_*`, the enrichment
 * queue, or any homeowner-facing table. Results land only in
 * `batchdata_test_runs` / `batchdata_test_results`.
 */

import {
  isMatched,
  normalizeBatchdataProperty,
  normalizeTestAddress,
  parseTestAddress,
} from "./batchdata-normalize";

const BATCHDATA_BASE = "https://api.batchdata.com/api/v1";
const LOOKUP_PATH = "/property/lookup/all-attributes";

/** Estimated cost per successful lookup, in cents. UNVERIFIED — see memo. */
export const BATCHDATA_EST_COST_CENTS = 10;

export interface RawCall {
  ok: boolean;
  status: number;
  durationMs: number;
  raw: unknown;
  error: string | null;
  requestId: string | null;
}

async function callBatchdata(address: string): Promise<RawCall> {
  const apiKey = process.env["BATCHDATA_API_KEY"];
  const started = Date.now();
  if (!apiKey) {
    return { ok: false, status: 500, durationMs: 0, raw: null, error: "BATCHDATA_API_KEY not configured", requestId: null };
  }

  const parsed = parseTestAddress(address);
  if (!parsed.address_line1 || (!parsed.city && !parsed.state && !parsed.zip)) {
    return {
      ok: false,
      status: 422,
      durationMs: 0,
      raw: null,
      error: "Incomplete address: street plus city/state/ZIP required",
      requestId: null,
    };
  }

  const body = {
    requests: [
      {
        address: {
          street: parsed.address_line1,
          city: parsed.city,
          state: parsed.state,
          zip: parsed.zip,
        },
      },
    ],
  };

  try {
    const res = await fetch(`${BATCHDATA_BASE}${LOOKUP_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const durationMs = Date.now() - started;
    const requestId = res.headers.get("x-request-id") ?? res.headers.get("request-id");
    const text = await res.text();
    let raw: unknown = null;
    try {
      raw = JSON.parse(text);
    } catch {
      raw = { _nonJson: text.slice(0, 2000) };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, durationMs, raw, error: `HTTP ${res.status}`, requestId };
    }
    return { ok: true, status: res.status, durationMs, raw, error: null, requestId };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      durationMs: Date.now() - started,
      raw: null,
      error: err instanceof Error ? err.message : String(err),
      requestId: null,
    };
  }
}

/** Connection check — one live call against a known-good address. */
export async function batchdataConnectionTest(): Promise<{
  pass: boolean;
  status: number;
  durationMs: number;
  requestId: string | null;
  message: string;
  keyConfigured: boolean;
}> {
  const keyConfigured = Boolean(process.env["BATCHDATA_API_KEY"]);
  const call = await callBatchdata("1600 Pennsylvania Ave NW, Washington, DC 20500");
  return {
    pass: call.ok,
    status: call.status,
    durationMs: call.durationMs,
    requestId: call.requestId,
    keyConfigured,
    message: call.ok
      ? "Authenticated and endpoint reachable."
      : call.error ?? "Request failed.",
  };
}

export interface TestInput {
  address: string;
  sourceContactId?: string | null;
  sourceLabel?: string | null;
}

export async function runBatchdataTest(opts: {
  label: string;
  inputs: TestInput[];
  createdBy: string;
  notes?: string | null;
}): Promise<{ runId: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const inputs = opts.inputs.slice(0, 100);

  const { data: run, error: runErr } = await supabaseAdmin
    .from("batchdata_test_runs")
    .insert({
      label: opts.label,
      created_by: opts.createdBy,
      status: "running",
      submitted_count: inputs.length,
      notes: opts.notes ?? null,
    })
    .select("id")
    .single();
  if (runErr || !run) throw new Error(runErr?.message ?? "Could not create test run");

  let matched = 0;
  let unmatched = 0;
  let failed = 0;
  let requests = 0;

  const CONCURRENCY = 3;
  for (let i = 0; i < inputs.length; i += CONCURRENCY) {
    const slice = inputs.slice(i, i + CONCURRENCY);
    const rows = await Promise.all(
      slice.map(async (input) => {
        const requestedAt = new Date().toISOString();
        const call = await callBatchdata(input.address);
        requests += 1;
        const normalized = call.ok ? normalizeBatchdataProperty(call.raw) : null;
        const didMatch = isMatched(normalized);
        if (!call.ok) failed += 1;
        else if (didMatch) matched += 1;
        else unmatched += 1;

        return {
          test_run_id: run.id,
          source_contact_id: input.sourceContactId ?? null,
          source_label: input.sourceLabel ?? null,
          input_address: input.address,
          address_normalized: normalizeTestAddress(input.address),
          provider: "batchdata",
          provider_request_id: call.requestId,
          provider_property_id:
            ((call.raw as any)?.results?.properties?.[0]?._id as string | undefined) ??
            ((call.raw as any)?.results?.properties?.[0]?.id as string | undefined) ??
            null,
          http_status: call.status,
          success: call.ok,
          matched: didMatch,
          error_message: call.error,
          duration_ms: call.durationMs,
          raw_response: call.raw as any,
          normalized: normalized as any,
          usage_info: ((call.raw as any)?.status ?? null) as any,
          requested_at: requestedAt,
          responded_at: new Date().toISOString(),
        };
      }),
    );
    await supabaseAdmin.from("batchdata_test_results").insert(rows);
  }

  await supabaseAdmin
    .from("batchdata_test_runs")
    .update({
      status: "complete",
      matched_count: matched,
      unmatched_count: unmatched,
      failed_count: failed,
      api_request_count: requests,
      estimated_cost_cents: matched * BATCHDATA_EST_COST_CENTS,
      finished_at: new Date().toISOString(),
    })
    .eq("id", run.id);

  return { runId: run.id };
}
