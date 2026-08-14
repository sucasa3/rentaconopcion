# Background enrichment queue (and why the dashboards look empty)

## What I checked

Property data is flowing — this is not an API outage:

- The property-data cache holds 53 properties (valuations on 45, mortgage on 53, sale history on 52).
- Successful live pulls happened today (26 mortgage, 26 sales, 24 detail, 23 tax, all HTTP 200 in the last 2 days).
- This month: 2,183 of 5,000 included records used; cache-only mode is off.

Why the lender and agent dashboards show nothing:

1. **Coverage gap.** 402 client rows exist across the books; only 102 match a cached property, and zero rows have ever been marked intel-refreshed. Enrichment only runs when someone opens a portfolio page, and only for rows missing loan amounts.
2. **No opportunities.** The dashboards read counts, the "today" list and signal cards from the opportunities store, which has 0 rows — the routine that derives and saves them is never called anywhere in the app.
3. **Rejected pulls vanish.** 2,303 rejected requests this month (mostly address-format rejections) are skipped silently and retried forever on every visit.

## What to build: a controlled enrichment queue

### 1. Queue table
A work queue holding one row per client needing property data: client id, portfolio, priority, state (pending / running / done / failed / skipped), attempt count, last error, next-eligible-at. Rows are enqueued when a client is imported or created, and by a backfill pass over the existing 402.

### 2. Priority order
Highest first: activated clients (linked homeowner account with recent activity), then active clients (recent engagement or an open request), then everyone else, oldest-refreshed first inside each band. Manual "refresh this client" jumps the queue.

### 3. Never re-spend on data we already have
Before any outbound call the worker checks, in order: an existing cached property record that is still inside its per-class freshness window; the client's own stored loan/close data; and a recent failure cooling-off. Only the missing classes for that specific client are requested — never a blanket re-pull. Successful and cached-hit rows both stamp the refresh timestamp so they leave the queue.

### 4. Throttled worker
A scheduled job drains the queue every few minutes in small batches (default 10 clients per run, configurable), stopping immediately when the monthly allowance passes the soft cap or cache-only mode is on. Retries use backoff; addresses the provider rejects as unusable are marked "needs review" after two attempts instead of being retried forever.

### 5. Compute opportunities after each batch
Every drained batch recomputes opportunities for the affected books, so refi, equity, tenure, permit and intent signals actually land in the store the dashboards read.

### 6. Visibility
A coverage strip on the lender and agent dashboards: "Property data on X of Y clients · N queued · M need review", with a retry action and the list of addresses flagged for review so they can be corrected.

### 7. Backfill
Seed the queue with the existing 402 clients at their correct priority and let the worker drain it over time — no single burst of spend.

## Spend policy: most value per record

**Buy once, reuse forever.** Property details and assessor/tax records almost never change — pull them a single time per address and never refresh unless the home is sold. Sale history refreshes yearly. Only the automated valuation is genuinely time-sensitive.

**Deduplicate by address, not by user.** The same home can sit in a lender book, an agent book and a homeowner account. One cached record serves all three; the cache is already keyed by normalized address, so the queue must always check it before spending — including across organizations.

**Tier valuation refresh by engagement, not by calendar.**
- Homeowner logged in or a partner opened the client this month → refresh valuation monthly.
- Dormant but in a book → refresh quarterly.
- No account, no partner activity, no campaign → never refresh in the background; pull on first view.

**Spend on request, cache for everyone else.** When a homeowner, lender or agent explicitly asks (opens a profile, taps Refresh, requests a report), we pull immediately if the data is stale — that is the moment worth paying for. Background work only fills gaps for people who will actually be shown the result.

**Validate the address before spending.** Roughly 2,300 rejected requests this month were wasted on unusable addresses. Verify street/city/state/ZIP through the free geocoder first; only queue addresses that resolve. Bad ones go to a "needs review" list instead of retrying.

**Store the answer, not just the raw record.** Every resolved value writes a daily snapshot, so trends, appreciation and "since last month" charts are computed from our own history rather than repeated lookups.

**Budget envelope.** Split the monthly allowance: ~60% reserved for on-demand user requests, ~30% for background backfill, ~10% held back. Background work halts at the soft cap; on-demand requests keep working. If the reserve is hit, show cached values with an honest "last updated" label rather than a blank card.

**Cheapest path first.** For a new address, pull detail + tax (which also yields the property id and canonical address) before valuation — matching by property id avoids the failed valuation lookups that address strings cause.



## Technical notes

- New table `property_enrichment_queue` (client id, portfolio id, priority int, status, attempts, last_error, next_attempt_at, requested_classes) with RLS scoped to org members plus service-role access.
- Worker: `src/routes/api/public/enrich.tick.ts`, called by pg_cron every 5 minutes with the anon `apikey` header, following the existing `campaigns.tick` / `leads.tick` pattern.
- Freshness reuses `ATTOM_TTL_DAYS` and `getPropertyIntel` in `valuation.server.ts`; the worker only requests classes whose cached row is missing or expired.
- Budget guard reuses `attom_monthly_budget` (soft cap, cache-only) — the worker exits early instead of queuing more work.
- Opportunity recompute calls the existing but currently unreferenced `recomputePortfolioOpportunities` in `src/lib/opportunities.functions.ts`.
- `enrichPortfolioFromAttom` becomes a manual "refresh now" that enqueues at top priority rather than pulling inline; `useAutoEnrich` stops issuing paid calls on page load and just reports queue progress.
- Coverage strip reads queue status counts plus the match rate between `lender_portfolio_clients` and `property_intel`. No vendor name shown anywhere in the UI.
