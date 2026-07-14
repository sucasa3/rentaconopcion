## Goal
Warm the hero-section background (the light blue/mint wash at the top of the homepage) with a soft peach/orange tint that echoes the SuCasa logo, while keeping the deep-blue primary and green growth accents intact.

## Change (src/styles.css, `gradient-hero` utility only)
Replace the blue + mint radial glows with warm-orange + soft-peach glows and swap the base linear wash from cool white → warm cream:

```css
@utility gradient-hero {
  background-image:
    radial-gradient(1200px 600px at 10% -10%, oklch(0.9 0.09 60 / 0.55), transparent 60%),
    radial-gradient(900px 500px at 90% 0%,   oklch(0.92 0.06 45 / 0.45), transparent 60%),
    linear-gradient(180deg, oklch(0.99 0.012 75), oklch(0.97 0.02 60));
}
```

Result: the hero fades from a warm cream at the top into a subtle peach glow — a soft, muted echo of the logo's orange, not a saturated wash. Deep-blue CTA button and green growth accents stay untouched and pop more against the warm background.

## Scope
- Only the `gradient-hero` utility in `src/styles.css`.
- No changes to `gradient-brand`, `gradient-growth`, dark-mode hero, or any component.
- If the warmth reads too strong/weak after preview, one-line nudge to chroma (0.06 ↔ 0.12) or hue (45 ↔ 75).