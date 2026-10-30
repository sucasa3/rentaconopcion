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

## Remaining controlled integration / rollout steps
1. Obtain approval for the additive shared schema `docs/release-candidates/upload-reverse-migration.sql`. It creates two private tables and two service-only RPCs; applying schema is shared and cannot be isolated by account. It does not backfill/replay uploads or change existing rewards, holds, jobs or grants.
2. Local ownership/RLS, concurrency, capacity, repeat safety and separate grants are tested. Remaining hosted checks: real auth, full production trigger chain, saved-record freshness/fallback through the real worker and crash recovery. Review also still needs phone/email overlap conflict handling and consistent previous-search scope across summary/reservation; no deployment readiness claim until resolved. Additional response addresses remain evidence only (never asserted as owned); the tested multi-property case has two explicit linked property records, each separately confirmed. Local fixture tests do not prove all production triggers or hosted auth.
3. Publish only after approval, with `UPLOAD_REVERSE_ENABLED` absent/false. Mixed upload allowlist remains exactly Neil's agent and loan officer ids.
4. Enable `UPLOAD_REVERSE_ENABLED=true` only after approved testing scope. Code additionally hard-limits access to the two specified accounts and requires MIXED_UPLOAD_USER_IDS membership. No other account can opt in through client input.
5. Run approved real-data browser test only when eligible retained contacts and the price ceiling are confirmed. No property lookup, Amalia handoff, historical queue release or reward changes are included.
6. Turn off with `UPLOAD_REVERSE_ENABLED=false` (and redeploy/publish the secret change for production). No migration rollback/purge needed; results, capacity-waiting matches and reservations remain preserved. Disabling cannot cancel a request already dispatched; uncertain/reserved work stays held.

Do not mark production workflow verified until steps 1–5 succeed. Review-only SQL is intentionally unapplied.