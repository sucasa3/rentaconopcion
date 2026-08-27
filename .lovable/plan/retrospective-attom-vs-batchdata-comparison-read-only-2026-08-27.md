# Retrospective ATTOM vs BatchData comparison (read-only)

## Headline finding, verified before planning

I queried the stored data only — no provider calls were or will be made.

- BatchData properties matched in run `1644c21c`: **79 distinct addresses** (80 matched rows, one duplicate address)
- Stored ATTOM property records in SuCasa: **480** properties (`property_intel`), backed by 10,899 logged ATTOM calls
- Overlap (same property in both, after normalizing street/city/state/ZIP punctuation): **4 properties**
- Overlap percentage: **5.1% of BatchData matches**, **0.8% of the ATTOM library**

The 4 overlapping addresses are: 465 Rocky Creek Dr Roswell GA 30075; 2138 Gunstock Dr Stone Mountain GA 30087; 1387 Larkview Dr SW Lilburn GA 30047; 5392 Button Gwinnett Pl Norcross GA 30093. All four have ATTOM valuation, detail, tax and mortgage stored; three have sales; one has permits; one has an owner block.

**4 overlapping properties is far below the 20-property floor you set. Any percentage computed on n=4 moves 25 points per property, so the comparison cannot choose a primary provider.** I will still run the full analysis, clearly labelled as anecdotal.

## What the report will contain

Sections 1–9 run exactly as specified, on the 4 overlapping properties, field by field (address/owner match, property attributes, valuation, mortgage, equity, sales, tax, permits, Home Record completeness). Every cell shows the raw value from each provider plus one of five explicit states: provider omitted the field / provider returned it but SuCasa's parser dropped it / no stored response / property not in the test / genuine disagreement.

Section 10 (business outcomes) reruns SuCasa's own signal logic — the existing refinance benchmark math in `src/lib/refi.ts` and the equity/opportunity rules — twice, once fed from the BatchData normalized record and once from the stored ATTOM record, and reports per-property agreement. With n=4 the "agreement rate" is reported as a count (e.g. 3 of 4), not a percentage.

Section 11 (API economics) uses only what is logged: `attom_call_log` (endpoint, cache_hit, status, cost_cents, per-property call counts) versus the BatchData test rows (attempts, retries, cache hits, HTTP status, duration). No inferred pricing.

Section 12 scorecard and section 13 recommendation are produced two ways, kept separate:
- **On the 4 overlaps** — labelled statistically meaningless.
- **On the full independent populations** (79 BatchData matches vs the 480-property ATTOM library) — a coverage/completeness comparison that is statistically usable for field availability, but cannot speak to accuracy because the two sets are different homes.

Closing answer to "is this strong enough to choose a primary provider" — with the honest reason, plus the exact additional test that would settle it, described but **not run**.

## Technical approach

Read-only. Address matching normalizes to `street + ZIP` with punctuation and whitespace stripped (this is what surfaced the 4th match that exact-string matching missed). Analysis runs in a sandbox Python script over `psql` exports of `batchdata_test_results.normalized` / `raw_response` and `property_intel.{avm,detail,tax,sales,mortgage,owner,permits}`. No writes to any table, no normalizer changes, no enrichment queue activity.

## Delivered as

The report in chat. No CSV export and no new Test Lab tab unless you ask afterwards.
