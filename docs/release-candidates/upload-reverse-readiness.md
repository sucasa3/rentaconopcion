# Retained-contact reverse search readiness

Prepared, default off. No shared migration applied, uploads, provider calls, queue releases or publication performed.

## Prepared experience
- Agents and lenders can reopen retained upload results, select eligible contact-only rows, and confirm a separate owner-search batch (1–10 searches, maximum estimated 30 cents each).
- Shared reverse-service transport and existing normalization/classification are reused. Every result stays available, including no-match and uncertain outcomes. All property associations require explicit review; mailing addresses do not become owned homes.
- Service-only reservation function locks the reverse budget, reserves worst-case spend before IO, and deduplicates by retained row and normalized phone/email in the book. Existing Test Lab searches block paid replay. Reserved or uncertain requests never automatically retry.
- Owner and active membership checks guard writes. Suppression is checked before approval, dispatch and property confirmation. Opt-out read failures stop processing.
- Property confirmation uses the existing organization capacity lock and original intake hold. No capacity means a preserved waiting match. Book-address duplicates create no new home. Saved data is checked in the database; subsequent property enrichment requires the existing separate upload spending approval. Original CSV outcomes/totals remain unchanged; derived properties are shown separately.

## Local evidence
69 focused tests passed: offline reverse transport/classification, phone opt-out equivalence, default-off/two-account access, synthetic-input rejection, and 23 disposable PostgreSQL transaction/regression tests. Fixture browser verified selection, $0.30 confirmation, matched/no-match/needs-review/waiting-capacity states; no approval submitted. Preview build OK.

## Retained test contacts: blocker to a meaningful paid test
Read-only inspection found four contact-only rows and zero prior reverse searches:
- Agent Test Email: agent-test-email@example.invalid
- Agent Test Phone: 6785550143
- Test Contact Email: lo-test-email@example.invalid
- Test Contact Phone: 6785550142

These are deliberately synthetic (.invalid emails and reserved 555-01xx phones). They are blocked from paid searching. Proposal now: exercise all four with local mock results, cost $0. For a meaningful paid test, Neil must identify an already-retained real contact with valid details and no prior search; do not substitute, edit live contact details, upload or dispatch without approval. Proposed eventual limit: one eligible real retained contact per account, two reverse searches, maximum estimated $0.60, zero property-enrichment approval. The per-person $0.10 is a planning estimate, not provider-confirmed pricing; confirm that contractual ceiling before execution if a guaranteed dollar cap is required.

## Remaining controlled integration / rollout steps
1. Obtain approval for the additive shared schema `docs/release-candidates/upload-reverse-migration.sql`. It creates two private tables and two service-only RPCs; applying schema is shared and cannot be isolated by account. It does not backfill/replay uploads or change existing rewards, holds, jobs or grants.
2. Verify actual RLS/grants, active-member ownership, capacity/credit triggers, saved-record freshness/fallback, suppression failures, concurrent approvals and crash recovery in a controlled database integration. Local fixture tests do not prove all production triggers or hosted auth.
3. Publish only after approval, with `UPLOAD_REVERSE_ENABLED` absent/false. Mixed upload allowlist remains exactly Neil's agent and loan officer ids.
4. Enable `UPLOAD_REVERSE_ENABLED=true` only after approved testing scope. Code additionally hard-limits access to the two specified accounts and requires MIXED_UPLOAD_USER_IDS membership. No other account can opt in through client input.
5. Run approved real-data browser test only when eligible retained contacts and the price ceiling are confirmed. No property lookup, Amalia handoff, historical queue release or reward changes are included.
6. Turn off with `UPLOAD_REVERSE_ENABLED=false` (and redeploy/publish the secret change for production). No migration rollback/purge needed; results, capacity-waiting matches and reservations remain preserved. Disabling cannot cancel a request already dispatched; uncertain/reserved work stays held.

Do not mark production workflow verified until steps 1–5 succeed. Review-only SQL is intentionally unapplied.