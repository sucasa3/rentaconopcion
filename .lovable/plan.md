## Goal
Shift the near-white light-blue backgrounds/surfaces to a subtly warmer, cream-tinted tone that harmonizes with SuCasa's orange logo — while keeping the deep blue primary and green growth colors intact.

## Changes (src/styles.css only)
Retint the neutral tokens by moving their hue from cool blue (~250) toward warm orange (~65-70) and adding a touch more chroma. Approximate new values:

- `--background`: `oklch(0.995 0.003 240)` → `oklch(0.99 0.008 70)`
- `--surface`: `oklch(0.98 0.005 250)` → `oklch(0.975 0.012 70)`
- `--secondary` / `--muted`: `oklch(0.965 0.01 250)` → `oklch(0.96 0.015 70)`
- `--border` / `--input`: `oklch(0.92 0.01 250)` → `oklch(0.915 0.014 70)`
- Shadow tint: `oklch(0.2 0.05 250 / …)` → `oklch(0.25 0.04 60 / …)` for a warmer cast

Primary blue (`--primary`, `--brand`), growth green, and chart colors stay unchanged so the identity remains deep-blue + green with orange accents.

## Preview
After you approve, I'll apply the token changes and you can review live on `/`, `/dashboard`, and `/report`. If the warmth is too strong or too subtle, we'll nudge chroma (0.008 ↔ 0.02) or hue (60 ↔ 80) in one quick follow-up.

## Scope
CSS tokens only — no component, layout, or logic changes.