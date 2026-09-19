# Confirm preview URL and resolve lingering pastel colors in My Home demo

The user wants the updated preview link and reports that the My Home demo still shows pastel colors instead of the real homeowner product palette.

## Current state

- The public homepage (`src/routes/index.tsx`) renders the fictional **My Home** demo via `HomeownerShowcase` in `src/components/homepage-product.tsx`.
- The demo wrapper already applies the `homeowner-premium` class, which overrides the global semantic tokens with the exact homeowner palette (white cards, saturated navy/orange/green, no pastels).
- The preview URL for this draft has not changed with each edit; it is the same link.

## Plan

1. **Provide the current preview URL**  
   Confirm the single draft preview link is:  
   `https://id-preview--94429f0c-1687-4b34-81a7-6195279589c3.lovable.app`

2. **Verify the live preview matches the real product palette**  
   - Check the rendered My Home demo at 390px and 1280px in English and Spanish.
   - Compare it to the authenticated homeowner dashboard (`src/routes/_authenticated/dashboard.tsx` + `src/components/home-hero/HomeHero.tsx`) and the `homeowner-premium` token override in `src/styles.css`.
   - Confirm the hero metric tray, Home Score ring, Home Health cards, Home Care card, and Ask SuCasa card use the same saturated tones as the real dashboard, not pastels.

3. **If the preview still appears pastel, diagnose the cause**  
   - Browser/service-worker cache on the existing preview tab.
   - Stale preview build not yet flushed.
   - A remaining token in `homepage-product.tsx` that bypasses the `homeowner-premium` override (e.g., hardcoded Tailwind utilities, non-semantic colors, or elements outside the override scope).

4. **Fix any remaining color mismatch**  
   - Align any leftover pastel/soft tokens inside the demo with the real homeowner semantic tokens.
   - Keep all changes scoped to the public demo components; do not import or share authenticated dashboard logic.
   - Preserve routes, English/Spanish copy, mobile-first layout, and all other approved homepage structure.

5. **Verification**  
   - Re-check the preview at 390px and 1280px, English and Spanish.
   - Run typecheck and the full test suite to ensure no regressions.
   - Keep changes preview-only; do not publish.
