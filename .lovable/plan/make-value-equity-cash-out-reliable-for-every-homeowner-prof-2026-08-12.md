# Make value / equity / cash-out reliable for every homeowner profile

## What the data actually shows for 545 Huntwick Pl

The property records for this home are complete and cached:

- Automated value: **$744,126** (range $696,991–$791,261, dated 2026-07-14)
- Assessor market value: **$542,900**, tax $4,440.88 (2025)
- Mortgage record: empty (no amount, no lender, no date) — no open mortgage on public record
- Property record matched exactly (ID 19336737, 5 bed / 3.5 bath, 3,014 sqft, built 1988)
- The dashboard fetched all of this successfully at 03:07 UTC — every call returned 200 from cache

Running the current equity math on those cached values yields equity $744,126, equity 100%, cash-out headroom ~$595,301. So the numbers exist and the calculation produces them, yet the card renders dashes. That means the break is in delivery to the screen, not in the data or the math — and the exact cause is **not yet confirmed**. The leading suspects are: the browser is running an older published build (last fixes are only in preview until published), or a cached client-side query result from an earlier failed load is being reused.

Because the cause is unconfirmed, step 1 of this plan is to reproduce and identify it before changing logic.

## Plan

1. **Reproduce and confirm.** Sign in as that homeowner in a clean browser session, load the Home tab, and capture exactly what the server function returns versus what the card renders. Confirm whether preview and the published site behave differently. Do not change logic until this identifies the cause, then fix the identified cause.
2. **One source of truth for "home value".** Today each card resolves value with its own fallback chain, so one place can show a number while another shows a dash. Introduce a single shared resolver (automated value → assessor market value → assessed total) and use it in the hero, Home intelligence, Equity & mortgage, home score, the AI assistant, and the lender/agent portfolio views.
3. **One intel fetch per dashboard load.** The Home tab currently makes four separate requests for the same property (hero, intelligence, equity, maintenance), each with its own cache window, so they can disagree with each other and log four times the calls. Consolidate into one shared query the cards read from.
4. **Never render bare dashes.** Any card that can't show a value shows a short reason instead: "No valuation on record for this address", "Waiting on property records", or "Finish your address" — plus a Retry that forces a fresh pull.
5. **Apply to established profiles, not just new ones.** Run a one-time pass over existing homeowner profiles that backfills missing city/state/ZIP from the matched public record and refreshes intel for any profile whose value is currently unresolved, so existing accounts are corrected without each homeowner having to trigger it.
6. **Apply to future profiles.** Keep the existing post-signup prewarm, and add a guard so a profile saved without a resolvable value gets retried on next dashboard load rather than silently staying blank.
7. **Publish afterwards** so the live site carries the same behavior as preview.

## Technical notes

- New `src/lib/home-value.ts`: `resolveHomeValue({ avm, tax })` returning `{ value, source }`; replace the ad-hoc chains in `dashboard.tsx`, `home-intel-panel.tsx`, `equity-mortgage-panel.tsx`, `home-score.ts`, `assistant.functions.ts`, `agent.functions.ts`, `lender.server.ts`.
- Shared query: single `useQuery(["home-intel", userId])` requesting `avm, detail, tax, sales, mortgage, permits` once; cards consume slices. Removes the duplicate `dashboard_hero` / `dashboard_view` / `dashboard_equity` / `dashboard_maintenance` fan-out visible in the call log.
- `getMyHomeIntel` returns an explicit `valueStatus` (`resolved` | `no_coverage` | `incomplete_address` | `budget_capped`) so the UI picks the right message instead of falling through to `—`.
- Backfill: server function (admin-only) iterating profiles with an address, calling `getPropertyIntel` with the existing cooldown/budget guards, writing back matched city/state/ZIP.
- Verify after the change on 545 Huntwick Pl (expect $744,126, 100% equity, ~$595K cash-out, "no open mortgage on record") and on 1010 Arbor Creek Dr (expect the assessed-value path, $585,000).
