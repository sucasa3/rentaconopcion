# Simplify the homeowner dashboard: one scrolling page, one priority list

## The problem

Home / Home care / Documents are three tabs that hide two-thirds of the page at all times. Tapping them feels unresponsive and jumps the page to the top, and people can't tell what "Care" means or why Documents is separate. Inside Home care there's a second layer of tabs (Big systems / Routine upkeep) that splits one question — "what does my home need?" — into two lists that have to be compared manually.

## The fix: remove the tabs

The dashboard becomes one mobile-native scrolling page in priority order. Nothing is hidden behind a tap.

```text
Welcome back, {name}
[ Home value / equity / Home Score hero ]

1  Your next step            (existing NextStepHero — unchanged)
2  What your home needs      (Home care, one merged priority list)
3  Your home's paperwork     (Documents)
4  Your home's numbers       (signals, intel, equity & mortgage)
5  Assistant + recent requests
```

Care and Documents move above the numbers because they're the actionable part. Each becomes a clearly titled section with the hero framing already built, so the page reads as a sequence of answers rather than a set of containers.

## Home care becomes one priority list

Big systems and routine upkeep merge into a single list ordered by urgency: overdue first, then due soon, then routine tasks that are due, then everything that's fine. Each row carries a small tag — "System" or "Routine" — so the distinction is still visible without being a navigation decision. Rows keep their existing actions (Mark done / Update, Get quotes for systems; Mark done for routine tasks).

To keep the section short on a phone, only the items needing attention plus the next few show by default, with a "Show all (N)" expander for the rest. The one-line explainer that these are estimates from home age and permits stays.

## Navigation still works

- The bottom nav and sidebar keep Home / Care / Documents entries; they now smooth-scroll to the matching section instead of switching tabs, and highlight based on which section is on screen.
- Existing `?tab=care` and `?tab=documents` links (including the guided-onboarding focus and the "Next step" hero jumps) scroll to that section on load, so nothing breaks.

## What we are not removing

Documents stays a full section rather than being folded into care — it has its own upload flow and lifecycle. It just sits directly under care with the "this feeds your care plan" line connecting them.

## Technical notes

- `src/routes/_authenticated/dashboard.tsx`: drop `Tabs`/`TabsList`/`TabsContent`; render sections in order inside `<section id="care">` / `<section id="documents">` etc. with `scroll-mt-20`. Replace `setTab` navigation with a `scrollToSection(id)` helper; on mount, read the existing `tab` search param (and the onboarding focus) and scroll once. Keep the search-param schema so old URLs stay valid.
- `src/components/home-care-panel.tsx`: remove the internal `tab` state and the two toggle buttons; build one array from `buildMaintenanceTimeline` items and `buildSeasonalTasks` results, each tagged `kind: "system" | "routine"`, sorted overdue → due soon → routine due → healthy. Render through one row component that branches only on the action buttons. Add the collapse/"Show all" behavior.
- `src/components/homeowner-shell.tsx`: nav items point at `/dashboard#care` / `#documents` style scroll targets with an active-section observer instead of tab matching.
- Presentation only — no server function, query, or schema changes.
