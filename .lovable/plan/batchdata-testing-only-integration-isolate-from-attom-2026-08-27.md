# BatchData — Testing-Only Integration (isolate from ATTOM)

## Where we stand today (verified)

- API key is stored as a Lovable secret (`BATCHDATA_API_KEY`), read server-side only. No key in frontend or database.
- `src/lib/batchdata.server.ts` exists: server-only client for BatchData's `POST /api/v1/property/lookup/all-attributes`, plus extractors for valuation, detail, tax, sales, mortgage, permits.
- `batchdata_call_log` table exists and has recorded 8 calls (7 HTTP 200, 1 HTTP 400). Live calls do work.
- `data_provider_health` table exists (per-provider, per-dataset on/off switches).

Important, and contrary to what this request asks for: **BatchData is currently wired into the live property pipeline, and ATTOM is switched off.**

- `src/lib/valuation.server.ts` now falls back to BatchData inside the shared `getPropertyIntel()` used by production Home Profiles and enrichment.
- `src/lib/enrichment.server.ts` counts BatchData-enabled datasets as enrichable, so the background worker uses it.
- All 9 ATTOM datasets are disabled in both `attom_endpoint_health` and `data_provider_health` (done earlier because the ATTOM key was returning 401).

So the honest status is: connected and working, but **not isolated**. Step one below fixes that.

## Plan

### 1. Restore isolation (first, before anything new)
- Remove the BatchData fallback branch from `getPropertyIntel()` so the production path is ATTOM-and-cache only, exactly as before.
- Revert `enrichment.server.ts` to count only ATTOM-enabled datasets.
- Leave ATTOM's disabled flags as they are (they were turned off because of the 401 entitlement problem, not because of BatchData) and confirm with you whether to re-enable once the ATTOM key is restored.
- Result: production Home Profiles, enrichment queue, cron, budget caps and lender/agent workflows behave the same as before BatchData existed.

### 2. Document the BatchData API surface
Write a short capability memo covering endpoint(s) used, required inputs, returned datasets, auth header, rate limits, batch size, pagination, and the billing unit (per request vs per match vs per record). Anything BatchData's docs don't state clearly gets flagged as unknown rather than guessed — the per-call cost currently hard-coded (10¢) is an estimate and will be marked as unverified until confirmed.

### 3. Test-only data model
New tables, fully separate from `property_intel`:
- `batchdata_test_runs` — run label, created_by, counts (submitted/matched/unmatched/failed), API request count, billing units, timing.
- `batchdata_test_results` — one row per contact: `test_run_id`, `source_contact_id`, input address, `provider='batchdata'`, provider request id, provider property id, request/response timestamps, success flag, error, **raw response JSON**, normalized JSON, usage info.
Admin-only RLS plus grants, matching existing conventions. Nothing writes to production property tables.

### 4. Normalizer
A `normalizeBatchdataProperty()` function producing the structure you listed (property, ownership, valuation, mortgage, sales, permits, contact), with `null` wherever BatchData gives nothing. Raw response is always kept alongside.

### 5. Test runner (server-side)
An admin-only server function that takes a set of contacts (selected from an existing book, or pasted/uploaded CSV), sends them to BatchData at a throttled concurrency, and writes one result row per contact plus a run summary. Uses BatchData's true batch form if the docs confirm one; otherwise controlled sequential batches.

### 6. Admin test UI — "BatchData Test"
New admin-only route, clearly labeled, separate from the production enrichment screen:
- Connection test card: PASS/FAIL, auth, endpoint reachability, response time, provider request id (never the key).
- Select/upload up to ~100 contacts, start run, live progress.
- Results table: matched / unmatched / failed, property + owner data, provider consumption.
- CSV export of the run.

### 7. Out of scope for this phase
No ATTOM-vs-BatchData comparison, no provider auto-switching, no pricing changes, no production enrichment changes.

## Technical notes
- Files edited: `src/lib/valuation.server.ts`, `src/lib/enrichment.server.ts` (both reverted to pre-BatchData behavior).
- Files added: `src/lib/batchdata-normalize.ts`, `src/lib/batchdata-test.functions.ts`, `src/lib/batchdata-test.server.ts`, `src/routes/_authenticated/admin/batchdata-test.tsx`.
- Migration: `batchdata_test_runs`, `batchdata_test_results` with GRANTs + admin-only RLS via `has_role`.
- `src/lib/batchdata.server.ts` stays, minus its role in the production fallback.

## Open question
The ATTOM key was returning 401, which is why ATTOM datasets are disabled. Isolating BatchData means production enrichment will produce nothing until the ATTOM entitlement is restored. Confirm you're fine with that pause, or say the word and I'll keep the BatchData fallback live for production while still building the isolated test harness.
