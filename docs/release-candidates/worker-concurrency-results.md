# Consolidated worker release candidate

## v2 — uncertain-request gap (2026-10-20)

Durable dispatch intent is committed before either worker provider path invokes IO. An unacknowledged begin never sends. Dispatched/uncertain evidence blocks automatic recovery and manual queue resets from redispatching that job. Crashes before send are conservatively uncertain; crashes after saved successful responses replay the response without spending again. Late responses are evidence only and cannot authorize expired-worker cache/client/terminal writes. Provider exceptions and returned errors are conservatively held, not automatically retried.

Gap-only results: **12 passed / 0 failed**: 11 in the new dispatch file and 1 replaced in-flight acceptance (13 unrelated cases skipped). Actual review SQL, real guard, both actual provider wrappers and local stubs were used. Prior **44 passing tests** remain historical evidence, not a newly executed 56-test result; no broad suite rerun. Runs: 22:10:15 and 22:10:20 UTC. Updated gap output and exact incremental diff are in the v2 package. Preview compilation: **build OK**. Intentional invalid-reconciliation SQL errors are expected rejection tests, not failures.

Operator reconciliation is service-role-only, row-locked and audited with actor/evidence: `accept_response` permits a new owner to replay a saved successful response for the same address; `confirmed_not_sent` permits a fresh dispatch only with positive evidence and no saved response. A timeout, elapsed lease or missing logs is never proof of not-sent. Stop/drain the old request before confirming not-sent. Unknown, failed and address-mismatched responses stay held. No force-retry path or automatic uncertain timeout exists. No dashboard or hosted operations were added.

Limits: this blocks automatic redispatch for the same queue job, **not** global per-property duplicate calls, unguarded on-demand callers, internal transport retries or exactly-once external spend. Durable response evidence is private and requires separately approved hosted compatibility/access/retention checks. Matching SQL and code still require authorized isolated acceptance and stop/drain of old workers; accounting and ancillary effects remain uncertified. Historical notes below describe v1 and are superseded wherever they discuss missing uncertain-request handling.

**2026-10-20 — local acceptance PASS; hosted release NOT YET VERIFIED.**

## Implementation

- Atomic bounded PostgreSQL `FOR UPDATE SKIP LOCKED` claim/recovery replaces separate pending selection, bulk claim and stale reaper. Each claim/reclaim gets a fresh UUID token and a 15-minute lease. Existing attempts/history are not reset by recovery.
- All per-job worker queue transitions require matching token, running state and an unexpired lease. Missing ownership or persistence errors fail closed, without fake retries or success. Priority maintenance remains a pending-only update, not a claim.
- Coupled client fact/refresh and queue terminal updates run in one RPC transaction. Client-before-queue locking follows the address-requeue trigger order. Internal verified-address changes preserve claim/history atomically; external address edits, resets/cancellation and book reassignment invalidate it.
- Worker shared property-cache and miss writes now use token-checked transactional RPCs in both provider paths. Provider implementations renew immediately before sending their request. Non-worker callers retain their existing behavior.
- The real suppression helper still throws a sanitized returned-database-error exception. Email/phone matching, consent and address-only rules remain unchanged. Suppression processing finishes before any provider processing in the tick.
- SQL is review-only under `docs/release-candidates`, outside migration-runner directories. No hosted migration was applied and no old worker was activated or replaced.

## Focused results

```text
bash docs/release-candidates/run-focused-worker-tests.sh
44 passed / 0 failed, 3 files
enrichment-suppression.test.ts: 23
suppression-lookup.test.ts: 7
enrichment-concurrency.test.ts: 14
Final run: 2026-10-20 19:54:27 UTC
```

The existing 26 regression scenarios were reused and adapted to the new atomic RPC interface (empty successful claim is now legitimately an empty queue, while malformed/error claim responses reject). Added 18 focused cases; no broad suite ran.

Actual candidate SQL ran only on a disposable local PostgreSQL instance using explicit local socket/port, synthetic tables and the repository queue/address-requeue definitions. The overlapping-transaction test uses an observed database lock/sleep barrier, not a mocked claim function. Actual worker tests connect the real suppression and claim helpers to local IO mocks; they never import live provider IO. The expected SQL constraint error in test output proves coupled rollback and is not a failed test. Latest preview compilation diagnostic: **build OK**.

Proven locally:
- Two overlapping database transactions cannot claim the same live job.
- Recovery rotates the token; stale completion cannot overwrite the reclaimed queue, client facts or shared property cache.
- An expired token cannot resurrect itself by renewal or write before reclaim. Expiry while waiting for a lock is checked after lock acquisition.
- Real-worker suppression lookup failures and lost pre-request renewals prevent all provider calls.
- Both actual worker branches reject completion after a simulated in-flight reclaim, preserving the new owner's token/history.
- External address requeue, cancellation/reset and book assignment invalidate ownership; legacy abandoned rows recover; worker verification preserves history; invalid coupled terminal changes roll back client writes.
- Browser roles cannot execute privileged claim/write/cache functions; service-role execution is explicitly granted.

## In-flight lease expiry: explicit limitation

**Duplicate-call prevention is NOT demonstrated and is NOT claimed.** The focused local test intentionally keeps A's stub request in flight, expires A's lease, reclaims as B and counts **two simulated calls**. A cannot persist a stale result afterward. Leases fence database ownership; they cannot undo a sent request. There is no continuous heartbeat, request-abort guarantee, provider idempotency key or uncertain-request reconciliation here. Jobs for distinct client rows of the same property and non-worker refreshes are not serialized by this job-level claim.

## Remaining release blockers

1. Matching SQL and worker must be accepted together only after independent hosted compatibility/acceptance is authorized and the isolated backend is proven separate. No such hosted validation occurred.
2. Old unconditional workers must be disabled and drained before rollout. Coexistence is unsafe; service-role access does not make old code honor a token.
3. Strict exactly-once external spending remains unresolved as demonstrated above. No accounting policy change is implied.
4. Existing post-completion home-team evidence processing and portfolio recomputation remain separate ancillary routines, not fenced transactions. Provider call logs remain append-only evidence; existing budget counters/accounting are unchanged and not certified concurrency-safe. The release candidate does not claim those side effects or the full deployed worker are transactionally atomic.
5. Local SQL tests use a minimal synthetic fixture, not all deployed constraints/triggers/RLS. Shared provider code compiles but has not been exercised with real services or hosted requests; the isolated plan specifies the narrow remaining checks.

## Package contents and baseline

- `exact-code.diff`: consolidated code/tests relative to the baseline captured before the prior two-blocker follow-up (Step A patch already present). Provider files use their pre-concurrency baseline. Includes the real-helper error fix, checked-write regression tests and this concurrency correction. New SQL/tests/helper are included as added files. No unrelated accounting/household changes.
- `worker-concurrency-migration.sql`: exact review SQL tested locally; not applied or registered for automatic hosted migration.
- `worker-concurrency-rollback.md`: safe stop/drain rollback and the smallest isolated hosted acceptance plan.
- `run-focused-worker-tests.sh`: repeatable local-only test runner; assumes sandbox PostgreSQL binaries and its existing non-root `lovable` account for root execution.
- `focused-test-output.txt`: final focused test output including the intentional rollback error.

No hosted operations, real external calls, customer messages, payments, worker activation or publishing occurred. Accounting and household intelligence remain unchanged and unauthorized.