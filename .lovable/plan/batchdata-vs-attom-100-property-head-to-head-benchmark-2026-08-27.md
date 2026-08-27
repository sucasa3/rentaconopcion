# BatchData vs ATTOM — 100-property head-to-head benchmark

Goal: decide whether BatchData can replace ATTOM as SuCasa's primary property-data provider, using the same 100 homes for both.

Confirmed from stored data: 480 properties in the ATTOM library, **309 with stored mortgage records** — the eligible pool. No new ATTOM calls will be made anywhere in this work.

## Stage 1 — Random sample, reported before any API call

- Draw 100 of the 309 eligible properties with a seeded random ordering (reproducible, no hand-picking), recorded as a saved sample so the exact set is auditable.
- Publish before running BatchData:
  - total eligible (309) and selection method
  - the 100 selected addresses with their stored property IDs
  - county/city and state distribution
  - property-type distribution
  - stored ATTOM valuation distribution (min / quartiles / median / max)
- Pause here for your go-ahead before spending any credits.

## Stage 2 — BatchData run (100 calls, authorized)

- Same endpoint, request shape, and normalizer as the previous test: `POST /property/lookup/all-attributes`, one call per property, no secondary endpoints.
- Hard cap at 100 calls, retries disabled for this run. If the account blocks calls (insufficient balance / 402 / 429), stop immediately and report how many completed.
- Results stored in the existing isolated tables only (`batchdata_test_runs`, `batchdata_test_results`). Nothing writes to `property_intel`, `attom_*`, the enrichment queue, or any homeowner-facing table.
- Report: calls made, successes, failures, no-matches, latency (avg/median/p95), error breakdown, and any balance/credit info the API returns.

## Stage 3 — Comparison report (points 1–14)

Built as a new "ATTOM vs BatchData" report tab inside the existing Test Lab, plus a downloadable per-property CSV, covering:

1. Property match — exact / probable / mismatch / no match, on address, owner and property type.
2. Field-by-field — property, tax, sales, valuation; per numeric field the $ diff, % diff, and agreement bands at 5% / 10% / 20%.
3. Valuation ground truth — properties with a reliable recent recorded sale; APE, median APE, mean APE per provider; every catastrophic outlier (>2× or <0.5× reference), labelled explicitly as a limited benchmark, not true AVM ground truth.
4. Mortgage (priority) — lender, original amount, date, type, term, rate, current balance, LTV, payment, junior liens, HELOC: coverage per provider, agreement where both exist, provider-only counts. A field ATTOM never returns is counted as "not provided", not disagreement.
5. Mortgage freshness — who identifies the newer/current lien; each disagreement listed with both loan dates, lenders, amounts and rates.
6. Refinance signal — SuCasa's existing rule run unchanged over each provider's inputs; the four-way agreement matrix and the underlying value / balance / rate / LTV for every disagreement.
7. Equity — per-provider equity, $ and % difference, agreement bands, and attribution of each gap to valuation, mortgage balance, amortization assumption, or other.
8. Second lien / HELOC / multiple open liens — per-provider detection across the 100.
9. Completeness table — property, owner, tax, sales, valuation, mortgage, rate, balance, equity, refi intelligence, junior liens, with a winner per row.
10. API efficiency — calls per property, success rate, latency, errors, retries, cache behaviour for BatchData vs ATTOM's stored call log. No pricing claims without real pricing data.
11. Business outcome — high equity, refi, cash-out, HELOC, long-term owner, recent purchase, rate opportunity; overall SuCasa Decision Agreement Rate plus a separate Mortgage-Dependent Decision Agreement Rate.
12. Scorecard — 11 categories × /10 per provider, totalled out of 110 and normalized to /100.
13. Valuation safety — whether BatchData's AVM can be trusted directly, and if not, a recommended (not implemented) cross-check rule using county market value, ATTOM AVM, BatchData AVM and last sale price.
14. Final decision — headline scores and one of options A–F with at most 7 bullets of reasoning.

No further test will run automatically after this one.

## Technical notes

- Sampling and reporting are read-only server functions over `property_intel`, `attom_call_log` and `batchdata_test_results`; comparison math lives alongside the existing `src/lib/batchdata-report.ts`.
- The runner is the existing isolated harness with retries off and a 100-call ceiling for this run.
- ATTOM-side mortgage/valuation values are read exactly as stored, including SuCasa's current amortization assumption, so the refi/equity comparison reflects what production actually decides today.
