/**
 * BatchData TEST harness — server-only, fully isolated from production.
 *
 * Nothing in this file writes to `property_intel`, `attom_*`, the enrichment
 * queue, or any homeowner-facing table. Results land only in
 * `batchdata_test_runs` / `batchdata_test_results`.
 */

import {
  firstBatchdataProperty,
  isMatched,
  normalizeBatchdataProperty,
  normalizeTestAddress,
  parseTestAddress,
} from "./batchdata-normalize";
import { classifyCompleteness, evaluateCoverage } from "./batchdata-report";


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

/** Hard cap for a single evaluation run. */
export const MAX_TEST_INPUTS = 150;

function providerPropertyId(raw: unknown): string | null {
  const p = firstBatchdataProperty(raw) as Record<string, any> | null;
  return (p?.["_id"] as string | undefined) ?? (p?.["id"] as string | undefined) ?? null;
}

export async function runBatchdataTest(opts: {
  label: string;
  inputs: TestInput[];
  createdBy: string;
  notes?: string | null;
  /** Benchmark runs disable retries so the call count is exactly one per property. */
  noRetry?: boolean;
}): Promise<{ runId: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const inputs = opts.inputs.slice(0, MAX_TEST_INPUTS);


  const { data: run, error: runErr } = await supabaseAdmin
    .from("batchdata_test_runs")
    .insert({
      label: opts.label,
      created_by: opts.createdBy,
      status: "running",
      submitted_count: inputs.length,
      input_record_count: inputs.length,
      provider: "batchdata",
      endpoint: LOOKUP_PATH,
      attom_call_count: 0,
      notes: opts.notes ?? null,
    })
    .select("id")
    .single();
  if (runErr || !run) throw new Error(runErr?.message ?? "Could not create test run");

  let matched = 0;
  let unmatched = 0;
  let failed = 0;
  let requests = 0;

  // Duplicate detection + in-run cache. Duplicates are LABELLED, never
  // skipped — the point of the test is to measure them.
  const seenAddresses = new Set<string>();
  const CONCURRENCY = 3;
  const maxAttempts = opts.noRetry ? 1 : 2;
  /** Set when the account blocks further calls (payment/quota). Stops the run. */
  let blocked: string | null = null;

  for (let i = 0; i < inputs.length; i += CONCURRENCY) {
    if (blocked) break;
    const slice = inputs.slice(i, i + CONCURRENCY);
    const nested = await Promise.all(
      slice.map(async (input, sliceIdx) => {
        const homeIndex = i + sliceIdx + 1;
        const normalizedAddress = normalizeTestAddress(input.address);
        const isDuplicate = seenAddresses.has(normalizedAddress);
        seenAddresses.add(normalizedAddress);

        const rows: any[] = [];
        let attempt = 0;
        let call: RawCall | null = null;

        // Real workflow: one bundled lookup, one retry on transport/5xx only.
        while (attempt < maxAttempts) {
          attempt += 1;
          const requestedAt = new Date().toISOString();
          call = await callBatchdata(input.address);
          requests += 1;

          const normalized = call.ok ? normalizeBatchdataProperty(call.raw) : null;
          const didMatch = isMatched(normalized);
          const coverage = evaluateCoverage(normalized);

          rows.push({
            test_run_id: run.id,
            home_index: homeIndex,
            source_contact_id: input.sourceContactId ?? null,
            source_label: input.sourceLabel ?? null,
            input_address: input.address,
            address_normalized: normalizedAddress,
            provider: "batchdata",
            request_type: "lookup_all_attributes",
            attempt,
            is_retry: attempt > 1,
            is_duplicate_address: isDuplicate,
            cache_hit: false,
            provider_request_id: call.requestId,
            provider_property_id: providerPropertyId(call.raw),
            http_status: call.status,
            success: call.ok,
            matched: didMatch,
            error_message: call.error,
            duration_ms: call.durationMs,
            raw_response: call.raw as any,
            normalized: normalized as any,
            coverage: coverage as any,
            completeness: classifyCompleteness(didMatch, coverage),
            usage_info: ((call.raw as any)?.status ?? null) as any,
            requested_at: requestedAt,
            responded_at: new Date().toISOString(),
          });

          // Account-level block (payment required / quota): stop the whole run.
          const bodyText = JSON.stringify(call.raw ?? "").toLowerCase();
          if (
            !call.ok &&
            (call.status === 402 ||
              call.status === 403 ||
              call.status === 429 ||
              /insufficient|balance|quota|credit/.test(bodyText))
          ) {
            blocked = `HTTP ${call.status} — account blocked further calls`;
          }

          const retryable = !call.ok && !blocked && (call.status === 0 || call.status >= 500);
          if (!retryable) break;
        }

        const final = rows[rows.length - 1];
        if (!final.success) failed += 1;
        else if (final.matched) matched += 1;
        else unmatched += 1;

        return rows;
      }),
    );
    const flat = nested.flat();
    if (flat.length) await supabaseAdmin.from("batchdata_test_results").insert(flat);
  }



  await supabaseAdmin
    .from("batchdata_test_runs")
    .update({
      status: "complete",
      matched_count: matched,
      unmatched_count: unmatched,
      failed_count: failed,
      api_request_count: requests,
      attom_call_count: 0,
      estimated_cost_cents: requests * BATCHDATA_EST_COST_CENTS,
      finished_at: new Date().toISOString(),
    })
    .eq("id", run.id);

  return { runId: run.id };
}


/**
 * Re-score a completed run from the stored raw responses. Zero provider calls:
 * this only re-runs the normalizer + coverage classifier over data already in
 * `batchdata_test_results`.
 */
export async function rescoreBatchdataRun(runId: string): Promise<{
  rowsUpdated: number;
  matched: number;
  unmatched: number;
  failed: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await supabaseAdmin
    .from("batchdata_test_results")
    .select("id, success, raw_response, home_index")
    .eq("test_run_id", runId);
  if (error) throw new Error(error.message);

  let rowsUpdated = 0;
  const finalByHome = new Map<number, { matched: boolean; success: boolean }>();

  for (const row of rows ?? []) {
    const normalized = row.success ? normalizeBatchdataProperty(row.raw_response) : null;
    const didMatch = isMatched(normalized);
    const coverage = evaluateCoverage(normalized);
    await supabaseAdmin
      .from("batchdata_test_results")
      .update({
        normalized: normalized as any,
        coverage: coverage as any,
        matched: didMatch,
        completeness: classifyCompleteness(didMatch, coverage),
      })
      .eq("id", row.id);
    rowsUpdated += 1;
    finalByHome.set(row.home_index ?? rowsUpdated, { matched: didMatch, success: Boolean(row.success) });
  }

  let matched = 0;
  let unmatched = 0;
  let failed = 0;
  for (const v of finalByHome.values()) {
    if (!v.success) failed += 1;
    else if (v.matched) matched += 1;
    else unmatched += 1;
  }

  await supabaseAdmin
    .from("batchdata_test_runs")
    .update({ matched_count: matched, unmatched_count: unmatched, failed_count: failed })
    .eq("id", runId);

  return { rowsUpdated, matched, unmatched, failed };
}
