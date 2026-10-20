# Worker concurrency candidate — rollback and isolated acceptance

## Deployment prerequisite

Nothing is deployed or authorized for hosted execution. The SQL file is deliberately outside `supabase/migrations` and `drizzle/migrations`: it is a review artifact, not a queued automatic migration. Do not deploy the new worker without the matching SQL; it fails closed if the claim RPC is absent. Do not run old and new worker versions together: an old service-role worker can still issue unconditional queue writes. Stop schedules/manual ticks and drain existing invocations before any separately authorized deployment.

## Rollback

1. Disable all enrichment tick entry points and wait for every invocation/in-flight request to finish. Never roll back worker code with active claims.
2. Keep the additive columns, functions, grants and invalidation trigger in place; do not drop data or replay old migrations. This avoids destructive rollback and preserves history.
3. Prefer leaving enrichment stopped while correcting the candidate. Reverting code to the previous worker reintroduces duplicate-claim/stale-write defects and is not a safe activated fallback.
4. If restoration of old code is explicitly authorized, keep workers disabled. After draining, an authorized operator can reset only stranded running claims to pending, clearing started_at/token/lease and preserving attempts, last_result and history. Record affected IDs before/after; do not mass-reset terminal/skipped rows. This is an operational action, not included or executed in the review migration.
5. Inspect any requests whose outcome was uncertain before retrying. Do not assume a database rollback refunds or cancels an external lookup.

## Smallest isolated hosted acceptance plan (not executed)

Requires separate authorization and a proven independent disposable backend with synthetic data only. No cloned production records, secrets, schedules, provider credentials, emails, payments or outbound providers. Use a stub provider that can pause/release requests and record request counts; manual test ticks only.

1. Compare only the queue/client/cache definitions and the address-requeue trigger to the SQL dependencies; verify status constraints and RPC grants. Apply only this review SQL to the isolated backend.
2. Create one synthetic client/job and run two concurrent manual ticks. Read back one token/one running claim; only one worker reaches the stub while its lease remains valid.
3. Pause worker A, expire its lease in the isolated fixture, reclaim as B, then return A. A must not change queue, client facts or shared cache. B completes normally. Repeat for both provider branches and conditional requests.
4. Force suppression read error and skipped-write error. Assert zero stub-provider calls, no false success and no needs_review rewrite; read back attempts/history unchanged.
5. Test renewal, legacy abandoned recovery, outside address requeue/cancellation, and coupled client/terminal rollback. Test old-token RPC calls through the actual hosted Data API, not solely SQL.
6. Intentionally expire the lease with A's request in flight. Record the possible second stub call and rejection of A's durable writes. This acceptance is fencing correctness, **not** duplicate-call prevention.
7. Confirm anon/authenticated cannot execute any claim/cache/write RPC, service-role can, and no schedule or external provider was enabled. Capture SQL/test version hashes and affected synthetic IDs; stop manual ticks and delete the isolated fixture only under its own authorization.

## Outstanding release limits

Local database tests use the actual candidate SQL against a minimal synthetic PostgreSQL fixture plus the repository queue/address-trigger definitions. They are not a complete deployed-schema/RLS compatibility test. Claim ownership is per job, not a cross-job per-property mutex. Separate jobs for the same physical home and on-demand refreshes can still overlap.

The lease is fixed at the existing 15-minute stale threshold and renewed just before provider invocation. There is no continuous heartbeat or external request cancellation guarantee. In-flight expiry permits recovery and potentially two provider requests; exactly-once calls require a separately designed durable provider-request key/idempotency or uncertain-result reconciliation mechanism.

Shared property cache and miss writes are now fenced for worker calls. Provider call logs remain truthful append-only evidence even if ownership is lost; existing budget accounting is unchanged and is not claimed concurrency-safe. Home-team candidate processing and portfolio recomputation still use existing separate routines after successful completion; those ancillary effects are not covered by the claim transaction. Accounting and household remain outside scope.