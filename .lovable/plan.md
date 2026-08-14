# Enrich the whole book fast — and stop burning the allowance on failures

## What's actually happening

This month's records allowance sits at 4,000 of 5,000 used — exactly the 80% soft cap, which is why the dashboard says "auto-fill paused". But most of that spend bought nothing:

- 4,263 outbound requests logged this month; only ~660 returned data.
- 1,603 + 904 requests came back as "no result" for the address given.
- 543 were blocked locally as incomplete addresses (still logged as attempts).
- 96 came back "Unauthorized" — sale-history and mortgage endpoints returned 401 repeatedly, meaning those two endpoint types are not entitled on the current key/plan.
- Failures currently count against the monthly allowance the same as successful pulls.

Queue state right now: 651 waiting, 222 parked as "needs an address fix", 101 done, 89 stuck in "running" (interrupted batches that never got released). Of 1,013 client rows, 50 have an address with no city/state or ZIP.

So the 541 unenriched contacts are not blocked by volume — they're blocked by wasted spend and a stuck queue.

## What to change

### 1. Stop paying for failures
Only count a request against the monthly allowance when it actually returns data. No-result, rejected, and unauthorized responses get logged for diagnostics but no longer consume the budget. This alone frees roughly 3,000 of this month's 4,000 "used" records.

### 2. Never re-ask the same dead address
An address that returns "no result" for a class is marked as such and not retried for a long window (instead of the current 24-hour cooling-off that lets the same address be re-bought repeatedly). Unauthorized endpoint types get switched off automatically until the entitlement changes, so sale history and mortgage stop being called into a wall.

### 3. Validate addresses before spending
Run every queued address through the free geocoder first. Ones that resolve get a clean, canonical street/city/state/ZIP written back and then queued. Ones that don't resolve go straight to "needs an address fix" with the reason shown, so the 50 incomplete rows and the 222 parked ones can be corrected in bulk rather than silently retried.

### 4. Release stuck work and re-queue
Any row left "running" for more than 15 minutes returns to pending. The 89 currently stuck rows are released as part of this.

### 5. Turn the throttle up
- Background share of the allowance rises from 30% to 70% (on-demand user requests keep a reserved 30% so a homeowner opening their dashboard is never blocked).
- Cron interval drops to every 2 minutes with batches of 25 instead of 10.
- The soft cap only pauses background work, never a user-initiated view.

### 6. A real "backfill this book" control
On the lender and agent record-queue strip: a single button that validates, queues and drains the whole book, with live progress ("412 of 661 done · 38 need an address fix · ~14 min remaining") instead of the current one-batch button.

## Honest answer on limits

With the above, a 661-contact book needs roughly 3 records per home (profile, valuation, permits) — about 1,900 successful pulls, of which the ones already cached cost nothing. At the current 5,000/month tier with ~1,000 genuinely left after the accounting fix credits back the failures, the full book completes in a single drain of a few hours. Without the accounting fix, it can't finish this month at all.

Two caveats worth knowing:
- Sale history and mortgage detail are returning Unauthorized. Until that entitlement is sorted with the provider, loan balances and last-sale dates will stay blank for homes where the book didn't supply them. Everything else (value, equity, permits, property profile) fills in.
- Addresses that the geocoder can't resolve will never enrich; those surface as a correctable list rather than as silent gaps.

## Technical notes

- `attom_monthly_budget.calls_used` increments only on `status = 200` with a non-empty payload; `attom_call_log` keeps recording every attempt.
- `property_intel` gains a per-class `no_result_at` stamp, honoured by `getPropertyIntel` with a 180-day suppression window.
- Endpoint-level kill switch keyed off repeated 401s, checked in `attomFetch`.
- New pre-flight in `enrichment.server.ts` calling the existing Census geocoder from `geocode.functions.ts`, writing back normalized address parts to `lender_portfolio_clients`.
- `BACKGROUND_BUDGET_PCT` 30 → 70; stale-`running` reaper in `runEnrichmentTick`; cron schedule for `/api/public/enrich/tick` changed to every 2 minutes.
- One-time cleanup: release the 89 `running` rows, reset the 222 `needs_review` rows after geocoding, and recompute opportunities for touched books.
