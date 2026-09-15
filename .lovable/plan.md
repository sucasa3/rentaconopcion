# Homeowner Home Profile Light Refinement + Home Team

## Build
- Keep the current property-photo-first dashboard structure and all existing calculations, records, navigation, onboarding, and assistant behavior.
- Replace only the dashboard-scoped near-black premium theme with a warm light SuCasa system: warm page, white cards, intelligence-blue financial surfaces, warm care surfaces, navy hierarchy, restrained orange relationship accents, and soft borders/shadows.
- Refine the existing Home Score, system summaries, Value & Equity, Home Care tabs, and Ask SuCasa finale without adding new widgets or changing their data sources.

## Home Team
- Extend the existing authenticated Home Team read to return presentation-safe members from canonical relationship and professional records.
- Show at most one current confirmed agent and one current confirmed lender. Exclude rejected, revoked, disconnected, stale, and unconfirmed records from active-member labels.
- Show asserted relationships as pending review, never as “Your agent” or “Your lender.” Use existing Home Team navigation for confirmed cards, pending cards, and empty/add states.
- Reuse privacy-safe display names and existing professional identity fields; never expose contact details on the dashboard.

## Safety
- Relationship display remains read-only and grants no consent, information access, entitlement, sponsorship, or capacity.
- `consent_records` and the existing access classifier remain the only authority for lender information sharing; agent access rules remain unchanged.
- No new table, relationship status, parallel model, fabricated professional, system condition, score, or financial value.

## Verification
- Verify the Home Profile at 320, 375, 390, and 430px plus desktop, including overflow, 44px tap targets, contrast, and safe-area navigation.
- Capture the requested 390px and desktop Home Profile views.
- Verify confirmed agent + lender, one-professional, pending-professional, and empty states using canonical records or isolated presentation fixtures that never alter production data.
- Verify Dashboard → Home Care and Dashboard → Money visually and confirm no browser errors.
- Run focused Home Team/access regressions and the existing test suite; confirm relationship display produces no permission or access changes.
