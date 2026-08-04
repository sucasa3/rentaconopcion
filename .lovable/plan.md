# Homepage: elevate "How It Works" + "For Homeowners"

Rebuild the two homepage sections using the "Elevated depth" direction you picked, and add the "Start your journey" button after the benefits grid.

## How It Works

- Keep the eyebrow + heading, but restyle the eyebrow as a small green uppercase label and split the heading into a bold dark first half and a muted second half.
- Replace the three flat white cards with a stacked column of three dark, deep-blue cards (one per step, full width on mobile, still a 3-up grid on desktop).
- Each card: a rounded square number badge with a tinted translucent background and thin ring (green for steps 01 and 03, blue for step 02), the step title in white, and the description in a soft muted tone.
- Card 01 gets a subtle blue-to-green gradient halo behind it so the first step reads as the entry point.
- Content stays exactly as it is today: Create your Home Profile / Get matched with trusted pros / Manage and grow your home, with their current descriptions.

## For Homeowners

- Eyebrow becomes a small blue uppercase label; heading splits into bold dark + muted continuation.
- Four benefit cards keep their copy but get a lighter, more elevated treatment: white surface, hairline border, soft ambient shadow, and a round pastel icon chip (green for Save money and Grow home value, blue for Protect your investment and Never miss a task).
- Two columns on mobile, four across on desktop.

## New CTA

- Directly under the benefits grid, add a full-width deep-blue "Start your journey" button that links to the onboarding flow, with a soft shadow and a gentle press-down effect. It constrains to a comfortable width on larger screens instead of stretching edge to edge.

## Motion

- Both sections get a subtle staggered fade-in-up as they scroll into view, plus a light lift on card hover.

## Technical notes

- All changes are confined to `src/routes/index.tsx` (the `HowItWorks` and `Benefits` components) plus any small token additions in `src/styles.css`.
- Colors map to existing semantic tokens (`primary`, `growth`, `muted-foreground`, `card`, `border`) and the `gradient-brand` / `gradient-growth` / `shadow-soft` / `shadow-elevated` utilities — no hardcoded hex values, so dark mode keeps working.
- The dark step cards use a deep-blue surface derived from the existing brand token rather than a raw slate color.
- The CTA reuses the same `Link to="/onboarding"` target as the hero's primary button.
- Reveal animation uses the existing `animate-fade-in` utility with staggered delays; no new dependencies.
