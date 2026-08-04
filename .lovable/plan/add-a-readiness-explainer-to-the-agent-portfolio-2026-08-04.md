# Add a Readiness explainer to the Agent portfolio

## What "Prep needed" means today

In the Agent portfolio, **Listing readiness** is a 0–100 score built from six pass/fail checks (equity clears selling costs, property records on file, condition story, past the 2-year capital-gains basis window, not represented elsewhere, reachable). The score maps to three bands:

- **List-ready** — score ≥ 84. All six checks pass; if the homeowner said yes today, you could take the listing.
- **Prep needed** — score 50–83. Real listing potential, but a few things still need lining up (e.g. pull property records, have the pre-list condition conversation, confirm contact info, wait out the 2-year basis window). A warm listing lead that needs work before a listing conversation — not a no.
- **Not ready** — score < 50. Too many blockers (often underwater after selling costs, no records, no contact). Keep in value-only nurture.

So "Prep needed" = "promising, but a couple of prep steps remain before it's listable."

## The change

Add a small **info icon** next to the readiness labels so the question above is answered inline when pressed/hovered, instead of leaving agents guessing.

Use a `Popover` (so it works on mobile/tap — `Tooltip` is hover-only and the app is mobile-first). The popover content is a short, static explainer listing the three bands and what drives the score.

### Placement (3 spots)

1. **"Listing readiness mix" widget heading** (line 310) — icon next to the title. Popover explains the three bands + the six checks. This is the primary spot.
2. **"Readiness" column header** in the Top listing opportunities table (line 256) — small icon next to the header text. Same popover content.
3. **"Listing readiness" heading in the client detail drawer** (line 659) — icon next to the heading. Same popover content.

### Implementation

- New small component `ReadinessInfo({ trigger })` in `src/routes/_authenticated/agent/portfolio.$id.tsx` (local, since it's only used here) that renders an `Info` (lucide) icon button and a `Popover` with the three-band explainer and the six scoring checks.
- Reuse `READINESS_META` for tone/labels so the explainer stays in sync with the bars.
- Reusable: the three call sites pass nothing — content is fixed.
- Add `Info` to the existing lucide imports in the file.

### Files touched

- `src/routes/_authenticated/agent/portfolio.$id.tsx` — add `ReadinessInfo` component, import `Info` + `Popover`/`PopoverContent`/`PopoverTrigger`, add the icon at the three spots above.

No backend, schema, or server-function changes.

## Verify

- Build / typecheck pass.
- Open `/agent/portfolio/<id>`: confirm the info icon appears next to the readiness heading, the Readiness column header, and the drawer readiness heading; tapping it opens the explainer on mobile width.
