# Local worker blocker fixes — 2026-10-20

## Result

**Local acceptance PASS; concurrent release readiness BLOCKED.** No hosted operations, migrations, worker activation, real external calls, messages, payments or publishing. Accounting and household intelligence implementation remain unchanged.

## Exact changes

- `src/lib/suppression.server.ts`: the real shared `isSuppressed` now throws `Suppression lookup failed` on a returned database error, without exposing database details. Email/phone matching, normalization, address-only nonmatching and consent renewal code are unchanged. Its existing callers inherit fail-closed behavior.
- `src/lib/enrichment.server.ts`: every worker queue update now requests returned IDs and checks returned errors. Claims must return every selected ID exactly once; skipped and other per-job writes must return the exact expected IDs. Thrown queue IO errors are also sanitized. Failed writes reject the tick rather than returning success, and are not converted by the ATTOM catch into another provider attempt or history mutation.
- Suppression writes target only the selected jobs for that client, not every historical queue row. The suppressed set is updated only after persistence is confirmed; failures abort before any provider processing.
- The 15-minute stale-running recovery still resets only status/started_at, preserving attempts and prior history. Recovery and reprioritization may legitimately affect zero rows; their unknown membership means exact expected-ID checks are not possible without the broader atomic design. Returned errors/invalid responses still abort.
- Added/converted focused tests using the actual transpiled worker connected to the actual shared helper; the database and every IO dependency are local mocks. No production module with external IO is imported by the worker harness.

## Focused test results

Command:

```text
bunx vitest run src/lib/__tests__/enrichment-suppression.test.ts src/lib/__tests__/suppression-lookup.test.ts
```

**26 passed / 0 failed, 2 files** (19 worker tests + 7 helper tests; final run 19:44:36 UTC).

Coverage includes:
- Real-helper returned lookup failure through the actual worker: zero provider calls, sanitized rejection, no terminal/review rewrite, history preserved.
- Suppressed jobs: persisted skipped, zero provider calls, never needs_review; attempts, priority, created_at, next_attempt_at and last_result preserved.
- Claim/skipped returned errors, rejected IO, zero affected rows, incorrect IDs, and partial returned batches: no provider calls or successful tick result.
- Stale recovery success and failure, valid zero-row recovery, pre-provider address queue-write failure, cached terminal no-op, and post-provider ATTOM terminal failures without fabricated retries.
- Successful empty lookups, normalized email/phone matching, no address-only suppression, no register query without a primary identifier, and partition failure propagation.

The single simulated provider call in each post-provider terminal-write test is a local stub, not a real request. Those tests demonstrate that a terminal failure cannot undo a call already made. No broad suite or hosted tests ran. Latest available preview build diagnostic: build OK; no manual build/typecheck was run.

## Smallest concrete concurrency correction — proposal only

**Required database change:** add `claim_token uuid` and `lease_expires_at timestamptz` to `property_enrichment_queue`, plus narrowly granted server-only claim/recovery and fenced write RPCs. This is not implemented and no migration has been created or executed.

1. Replace separate queue selection/bulk running update and global reaper with one transactional claim/recovery RPC. Use ordered, bounded `FOR UPDATE SKIP LOCKED` selection; claim pending eligible rows or recover expired running rows, assign a fresh token, set status/started_at/lease, and return only claimed rows. Reclaiming rotates the token while preserving attempts/history.
2. Require ID + token + running status + unexpired lease on address metadata, suppression, done/review/failed transitions and retry/budget releases. Zero affected rows means lost ownership, not success: stop the item without another provider call or retry-history rewrite. Clear ownership fields on release or terminal transition. Retain current retry policy and 15-minute stale threshold unless separately approved.
3. Renew/validate the lease with the token before each provider call, including conditional sales calls; recovery must not reclaim a live lease. Check ownership again when applying results. Any old worker returning after reclaim must be unable to overwrite the new owner’s state.
4. Couple client address/refresh/loan-fact writes and the terminal queue update in a narrow token-checked transaction/RPC. Queue fencing alone does not protect separate client-row mutations. Identify and fence claim-derived provider/cache result persistence too; a client-side recheck followed by a separate write still races.
5. Local concurrency tests must exercise two claimers, old-token completion after recovery, lease renewal/recovery conflict, suppression after reclaim, and coupled-write rollback. Deployed-definition compatibility and hosted transaction validation need separate authorization.

**Limit:** token fencing prevents stale durable writes, but cannot revoke an already in-flight external request. A worker that stalls beyond its lease may overlap a recovered worker’s call. Strong no-duplicate-provider-call guarantees need provider-supported idempotency or a durable request key/in-flight reconciliation design; locking/lease claims alone are not proof of exactly-once external spending.

## Remaining blockers

- Current bulk claim is still unconditional and nonexclusive. Two workers can both return the expected IDs; affected-row verification is not an ownership mechanism.
- Current stale recovery can reset a job whose original worker is still alive; terminal writes have no owner token and can overwrite a recovered worker’s state.
- Claims/skipped writes affecting only part of a batch reject the tick but are not rolled back across separate requests. Successfully claimed leftovers retain running status and are eligible for existing stale recovery. Recovery does not make duplicate external spending safe.
- Non-queue client-row writes and provider/cache persistence are not made atomic or fully error-checked by this narrow change. Existing other database reads are not broadly audited or hardened. No end-to-end persistence/concurrency release claim is made.
- Shared-helper caller UX and deployed definitions/grants have not been hosted-tested. No hosted runtime behavior has changed.
- Accounting policies, entry-point coverage/retries and catalog concurrency protections remain blocked as previously documented. Household intelligence remains outside scope.

## Deliverables

`sucasa-worker-blockers-exact-code.diff` contains the exact incremental code/test changes relative to the local files captured immediately before this follow-up. Prior Step A changes are the baseline, not repeated as new changes. The new helper test is included as an added file. Project rules/roadmap updates are recorded separately and are not executable code changes.