# Simplify "Needs your attention" into one Home Assistant nudge

Replace the stack of alert cards on the homeowner dashboard with a single, calm iOS-style row at the top: the Home Assistant raising a hand about the one thing that matters right now.

## What the homeowner sees

A single rounded card pinned above the home hero:

```text
┌──────────────────────────────────────────────┐
│  ( 👋 )   HOME ASSISTANT                      │
│   ·pulse   Your water heater is past due      │
│            Tap to see what this means     ›   │
│            + 2 more things                    │
└──────────────────────────────────────────────┘
```

- One line, one action. No dismiss X, no red walls of text, no three stacked cards.
- The assistant avatar carries a softly blinking/pulsing emoji badge that draws the eye without shouting (respects reduced-motion).
- "+ N more things" is plain text, not extra cards. Tapping anywhere opens the assistant.

## What happens on tap

Tapping opens the Home Assistant page pre-seeded with that topic. The assistant immediately answers in plain language: what the signal is, why it matters for this specific home, what it costs to ignore, and the next step (with the existing link to Home Care, Money, or Documents). The homeowner reads the explanation in conversation, not in a banner.

Dismissal moves into that conversation: once they act (or say they've handled it), the item stops leading. The existing seen/dismissed storage keeps working underneath, so nothing shouts forever.

## When nothing is urgent

If there are no live alerts and no inspection report on file, the assistant takes that slot with an invitation rather than an alarm: what an inspection unlocks (a real condition picture, findings turned into a plan, better value and equity accuracy) and a one-tap path to upload. If everything is handled and the inspection is on file, the card simply doesn't render.

## Technical notes

- Rewrite `src/components/home-alerts.tsx` as a single-row `AssistantNudge`: pick the top non-dismissed signal from the existing `SignalReport`, render count of the rest, keep `listAlertStates` / `markAlertsSeen` / `dismissAlert` wiring unchanged.
- Pulse via a `@utility` in `src/styles.css` using semantic tokens plus a `motion-reduce` guard; no hardcoded colors.
- Empty-state branch reads the document list already loaded on the dashboard (`kind === "inspection"`) to decide the inspection invite.
- `/assistant` accepts a `topic` search param; `HomeAssistantCard` auto-sends a grounded opening question for that signal key on mount and swaps its default suggestion chips for signal-specific ones. Signal titles/reasons already come from the engine, so the assistant answers from the same facts.
- New i18n keys in `en.ts` / `es.ts` for the nudge line, "+ N more", and the inspection invite; drop the now-unused alert-list strings.
- Dashboard change is limited to where the strip renders (above `HomeHero`).
