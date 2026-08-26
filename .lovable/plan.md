# Phase 2 — Homeowner selling analysis: ROI-ranked pre-sale improvements

## Goal
Give homeowners and agents a clear, ranked view of which deferred-maintenance fixes and light pre-sale improvements are most likely to increase net proceeds and saleability, using data SuCasa already collects.

## How we know what to rank

SuCasa already builds a `HomeRecord` for every profile that contains the exact signals we need:

- **Condition**: inspection findings, maintenance timeline (overdue / due-soon / healthy), permit history, and service-log gaps from `src/lib/maintenance-rules.ts` and `src/lib/home-maintenance.functions.ts`.
- **Value**: resolved home value from `src/lib/home-value.ts` (AVM → assessed → equity estimate).
- **Property context**: year built, beds/baths, sqft, last sale from `src/lib/property-intel.functions.ts`.

We do **not** need a new external ROI dataset for the MVP. Instead we use a conservative, category-based rule set:

1. **Inspect the Home Record** for deferred-maintenance items already flagged by the Home Plan engine (Phase 1).
2. **Map each item to a payback bucket** using category rules:
   - **High payback**: safety/inspection blockers (electrical hazards, roof leaks, plumbing leaks, HVAC failure), curb appeal with low cost (paint, landscaping, deep clean).
   - **Medium payback**: mechanical systems in due-soon window (HVAC, water heater, roof within 3–5 years), minor kitchen/bath refresh.
   - **Low payback / discuss first**: major additions, luxury finishes, anything with long payback or high cost relative to home value.
3. **Attach a planning cost range** from a small internal table keyed by category + home-value tier, not a quote. Example: "Roof repair/replacement — typically $8K–$18K for a home in this value range."
4. **Rank by combined score**: (payback bucket weight) × (urgency multiplier) × (visibility to buyers). Overdue safety items float to the top; optional cosmetics sink to the bottom.
5. **Show estimated value lift as a range**, not a guarantee. The range is derived from the same rule table and is intentionally conservative.

## What gets built

1. **`src/lib/selling-analysis.ts`**
   - `PreSaleItem` type: category, urgency, payback bucket, typical cost range, estimated value-lift range, rationale.
   - `buildSellingAnalysis(homeRecord)` returns ranked items and a "net-proceeds summary" (current estimated value + low/high improvement lift).
   - Deterministic, testable, no AI needed.

2. **`src/lib/selling-analysis.server.ts`**
   - Optional Gemini wrapper to generate one plain-language "why this matters" sentence per item, cached by source hash (same pattern as Home Plan AI explanations).

3. **`src/lib/selling-analysis.functions.ts`**
   - `getSellingAnalysis()` authenticated server function that loads the owner’s Home Record and returns the ranked analysis.
   - `saveSellingAnalysisSnapshot()` to cache the last generated analysis for agents/lenders to reference.

4. **`src/routes/_authenticated/sell.tsx`**
   - New iOS/mobile-first page: "What could you net if you sold?"
   - Hero shows current estimated value + projected net range after top improvements.
   - Stacked cards show ranked improvements with payback badge, cost range, value-lift range, and rationale.
   - "Get a real estimate" CTA links to a service request or agent intro (consent-gated per Phase 5 rules).

5. **`src/routes/_authenticated/agent/portfolio.$id.tsx` and lender portfolio views**
   - Add a "Listing readiness" tab or drawer section that surfaces the same ranked list for the agent/lender to discuss with the homeowner.
   - Agent-facing copy frames it as "conversation starter," not a guarantee.

6. **`src/routes/_authenticated/dashboard.tsx`**
   - Add a "Selling analysis" `SummaryCard` (behind a simple eligibility check: value resolved + condition data present) that links to `/sell`.

7. **i18n**
   - Add `sell.*` keys to `src/lib/i18n/en.ts` and `src/lib/i18n/es.ts`.

## Out of scope for this phase

- Live contractor bids or pro cost estimates.
- MLS sold-with-renovation comps (can be added later when a data source is contracted).
- Major renovation ROI (kitchen/bath remodels) beyond simple deferred-maintenance-linked refreshes.
- Public leaderboards or gamification.

## Risks and mitigations

- **Risk**: ROI numbers feel like guarantees and create liability.  
  **Mitigation**: Every estimate is labeled as a "planning range," not a quote or appraisal. Add a one-line disclaimer.
- **Risk**: Home Record condition data is incomplete, so the analysis is empty for some profiles.  
  **Mitigation**: If no condition signals exist, show a prompt to upload an inspection report or schedule a walk-through, then fall back to generic guidance.
- **Risk**: Agents/lenders see the analysis before the homeowner consents.  
  **Mitigation**: Professional views only show the analysis for clients where `homeowner_lender_consents` or agent relationship exists; otherwise the card is hidden.

## Verification

- Test with the `neilterc@hotmail.com` profile (545 Huntwick Pl) and confirm ranked items appear based on its Home Record.
- Test with a profile that has no inspection/maintenance data and confirm the empty state prompts for inspection upload.
- Typecheck passes (`bunx tsgo --noEmit -p tsconfig.json`).
