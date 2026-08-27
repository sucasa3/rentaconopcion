# Giselle Matthews test result + ATTOM recovery

## What I tested

I ran a live property-data lookup for Giselle Matthews (4213 Harris Ridge Ct, Roswell, GA 30076) using the ATTOM key currently stored in this project, hitting five endpoints directly: property detail, AVM, tax/expanded profile, sales history, and building permits.

**Result: all five returned 401 Unauthorized.** The key stored in the project is still being rejected.

Supporting evidence from the system:
- The most recent real (non-cached) ATTOM call was a permits request at 14:59 UTC today, which returned 401 and auto-disabled that dataset.
- All 9 ATTOM datasets (detail, avm, tax, sales, mortgage, permits, owner, neighborhood, risk) are currently disabled, so the app makes no live calls at all.
- Every 200 in the recent call log is a cache hit from previously stored data, not a fresh provider response.
- Giselle has no property record stored at all, so her profile shows nothing. Neil Terc's Stone Mountain address does have cached data from August 6.

## Why this happens

Either the new key was never saved into this project's stored credentials (it still holds the old one), or the key is valid but the ATTOM account lacks entitlement for these endpoints. A 401 on every endpoint including basic property detail points to the key itself rather than per-endpoint entitlement.

## Plan

1. **Update the key.** Save the new ATTOM key into project secrets (I need you to paste it, since I can't read what's on ATTOM's side).
2. **Probe before trusting.** Run a 9-endpoint probe against a known-good address and record which endpoints return 200, 401, or 404. This costs at most 9 lookups.
3. **Re-enable only what passes.** Flip the dataset health flags back on for endpoints that authenticate, clear their failure counters, and leave failing ones off with a note.
4. **Enrich Giselle.** Run a live enrichment for 4213 Harris Ridge Ct and confirm value, equity, tax, sales, and permits populate on her profile.
5. **Backfill.** Once verified, re-queue the un-enriched clients (including the ~541 lender contacts) through the existing background enrichment worker and report progress.

## Technical notes

- Health flags live in `attom_endpoint_health`; disabled endpoints short-circuit before any HTTP call, so a good key alone does not restore enrichment — step 3 is required.
- Probe results and 401s are recorded in `attom_call_log` for audit.
- No production code changes are needed for steps 1-4; they are credential and data operations.
