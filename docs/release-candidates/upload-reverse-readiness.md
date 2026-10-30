# Retained-contact reverse search readiness

Prepared, default off. No shared migration applied, uploads, provider calls, queue releases or publication performed.

## Prepared experience
- Agents and lenders can reopen retained upload results, select eligible contact-only rows, and confirm a separate owner-search batch (1–10 searches, maximum estimated 30 cents each).
- Shared reverse-service transport and existing normalization/classification are reused. Every result stays available, including no-match and uncertain outcomes. All property associations require explicit review; mailing addresses do not become owned homes.
- Service-only reservation function locks the reverse budget, reserves worst-case spend before IO, and deduplicates by retained row and normalized phone/email in the book. Existing Test Lab searches block paid replay. Reserved or uncertain requests never automatically retry.
- Owner and active membership checks guard writes. Suppression is checked before approval, dispatch and property confirmation. Opt-out read failures stop processing.
- Property confirmation uses the existing organization capacity lock and original intake hold. No capacity means a preserved waiting match. Book-address duplicates create no new home. Saved data is checked in the database; subsequent property enrichment requires the existing separate upload spending approval. Original CSV outcomes/totals remain unchanged; derived properties are shown separately.

## Local evidence
84 focused tests passed (Oct 30): offline transport/classification, phone opt-out equivalence, default-off/two-account access, synthetic-input rejection, 26 disposable PostgreSQL transaction/regression tests and 12 complete server-orchestration tests against local PostgreSQL. Every transport request is injected in-process; global fetch is blocked. Actual mock cost $0. Fixture browser previously verified the selection/confirmation screen. The full flow now executes real server helpers and review SQL, not merely prefilled result states.

For each agent/lender fixture, 3 retained contacts require approval (worst-case simulated reverse ceiling $0.90). Mock results: matched (one property), no match (zero estimate), needs review (two distinct properties). No homes are added until confirmation. Agent at zero capacity preserves a waiting match, then manual capacity recheck succeeds. Two confirmed homes consume normal local capacity; a third property remains waiting. Original contact rows/totals remain intact. Separate enrichment approval releases one saved record with a zero-dispatch grant; a noncached home rejects a $0.09 ceiling and accepts a separate one-job/$0.10 grant. No worker or actual property call runs. Repeat approvals/confirmation create no new spend/home. Concurrent reservation and same-address confirmation tests pass; local authenticated owner reads work, other-account reads and direct writes/RPC execution are denied.

## Retained test contacts: blocker to a meaningful paid test
Read-only inspection found four contact-only rows and zero prior reverse searches:
- Agent Test Email: agent-test-email@example.invalid
- Agent Test Phone: 6785550143
- Test Contact Email: lo-test-email@example.invalid
- Test Contact Phone: 6785550142

These are deliberately synthetic (.invalid emails and reserved 555-01xx phones). They are blocked from paid searching. Proposal now: exercise all four with local mock results, cost $0. For a meaningful paid test, Neil must identify an already-retained real contact with valid details and no prior search; do not substitute, edit live contact details, upload or dispatch without approval. Proposed eventual limit: one eligible real retained contact per account, two reverse searches, maximum estimated $0.60, zero property-enrichment approval. The per-person $0.10 is a planning estimate, not provider-confirmed pricing; confirm that contractual ceiling before execution if a guaranteed dollar cap is required.

Read-only Oct 30 inspection expanded to both accounts' contact-only staging, book contacts and active home contacts. No eligible phone-only contact or never-searched phone+email contact was found. Agent has 522 active homes but only one real phone contact, Elsa Milena Sierra (phone+email), already reverse-searched; loan officer has 132 active homes and no phone contacts. Do not reuse Elsa or substitute Amalia. A two-contact live test cannot currently be nominated from existing eligible data. Once eligible contacts are identified, proposed reverse ceiling remains $0.60 total (2 × 3 people × $0.10 estimated); property enrichment authorization remains $0, with any future property test requiring a separately agreed count/cost.

## Oct 30 fixes (local, 79 focused tests pass)
- Conflicting phone/email: when both were supplied and the returned person's own listed details contradict either one, or the phone and email point to different people, the result becomes "needs review" (flagged as a conflict). Confirmation SQL now accepts only completed matched/needs-review results; uncertain, suppressed or reserved results can never be confirmed. Nothing is ever confirmed automatically.
- Prior searches: one shared check (`reverse-prior.server.ts`) now runs in the upload summary, upload approval AND the Test Lab. A normalized phone or email searched in either workflow, anywhere in the same workspace or by the same person, blocks a paid repeat — including uncertain outcomes. The reservation RPC enforces the same rule under the global spend lock. Read failures stop with "Nothing sent". Before the migration exists the upload table reads as empty (Test Lab unaffected).

