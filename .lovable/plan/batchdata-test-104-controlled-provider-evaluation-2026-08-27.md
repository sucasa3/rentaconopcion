# BATCHDATA_TEST_104 — controlled provider evaluation

Goal: measure BatchData objectively across ~104 homeowner records, with zero ATTOM calls and a complete, auditable record of every provider request.

## Current state (verified)

The BatchData Test Lab already exists and is isolated from production:
- Admin-only route with a live connection test, manual address entry, and contact selection (capped at 100).
- Isolated tables `batchdata_test_runs` and `batchdata_test_results` — no writes to production property records.
- One provider endpoint in use: `/property/lookup/all-attributes`, a single bundled lookup per address.
- A normalizer that maps the bundle into property, ownership, valuation, mortgage, sales, permits and contact groups.
- ATTOM is already fully disabled — all 9 datasets are off and the monthly trial cap is exhausted, so zero ATTOM calls will occur regardless.

What is missing for the test you specified: CSV upload as an input source, per-call audit fields (retry / duplicate / cache-hit / attempt number), the 104-record cap, and the analysis report.

## What gets built

### 1. CSV upload into the test lab
Add a CSV/Excel drop zone to the Test Lab that reuses the existing bulk-upload parser (same header aliases and address splitting agents already use for adding homeowners). Parsed rows preview in a table before anything runs; the run button stays disabled until you confirm. Raise the run cap from 100 to 150 so all 104 records go in one run.

Records are held in the test run only — the CSV does not create homeowner accounts, portfolio clients, or production property records.

### 2. Test run header
Creating the run records: label `BATCHDATA_TEST_104`, test ID, start time, input record count, provider endpoint in use, and `attom_calls = 0` asserted in the run notes. A guard in the test runner throws if any ATTOM code path is reached during a test run.

### 3. Full per-request audit log
Extend the test result rows with the fields needed to audit call behavior: attempt number, retry flag, duplicate-address flag, cache-hit flag, request type, and the request/response identifiers already captured. Every single HTTP request — including retries and failures — writes its own row, so total rows equal total provider calls.

### 4. Run the real workflow, unoptimized
Each record goes through the actual SuCasa path: normalize address → BatchData lookup → normalize response → store in the test cache. No pre-deduping of the input, no call-shaving. Duplicates and cache hits are detected and labeled, not prevented, so the difference between "BatchData needed this call" and "our app made this call" is measurable rather than hidden.

Retry policy for the test: one retry only, on transport errors and 5xx. No retry on a clean no-match — an unmatched property is a result, not a failure.

### 5. Analysis report
A report view on the completed run computing, straight from the logged rows:
- Matched / unmatched / fully enriched / partially enriched / failed counts.
- Total calls, failed calls, retry calls, duplicate calls, cache hits.
- Calls per home: average, median, min, max, plus the 1 / 2 / 3 / 4 / 5+ distribution.
- Calls per matched home and per fully enriched home.
- Provider-required calls vs. application-generated calls, reported separately.
- Data coverage table across property, owner, sales, tax, mortgage, valuation, permits and other fields, each marked returned / not returned / not requested / not available on plan, with the percentage of matched homes and calls required.
- FULL / PARTIAL / FAILED classification per home, with the specific missing fields that caused each PARTIAL.
- Scale projections for 1,000 / 10,000 / 100,000 homes derived from the observed rate, given as a range using observed min, median and max.
- CSV export of both the per-call log and the per-home summary.

### 6. Executive summary
Delivered in chat in the exact format you specified, ending with the five conclusion questions answered strictly from the test evidence — and no provider recommendation.

## Guardrails

- BatchData only. No ATTOM fallback, no other provider, no unrelated enrichment jobs.
- The background enrichment worker stays paused for the duration of the run.
- Production provider architecture and all ATTOM functionality remain untouched.
- A field BatchData cannot return is recorded as not returned. It is never sourced elsewhere.

## Technical notes

- Input parsing reuses the existing `xlsx`-based bulk parser; no new dependency.
- New columns land on `batchdata_test_results` (attempt, is_retry, is_duplicate_address, cache_hit, request_type) via one migration; no production table changes.
- Concurrency stays at the current throttle to avoid rate-limit noise skewing the failure count.
- Coverage classification is driven by an explicit required-field list for the SuCasa Home Profile, defined in the normalizer so the PARTIAL reasons are reproducible.

## Sequence

1. Build the above.
2. You upload the CSV.
3. I confirm: "CSV received. Test is configured. ATTOM calls are disabled for this test. Ready to begin."
4. I wait for your go-ahead before a single provider call is made.
