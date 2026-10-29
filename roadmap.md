# Roadmap — Agent experience repair (Oct 22, 2026)

Source: uploaded spec "We have identified two critical issues" (Neil Terc). No publish without approval.

## Priority 1 — Automatic enrichment on manual add
- [x] Manual agent add → cache-first, then auto BatchData lookup within plan/usage limits (enrichment-auto.server.ts)
- [x] Minimal anti-abuse controls (one dispatch per add, 50/month per book, budget envelope); bulk uploads unchanged
- [x] No auto-release of paused queues or other customers' records; isolation/dedupe/attribution preserved
- [x] Add-page toast shows enriched / cached / no-match / failed / queued states
- [x] Elsa Milena Sierra + Daniel Romero (2 homes) enriched via the new path — 3 lookups, all matched
- [x] ATTOM stays off

## Priority 2 — Trustworthy Agent Today
- [x] Monitored shows 86 properties + 33 owners; unique-contact counting added
- [x] "Need attention" = genuine contact-level total (32), not the 25 query cap
- [x] "Follow-ups due" = real to-dos only (1); opportunity suggestions separated
- [x] Queue grouped by contact (email/phone/name); cards show "N homes on your list"
- [x] Removed artificial Hot: year-built condition guesses capped, never-contacted bonus removed, nominal-transfer appreciation claims blocked
- [x] Wide-disagreement guard: contradictory records → review-only value, equity claims suppressed (Eduardo Soto fixed)
- [x] Owner-mismatch flag built (activates on records with owner names; Amalia's old records lack owner data)
- [x] Validated in browser as the live agent account

## Status
- 602 tests passing (19 new/updated); build OK; preview only — NOT published, awaiting approval

## Explore Your Mortgage Options (/money) — Oct 28
- [x] Agent-confirmed lending contact, homeowner card, consent modal, LO book + opportunity + email
- [x] Atomic inbound inquiry delivery, capacity-safe staging, public-record access, selected contact and optional snapshots; marketing off, enrichment held
- [x] 50 focused checks passed, including 9 real PostgreSQL transaction tests on an isolated local fixture; build OK; signed-in neutral /money desktop/mobile verified
- [ ] Confirm designated-homeowner → LO Today/book in live sessions and notification receipt — no active designations/requests; prior synthetic LO email bounced; full linked-account flow remains unverified
- [ ] Spanish live-session confirmation — saved profile language overrides device setting; translations and recorded consent are covered by focused tests
- [ ] Legal review (RESPA) and NMLS verification — awaiting attorney/user

## BatchData Reverse Lookup — Phase 1 (Oct 29, 2026)
Source: uploaded spec "Implement Phase 1 of SuCasa's BatchData Reverse Lookup" (Neil Terc). Preview only, no publish, no paid calls without approval.
- [x] Secure secret entry for separate reverse-lookup token (BATCHDATA_REVERSE_API_KEY); property-lookup key untouched
- [x] Verified docs: endpoint /api/v3/property/reverse-skip-trace, option spelling propertyOwnersOnly; DISCREPANCY: docs say owner-only filters BEFORE the 3-person limit (up to 3 billed results/item), not 1 result/$0.10 max as Ricky stated
- [x] Controlled single-contact lookup: workspace-scoped, validated inputs, cache/dedupe, monthly spend cap, durable pre-call record, no auto-retry
- [x] Review states: matched / needs_review / no_match / invalid_input / provider_error; multi-person responses flagged and held
- [x] Explicit handoff action: approved property → contact address (never overwrite) + enrichment queue only (no grant, no paid property lookup)
- [x] Separate cost tracking: estimated vs provider-confirmed, $700 wallet as unverified starting estimate
- [x] Offline fixture tests — 20 passed, no paid calls; live test proposal: 3 known contacts, max est. $0.90 (3 items × up to 3 results × $0.10)
