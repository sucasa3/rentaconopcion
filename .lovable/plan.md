## Goal

Surface a subtle refinance upsell in the homeowner dashboard hero so we can convert equity signals into lender conversations, without cluttering the primary value/equity story.

## UX

- New **contextual chip** overlaid on the hero card (top-right of the equity stat area), only rendered when `equity.refiSignal` is `"strong"` or `"moderate"`.
  - Strong → green "Refi ready · save ~$X/mo" chip
  - Moderate → neutral "Explore refi options" chip
  - Watch/none → chip hidden (hero stays clean)
- Tap opens a bottom-sheet/modal ("Your matched lender") showing:
  - Matched lender org name, license #, primary contact
  - Current equity, estimated new rate spread, rough monthly savings (reuse `computeEquityRibbon` math)
  - Tap-to-call and tap-to-email buttons (same pattern as the lender→client contact card)
  - Small consent line: "Sharing your address + equity summary with {lender}"
  - Secondary link: "See full refi readiness report" → `/report`
- On open, log a lender lead event (see Data below) so the lender sees it in their portfolio inbox.

## Matching logic (server)

New server fn `getMatchedLenderForMe` in `src/lib/lender.functions.ts`:

1. Look up any `lender_portfolio_clients` row where `homeowner_id = auth.uid()` → return that portfolio's `lender_org_id`.
2. Else fall back to the round-robin founding lender (first active `lender_orgs` row with `plan = 'founding'`, cycled via a lightweight cursor mirroring `rr_cursor`).
3. Return `{ orgId, name, contactEmail, contactPhone, licenseNumber, matchType: "portfolio" | "roundrobin" }` or `null`.

Second server fn `createRefiIntent({ orgId, estSavingsMonthly })`:
- Inserts a `service_requests` row with `category = 'refinance'`, `source = 'homeowner'`, and writes a `lender_activity` entry so the lender dashboard shows the new intent.
- Ensures/creates a `homeowner_lender_consents` row (scope `refi_intent`, `granted_at = now()`) so `has_lender_access` passes for that lender.

## Frontend changes

- `src/components/home-hero/HomeHero.tsx`: accept optional `refiChip` slot and render it absolutely-positioned inside the hero card.
- `src/routes/_authenticated/dashboard.tsx`: compute chip visibility from the existing `intel.equity.refiSignal`, pass a `<RefiChip />` into `<HomeHero>`.
- New `src/components/refi-chip.tsx`: chip + `<RefiLenderSheet />` (shadcn `Sheet`/`Dialog`) that calls `getMatchedLenderForMe` on open via `useServerFn` + `useQuery`, and `createRefiIntent` on the "Connect" button via `useMutation`.
- Reuse existing tokens (`gradient-growth`, `bg-growth/15 text-growth`); no new colors.

## Data / DB

No schema changes required — reuses `service_requests`, `homeowner_lender_consents`, `lender_activity`, `lender_orgs`, `lender_portfolio_clients`.

## Out of scope

- No changes to `/report`, lender dashboard layout, GHL sync mapping, or pricing.
- No new payment surface; refi intent is a free lead handoff.
- Persistent hero button and hero tab variants (rejected in favor of contextual chip).
