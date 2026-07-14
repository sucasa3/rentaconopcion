## Goal

Replace the top of `/dashboard` with a cinematic, living "Home Hero" — a stylized 3D house that visually reflects value, equity, maintenance health, and upgrades in real time. Intensity 3/5: refined and Apple-like, but with genuine motion and depth. Mobile-first.

## What the user will see

A single wide hero card at the top of the dashboard containing:

1. **The house** — a stylized isometric 3D home rendered live (react-three-fiber). It gently rotates on load, then responds to scroll/tilt. Windows glow warm. A soft ground shadow anchors it. Subtle particles (leaves/pollen) drift in the background.
2. **Living overlays on the house itself:**
   - A rising "value" watermark behind the house — a soft area chart that fills as value grows.
   - Roof, HVAC, plumbing zones gently pulse in green / amber / red based on maintenance status (tap a zone → jumps to that task).
   - A glowing "equity" base ring underneath the house that fills proportionally (39% today).
3. **Right-side stat rail** (stacks below on mobile):
   - Animated counters for Value, Equity, ROI that count up on mount.
   - Tiny sparkline under Value showing the last 12 months.
   - A single "Home Score" number (0–100) with a thin circular progress ring — the one headline metric.
4. **Projection scrubber** (below the house, collapsible): a slider "Project 1–10 years" that smoothly re-animates the value watermark and equity ring to show forecast. Presets: Today · 1yr · 5yr · 10yr.

Existing three value cards, maintenance list, AI assistant, documents, pros, and intelligence report stay exactly as they are, directly under the new hero.

## Visual language

- Deep blue → green gradient sky behind the house, matching current brand tokens (`gradient-brand`, `--growth`).
- House itself: matte off-white walls, warm terracotta roof (nods to the SuCasa logo), soft ambient + one key light, contact shadow.
- Motion: ease-out, 600–900ms. Nothing bouncy. One idle sway every ~8s so it feels alive without being distracting.
- Reduced-motion: respects `prefers-reduced-motion` — house renders static, counters snap, no particles.

## Technical section

- **New deps:** `three`, `@react-three/fiber`, `@react-three/drei`. Client-only — dynamically imported so SSR doesn't try to render WebGL.
- **New files:**
  - `src/components/home-hero/HomeHero.tsx` — layout, counters, scrubber, stat rail. Client component wrapper.
  - `src/components/home-hero/HomeScene.tsx` — react-three-fiber canvas: house model, lights, equity ring, particles, zone hotspots. Lazy-loaded via `React.lazy` + `Suspense` with a static gradient fallback so first paint is instant.
  - `src/components/home-hero/HouseModel.tsx` — the stylized house built from primitive geometry (boxes, extruded roof) — no external GLB needed, keeps bundle small.
  - `src/components/home-hero/useCountUp.ts` — small hook for animated counters (rAF, respects reduced motion).
  - `src/lib/home-hero-data.ts` — mock data shape: `{ value, equity, valueSeries[12], zones: { roof, hvac, plumbing, electrical }, homeScore, projection(years) => {value, equity} }`. Wired to existing mock data; ready to swap for a server function later.
- **Edited files:**
  - `src/routes/dashboard.tsx` — replace the current three-card value row with `<HomeHero />`. Keep everything below untouched.
  - `src/styles.css` — add `--gradient-hero` (deep blue → growth green), `--shadow-hero`, and a `@utility hero-glow` for the equity ring. No changes to existing tokens.
- **Performance:** WebGL canvas is `dpr={[1, 1.75]}`, `frameloop="demand"` — only re-renders on interaction / projection change. Idle sway uses a single throttled rAF. Bundle impact isolated behind lazy load.
- **Fallback:** if WebGL unavailable or lazy chunk fails, `HomeHero` shows a polished static SVG house with the same overlays and animated counters — same layout, no jank.

## Out of scope this pass

- Gamification (XP, badges) — parked; can layer on later.
- Homepage hero animation — parked; dashboard-only per the answer.
- Real financial projection math — using a simple compounding mock (3.5%/yr value, principal paydown curve) until real data lands.

## Verification

- Build passes; `/dashboard` renders on mobile (420px) with hero above the fold and stat rail stacked below the house.
- With devtools throttled to 4× CPU, first paint shows fallback within ~200ms, canvas hydrates after.
- `prefers-reduced-motion: reduce` disables rotation, particles, and count-up.
- Tapping a roof/HVAC zone scrolls to the matching maintenance task.
