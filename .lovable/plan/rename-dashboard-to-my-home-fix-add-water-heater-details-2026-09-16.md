# Rename "Dashboard" to "My home" + fix "Add water heater details"

## 1. Menu label
In the public site header (and the matching homeowner footer link), rename the
"Dashboard" entry to "My home". It keeps pointing at the same page — label only.

## 2. "Add <system> details" opens the details form, not onboarding
Today, when a system has no records, that button sends you to the "Let's get to
know you" onboarding page. Instead it should open the same pop-up already used
for "Update information": a small form asking whether the system was
**replaced or serviced**, the **year**, plus optional **brand, model, warranty
years, provider and notes**. Saving it logs the service and refreshes Home Care
and Home Health.

"Request service" beside it stays exactly as it is.

Onboarding stays the destination only for the card that asks for the home's
basic details (address/year built) — not for a single system.

## 3. Nothing is assumed until the homeowner saves
- The year field may still show this year for convenience, but the homeowner
  must confirm or change it before saving — an untouched year cannot be saved.
- Opening the form records nothing: no service record, no install year, no
  change to Home Score or system health until Save is pressed.
- Cancelling leaves no trace at all.
- Saving immediately refreshes both Home Care and the Home Health summary.
- "My home" is used consistently in both English and Spanish navigation
  wherever the label is translated.

## Technical notes
- `src/components/site-header.tsx`: nav label and footer link text. The public
  header labels are hard-coded English today; the homeowner bottom nav uses
  i18n keys, so any translated "Dashboard"/"Home" label gets the matching
  Spanish wording ("Mi casa") where it applies.
- `src/components/home-care-panel.tsx`: in the focused-system card's no-record
  branch, replace `navigate({ to: "/onboarding" })` with
  `setMarkItem(<synthetic item>)`, built from the canonical `LIFESPANS` rule for
  the focused key (key, label, category, years). The synthetic item is local
  React state only — it is never written anywhere and never enters
  `buildMaintenanceTimeline`, so it cannot influence status or score.
- `src/components/mark-component-done-dialog.tsx`: add a `requireYearConfirm`
  mode (used when opened for a system with no records) that keeps Save disabled
  until the year input is touched/changed, so the default year is never
  silently stored as fact. Existing "I did this" behaviour unchanged.
- No change to `logComponentService`, maintenance rules, Home Score, value or
  equity math, relationships, consent, or permissions.
- Cache invalidation on save covers the queries feeding Home Care and Home
  Health so both update without a reload.
- Unit tests: the synthetic item carries the canonical key/label/category for
  each system key, and no timeline/score change occurs from building it.

