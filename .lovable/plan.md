## Goal
Revert the hero background to the original cool blue/mint wash.

## Change (src/styles.css, `gradient-hero` utility only)
Restore the previous values:

```css
@utility gradient-hero {
  background-image:
    radial-gradient(1200px 600px at 10% -10%, oklch(0.85 0.08 220 / 0.5), transparent 60%),
    radial-gradient(900px 500px at 90% 0%, oklch(0.88 0.08 155 / 0.45), transparent 60%),
    linear-gradient(180deg, oklch(0.99 0.003 250), oklch(0.97 0.01 220));
}
```

No other files touched. The earlier neutral-token warmth (backgrounds, surfaces, borders) stays as-is unless you want that reverted too — let me know.