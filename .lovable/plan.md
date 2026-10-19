# Household storage and lossless imports — approval plan

## What this approval covers
Approve the storage/import design and preparation for an isolated test implementation only. **Do not apply production schema changes, backfill production records, modify live imports, trigger lookups/messages, or publish.** Those remain separate authorization gates.

## Read-only findings
- 1,392 existing client records across 65 books; 375 records in non-test organizations and 1,017 in test organizations.
- Every client address key is currently null; the active unique-address index therefore does not protect those rows.
- 4 records have no street; 50 addressed records lack ZIP. Keep them for review.
- 176 same-book email groups span multiple properties (459 rows); non-test subset: 11 groups / 24 rows. Email cannot be a property dedupe key.
- 1,065 address/location candidates and 1,109 contact candidates are **not verified identities**. Never merge automatically.
- 2,840 property opportunities and 1,383 enrichment jobs have no orphan clients or org/book mismatches. Preserve IDs and history.
- Existing relationship rows are org-readable; they are unsuitable for private officer-scoped household information. Enrichment metadata is also org-readable and needs an explicit security acceptance gate before rollout.

## Proposed experience and workflow
1. Preserve every CSV source record, including repeated, malformed, addressless and unmapped content, in private staging.
2. Distinguish exact-repeat rows, existing contact candidates, shared properties, additional properties, new records and ambiguous matches.
3. Retain all co-borrowers and distinct units. Never infer households, primary residence, ownership, consent or access from matching names/emails.
4. Resolve uncertain matches through explicit review within the uploader’s own book.
5. Keep a single household conversation recommendation with one authorized recipient while preserving all underlying property opportunities and individual follow-ups.
6. Show review results without inserting clients, spending capacity or starting paid enrichment/communications.

## Technical design
Seven additive tables: canonical property identity; book contacts; client-contact links; book households; household members; import batches; source rows. Add a nullable property reference to existing client rows. No destructive edits, duplicate provider store or new financial engine. Exact fields/indexes/policies and code seams are specified in `docs/household-storage-plan.md`.

- Existing client rows remain compatibility property/book records. Extra contacts do not create extra client rows or spend Home Profile capacity. Additional distinct properties use existing entitlement rules.
- Canonical identities stay internal; caller-visible addresses and facts require existing independently authorized client/property access.
- Graph rows remain book-scoped. Household edges never grant access or override homeowner consent, officer ownership, suppression or lender financial scopes.
- New-table grants are explicit; RLS is enabled. Raw staging is uploader-owned. Mutations go through authenticated, guarded, same-book transaction functions with explicit execute grants and fixed search paths.
- Future promotion locks ownership/capacity/identity, validates review version and records per-row receipts atomically. Retries read receipts; interrupted transactions leave no promoted rows. Repeated files need reviewed contact IDs, not inferred email merging.
- Preserve raw staging with its uploader when managers assign records. Move/clone book-scoped links transactionally without exposing unassigned properties or duplicating enrichment.

## Conservative shadow projection — not performed
After a separately authorized backfill: retain 1,392 clients, create 1,392 provisional contacts and asserted source links; create 1,388 provisional property references and hold 4 addressless rows. **Zero automatic confirmed households, new homeowner accounts, credit spends, lookup jobs or messages.** Later explicit identity review may consolidate candidates, but that is not authorized here.

## Evidence and tests completed
- Read-only catalog audit: actual columns, foreign keys, indexes, RLS policy composition, ACL grants and client insert/address-change/credit triggers.
- Aggregate evidence: `docs/household-storage-reconciliation.json`; reproducible SELECT-only checks: `docs/household-storage-readonly.sql`.
- 11 new offline contract tests plus 57 focused existing safeguards: **68 tests in 7 files passed**. Scenarios include multi-property contacts, co-borrowers, units, source retention, repeat/interrupted imports, stale reviews, capacity, workspace/officer boundaries and single household conversation selection.
- Production counts remained unchanged; no application importer code or database schema was modified. No unnecessary full-suite rerun or Test Lab payload replay.

## Required gates before real rollout
1. Implement schema/transaction/parser in a genuinely isolated backend after approval; if unavailable, stop rather than apply to the shared production database.
2. Run real-session RLS and SQL concurrency/failure tests there: manager/officer/agent/homeowner, foreign references, pending/revoked data, raw staging, property-ID enumeration, trigger/credit invariants and assignment.
3. Validate full-record CSV parsing and original workbook retention; choose a private source retention policy before real staging.
4. Separately authorize production schema-only deployment, then shadow backfill, then one controlled real import, then publication.

Offline simulations do not establish actual SQL transactions, live RLS or parser correctness. Historical skipped-row recovery still requires the original CSV and explicit authorization. Provider financial activation remains blocked by evidence/freshness requirements and is not part of this plan.

## Rollback
Disable new consumers/commits first; retain additive tables, source rows, confirmations and nullable references. Keep old client fields, IDs, opportunities and queue untouched. After actual imports, keep new clients and all co-borrower evidence; do not delete records or drop schema to roll back the UI.
