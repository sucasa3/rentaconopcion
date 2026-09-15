# Homeowner Home Profile — premium mobile-first redesign

## Audit findings

### Reusable foundations
- **Photo hero:** keep `HomeHero` and the existing property-photo asset as the emotional anchor; simplify its overlays rather than replacing the image.
- **Canonical home record:** continue using `useHomeRecord()` and `useHomeIntel()` for value, equity, property details, permits, maintenance, findings, documents, and the signal-engine result.
- **Home Score:** a real shared score already exists. `evaluateHome()` computes it from the canonical maintenance timeline, inspection findings, and record completeness, and returns `null` when there is no timeline. It is not a sample value.
- **Care data:** reuse the maintenance timeline, service log, inspection findings, documents query, and value-history query already loaded by the dashboard.
- **Destinations:** retain the existing `/home-care`, `/documents`, `/timeline`, `/money`, `/home-team`, `/request`, and `/assistant` experiences for progressive disclosure.
- **Shell and controls:** retain `HomeownerShell`, account controls, bottom navigation, existing dialogs, and the design-system button/popover/sheet primitives.

### What the current Home Score and health statuses mean
- The score is canonical within the current SuCasa signal engine, so it can be shown when available.
- The four requested health summaries map to existing tracked systems: **Roof**, **HVAC**, **Plumbing** (currently represented by water-heater data), and **Electrical**.
- Status confidence varies. A homeowner service record is strongest, a permit record is next, and year-built lifespan estimation is the fallback. These are maintenance-condition estimates, not live sensor readings.
- If the score or timeline is unavailable, the redesign will show the neutral financial/intelligence summary instead. It will not imply that missing systems are healthy.

### Unsupported item
- **Upgrade ROI is not backed by a production homeowner data pipeline.** The current dashboard explicitly passes `null`; the only populated ROI examples are marketing/mock data. The redesign will hide this tab until canonical ROI data exists.

### Home Team limitation and safe reuse
- The existing homeowner Home Team flow safely separates relationship truth from sharing permission. Confirming a professional grants no access; sharing remains a separate opt-in.
- The current homeowner read function returns pending lender validations, not a complete active agent-and-lender roster. The redesign will add only a read-only presentation adapter over the existing canonical professionals, relationships, organizations, and consent rules—no new table, relationship type, permission path, or parallel model.

## Redesign

### 1. Premium homeowner visual system
- Add homeowner-scoped semantic tokens matching the supplied dark palette: near-black base, layered dark surfaces, subtle white borders, electric-blue actions, green/amber/red status roles, and the supplied text hierarchy.
- Apply the dark treatment through the homeowner shell so its top bar, sidebar, and mobile tab bar feel native to the redesigned page without affecting agent, lender, or public pages.
- Preserve accessible contrast, 44px tap targets, safe-area spacing, keyboard focus states, and reduced-motion behavior.

### 2. Hero and immediate home status
- Keep the full-width rounded property-photo hero with a stronger bottom gradient, soft vignette, and simplified `Your home` + address treatment.
- When canonical Home Score data exists, present one large animated score ring associated with the hero and move the four system summaries into a compact two-column status grid directly below it.
- Make each available system status a short icon-and-label tap target leading to Home Care. Missing or insufficient data gets an honest neutral unavailable state.
- When no score is available, replace the score area with the supported top-level intelligence summary: value, equity, and next action—never a fabricated score.

### 3. One financial card
- Replace the hero’s dense four-stat glass panel and projection controls with a focused **Value / Equity** segmented card.
- Value uses the canonical resolved value and its real freshness/source language; Equity uses the canonical equity amount and percentage.
- Hide **Upgrade ROI** entirely until real supported data is present. No projected growth, invented renovation return, or visual-only finance math remains on this page.
- The card links to `/money` for full detail.

### 4. One Home Care section
- Merge the current maintenance, document, and timeline entry points into one section with **To do / Documents / History** segments.
- Show at most three real rows from the existing maintenance plan, document list, or history snapshots, ordered by relevance; each segment provides a clear **See all** destination.
- Keep detailed explanations, completion actions, inspection findings, requests, recommended professionals, document management, and the full timeline on their existing pages.

### 5. Compact Home Team
- Show up to one active/confirmed agent and one active/confirmed lender from canonical relationship data, plus **Add a resource**.
- Cards contain only initials/avatar, name, and role. Tapping opens the existing Home Team flow; no phone/email details appear on the primary page.
- Pending validation remains visibly distinct from confirmed membership, and neither state changes permissions.

### 6. Ask SuCasa
- End the page with one strong electric-blue **Ask about your home** action using the existing `/assistant` experience.
- Keep the full assistant conversation off the primary page.

### 7. Remove visual competition, not access
- Remove the standalone greeting summary, “What SuCasa sees,” separate alerts card, large coming-up card, six-row Home Profile directory, and profile-completeness block from the primary layout.
- Fold the highest-priority real next action into Home Care or the no-score intelligence summary.
- Preserve every deeper capability through the existing shell navigation and destination routes.

### 8. Desktop and motion
- Keep the same sequence on desktop, using a wider hero and restrained two-column grouping only where it improves scanning.
- Add gentle score-ring load motion, segmented-content transitions, subtle desktop lift, mobile press feedback, and existing count-up behavior; disable nonessential motion under `prefers-reduced-motion`.

## Verification
- Validate canonical value/equity agreement and confirm no ROI/sample values render.
- Test score-present, score-unavailable, partial-system-data, empty-care, no-documents, no-team, pending-team, and confirmed-team states.
- Verify relationship confirmation still grants no permission and the dashboard’s read-only Home Team display cannot bypass the existing access classifier.
- Browser-check at 320, 375, 390, and 430px plus desktop: no horizontal overflow, clipped text, overlapping controls, or more than three preview rows per section.
- Confirm photo loading, all segment/tap destinations, assistant CTA, keyboard focus, contrast, reduced motion, and no console errors.

## Technical boundaries
- Presentation-first changes to the homeowner dashboard, hero, shell styling, and focused reusable dashboard sections.
- A read-only Home Team query may be added solely to present existing canonical relationships; no schema changes or permission changes.
- No changes to homeowner calculations, maintenance rules, document logic, relationship semantics, consent, lender access, or professional permissions.
- No DNS, canonical, redirect, or domain-migration changes; `docs/domain-migration-matrix.md` remains untouched as the domain working source of truth.
