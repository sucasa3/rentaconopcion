# One Care page: To do + Your Home Plan merged

Today a homeowner has two overlapping pages:

- **Home Care (To do)** — what's true now: systems, seasonal tasks, inspection findings, "I did this", "Get help".
- **Your Home Plan** — the same underlying records, but forward-looking: next 90 days, next 12 months, next 3–5 years, each with a typical cost range.

They read from the same canonical records, so keeping both splits attention and hides the money guidance most homeowners want. Recommendation: **keep Home Care as the single destination** (it's in the bottom navigation, it holds the actions, and the dashboard tiles already link into it) and **fold the Home Plan content into it**, including the cost ranges.

## What the merged page looks like

Order on `/home-care`:

1. **Now** — the existing To do list, unchanged: focused-system view, overdue and due-soon rows, "Update information", "Request service", documents and history tabs.
2. **What's coming** — the Home Plan horizons, as three collapsible groups:
   - Next 90 days
   - Next 12 months
   - Next 3–5 years
   Each item keeps its plain-English reason, its **typical cost range** ("$8K–$18K typical"), and its "Take care of it" action into the existing request flow. Done / dismiss keeps working and still saves per item.
3. **How to do it yourself** — for each plan/care item where a safe DIY path exists, add a small "Do it yourself" option that opens a compact pop-up with concise SuCasa guidance. Guidance is presentation-only (e.g., "Clean the lint trap and vacuum the outside vent cover every 6 months") and never replaces a pro for safety-critical systems (roof, electrical, gas). Items without guidance do not show the option.
4. The existing Predicted actions, Recommended pros and Recent requests cards stay below.

Items already shown in the "Now" list are not repeated in "Next 90 days" — the same item appears once, with its cost range attached.

## What happens to Your Home Plan

`/home-plan` stops being its own page and permanently redirects to `/home-care`, so old links, the alerts card and the dashboard preview all land on the merged page. Nothing is deleted from the plan logic.

## What does not change

- No new numbers: cost ranges, horizons, urgency and reasons all come from the existing plan engine and cost bands.
- Home Score, value/equity, system-condition logic, maintenance rules, documents, relationships, consent and permissions are untouched.
- Missing records still show neutral "we don't know" states, never "healthy".
- Agent and Lender experiences untouched.

## Technical notes

- Keep `src/lib/home-plan.ts` and `src/lib/home-plan.functions.ts` as-is (build, save, per-item state, cached AI "why").
- Extract the plan rendering from `src/routes/_authenticated/home-plan.tsx` into a `HomePlanSection` component and render it inside `/home-care` under the care panel; the route file becomes a redirect (`beforeLoad` → `/home-care`) so it stays a real HTTP redirect, not a client bounce.
- Add a small DIY guidance dictionary in `src/lib/diy-guides.ts` keyed by system/seasonal/plan item; each entry is title + 3–5 bullets. Link only opens when an entry exists.
- Reuse existing i18n `plan.*` keys; add heading keys for the new "What's coming" section and DIY labels (EN + ES).
- Verify at 320/375/390/430px and desktop: no overflow, horizons collapsible, done/dismiss persists, `?system=` focus still works, no console errors; `tsgo --noEmit` and the test suite pass.
