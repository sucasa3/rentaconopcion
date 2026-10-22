# Roadmap — Agent experience repair (Oct 22, 2026)

Source: uploaded spec "We have identified two critical issues" (Neil Terc). No publish without approval.

## Priority 1 — Automatic enrichment on manual add
- [ ] Manual agent add → cache-first, then auto BatchData lookup within plan/usage limits
- [ ] Minimal anti-abuse controls (per-book caps, dedupe); bulk uploads stay separately controlled
- [ ] Never auto-release paused queues or other customers' records; preserve isolation/dedupe/attribution
- [ ] Accurate progress/success/no-match/failure states in UI
- [ ] Enrich Elsa Milena Sierra's property as the validation example
- [ ] ATTOM stays off

## Priority 2 — Trustworthy Agent Today
- [ ] Accurate monitored properties vs unique-contact counts
- [ ] "Need attention" from genuine qualifying contacts, not query limit
- [ ] "Due" follow-ups = real user-created/scheduled only; auto suggestions separated
- [ ] Group recommendations by contact, not property; no duplicate contact cards
- [ ] Remove artificial Hot ratings (equipment age, generic tenure, unverified equity, never-contacted bonuses)
- [ ] Recommendation and priority justified by same evidence
- [ ] Don't present mortgage-implied/assessor/old-sale values as provider AVMs
- [ ] Suppress high-confidence equity/net-proceeds when valuation/loan unreliable
- [ ] Fix Eduardo Soto valuation discrepancy; Amalia Manzo ownership association

## Constraints
- Smallest focused changes; preserve lender/homeowner UX, billing, permissions, compliance
- No scoring-engine rewrite, no page redesign, no unrelated features
- No unauthorized paid calls; validate against the 85-property account
- Report: fixes, before/after numbers, auto-enrich status, BatchData AVM limits, tests, publish safety
