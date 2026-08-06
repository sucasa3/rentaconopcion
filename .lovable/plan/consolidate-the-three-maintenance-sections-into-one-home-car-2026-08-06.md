# Consolidate the three maintenance sections into one Home Care hub

## What each section is today

- **Maintenance timeline** — the real one. Projects roof/HVAC/water heater/windows/electrical/siding from year built, permits and anything the homeowner logged, flags overdue/due soon, holds the "Your next suggested step" card, "Mark done" and "Get quotes". This is what feeds the Home Score.
- **Suggested for your home** — a second, simpler version of the same logic. It re-derives "roof inspection / HVAC service / electrical panel / water heater" purely from home age, using different thresholds than the timeline. So it can disagree with the timeline about the same system. Its one unique item is the refi nudge, which already has its own prominent button in the equity panel.
- **Maintenance checklist** — not real. It renders a hardcoded demo list of tasks with a "Mark done" button that does nothing. Nothing here is tied to the home.

So yes: three sections, one real engine. They should be combined.

## Proposed structure

One section, **Home care**, in place of all three, built entirely on the timeline engine:

1. Next suggested step card (unchanged).
2. Seasonal/light tasks tab — the recurring things the timeline doesn't cover (HVAC filter, gutters, water heater flush, dryer vent). These become real, generated from the home and checkable, replacing the fake checklist so the "Mark done" button actually records into the existing service log.
3. Systems timeline tab — the current list, unchanged.

"Suggested for your home" goes away; its only unique content, the refi nudge, stays in the equity panel where it already is.

## Recommended professionals — make it needs-based

Agreed. Today the card shows three hardcoded demo pros regardless of the home. Change it to pull live pros for the categories the home actually needs right now, ordered by urgency: overdue timeline items first, then due soon, then open high-urgency inspection findings. Show at most three, each labeled with the reason ("Roof — 9 yrs overdue") and a request button pre-filled with that category. If nothing is due, fall back to a short "no work due — browse the directory" state instead of filler vendors.

## Technical notes

- Delete `src/components/suggested-services-panel.tsx` and the `MAINTENANCE_TASKS` / `RECOMMENDED_PROS` blocks from the dashboard.
- New `src/components/home-care-panel.tsx` wrapping the existing `MaintenanceTimelinePanel` content plus a seasonal-tasks tab; seasonal completions write to the existing `home_component_service_log` via a new task-type row rather than a new table.
- Recommended pros card reads the timeline from the existing `useHomeScore` hook (already loaded, no extra fetch) and calls `getRecommendedPros` per needed category.
- No schema changes beyond allowing a seasonal task key in the existing log table.
