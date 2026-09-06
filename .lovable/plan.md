# Why the lender side shows nothing, and how to fix it

## What's happening

Every homeowner record in the lender books is currently marked with the relationship label `org_uploaded` (all 1,088 rows). The lender access gate only recognises a fixed list of labels (`lender_upload`, `existing_customer`, `servicing`, `past_borrower`, `import`, ...) as "this lender's own relationship". `org_uploaded` is not on that list, so every homeowner is classified as "no documented basis": they are counted in an aggregate bucket and dropped from the named list.

Consequences, all from that one mismatch:
- My Book and the contact queue come back empty.
- The homeowner detail view returns nothing.
- The briefing tool refuses with "Not permitted", because it first asks for the same detail view.

A second, smaller gap explains why the lender detail would still look thin next to the agent's: the agent's client view reads the cached property record (value, characteristics, permits) for the address, while the lender view derives value only from the loan amount and closing date. Roughly 80% of lender rows have no loan amount on file, so those homeowners would have no numbers and therefore no review cards even after the gate is fixed.

## The fix

1. **Accept the real label.** Add `org_uploaded` (and the other labels our own importers write) to the set of bases that establish a lender's own relationship, so uploaded book records are named again. Keep the existing scope limits — an uploaded record still only gets the baseline own-relationship scope, never contact-marketing consent.
2. **Backfill the label** on existing rows to the canonical value so the data and the code agree going forward, and set the importer to write the canonical value.
3. **Use the cached property record for lenders too.** Join the already-cached property data by address in the lender workspace read — the same cache the agent side uses, so no new provider calls and no extra cost. Value, equity, LTV and loan age then come from real records where they exist, falling back to the loan-derived estimate as today.
4. **Make the empty state honest.** When a homeowner is visible but we still have no numbers, show the reason ("no property record on file for this address") rather than silently omitting them from the queue.
5. **Brief tool.** No logic change needed — once the detail view resolves, the brief generates with the compliance loop already in place. Add a clear message when a homeowner genuinely has no permitted basis, instead of a raw error.

## Technical notes

- `src/lib/lender-access.ts`: extend `OWN_RELATIONSHIP_BASES`; add a unit test asserting `org_uploaded` classifies as `own_relationship` with the baseline scope.
- `src/lib/lender-workspace.server.ts`: add a cached `property_intel` lookup keyed by normalised address for the visible client rows; prefer record-derived value over `estimatedValueCents`; keep everything behind `hasScope`.
- Migration: `update lender_portfolio_clients set relationship_basis = 'lender_upload' where relationship_basis = 'org_uploaded'` (plus the importer writing that value), so the code path has one canonical label.
- `src/lib/lender-workspace.functions.ts`: return a typed "not permitted" result instead of throwing, so the UI can explain it.
