# Demo-only Branch Pro entitlement (preview database, 2026-10-08)

There is no per-org demo override mechanism, so the smallest data-only change was made to ONE org:

- `lender_orgs.id = 11111111-1111-1111-1111-111111111111` ("SuCasa Demo Lender")
- `plan_key: mlo -> branch_pro_v2`, `seat_limit 1 -> 15`, `profile_allowance 250 -> 10000`, `sponsored_allocation 3 -> 50`
- `plan = 'demo'` (unchanged), `is_test_account = true` (marks it synthetic; blocks CRM sync)

Not touched: Stripe (customer/subscription ids unchanged, nothing charged), `plan_tiers`, global plan checks, any other org.
Caveat: a Stripe subscription webhook for this org could rewrite `plan_key`. To revert, restore the old values above.
