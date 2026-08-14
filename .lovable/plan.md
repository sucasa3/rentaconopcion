# Why the lender and agent dashboards look empty

## What I checked

Property data is flowing — this is not an API outage:

- The property-data cache holds 53 properties, with valuations on 45, mortgage records on 53, sale history on 52.
- Successful live calls were made as recently as today (26 mortgage, 26 sales, 24 detail, 23 tax pulls in the last 2 days, all HTTP 200).
- This month's usage: 2,183 of 5,000 included records — nowhere near the cap, and cache-only mode is off.

The real problem is downstream of the data pull:

1. **Coverage gap.** There are 402 client rows across the books, but only 102 of them match a cached property, and **zero** rows have ever been marked as intel-refreshed. The enrichment pass only runs when someone opens the old lender/agent portfolio page, and it only targets rows missing loan amounts — so most clients were never pulled.
2. **No opportunities exist.** The new dashboards read their headline counts, "today" list and signal cards from the opportunities store. That table is completely empty (0 rows), because the routine that derives and saves opportunities is never called from anywhere in the app. It exists, but nothing triggers it.
3. **Failed pulls are not retried.** 2,303 rejected requests this month (mostly address-format rejections on valuation and permits). Those addresses get skipped silently and never surface as "needs attention".

Net effect: the API is feeding us data, but the dashboards read a table nobody fills.

## What to build

### 1. Wire the opportunity engine to the dashboards
Call the existing recompute routine when a book is loaded (throttled, once per book per few hours) and after every enrichment pass, so signals — refi, equity, tenure, permit activity, intent — get written for every client with property data. Show real counts and cards on the lender and agent home screens.

### 2. Make enrichment cover the whole book
Widen the enrichment pass so it targets any client that has no cached property record (not just ones missing loan amounts), runs in background batches with the monthly budget guard already in place, and records the refresh timestamp so it never re-pulls the same address unnecessarily. Run it from the new dashboard shell, not only the legacy portfolio page.

### 3. Surface coverage and failures honestly
Add a small coverage strip to the lender and agent dashboards: "Property data on X of Y clients · Z addresses need review", with a retry action and a list of addresses the data provider rejected, so bad addresses can be corrected instead of disappearing.

### 4. Backfill now
Run a one-time pass over the existing 402 client rows to pull property data and compute opportunities, so both dashboards are populated immediately rather than filling in gradually as pages are visited.

## Technical notes

- Callers to add: `recomputePortfolioOpportunities` (`src/lib/opportunities.functions.ts`) — currently referenced nowhere — invoked from `src/lib/business.functions.ts` flow and after `enrichPortfolioFromAttom`.
- `enrichPortfolioFromAttom` (`src/lib/lender.functions.ts`) filter changes from `loan_amount_at_close_cents is null` to "no cached `property_intel` match or stale `last_intel_refreshed_at`", and writes `last_intel_refreshed_at` per row.
- `useAutoEnrich` gets mounted in the new business dashboard, keeping the existing per-pass cap and budget soft cap.
- Coverage/failure strip reads `attom_call_log` non-200 rows grouped by address, plus the match rate between `lender_portfolio_clients` and `property_intel`.
- No schema changes required; no user-facing mention of the data vendor.
