# Home Health system tiles become tappable links

Each system tile in Home Health (Water Heater, HVAC, Roof, Electrical — and the score tile) currently shows a chevron but is not a link. Make every tile a real destination.

## Behavior

1. **System tiles → Home Care, focused on that system.**
   - Each tile becomes a `<Link>` to `/home-care?system=<key>` (e.g. `water_heater`, `hvac`, `roof`, `electrical`).
   - Add a validated `system` search param on the Home Care page. When present, that system's section is expanded/highlighted and scrolled into view, and its existing actions ("add/update info", "request service") are surfaced directly.
   - If the param is absent or invalid, the page renders exactly as today.

2. **Home Score tile → "What affects this?"**
   - The score area links to the existing score explanation (the same "What affects?" explainer the button already opens), not a new page.

3. **Accessibility & visual polish**
   - Real links (not click handlers): keyboard focusable, visible focus ring, 44px minimum touch target.
   - Keep the chevron; add a subtle hover/press state consistent with existing PreviewRow links.

## Guardrails

- Presentation and navigation only: no changes to Home Score logic, system-condition evidence rules, maintenance rules, service-request flow internals, or permissions.
- "Request service" continues to use the existing `/request` flow — the tile does not bypass it, Home Care surfaces the existing entry point.
- No new pages, no new data, no fabricated system content.

## Verification

- At 390px: tap Water Heater → lands on /home-care?system=water_heater with that system highlighted and its actions visible; invalid `?system=` value falls back to the normal page.
- Score tile opens the score explainer.
- Keyboard focus + aria labels pass; `tsgo --noEmit` and full test suite (226 tests) pass.

## Technical notes

- `src/routes/_authenticated/dashboard.tsx`: wrap each system tile in `Link to="/home-care" search={{ system: key }}`.
- `src/routes/_authenticated/home-care.tsx`: add `validateSearch` for `system`, map key → system section, scroll/highlight via ref + `useEffect`, render the system's existing update-info and request-service actions inline.
- i18n: reuse existing labels; add aria-label strings in en/es if missing.
