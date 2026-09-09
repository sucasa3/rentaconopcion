# SuCasa Visual Color System Refinement

A visual-system refinement only. No change to navigation, workflows, data, opportunity logic, permissions, access gates, ranking, or component hierarchy.

---

## 1. What I found today

**The brand orange is not in the design system at all.** The SuCasa logo is orange (`#DA5431`), but there is no orange token anywhere in the theme and no screen uses it. Every "brand" surface is navy. That is the single biggest reason the product does not feel unmistakably SuCasa.

**Everything neutral is cold or near-identical.** The theme has `--surface`, `--secondary`, `--muted`, `--card` and `--border`. `--secondary` and `--muted` are the exact same value, `--card` and `--surface-elevated` are both pure white, and `--surface` is a cold blue-gray. So there is no warm surface available and no meaningful difference between a card, a chip and a panel — which produces the "white card / thin gray border / gray pill" rhythm on every page.

**No intelligence surface exists.** `--info` is a mid-saturation blue meant for text/badges; there is no light blue background token. Suggested Opener, Daily Read and AI summaries currently render on the same white or `bg-secondary` as everything else, so AI interpretation is visually indistinguishable from raw data.

**Temperature uses traffic-light semantics.** `TEMPERATURE_META` maps Hot → attention (amber), Warm → growth (green), Nurture → info (blue), and carries emojis (🔥 🟡 🔵). Hot reads as a warning and Warm reads as a success, which is backwards from the intended meaning.

**Hard-coded palette colors bypass tokens.** The agent homeowner detail route (`agent/portfolio.$id.tsx`) has eight separate hard-coded `amber-500` / `amber-700` treatments for warm status, prep-needed, timeline dots and priority pills. The inspection findings panel hard-codes its own condition scale. Roughly a dozen other files hard-code one or two Tailwind palette colors.

**Red is over-applied to maintenance.** Home-care items escalate on age alone and inherit destructive styling, so ordinary aging upkeep reads as an emergency.

Unverified until implementation: exact per-screen contrast on a warm surface — I will check contrast ratios as I apply the tokens.

---

## 2. Proposed semantic palette

Derived from the existing logo and current theme. Navy, green, amber and red keep their current hues; orange and the warm/intelligence surfaces are new.

| Token | Meaning | Value |
|---|---|---|
| `--sucasa-navy` (existing `--primary`) | act, primary CTA, selected nav, strong emphasis | `oklch(0.36 0.13 255)` |
| `--sucasa-orange` | relationship opportunity, human moment, brand accent | `oklch(0.618 0.175 35.5)` — from the logo, `#DA5431` |
| `--surface-base` | default page ground | near-white, neutral |
| `--surface-warm` | human / relationship / homeowner context | very light cream, `oklch(0.985 0.008 65)` |
| `--surface-intelligence` | SuCasa interpretation | soft blue, `oklch(0.972 0.018 250)` with a `0.90 0.03 250` border |
| `--text-primary` / `--text-secondary` | body hierarchy | existing foreground / muted-foreground, contrast-checked on warm and blue surfaces |
| `--border-subtle` | quieter hairlines | existing border, lowered opacity in use |
| `--status-opportunity` | orange | relationship opportunity |
| `--status-attention` | amber | due, aging, follow-up |
| `--status-positive` | green | completed, gain, successful outcome |
| `--status-risk` | red | genuine urgency or risk only |
| `--status-nurture` | neutral blue-gray | steady relationship |
| `--action-primary` / `--action-secondary` | navy filled / outlined neutral | CTAs |

Ratio target stays 80–85% neutral, 10–15% navy/intelligence blue, 5% accents. Dark mode gets a matching set.

---

## 3. What changes

**Theme**
- `src/styles.css` — add the semantic tokens above plus `@theme inline` color mappings so they become real utilities (`bg-surface-warm`, `text-status-opportunity`, and so on), light and dark.

**Shared primitives**
- `src/components/ui-kit/index.tsx` — the two tone maps and StatCard tones move onto semantic tokens; add an `opportunity` tone.
- `src/lib/next-best-action.ts` — `TEMPERATURE_META` tones become Hot → opportunity (orange), Warm → attention (soft amber), Nurture → nurture (neutral blue-gray); emojis drop in favor of a text label plus a small marker so status is never color-only.

**Today pages**
- `src/components/agent-today.tsx`, `src/components/lender-today.tsx` — three-layer treatment (below).

**Opportunity surfaces**
- `src/components/action-queue.tsx`, `src/components/opportunities-board.tsx`, `src/components/lender-contact-card.tsx`, `src/components/lender-brief.tsx`, `src/components/next-step-card.tsx`, `src/components/next-step-hero.tsx`, `src/components/predicted-actions-card.tsx`, `src/components/seller-intent-card.tsx`.

**Detail pages**
- `src/routes/_authenticated/agent/portfolio.$id.tsx` — replace all eight hard-coded amber treatments with tokens; warm accents on tenure, history and milestones.
- `src/routes/_authenticated/lender/portfolio.$id.index.tsx` — navy/intelligence lean.

**Maintenance and homeowner context**
- `src/components/home-care-panel.tsx`, `src/components/home-alerts.tsx`, `src/components/inspection-findings-panel.tsx`, `src/components/recommended-pros-card.tsx` — routine stays neutral, due-soon amber, real risk red, completed green. Presentation only: no change to how urgency is computed, only to which visual weight each existing urgency level receives.

**Untouched:** bottom navigation stays navy-only and calm; `business-shell.tsx` active state is unchanged.

---

## 4. How three screens will feel different

**Agent Today.** Today the greeting, the Daily Read, the Start Here card and the five relationship rows are all white cards with the same hairline border, so the eye has no entry point. After: the greeting sits on a warm off-white ground with navy type and one small orange mark; the Daily Read becomes a soft blue panel with a blue hairline and a small intelligence icon, so it visibly reads as SuCasa interpreting rather than reporting; Start Here becomes a warm-white card with real elevation, a thin orange accent at its edge, a navy CTA, and the Suggested Opener nested inside it on the same blue intelligence surface. The five rows below stay deliberately quiet.

**Agent homeowner detail (a long-tenure client such as Kevin).** Today "Warm" is an amber pill, timeline dots are amber, and priority pills are amber — amber appears in four unrelated meanings on one screen. After: "Warm" becomes a soft amber accent, the relationship and tenure moments carry small orange markers, the equity and value figures stay neutral navy typography rather than green (green is reserved for an actual gain), and only a genuine risk item can be red.

**Lender Today.** Same structure, leaning navy and intelligence-blue rather than warm: the Daily Read and Mortgage Review Brief share the blue intelligence surface, review-due items are amber, completed outcomes green, and orange appears only where a homeowner has actually asked to connect — a small, high-value signal.

---

## 5. Notes

- Status keeps its text label and icon everywhere; color is never the only signal.
- Contrast is checked for secondary text on the warm and blue surfaces; if muted gray fails on cream, that text moves a step darker.
- No gradients, glass, neon, or new animation.
