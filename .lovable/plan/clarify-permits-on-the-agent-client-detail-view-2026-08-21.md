# Clarify "Permits $#" on the Agent Client Detail View

## Problem
In the agent portfolio client detail view, the field labeled **"Permits"** displays a dollar value (e.g., "$48,000") that is easy to misread as equity, a fee, or money owed. It actually represents the total declared construction cost of building permits on record for that property.

## Proposed Change
Add a tap-to-open info label to the **Permits** field that explains what the number means and its limitations, using the same `Popover` pattern already used for "Net proceeds" and "Listing readiness" in the same file.

### Scope
- File: `src/routes/_authenticated/agent/portfolio.$id.tsx`
- Component: the `Field` call at line ~1405 (`label="Permits" value={money(client.permit_total_value)}`)

### Implementation Details
1. Create a local `PermitsInfo` component (consistent with `NetProceedsInfo` and `ReadinessInfo`) that renders:
   - Title: "Permitted work on record"
   - Body: "This is the total declared construction cost of building permits pulled at this address. It shows real investment in the home and supports the condition/readiness story."
   - Caveat: "Values are self-reported at filing and often understated. Coverage also varies by county, so $0 or blank can mean "no permits recorded" rather than "no work done."
2. Pass `info={<PermitsInfo />}` to the existing `Field`.
3. Optionally relabel the field from `"Permits"` to `"Permitted work"` to make the dollar value less ambiguous.
4. Verify the popover is accessible (aria-label, focus ring) and renders correctly on mobile and desktop.

## Out of Scope
- No database or API changes.
- No changes to the homeowner-facing "Permits on file" count in `equity-mortgage-panel.tsx` unless requested.
- No changes to lender portfolio (it does not currently display a permit dollar field).

## Acceptance Criteria
- [ ] The agent client detail view shows an info icon next to the Permits/Permitted work value.
- [ ] Tapping/clicking the icon opens a popover with the explanation above.
- [ ] The label is clear enough that "$48,000" is not mistaken for equity, a fee, or cash owed.
