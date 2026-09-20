# Lender Today — daily command center refinement (preview only)

Refine the Lender Today screen so it feels like the same product as the refined Agent Today and the approved Lender View homeowner detail, while staying lender-specific. Presentation only: no changes to ranking, eligibility, permissions, consent, opportunity generation, canonical reasons, opener logic, channel availability, outcome values, or tracking.

## What changes on screen

1. **Daily Read stays first, but compact.** Keep the personalized greeting and the SuCasa daily read sentence. Replace the tall attention block and bulleted list with one polished briefing band plus three small inline totals, drawn from existing metrics: needs attention today, follow-ups/reviews due, homeowners monitored. Keep the "Why these N?" disclosure available but quiet.

2. **Start here becomes the focal card.** The top-ranked relationship gets a white card with warm header, deep navy name, restrained orange accent and the existing priority chip (Hot / Warm / Nurture stays exactly as ranked today). Structure: homeowner name → canonical lender opportunity/reason → up to three supporting facts that already exist (equity/LTV, loan age, review timing, tenure, engagement, requested connection), then Why now → Recommended next step → Suggested opener on the intelligence-blue surface.

3. **One clear lender story.** Why now uses the existing canonical explanation; Recommended next step uses the existing recommended action wording; no duplicated near-identical sentences. No listing/selling language, no savings, approval, qualification or product-suitability claims.

4. **Outreach is immediate.** The recommended permitted channel renders as the filled navy action; other permitted channels stay secondary; unavailable channels keep showing their existing reason and stay non-actionable. View homeowner (the existing deeper route) sits beside them as the secondary research action.

5. **Compact outcome logging.** The eight visible outcome pills collapse behind a single "Log outcome" disclosure that reveals the same existing lender outcome values, with the same mutation, confirmation, follow-up scheduling and refresh behavior.

6. **Remaining relationships become a queue.** Secondary rows get a much denser card: rank indicator, name, concise reason, one strongest supporting line, recommended permitted channel, View homeowner. No per-row Why now, opener or snapshot grid.

7. **Homeowners who asked to connect** keep their existing precedence and their own compact treatment in the new visual language, with the current authorization disclosure intact.

8. **No property hero on Today.** No photos, no mortgage panels, no full equity breakdowns — those remain in View homeowner. The existing "SuCasa working for you" aggregate section stays, restyled compactly, with the sponsored-only privacy note unchanged.

## Technical notes

- Files touched: `src/components/lender-today.tsx` and `src/components/lender-contact-card.tsx`. `LenderContactCard` is used only by Lender Today, so no approved Agent screen is affected. `IntelligenceSurface` is shared — it will be reused as-is, not modified.
- Scope the page with the existing `professional-detail` token class in `src/styles.css` so it inherits the same approved palette as the refined detail screens. No new color values.
- All data keeps coming from the existing gated `getLenderWorkspace` read; `logLenderOutcome` and `setOutreachPermissions` calls are unchanged. Sponsored-only homeowners stay aggregate and unnamed.
- Outcome stage values, channel gating flags and priority labels are read straight from existing modules — no new derivations.

## Verification

- Typecheck plus the full test suite.
- Authenticated browser check at 320px, 390px, 430px and desktop: populated queue, quiet/caught-up state, and a relationship with an unavailable channel. Confirm no horizontal overflow and that Start here lands in the first viewport.
- Preview link provided for review. Nothing published until explicitly approved; Agent Today and both View homeowner screens stay untouched.
