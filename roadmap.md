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
- [ ] Legal review (RESPA) and NMLS verification — awaiting attorney/user
