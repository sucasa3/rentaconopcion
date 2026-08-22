# Fix: new home profiles come back with no data

## What I verified

Both accounts have complete, valid addresses — this is not a profile problem.

- Giselle Matthews (`matthewsg@fultonschools.org`), created today: `4213 Harris Ridge Ct, Roswell, GA 30076`.
- Neil Terc (`neilterc@hotmail.com`): `2138 Gunstock Dr, Stone Mountain, GA 30087`.

The real cause is on the property-records provider side:

1. On **Aug 14** the provider started returning `401 Unauthorized`. Our safety valve auto-disables an endpoint after 3 consecutive 401s, so **valuation, property detail, assessor/tax, sale history and mortgage are all switched off** in `attom_endpoint_health` right now. Once off, they are never retried — nothing re-enables them.
2. Because of that, when Giselle saved her address today the system made exactly **one** provider call (building permits, the only class still enabled) and it also came back **401**. Zero records were fetched, so her home profile is empty and will stay empty.
3. Neil's address does have cached records from **Aug 6** (valuation $516,914, detail, tax all "SuccessWithResult"). Those are served as stale, so his screen should show *something* — but the valuation cache is past its 30-day-ish freshness window and every refresh attempt is blocked by the same disabled endpoints, so parts of his profile read as unavailable.

So: one root cause (provider returning 401 since Aug 14), two symptoms (new homes get nothing at all; existing homes are frozen on stale data).

## What I need from you

Today's permits call still 401s, which means the credential itself is being rejected — not just an entitlement gap. Before any code change, this needs a working key:

- Has the ATTOM trial/subscription lapsed or been rotated since mid-August?
- If you have a current API key, I'll store it as a secret and re-run the checks.

If the key is still valid and only certain products aren't entitled, the probe below will show exactly which endpoints pass.

## Fix

1. **Probe each endpoint once** with the current key against a known-good address (Neil's) and report per-endpoint pass/fail — so we know whether this is the whole account or specific products.
2. **Update the key** (if you supply a new one) and re-enable the endpoints that pass, clearing the auto-disable flags and 401 counters.
3. **Make the auto-disable self-healing** instead of permanent: a disabled endpoint gets one probe retry after a cooldown (e.g. every 6 hours) rather than staying off forever. That's what turned a temporary provider outage into a week-long data blackout.
4. **Re-pull Giselle's home** (and any other profile created since Aug 14 with no records) once the endpoints are live, so her profile fills in.
5. **Tell the truth in the UI**: when records can't be fetched because the provider is unavailable, the home profile should say "We're still pulling your home records — check back shortly" instead of rendering an empty/blank home. Same for the agent/lender client detail views, which read from the same source.
6. **Alert on it**: surface provider health (disabled endpoints, recent 401s) on the admin panel so a blackout like this is visible the same day rather than found through a user complaint.

## Technical notes

- `src/lib/valuation.server.ts` — lines ~130-145 do the auto-disable upsert; ~208-219 short-circuit disabled classes. Add a `retry_after` / cooldown probe instead of a permanent `enabled=false`.
- `src/lib/enrichment.server.ts` reads the same health table, so the background enrichment queue is silently skipping these classes too — it recovers automatically once health is restored.
- `attom_endpoint_health` rows to clear: `avm`, `detail`, `tax`, `sales`, `mortgage` (all `enabled=false`), plus `permits` (`unauthorized_count=1`).
- Monthly budget is not the constraint: 1,897 of 5,000 calls used in August, cache-only mode off.
- No schema changes beyond an optional cooldown column on `attom_endpoint_health`.
