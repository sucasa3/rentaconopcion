# Launch Sprint — Stage A (checkpoint at the end)

Delivered in stages. This plan covers **Stage A: Phases 1–5**. Phases 6–13 are outlined at the end and planned in detail after you review Stage A results.

## Decisions locked in
- Final validation uses 15 addresses from today's upload, deliberately mixed: ~10 houses + ~5 apartment/unit addresses.
- BatchData becomes the primary source for new homeowner enrichment. ATTOM stays off.
- Payments: Stripe gets built (Stage B) — no payment path exists in the app today.
- Every cost number stays a configurable setting, never hard-coded, so Tuesday's confirmed pricing drops in without rework.

---

## Phase 1 — Finish the test harness

The last run was lost because it was executed ad hoc instead of through the saved harness. Fix that first.

- Every request and response gets written to the isolated test tables before anything else runs: run ID, original address, normalized address, exact request payload, endpoint, timestamp, HTTP status, latency, attempt number, match result, parsed fields, full raw response, and response headers.
- Add a stored-response viewer so any past run can be reopened and re-scored without spending a single new call.
- Hard block: the test path cannot reach the property-records provider we are not testing. A guard throws if anything tries.
- Unit/apartment handling: send the unit in the provider's own secondary-address field rather than jamming it into the street line. If the schema we have does not clearly define one, the run records exactly what was sent and the item is flagged for Tuesday rather than guessed at.

## Phase 2 — The 15-property validation run

- Hard cap of 15 new lookups, one bundled lookup per property, retries off, no separate value/mortgage/permit calls.
- Stops the whole run immediately on any payment, quota or permission error.
- Captures per property: building details, owner and tenure, tax and assessment, sale history, valuation with range/confidence/as-of date, liens with balances and rates, LTV and equity, and every signal flag (permits, listing, pre-foreclosure, vacancy, ownership change).
- Each record classified GREEN (safe to show), YELLOW (show with a guardrail) or RED (do not surface), with the reason recorded.
- Output: an on-screen report plus a downloadable spreadsheet.

## Phase 3 — Data safety guardrails

A single shared safety layer that every screen reads through, so no page can invent a number:

- Value estimates carry an as-of date and are flagged or hidden past a configurable age.
- An old distress record is never presented as a current one.
- Multiple loans stay separate; balances and LTV are never merged when the relationship is unknown.
- A missing loan balance is never back-calculated.
- Assessor value is never shown as a market value without being labelled as assessor data.
- "Owns it outright" only appears when the data clearly shows zero open loans.
- Weak address matches are not attached to a homeowner at all.
- Provider confidence and our own status are both preserved and visible.

## Phase 4 — Provider → Home Profile mapping

Map the validated fields into the existing Home Profile in clean blocks: property, owner, tax, sales, valuation, equity, loans, permits/events, and data quality. The provider's own value estimate is used directly — the balance-divided-by-LTV calculation is dropped, since it just reproduces that same number. Enrichment for new homeowners switches to BatchData behind a provider setting.

## Phase 5 — Opportunity engine

Every Home Profile is evaluated for: high equity, owns-outright, cash-out/HELOC, refinance, loan age, rate opportunity, likely move/sell, recent purchase, and home-improvement activity — alongside the signals already in the product.

Each opportunity records the type, what triggered it, the supporting numbers, the homeowner and property, the linked lender and agent, confidence, priority, the date found, why it matters, the recommended next step, and a suggested outreach reason. Suppression rules stop an opportunity being created at all when the underlying data is stale, ambiguous or unsafe.

**Stage A ends here with a written report and a checkpoint before Stage B.**

---

## Stage B and C (planned in detail after your review)

- **Stage B — revenue path:** lender action dashboard (Phase 6), sponsored-agent audit and launch-blocker fixes only (Phase 7), CRM actionability with duplicate prevention (Phase 9), onboarding friction audit (Phase 10), Stripe plans/checkout/subscription state and profile + sponsored-agent limits (Phase 11).
- **Stage C — depth and launch:** AI Document Inbox MVP (Phase 8), end-to-end QA including all the edge cases you listed (Phase 12), and the Launch Command Center with the ranked top-10 and the "what stops us taking a paying lender tomorrow" answer (Phase 13).

## Pending BatchData confirmation (tracked, blocks nothing else)

A living checklist page in the admin area holding: real per-lookup cost, whether no-matches are billed, value-estimate entitlement and refresh cadence, loan balance/equity refresh cadence, the correct apartment/unit request format, signal-list entitlement, realistic permit coverage, whether a cheaper refresh endpoint exists, the multi-loan LTV definition, and whether wallet balance is readable via the API. Each item is wired to a configuration value, so answers get typed in rather than coded in.

## Technical notes

- Harness persistence moves into `batchdata-test.server.ts` with header capture and a replay/re-score path over `batchdata_test_results`.
- New guardrail module (`property-safety.ts`) with thresholds in a config table; consumed by valuation, equity, opportunity and dashboard code paths.
- Mapping lands in `home-profile.server.ts` / `property_intel`; `batchdata.server.ts` normalizers get corrected to the real response shape confirmed by the stored runs.
- Opportunity rules extend `opportunities.server.ts`, writing typed rows with confidence, priority and suppression reasons.
