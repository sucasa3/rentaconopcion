# Homeowner Home Profile — Approved Reference Refinement

## Visual system
- Preserve the current property-photo-first structure, navigation, calculations, records, permissions, and assistant behavior.
- Tune only the homeowner-scoped light tokens to the exact approved palette: `#F6F7F9` page, `#FFFFFF` cards, `#EEF1F4` secondary, `#F5F1EC` care, `#182230` text, `#17324D` deep navy, `#214F7B` action navy, `#DA5431` orange, `#2F7D67` positive, `#B9822C` attention, `#B94A48` risk, `#E8EFF6` intelligence, `#4478A5` intelligence accent, `#DDE2E7` borders, and `#E3EBF4` Home Team avatars.
- Keep white and neutral surfaces dominant; navy, orange, and dark green provide personality without large blue, beige, or saturated fields.
- Keep Agent and Lender styling untouched.

## Mobile hierarchy and density
- Tighten page gaps, card padding, heading scale, and internal spacing so the 390px view is information-rich without crowding.
- Keep the photo dominant, then place Home Score and Home Systems immediately below it using compact layouts and 44px minimum interactive targets.
- Avoid nested decorative boxes; use compact two-column layouts for financial metrics and Home Team where practical.

## Section refinements
- Keep Home Score explainable and driven by the existing score; use neutral treatment for insufficient records and semantic ring colors only when supported.
- Present Home Systems as compact evidence-backed rows for Roof, HVAC, Water Heater, and Electrical; never imply live monitoring or invent health.
- Keep Value & Equity in a white outer card with one compact intelligence-blue inner surface and side-by-side financial values.
- Keep Home Care warm and compact with orange only for the active tab and small accents.
- Render at most one canonical agent and lender in compact white cards with blue-gray avatar circles, navy initials, dark names, and muted role labels. Keep the professionals visually primary and the manage action secondary; pending and empty states remain distinct and permission-neutral.
- Finish with a compact intelligence surface and the existing “Ask about your home” action.

## Safety
- No new data model, table, relationship state, score, financial value, system status, or professional record.
- Relationship display remains read-only and grants no consent, access, entitlement, sponsorship, or capacity.
- Freshness labels continue to come only from canonical timestamps.

## Verification
- Verify and capture the real Home Profile at approximately 390px and desktop.
- Verify confirmed agent+lender, one-professional, pending-professional, and empty presentation states without changing production relationships.
- Verify Dashboard → Home Care and Dashboard → Money, 320/375/390/430px overflow, safe-area spacing, 44px targets, console errors, and focused regressions.
