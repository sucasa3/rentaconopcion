# Demo-only Branch Pro entitlement (preview database, 2026-10-08)

There is no per-org demo override mechanism, so the smallest data-only change was made to ONE org:

- `lender_orgs.id = 11111111-1111-1111-1111-111111111111` ("SuCasa Demo Lender")
- `plan_key: mlo -> branch_pro_v2`, `seat_limit 1 -> 15`, `profile_allowance 250 -> 10000`, `sponsored_allocation 3 -> 50`
- `plan = 'demo'` (unchanged), `is_test_account = true` (marks it synthetic; blocks CRM sync)

Not touched: Stripe (customer/subscription ids unchanged, nothing charged), `plan_tiers`, global plan checks, any other org.
Caveat: a Stripe subscription webhook for this org could rewrite `plan_key`. To revert, restore the old values above.

## Stripe overwrite caveat and how to restore

The org still has its original Stripe customer/subscription ids. Any Stripe subscription event for it
(`customer.subscription.updated/deleted`, `checkout.session.completed`) runs the normal webhook path, which
rewrites `plan_key`, `seat_limit`, `profile_allowance` and `sponsored_allocation` from the Stripe price — this
can silently drop the demo back to MLO and pause members beyond the new seat count (downgrade handling).

Check: `select plan_key, seat_limit, profile_allowance, sponsored_allocation from lender_orgs where id = '11111111-1111-1111-1111-111111111111';`

Restore Branch Pro demo values (data-only, this org only, no Stripe call):
```sql
update lender_orgs
   set plan_key = 'branch_pro_v2', seat_limit = 15, profile_allowance = 10000,
       sponsored_allocation = 50, is_test_account = true
 where id = '11111111-1111-1111-1111-111111111111';
```
If members were paused, reactivate them manually from the Team screen as Morgan (lender.manager@sucasatest.com);
upgrades never auto-restore. Expected roster: Morgan Manager (owner), Alex Rivera and Alex Officer (loan officers).
