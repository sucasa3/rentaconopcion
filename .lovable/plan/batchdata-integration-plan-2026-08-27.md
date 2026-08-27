# BatchData Integration Plan

## Goal
Add BatchData as a side-by-side property-data provider alongside ATTOM, so SuCasa can enrich homeowner/lead records from either source and eventually compare or fail over between them.

## What we will build

1. **Securely store the API key**
   - Add `BATCHDATA_API_KEY` to the project secrets store so server functions can read it via `process.env['BATCHDATA_API_KEY']`.

2. **BatchData client wrapper**
   - Create `src/lib/batchdata.server.ts` with a typed fetcher for the BatchData Property Data API.
   - Support the endpoints needed for our enrichment flow: property details, ownership/tax, mortgage/loan, AVM/value, permits, and sales history.
   - Add request/response logging and basic retry logic.

3. **Unified property-intel mapping**
   - Build a mapper that normalizes BatchData responses into the same internal shape ATTOM uses, so the existing `property_intel` table and downstream opportunity logic keep working without changes.

4. **Provider health & routing config**
   - Extend `attom_endpoint_health` (or add a small `data_provider_health` table) so an admin can mark ATTOM and BatchData endpoints as enabled/disabled.
   - Update the enrichment worker to choose the provider per record: ATTOM first when healthy, BatchData as fallback, or BatchData first if configured.

5. **Cost/usage tracking**
   - Add a `batchdata_call_log` table mirroring `attom_call_log` so we can track calls, cache hits, status, and cost per record class.

6. **Background enrichment integration**
   - Wire BatchData into `src/lib/enrichment.server.ts` so the existing cron-driven queue can pull from BatchData when appropriate.
   - Preserve caching and deduplication: the same address should never be re-fetched from either provider within its TTL.

7. **Admin toggle**
   - Add a simple server function + UI control (or reuse the existing endpoint-health admin view) to set which provider is primary and which is fallback.

8. **Test batch**
   - Run a small manual batch (e.g., 10–50 records) through the new provider to verify mapping, caching, and cost tracking before scaling to 1,000.

## Out of scope for this plan
- Replacing ATTOM entirely.
- Changing the CSV upload flow or the enrichment queue schema.
- Adding new UI dashboards for BatchData-specific fields.

## Complexity
Medium. Most of the work is a new provider adapter that plugs into the existing enrichment pipeline.
