# Polish the My Home demo hero card only

## Goal
Update only the fictional My Home hero card on the public homepage so it matches the current homeowner dashboard’s hero treatment more closely. This is a visual alignment, not a homepage redesign.

## Changes
- Keep the existing fictional home photo, address, value, equity, and Home Score of 82.
- Refine the photo-and-metrics composition to match the current dashboard: address over the photo and a compact overlapping value/equity/Home Score tray.
- Replace the hero tray’s plain score number and shield icon with the green circular score ring used by the current dashboard.
- Keep the implementation isolated inside the public fictional demo; do not import authenticated dashboard logic or connect live data.

## Explicitly unchanged
- The rest of the My Home showcase, including Home Health, Home Care, documents, history, and Ask SuCasa.
- The already-approved mobile Home Services headline sizing, eight service categories, HVAC treatment, service actions, and disclosure.
- The already-compressed Agent and Lender previews and their content.
- “FOR AGENTS & LENDERS / Better context. Better-timed conversations.” and its spacing.
- Homepage hero, page structure, copy, English/Spanish support, final CTA, footer, routes, `/agents`, `/lenders`, pricing, authenticated dashboards, backend logic, and permissions.
- Preview-only status; nothing will be published.

## Verification
- Check the homepage at 390px and 1280px in English and Spanish.
- Confirm the green ring is clear, the three metrics remain readable, and the hero tray does not overflow.
- Confirm all previously approved homepage polish and all eight service categories remain intact.
- Confirm `/agents`, `/lenders`, and the authenticated homeowner dashboard remain unchanged.
- Run type, test, browser-console, overflow, and basic accessibility checks.
