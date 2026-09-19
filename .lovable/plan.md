# Align the homepage My Home demo with the current dashboard

## Goal
Make the public fictional My Home showcase visibly match the current homeowner dashboard shown in the reference, without changing the real dashboard, data, routes, or behavior.

## Changes
- Rework the demo’s property-photo card to follow the current dashboard composition: address over the photo and an overlapping value/equity/Home Score tray.
- Replace the plain score number in that tray with the green circular progress ring, using the demo’s existing score of 82.
- Restyle the demo Home Health area to match the current dashboard hierarchy:
  - Home Health heading and compact “What affects this?” treatment.
  - A prominent bordered Home Score panel with the larger green ring, score label, and status.
  - Compact system-status cards arranged like the current dashboard.
- Rebalance the remaining Home Care, documents, history, and Ask SuCasa preview content beneath the Home Health area so the overall showcase reads like the current product while preserving all approved homepage content.
- Keep the public preview isolated and static: no authenticated dashboard imports, live records, provider lookups, or new interactions.

## Preserved
- Existing fictional address, value, equity, score, and home-care content.
- Fictional-demo labeling and English/Spanish support.
- Homepage story, Home Services cards, professional previews, final call to action, navigation, routes, pricing, permissions, and backend behavior.
- Preview-only delivery; nothing will be published.

## Verification
- Check the homepage at 390px and 1280px in English and Spanish.
- Confirm both score locations show the green ring and the Home Health layout matches the current dashboard’s visual hierarchy.
- Confirm all existing demo content remains readable with no overflow or accessibility issues.
- Confirm `/agents`, `/lenders`, and the authenticated homeowner dashboard remain unchanged.
- Run the relevant type and test checks.
