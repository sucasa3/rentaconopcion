# ATTOM: it's a quota wall, not a bad key

## What the numbers show

ATTOM's dashboard reports 1,888 hits between 29 Jul and 27 Aug against a 2,000-call testing cap. Our own meter for August records 1,897 calls. Those agree. The 401s we hit on Giselle Matthews' address are the trial allowance being exhausted, not a rejected key — so the key does not need replacing.

Two other facts confirmed on our side:
- All 9 ATTOM datasets are currently switched off. Repeated 401s auto-disabled detail, AVM, tax and permits; the rest were switched off manually during the earlier investigation. Even with quota restored, nothing runs until those flags are turned back on.
- Our internal budget is configured for 5,000 calls/month, not the 2,000 the trial actually allows. That is why nothing throttled before the wall was hit.

The call mix also matters: 486 property detail + 484 assessment + 419 AVM + 261 mortgage + 174 sales = roughly 5 calls per property. At that rate, 2,000 calls covers only about 380 properties, and Alex Officer's book alone has more than 500 un-enriched clients.

## Plan

### 1. Align our budget with reality
Set the August allowance to the true 2,000-call cap so the soft cap trips at 80% (1,600) instead of 4,000, and switch to cache-only automatically at the ceiling rather than burning calls into 401s.

### 2. Re-enable the datasets, tiered
Turn the health flags back on in two tiers rather than all nine:
- **Core (always on):** property detail, AVM, assessment/tax — these drive value, equity and the home record.
- **On-demand only:** mortgage, sales, permits, owner, neighborhood, risk — fetched when a specific screen or an agent/lender action needs them, not during bulk enrichment.

This cuts bulk enrichment from ~5 calls per property to 3, raising trial coverage from ~380 to ~660 properties.

### 3. Verify with Giselle, using the remaining headroom
About 100 calls remain on the trial. Spend 3 of them on 4213 Harris Ridge Ct, Roswell GA and confirm value, equity and tax populate on her profile end to end. Report the result before anything else runs.

### 4. Hold bulk enrichment until the cap is raised
Leave the background worker paused. With ~100 calls left, releasing it would exhaust the trial in minutes and re-trigger the auto-disable loop. Ask ATTOM for a production allowance sized to the book: roughly 3 calls per property plus headroom, so about 2,000 calls for the current 541 un-enriched clients and 5,000-10,000/month for ongoing growth and refreshes.

### 5. Make the wall visible instead of silent
Add a budget banner on the admin data page showing calls used vs. allowance and the auto-disabled datasets, and treat a 401 that arrives near the cap as "quota exhausted" rather than "key invalid" — so it pauses enrichment cleanly instead of disabling datasets permanently.

## Technical notes

- Budget lives in `attom_monthly_budget` (`tier_calls_included`, `soft_cap_pct`, `cache_only_mode`); dataset switches live in `attom_endpoint_health`. Both are data updates, no schema change.
- Tiering core vs. on-demand happens in the `DEFAULT_CLASSES` list in `src/lib/enrichment.server.ts`; on-demand classes stay fetchable through the existing per-class request path.
- The 401-handling change is in `src/lib/attom.server.ts`: when the month's usage is at or above the allowance, record the failure as quota rather than incrementing the unauthorized counter that permanently disables an endpoint.
