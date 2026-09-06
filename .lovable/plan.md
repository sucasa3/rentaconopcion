# Real Stripe prices for the five lender plans, plus $0 testing paths

Short answer: yes. Once the real prices exist, there are three legitimate ways to test the full lender and agent experience at $0 — Stripe test mode, 100%-off promotion codes on live prices, and an internal complimentary-activation bypass. We can support all three; each is useful at a different moment.

## 1. Create the real Stripe prices

One Stripe product + monthly price per plan, written into `plan_tiers.stripe_price_id`:

| Plan | Monthly | Profiles | Agents |
| --- | --- | --- | --- |
| MLO | $79 | 250 | 3 |
| MLO Growth | $149 | 1,000 | 10 |
| Branch | $499 | 5,000 | 25 |
| Branch Pro | $799 | 10,000 | 50 |
| Network | $1,499 | 25,000 | 100 |
| Agent | $49 | 250 | — |
| Agent Growth | $99 | 1,000 | — |

Add-ons (+500 profiles $49/mo, +5 agents $29/mo) also get Stripe prices but stay inactive in the app until add-on self-serve is enabled.

No code change needed for this — the billing code already reads `stripe_price_id` from each plan row; plans become "purchasable" automatically once a price id is present.

## 2. The three $0 testing paths

### A. Stripe test mode (recommended for end-to-end QA)

Stripe has a full test environment: test-mode prices mirror the live ones, checkout runs with Stripe's test card (4242 4242 4242 4242), and no real money ever moves.

- Create test-mode copies of the seven prices and store their ids in a `stripe_test_price_id` column on `plan_tiers`.
- The app picks live vs. test price ids based on the Stripe key in use (test secret key vs. live secret key), so the whole preview environment can run in test mode while production runs live.
- The webhook signing secret is per-mode, so preview gets its own test webhook.
- This exercises the real flow: checkout → webhook → activation → allowances → renewal state.

### B. 100%-off promotion codes on live prices (recommended for pilot/real users)

Stripe supports coupons and promotion codes natively. A 100%-off coupon with "forever" duration makes every invoice $0, including renewals — the subscription exists, is active, and behaves exactly like a paid one in our data model.

- Create one internal coupon `LAUNCH-PILOT-100` (100% off, forever) and enable the promotion-code field on Checkout.
- Nothing about it appears on the pricing page; it's only usable by someone we hand the code to.
- Because billing goes through the real subscription object, upgrades, downgrades, cancellation, and the 90-day commitment logic all behave identically to a paying customer.
- This is the right tool for a first pilot lender on the live domain. When the pilot converts to paid, we remove the coupon — no data migration, no account change.

### C. Internal comp activation (for our own demos, no Stripe at all)

A manager-only "Activate without payment" action that sets the organization's plan, allowances, and `active = true` directly, clearly marked `subscription_status = 'comped'`. Useful for demo accounts and internal testing on the live site where we don't want any Stripe customer created at all. Guarded so only platform admins can invoke it, and visibly labeled "Complimentary" on the billing page.

## 3. What gets built

1. Create the seven live Stripe products/prices and write the price ids into `plan_tiers` (no UI shows them until then anyway).
2. Add `stripe_test_price_id` to `plan_tiers`; `billing.server.ts` selects test vs. live price id based on which key is configured.
3. Create test-mode copies of the prices and a test-mode webhook for the preview environment.
4. Create the `LAUNCH-PILOT-100` coupon + promotion code and enable promo codes in Checkout sessions.
5. Add the admin-only comp-activation function with the `comped` status and billing-page label.
6. Update the billing page copy once prices are live (no more "not set up for self-serve payment" state).
7. QA pass: test-mode purchase of MLO in preview, verify webhook activation, allowances on the Capacity page, then cancel in the Stripe dashboard and verify deactivation.

## 4. Technical notes

- Price ids live in the database, not in code — consistent with the existing "pricing is never hard-coded" rule.
- Test mode vs. live mode is selected by which `STRIPE_SECRET_KEY` is set, so there is no way to accidentally charge a real card from preview.
- A 100%-off "forever" coupon still runs the card through Checkout (Stripe requires a payment method), which is actually what we want for a pilot that converts later.
- The comp path writes through the same org fields the webhook writes, so dashboards, capacity, and activation behave identically.
- Agent plans get the same treatment; the agent continuation/upgrade flow can be tested in test mode end to end.

## 5. Decisions already made — nothing new needed

No new business decisions required: prices are the approved ones, the coupon is internal-only, and the comp path is admin-only. The only operational step outside the app is you confirming the Stripe account details when the price-creation tool runs.
