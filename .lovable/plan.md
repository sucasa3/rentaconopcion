# Make the Home Score real

Yes — it should be revisited. The 82 is not a calculation. It is a fixed demo value in the hero data file, along with the four zone dots (roof/HVAC/plumbing/electrical) and the "Top 18% in ZIP" line. The dashboard passes live address, value and equity into the hero but leaves the score untouched, so it reads 82 no matter how many components are overdue.

## What the score should measure

A single 0-100 "Home Health" number built from what we already know about the property:

- **Component condition (60 pts)** — from the maintenance timeline: each tracked system (roof, HVAC, water heater, windows, electrical, siding) starts at full credit and loses points as it passes end of expected life. Overdue costs more than due-soon; a homeowner-logged replacement restores full credit.
- **Inspection findings (25 pts)** — deductions for open high/medium-urgency findings pulled from uploaded inspection reports.
- **Record completeness (15 pts)** — credit for having an address on file, at least one uploaded document, and any logged service history. This is the part the homeowner can lift immediately, which keeps the score actionable rather than punishing.

Floor the score at 15 so it never reads as zero, and round to a whole number.

## How it shows up

- Hero ring and the "Home Score" line use the computed number.
- A band label next to it: Excellent (85+), Good (70-84), Needs attention (50-69), At risk (<50).
- Replace "Top 18% in ZIP" — we have no ZIP-level benchmark — with the band label plus the count of items needing attention (e.g. "Needs attention · 3 items due").
- Add a small info popover on the ring, matching the Readiness/Intent explainers on the agent dashboard: shows the three components, points lost, and the top two things that would raise the score.
- The four zone dots derive from the same timeline: overdue = urgent, due soon = watch, otherwise good. Plumbing maps from the water heater item, exterior/windows fold into the existing four.
- While property data is still loading, show a neutral "—" instead of a number.

## Technical notes

- New `src/lib/home-score.ts` with a pure `computeHomeScore({ timeline, findings, hasDocuments, hasAddress, hasLogs })` returning `{ score, band, breakdown[], topActions[], zones }`. Pure module so it can be unit-tested and reused by the report page.
- `src/routes/_authenticated/dashboard.tsx` already fetches home intel and the maintenance panel already builds the timeline via `buildMaintenanceTimeline`. Lift that timeline build into the dashboard (or a small shared hook) so both the hero and the maintenance panel use one source, then feed the score into `heroData`.
- `src/lib/home-hero-data.ts` keeps `HOME_HERO` only as a fallback for the public/report views; `homeScore` and `zones` become computed values on the dashboard.
- `src/components/home-hero/HomeHero.tsx` gains an optional `scoreDetail` prop for the band label and popover; no change to its layout or animation.
- No database or schema changes.
