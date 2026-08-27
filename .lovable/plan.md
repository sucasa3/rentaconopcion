# Run the ATTOM vs BatchData benchmark (account funded)

The harness is already built and the sample is already seeded. This run executes the previously approved benchmark now that the BatchData balance is available.

## Stage 1 — Confirm the sample (no API calls)

- Rebuild the same seeded sample of 100 properties from the eligible ATTOM pool (properties with stored mortgage records) — deterministic, so the exact same 100 homes as before.
- Report the sample profile: state/county mix, property types, stored ATTOM valuation distribution.

## Stage 2 — BatchData run (exactly 100 calls)

- One call per property to `POST /property/lookup/all-attributes`, retries disabled, hard cap at 100.
- Automatic hard stop if the account returns 402/403/429 or any balance/quota error; report how many completed if that happens.
- Zero new ATTOM calls. Results write only to `batchdata_test_runs` / `batchdata_test_results` — nothing touches `property_intel`, `attom_*`, the enrichment queue, or homeowner-facing tables.
- Report: calls made, matched / unmatched / failed, latency (avg / median / p95), error breakdown.

## Stage 3 — Comparison report (points 1–14)

Rendered in the existing Test Lab benchmark tab with a per-property CSV download:

1. Property match quality (address, owner, property type)
2. Field-by-field diffs with 5% / 10% / 20% agreement bands
3. Valuation vs recent recorded sale (APE, median/mean APE, outliers) — labelled as a limited benchmark
4. Mortgage coverage and agreement (lender, amount, date, type, term, rate, balance, LTV, junior liens)
5. Mortgage freshness — who has the newer lien, with both records listed
6. Refinance signal — SuCasa's rule run unchanged over each provider's inputs
7. Equity comparison and gap attribution
8. Second lien / HELOC detection
9. Completeness table with a winner per row
10. API efficiency — calls, success rate, latency, errors
11. Business outcome agreement rates (overall and mortgage-dependent)
12. Scorecard — 11 categories, /10 each, normalized to /100
13. Valuation safety verdict and a recommended (not implemented) cross-check rule
14. Final decision — headline scores plus one recommended option, max 7 bullets

No further test runs automatically after this one.
