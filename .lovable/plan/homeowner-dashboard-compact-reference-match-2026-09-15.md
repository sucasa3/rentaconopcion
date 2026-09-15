# Homeowner Dashboard — Compact Reference Match

## Goal
Make the existing Home Profile closely match the approved mobile reference’s compact, premium composition without changing its data, calculations, permissions, navigation, or SuCasa identity.

## What will change
- Keep the existing SuCasa logo and account controls in the mobile header.
- Shorten the property-photo area on phones while preserving it as the emotional first impression, with the home label and real address over the existing dark gradient.
- Reduce outer gaps, card padding, heading sizes, and repeated explanatory copy so more of the homeowner story is visible at once.
- Keep Home Score and Home Systems side by side on supported phone widths, using compact evidence-backed rows and the existing explainability action.
- Compress Value & Equity into one short white card with a restrained intelligence surface and two scannable columns.
- Tighten Home Care into the reference-style tab row plus compact task preview, without changing destinations or records.
- Present Home Team as two compact horizontal professional tiles when space allows; retain accurate confirmed, pending, one-professional, and empty states.
- Make Ask SuCasa a short final strip with the existing action.
- Preserve the current bottom navigation and its existing destinations.

## Visual rules
- Continue using the approved homeowner palette and semantic tokens.
- White and neutral surfaces remain dominant; navy, orange, and dark green carry the personality.
- No fabricated positive statuses, freshness, values, tasks, or professionals.
- The reference image guides composition only and will not be embedded in the app.

## Technical details
- Refine the existing Home Profile, property-photo header, and homeowner navigation presentation only.
- Use resilient mobile grids with shrink-safe text and fixed-size controls so the compact layout does not clip at narrow widths.
- Preserve 44px interaction targets even as non-interactive spacing becomes tighter.

## Verification
- Review the real dashboard at 320, 375, 390, and 430px plus desktop.
- Verify empty, confirmed agent+lender, one-professional, and pending-professional Home Team states.
- Verify Dashboard → Home Care and Dashboard → Money transitions.
- Check for horizontal overflow, clipped text, safe-area conflicts, console errors, and regressions in the existing test suite.
