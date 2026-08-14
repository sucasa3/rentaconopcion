# Mobile-first: no horizontal scrolling for primary information

Today the lender and agent portfolio screens render desktop tables inside horizontally scrolling wrappers (`min-w-[640px]`, `min-w-[900px]`, `min-w-[720px]`, `min-w-[980px]`). On a 393px phone that means swiping sideways to read rate, equity, net proceeds and signals. This work replaces those tables with purpose-built mobile cards, keeping the table layout only from `md:` up.

## What changes

### 1. Two new shared building blocks
Added to the existing UI kit so every list uses the same look:

- **OpportunityCard** — full-width card: status pill at top (e.g. "High opportunity"), name, 2-column metric grid of the two or three key numbers, a highlighted primary signal, and a full-width `View opportunity` button.
- **PersonCard** — compact card: name + location, a two-column grid of labeled metrics with icons, status pills (segment, consent, intent), and a full-width `View profile` action.

Both use rounded corners, large tap targets, short labels and large numbers, matching the iOS-style cards already used on the business dashboards.

### 2. Top refi opportunities (lender portfolio)
- Mobile: stacked `OpportunityCard`s, one per client, vertically ordered by estimated savings. Card shows name + city, Est. savings/mo as the hero number, Balance and Rate in a 2-col grid, an LTV/strength pill, and `View opportunity` which opens the existing contact detail sheet.
- `md:` and up: the current table stays.
- Trim the explanatory paragraph to one short line.

### 3. Clients list (lender portfolio)
- Mobile: stacked `PersonCard`s showing name, city/state, Balance, Equity, Rate, tenure, plus segment and consent pills. `View profile` opens the existing detail sheet.
- Desktop keeps the full 9-column table.
- Search input becomes full-width on mobile; the toolbar buttons wrap into a stacked row instead of a cramped inline group.

### 4. Top listing opportunities + Households (agent portfolio)
- Mobile: `OpportunityCard`s for listing opportunities (name, Net proceeds as hero, Est. value, intent band pill, readiness bar, top signal line) and `PersonCard`s for households (name/address, Value, Equity, Net proceeds, tenure, intent + listing pills).
- Desktop keeps the existing tables with their info popovers; on mobile the explainer popovers stay reachable from the section header rather than per column.

### 5. Segment filter chips and tab bars
- Filter chip rows wrap onto multiple lines on mobile instead of sitting on one line with a right-aligned counter block; the consent/summary counters move below the chips.
- The portfolio tab bar (`Clients / Campaigns / Import / Agent network`) and the agent Network tabs become a wrapping or evenly-spaced 2-row segmented control on mobile so no primary navigation is off-screen.

### 6. Sticky primary action
On mobile, each portfolio screen's main action (`Add clients` / `Add homeowner`) sits as a full-width button in the header area above the bottom tab bar, within thumb reach.

## Verification
Screenshot the lender portfolio, agent portfolio, business dashboard and opportunities board at 320, 375, 390 and 430px and assert `document.documentElement.scrollWidth <= innerWidth` (no horizontal overflow) and that no card content is clipped.

## Technical notes
- Files touched: `src/components/ui-kit/index.tsx` (new card primitives), `src/routes/_authenticated/lender/portfolio.$id.index.tsx`, `src/routes/_authenticated/lender/portfolio.$id.tsx` (tab bar), `src/routes/_authenticated/agent/portfolio.$id.tsx`, `src/routes/_authenticated/agent/network.tsx` (tab bar).
- Pattern: `<div className="md:hidden">cards</div>` + `<div className="hidden md:block overflow-x-auto">table</div>`; same data arrays, no query or server-function changes.
- Layout rules applied throughout: `min-w-0` on text containers, `shrink-0` on icons, `truncate` on names, `grid-cols-2` metric grids.
- Presentation only — no backend, schema, or data-fetch changes.
