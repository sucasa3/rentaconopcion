# Automatic refi comparison rates

Today the rate used to estimate savings is typed into the code in several places: 6.5% on the homeowner side, 6.25% on the lender portfolio and opportunity ranking, 6.5% again in campaigns and benchmark comparisons. Nobody can update it without a code change, and the screens don't say where the number came from or how old it is.

This replaces all of those with one automatically refreshed market benchmark, plus a lender-controlled scenario rate.

## What changes for people using SuCasa

**Market benchmark (default everywhere)**
- The current national 30-year fixed average is fetched automatically and stored, refreshed on a schedule.
- Every refi savings figure, "could save $X/mo" card, top-refi ranking, campaign message and homeowner panel uses that single number.
- Screens show the source and the as-of date, e.g. "Market benchmark 6.31% · Freddie Mac PMMS · as of Sep 4".
- If a refresh fails, the last good value keeps being used and the as-of date shows it is stale — no screen ever falls back to a made-up number.

**Lender scenario rate (override)**
- A lender can set their own scenario rate for their organization.
- When set, every refi opportunity, savings estimate and ranking for that lender recalculates against it immediately.
- The header changes to "Top refi opportunities @ 6.00% — Lender scenario rate", with a one-tap way to clear it and return to the market benchmark.
- Homeowner-facing screens always use the market benchmark, never a lender's scenario rate.

**Honest framing**
- Savings are always labelled as an estimate/scenario based on the benchmark, not a rate the borrower has been offered or qualified for.
- Existing wording rules stay: agents still never see refi/HELOC/LTV pitch language.

## Technical outline

1. **New table `market_rates`** — `series_key`, `rate_pct`, `as_of_date`, `source`, `fetched_at`. Read access for authenticated users; writes service-role only. Seeded with one current row so nothing is ever blank.
2. **New column on `lender_orgs`** — `scenario_rate_pct` (nullable) plus who set it and when.
3. **Fetcher** — a public server route `src/routes/api/public/rates.tick.ts` (same pattern as the existing tick endpoints) pulling the Freddie Mac PMMS 30-year fixed weekly average, upserting the latest row, and refusing to write an implausible value (outside 2–15%).
4. **One resolver** — `resolveBenchmarkRate(orgId?)` in a server module returning `{ ratePct, source: 'market' | 'lender_scenario', label, asOf }`. Cached per request.
5. **Remove hard-coded constants**: `BENCHMARK_REFI_RATE` (`src/lib/refi.ts`), `BENCHMARK_RATE` (`src/lib/benchmark-compare.ts`), `BENCHMARK_RATE_DEFAULT` (`src/lib/opportunities.ts`, `src/lib/lender.functions.ts`), `MARKET_RATE` (`src/lib/campaigns.server.ts`), the literal `6.25` in the lender portfolio routes, and `marketRate` in `src/lib/valuation.server.ts`. The pure math helpers in `src/lib/refi.ts` keep taking the rate as an argument — only the source of the number changes.
6. **Pass rate provenance through** to the surfaces that display it: lender portfolio index (replacing the local `useState(6.25)` with the resolved value and the override control), the refi opportunity cards, the homeowner equity/mortgage panel and the connect-lender dialog.
7. **Tests** — resolver precedence (scenario over market), implausible-value rejection, stale-data behaviour, and unchanged savings math for a fixed rate.

No changes to detection, stored opportunity categories, ranking logic, access, permissions, consent, outcomes, or the visual system.
