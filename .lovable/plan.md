# Lender Opportunity Discovery — free proof before the pilot

Goal: a loan officer uploads up to 100 past clients, SuCasa analyses them with the same engine the paid product uses, reveals how many are worth a call today, unlocks the top 5 in full, previews the rest, and offers the 90-day pilot as the natural next step.

## What exists today (verified)

- Lender import, CSV parsing, address de-duplication and portfolio clients already exist (`lender.functions.ts`, `lender.server.ts`, `BulkClientUpload`).
- Property enrichment is already cached per normalized address and idempotent, so a repeated address costs nothing extra.
- The canonical opportunity engine, priority ranking, conversation openers, next steps and channel permissions already exist (`opportunities.*`, `lender-daily.ts`, `lender-workspace.server.ts`).
- Lender plans live in the plan catalogue: MLO $79/mo, Branch $499/mo, Branch Pro $799/mo. There is **no** pilot product and no $149 tier yet — both are created by this plan.
- The lender page currently leads with "Talk to us about a pilot" and a request form; the presentation ends on the paid pilot.

Discovery reuses all of the above. No second scoring engine, no demo opportunities, no parallel client table.

## The flow

1. **Landing page** — hero becomes "Your past-client database already has opportunities inside it." Primary action: *Discover opportunities in my database*. Secondary: *See how SuCasa works* (presentation). Sign in stays. Adds the 3-step section (upload 100 → SuCasa finds the signals → see who to call and why). No mention of data vendors, AVMs or AI.
2. **Frictionless signup** — work email, magic link only. No password, no company profile, no billing. Creates the lender organization and a Discovery portfolio behind the scenes.
3. **Upload** — up to 100 past clients by CSV or paste, using the existing importer. Over 100 rows: keep the first 100 and say so.
4. **Processing screen** — honest progress (properties recognised, analysis running). Enrichment is de-duplicated and cached; failures retry without re-purchasing.
5. **The reveal** — a full-screen, progressively animated result, not a dashboard: "We analysed 100 of your past clients. 31 have signals worth reviewing right now," then the category breakdown (high priority / mortgage reviews / equity / other), then "Your database was sitting on 31 conversations. SuCasa just found them." Real counts from their own data; if the count is low, the copy stays truthful rather than inflated.
6. **Top 5 unlocked** — the five highest-priority clients in full, using the existing opportunity card and detail view: who, why they deserve attention, what changed, canonical property/mortgage context, suggested opener, recommended next step, permitted channels.
7. **The rest previewed** — the true total is always shown. Remaining opportunities appear as category counts and priority distribution with initials-only, address-less preview cards: enough to see the value, not enough to work the list.
8. **Pilot offer** — "You found opportunities today. Now keep SuCasa watching for the next one." Everything uploaded, enriched and scored carries into the paid workspace; no re-upload, ever.

Compliance language is unchanged: signals and reasons to reconnect, never qualification, approval, guaranteed savings, or a prediction that someone will transact.

## Pricing (new, as agreed)

- **90-Day SuCasa Pilot — $447 once**, up to 1,000 monitored Home Profiles.
- After 90 days it rolls automatically into **MLO Growth — $149/month**, 1,000 profiles, cancellable.
- Existing **MLO $79/month** stays as the 250-profile entry tier. Branch tiers untouched.
- Checkout uses the existing Stripe checkout path; new products/prices are created for the pilot and MLO Growth.

## Account states

Discovery state is tracked on the lender organization as its own field — `discovery_not_started`, `discovery_processing`, `discovery_complete`, `pilot_available`, `paid_active` — alongside, not inside, the existing subscription status. Buying the pilot flips billing state normally and the Discovery workspace simply becomes the real workspace.

## Abuse and cost control

- One free Discovery per lender organization, capped at 100 properties.
- Repeat attempts from the same email domain or the same address set are flagged and require review rather than silently re-enriching.
- Enrichment stays cached and idempotent; retries don't repurchase unchanged records; no expensive reverse look-ups are used just to finish a Discovery.

## Internal economics (never shown to the lender)

A configurable `discovery_enrichment_cost_per_property` (default $0.0155) drives internal cost tracking only. Actual provider calls, matches and failures are recorded per Discovery. The existing $0.10 assumption elsewhere is left alone pending a separate audit.

## Analytics

First-party events only, no vendor, no homeowner PII: `lender_landing_viewed`, `discovery_cta_clicked`, `discovery_account_created`, `upload_started`, `upload_completed`, `unique_properties`, `properties_matched`, `enrichment_cost`, `opportunities_found`, `top5_viewed`, `additional_opportunities_previewed`, `pilot_cta_clicked`, `checkout_started`, `pilot_started`, `paid_conversion`. An internal view reports Discovery completion rate, matches per 100, opportunities per 100, cost per Discovery, share viewing all five, Discovery→pilot and pilot→retained conversion.

## Presentation update

The deck at `/lenders/deck` is re-sequenced: problem → "let's test SuCasa with 100 of your actual past clients" → proof → the top 5 experience → continuous monitoring across the whole book → then the pilot offer. Navigation, print/PDF and links are preserved.

## Privacy guarantees kept

Discovery reads only the clients that lender uploaded. No agent-only, sponsored-only or unrelated homeowner data is exposed. Uploading grants no contact rights; homeowner consent remains the only authority for homeowner-level sharing. Canonical value and equity calculations are used as-is — no Discovery-specific maths, no hard-coded mortgage rates. Homeowner and agent experiences are untouched.

## Technical notes

- New: `lender_discoveries` + `lender_discovery_results` tables (org-scoped RLS, grants), `src/lib/discovery.server.ts` / `discovery.functions.ts`, magic-link route `/lender-start`, Discovery routes under `_authenticated/lender/discovery` (upload, processing, reveal), `discovery_state` on `lender_orgs`, `discovery_enrichment_cost_per_property` in `platform_config`, two new plan-catalogue rows + Stripe prices.
- Reused: `parseClientCsv`, `ingestPortfolioCsv`/`addPortfolioClient`, `BulkClientUpload`, property enrichment queue and cache, `opportunities.*`, `lender-daily.ts` ranking/openers/next steps, `readLenderWorkspace` permissions, existing opportunity card/detail components, `startCheckout`, `logNetworkEvent`.
- Email/magic-link sign-in enabled for the lender signup path; `/lender-start` and Discovery routes exempted from legacy IDX redirects.
- Verification: typecheck plus the existing suite, new tests for the 100 cap, de-duplication, one-Discovery-per-org, top-5 selection, preview redaction, carry-over into paid, and no cross-org leakage; mobile and desktop passes on the landing page and reveal.
