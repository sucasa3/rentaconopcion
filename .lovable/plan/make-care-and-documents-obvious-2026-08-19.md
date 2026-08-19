# Make "Care" and "Documents" obvious

## The problem

On the homeowner dashboard, the Home / Care / Documents tabs drop people straight into lists with almost no framing:

- **Care** opens with a small "Home care" heading and immediately shows a Systems / Routine upkeep toggle full of lifespan estimates. Nothing says these are projections, why they matter, or what to do first.
- **Documents** opens with a file-type dropdown and an Upload button. One line of small grey text mentions the inspection report. Nothing explains what happens after upload or why the other document types are useful.
- The two tabs overlap in people's minds: an inspection report is a *document*, but its findings power *care*. Today those two things live in separate tabs with no visible link between them.

Agents hit the same wall when walking a homeowner through the profile — they have no plain-language way to describe either section.

## The fix: a section hero on each tab

Add one consistent hero block at the top of the Care tab and the Documents tab. Same shape as the existing "Next step" hero so it feels native, not bolted on. Each hero carries four things:

1. **A plain-language title and one-sentence purpose.**
   - Care → "Keep your home healthy" / "We estimate when your roof, HVAC, water heater and other systems need attention — and remind you before they fail."
   - Documents → "Your home's paperwork, in one place" / "Upload an inspection report and we read it for you, turning it into a condition list and service recommendations."
2. **Live status, in words rather than raw counts** — e.g. "3 systems need attention, 2 routine tasks due" or "No documents yet — start with your inspection report."
3. **One primary action.** Care → jump to the top-priority item (or "Add your home details" when there's nothing to project from). Documents → "Upload inspection report", which opens the file picker with the inspection type preselected.
4. **A one-line "how these connect" note** that resolves the overlap: Documents feeds Care. The Documents hero links to Care, the Care hero links to Documents.

## Also cleaning up in the same pass

- **Care tab:** move the "Update your home. Improve your Home Score." nudge into the hero so the panel body starts with content. Rename the inner toggle labels to "Big systems" and "Routine upkeep", and add a short line under Systems clarifying these are estimates from home age and permits, not inspections.
- **Documents tab:** replace the bare dropdown + Upload row with a labeled "What are you uploading?" control, add helper text per type, and give the empty list a real empty state (icon, one sentence, upload button) instead of a grey dashed line. Surface the AI analysis lifecycle more clearly — uploading, analyzing, ready — so people know something is happening after upload.
- **Tab labels:** rename the tabs to "Home", "Home care", "Documents" so Care reads as a topic rather than an abstract word. Existing `?tab=care` and `?tab=documents` links keep working — only the visible label changes.
- **Findings link-up:** when inspection findings exist, the Care hero says so and links to them; when a document is still analyzing, the Documents hero says so.

## Partner side

Agents and lenders don't render the Care or Documents panels today — their client view shows a Readiness score whose explainer already references "records on file" and "condition story." Reuse the same wording there: update the Readiness explainer so "records" and "condition" are described with the exact phrases used in the homeowner heroes, so an agent coaching a homeowner uses the same language the homeowner sees on screen.

## Technical notes

- New shared component `src/components/section-hero.tsx` — title, subtitle, status chips, primary action, secondary link. Styled from the existing tone system in `next-step-hero.tsx` (semantic tokens only, no hardcoded colors).
- `src/components/home-care-panel.tsx` — render `SectionHero` at the top, derive status from the already-computed `overdue`, `dueSoon` and `seasonalDue` values; move the Home Score nudge into it; relabel the inner toggle.
- `src/components/documents-card.tsx` — render `SectionHero`, expose an imperative "open file picker with inspection preselected" path for the hero button, restructure the upload row and empty state.
- `src/routes/_authenticated/dashboard.tsx` — tab label change only; keeps the same `tab` search values. Passes `onGoToTab` into both panels so the heroes can cross-link.
- `src/routes/_authenticated/agent/portfolio.$id.tsx` — copy change inside `ReadinessInfo` only.
- No database, server function, or business-logic changes. Presentation only.