## Enforceable maximum for a two-contact test
- Enforced by SuCasa: the approval must equal exactly the selected count (1–10) and reserves 30 cents per search before any call; a 2-contact batch cannot reserve more than 60 cents, and the monthly cap (BATCHDATA_REVERSE_MONTHLY_CAP_CENTS, default $10) is checked under lock. A response with more than 3 people is held as uncertain and never retried.
- NOT enforceable by SuCasa: what the provider actually bills. $0.10/person is a planning estimate, and owner-only filtering returns at most 3 people per search per the docs. Provider-confirmed pricing/contract terms are needed to call $0.60 a guaranteed dollar cap.
- Property enrichment: $0 authorized; requires its own separate approval.

## Adding two real test contacts (simplest path)
Upload a 2-row CSV on the loan officer account with no address column values (mixed upload is already live for that account): row 1 = name + phone only; row 2 = name + phone + email. Both become "Contact only" — no homes, credits or lookups. After enablement, the reverse panel runs the prior-search check per row and shows "Previously searched" instead of a checkbox if either workflow has seen the phone or email. Use people who own a known property and have agreed to be tested; not Elsa, Eduardo or Amalia (already searched — they would be blocked).

## Hosted permission checks (read-only, after migration is applied)
1. `has_table_privilege('anon', 'public.upload_reverse_searches','SELECT')` and for `upload_reverse_properties` = false; authenticated SELECT only; no INSERT/UPDATE/DELETE for authenticated.
2. `has_function_privilege('authenticated'|'anon', reserve_upload_reverse / confirm_upload_reverse_property, 'EXECUTE')` = false; service_role = true.
3. RLS enabled on both tables; policies scoped to `requested_by = auth.uid()` plus assigned book.
4. Signed in as each test account: own rows readable, the other account's rows not visible.
5. Security scan shows no new findings.

## Remaining controlled integration / rollout steps
1. SHARED-DATABASE CHANGE (cannot be isolated per account): obtain approval for the additive shared schema `docs/release-candidates/upload-reverse-migration.sql`. It creates two private tables and two service-only RPCs; applying schema is shared and cannot be isolated by account. It does not backfill/replay uploads or change existing rewards, holds, jobs or grants.
2. Local ownership/RLS, concurrency, capacity, repeat safety and separate grants are tested. Remaining hosted checks: real auth, full production trigger chain, saved-record freshness/fallback through the real worker and crash recovery. Conflict handling and shared prior-search scope are resolved locally (Oct 30). Additional response addresses remain evidence only (never asserted as owned); the tested multi-property case has two explicit linked property records, each separately confirmed. Local fixture tests do not prove all production triggers or hosted auth.
3. SHARED: publishing ships the Test Lab prior-search check to everyone who can reach the Test Lab (preview hosts only). Publish only after approval, with `UPLOAD_REVERSE_ENABLED` absent/false. Mixed upload allowlist remains exactly Neil's agent and loan officer ids.
4. Enable `UPLOAD_REVERSE_ENABLED=true` only after approved testing scope. Code additionally hard-limits access to the two specified accounts and requires MIXED_UPLOAD_USER_IDS membership. No other account can opt in through client input.
5. Run approved real-data browser test only when eligible retained contacts and the price ceiling are confirmed. No property lookup, Amalia handoff, historical queue release or reward changes are included.
6. Turn off with `UPLOAD_REVERSE_ENABLED=false` (and redeploy/publish the secret change for production). No migration rollback/purge needed; results, capacity-waiting matches and reservations remain preserved. Disabling cannot cancel a request already dispatched; uncertain/reserved work stays held.

Do not mark production workflow verified until steps 1–5 succeed. Review-only SQL is intentionally unapplied.
## Oct 30 rollout
Migration applied (0049 + 0050 grant tightening: hosted defaults had given anon/authenticated write rights; now authenticated SELECT only, anon none, RPCs service-only). RLS on. UPLOAD_REVERSE_ENABLED=true; code limits access to the two test accounts. Publish requested; sucasa.com returns 200. Scan: no new findings. No paid searches run.
