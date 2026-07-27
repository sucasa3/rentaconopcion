
# MVP completion plan

Two tracks, one release. Homeowner side is ~85% there — a few gaps to close. Lender dashboard is net new.

## What's already working (do not rebuild)

- Homeowner auth, onboarding, address persistence to `profiles`.
- Dashboard hero bound to live ATTOM AVM/detail/tax.
- Equity + mortgage panel (equity ribbon, refi signal, cash-out headroom).
- Permits-driven maintenance timeline.
- ATTOM cache + budget + admin spend panel.
- GHL sync pipeline (homeowner lifecycle + service leads).
- Pro round-robin routing.

## Track A — Finish homeowner MVP

**Gaps to close:**

1. **Real service requests on the dashboard** — currently reads `RECENT_REQUESTS` mock. Wire to `service_requests` via a new `listMyRequests` server fn; keep the "Log outside service" flow that already writes to the table.
2. **Inspection report upload** — bucket `home-documents` (private), simple upload UI in the Documents card. Store row in a new `home_documents` table (id, user_id, kind, storage_path, uploaded_at). AI analysis is a follow-up; MVP just captures the file so nothing gets lost.
3. **Financial snapshot card** — combines mortgage + tax + equity into one "Home Finances" card at the top of the dashboard. Data is already fetched; this is a presentation pass.
4. **Suggested services from data** — small server fn `getSuggestedServices` that reads permits + home age + equity + missing docs and returns 3–5 category suggestions with a reason ("Roof is 18 years old — get roof inspection"). Renders above "Recommended professionals". No AI call yet — rules-based on data we already have. This is the "begin to suggest the services" ask.
5. **Home profile completion meter** — small progress bar showing what's filled (address, mortgage detail, inspection uploaded, insurance uploaded) → drives re-engagement.

## Track B — Lender dashboard

**Data model** (one migration):

- Extend `app_role` enum: add `lender`.
- `lender_orgs` (id, name, license_number, primary_contact_email, plan, active).
- `lender_members` (lender_org_id, user_id, role in org).
- `lender_portfolios` (id, lender_org_id, name).
- `lender_portfolio_clients` (id, portfolio_id, homeowner_id nullable, address_line1, city, state, zip, close_date, loan_amount_at_close, rate_at_close, term_months, notes). `homeowner_id` links to a real SuCasa user when we can match; otherwise the row is an "off-app" client the lender uploaded.
- `homeowner_lender_consents` (homeowner_id, lender_org_id, scope, granted_at, revoked_at). Required before a lender sees any homeowner's identifying data beyond address.
- `has_lender_access(lender_org_id, homeowner_id)` SECURITY DEFINER helper.
- RLS: lender members can only read rows in their org's portfolios; homeowner data only via consent.
- GRANTs on every new table (authenticated + service_role).

**Server functions** (`src/lib/lender.functions.ts`):

- `getMyLenderContext` — resolves user → lender_org.
- `listPortfolios`, `createPortfolio`.
- `uploadPortfolioClientsCsv` — takes rows, normalizes addresses, inserts.
- `getPortfolioClients` — for each row, joins cached `property_intel` and computes equity ribbon. If no cached intel, enqueues ATTOM fetch (respects the existing budget guard).
- `getRefiEligibleClients` — filter: equity_pct ≥ 20% AND current rate delta ≥ 0.75%.
- `inviteHomeownerConsent` — sends a magic link (via GHL later; MVP just creates a pending consent row + shareable URL).

**Enrichment pipeline**:

Reuse `getPropertyIntel` from `src/lib/valuation.server.ts` with `revenueSource: "lender_portfolio_enrichment"`. Batch fetch in `getPortfolioClients` (max 25 per call) so the ATTOM budget stays observable.

**UI** (`src/routes/_authenticated/lender/`):

- `route.tsx` — gate: user must have `lender` role.
- `index.tsx` — portfolio picker + KPI row (total clients, avg equity %, refi-eligible count, listing-risk count).
- `portfolio.$id.tsx` — sortable table: address, close date, current value, equity %, current LTV, refi signal, listing risk. Row click → detail drawer with equity ribbon + mortgage + tax history.
- `refi-queue.tsx` — refi-eligible list with "mark contacted" (writes to a `lender_activity` table).
- `upload.tsx` — CSV upload for portfolio ingest.

Nav: header shows "Lender" link only when the user has the `lender` role.

**Billing** (out of scope for this MVP, decided earlier):

Lender MSA ($997/mo flat) is invoiced in GHL. This build only delivers the product surface; we manually flip `active=true` on `lender_orgs` for pilot lenders. No Stripe wiring here.

**Seed access for testing**:

Admin panel gets a small "Create lender org" widget (existing `src/routes/admin.tsx`): create org, add member by email, done. Lets you self-onboard the first pilot lender without a signup flow.

## Build order

1. Migration: `home_documents` table + `home-documents` storage bucket.
2. Migration: lender schema (enum, tables, RLS, GRANTs, `has_lender_access`).
3. `src/lib/lender.functions.ts` + `src/lib/lender.server.ts`.
4. Lender routes under `_authenticated/lender/`.
5. Homeowner dashboard: swap mock requests → real, wire Documents upload, add Financial snapshot + Suggested services cards + completion meter.
6. Admin: "Create lender org" widget.
7. Header nav updates for `lender` role.

## Explicitly not in this MVP

- Stripe payments (SuCasa+, report unlocks, per-lead fees) — separate track, deferred.
- AI analysis of the inspection PDF — capture the file now, analyze in a follow-up turn.
- Lender white-label / co-branding.
- Homeowner ↔ lender messaging (link out to GHL for now).
- Rate-drop and listing-triggered push alerts (data is there; notification plumbing is a follow-up).

## Technical notes

- `home-documents` bucket: private, RLS on `storage.objects` scoped to `owner_id = auth.uid()`.
- CSV parse for lender uploads runs in the server fn (no client-side parsing) so we can normalize + dedupe addresses before we spend ATTOM calls.
- All lender ATTOM reads go through `getPropertyIntel` — cache TTLs and budget cap apply automatically. No new provider code.
- Consent gating: homeowner PII on a portfolio row (name, phone, email) is only returned when `homeowner_lender_consents` has an active row; otherwise the lender sees address + property intel only. Enforced in the server fn and in RLS.
- Lender-role check in header uses the existing `has_role(user_id, 'lender')` RPC.
