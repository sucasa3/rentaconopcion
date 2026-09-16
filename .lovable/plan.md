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

## Technical notes
- `src/components/site-header.tsx`: nav label and footer link text.
- `src/components/home-care-panel.tsx`: in the focused-system card's no-record
  branch, replace `navigate({ to: "/onboarding" })` with
  `setMarkItem(<synthetic item>)`, built from the canonical `LIFESPANS` rule for
  the focused key (key, label, category, years) with unknown install year left
  as the current year default the dialog already applies. No new data model,
  no change to `logComponentService`, maintenance rules, Home Score, or
  permissions — the dialog writes the same canonical service log.
- Add a small unit test that the synthetic item carries the canonical key and
  category for each system key.
