# Add an Intent explainer popover to the Agent portfolio

## Goal
The "Intent" column in the Agent portfolio shows pills like `22 · Nurture` with no
explanation, while the secondary "Readiness" column already has a tap-to-open
`ReadinessInfo` popover. Add a matching `IntentInfo` popover next to each
"Intent" column header so agents understand what the score means.

## Scope
"Bands + signals only" — the popover lists the four intent bands and the signals
that feed the score. No per-row expandable breakdown, no data-source hint about
manual listing entry.

## What changes

File: `src/routes/_authenticated/agent/portfolio.$id.tsx`

1. Add an `IntentInfo` component next to the existing `ReadinessInfo`
   component (around line 68). Same Popover structure, same styling:
   - Title: "Move intent"
   - One line: "A 0–100 score from public-property signals: time in home,
     equity, recent permits, tax pressure, absentee ownership, outgrown
     space, and any expired/withdrawn listing."
   - A list of the four bands with score ranges and short guidance:
     - Hot — 60+. Clear, time-sensitive move signal. Call now.
     - Warm — 38–59. Multiple solid signals. Worth a real conversation.
     - Nurture — 18–37. Mild signals. Stay in touch with value content.
     - Hold — under 18. Little movement signal. Keep in value-only nurture.
   - Color dots reuse the existing `BAND_META` tones (growth / amber / primary / muted).

2. Place an `<IntentInfo />` info button (the `Info` icon is already imported)
   next to the "Intent" `<th>` header in both table locations:
   - The main opportunities table header (around line 314).
   - The nested table header inside the client detail drawer (around line 564).
   This mirrors exactly how `ReadinessInfo` is placed next to "Readiness".

## Out of scope
- No new server functions, queries, or migrations.
- No per-row signal breakdown.
- No copy changes to `ReadinessInfo`.
- The `property_listing_status` manual-entry flow and any future MLS/IDX feed
  are unchanged.

## Verification
- Build passes (`bun run build` / typecheck).
- In the preview, open the Agent portfolio, click the info icon beside
  "Intent" in both the table and the drawer, and confirm the popover shows
  the four bands with correct score ranges and colors.
