# Fix: "Next suggested step" card missing on the homeowner dashboard

## What's happening

The maintenance timeline (and the "Your next suggested step" card inside it) is not rendering at all on `/dashboard`. The panel hides itself when it has neither a year built nor any permits for the home.

For the demo home (2138 Gunstock Dr), the property record does contain the year built — it's `1971` — but the code reads it from the wrong place in the record. The reader looks under `property.building.summary.yearbuilt`, while the record stores it under `property.summary.yearbuilt`. So the value comes back empty, the panel decides it has nothing to project from, and the whole section disappears.

Permits for this home are genuinely zero, so the year built is the only input available — which is why the section vanishes entirely rather than partially.

## The fix

1. Read the year built from the correct location, keeping the old path as a fallback so records shaped either way work.
2. Make the maintenance panel resilient: when there is no year built and no permits, show a short "add your home details to see your maintenance outlook" state instead of rendering nothing, so the section never silently disappears.

Once the year built resolves to 1971, the timeline projects roof/HVAC/water heater/windows/electrical/siding lifespans, several will be overdue, and the "Your next suggested step" card with the how-to explainer and recommended SuCasa pro will appear at the top of the section.

## Technical details

- `src/lib/valuation.server.ts` → `extractDetail`: change `yearBuilt` to `p?.summary?.yearbuilt ?? p?.building?.summary?.yearbuilt ?? null` (widen the local type accordingly).
- `src/components/maintenance-timeline-panel.tsx`: replace the `return null` empty-state branch with a small placeholder card.
- No database or schema changes; no new ATTOM pulls needed (the cached record already has the value).

## Verification

Reload `/dashboard` and confirm the "Maintenance timeline" heading, the overdue/due-soon chips, and the "Your next suggested step" card all render, with "How to handle this" and the recommended pro row.
