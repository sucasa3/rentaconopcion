# Fix: campaigns not visible in the dashboards

## What's happening

The 12 campaigns exist in the database and their access rules allow signed-in users to read them. But the three campaign tables were created without the database-level permission grants the data layer requires, so every read comes back empty (or as a permission error swallowed by the UI). That's why the admin panel shows only the empty "All campaigns" dropdown and the lender campaigns page shows no cards.

Confirmed:
- `campaigns` has 12 rows
- read policy allows any signed-in user
- `campaigns`, `campaign_activations`, `campaign_sends` have **zero** table grants

## The fix

One migration adding the missing grants:

- `campaigns` — SELECT for signed-in users, full access for admin/service operations
- `campaign_activations` — SELECT/INSERT/UPDATE/DELETE for signed-in users (policies already scope rows to their own org), full access for service operations
- `campaign_sends` — SELECT for signed-in users (policies scope to own org / own sends), full access for service operations

No schema, policy, or application-code changes are needed.

## Verification

After the migration: reload the admin dashboard — the campaign dropdown lists all 12 and the campaign grid renders; the lender Campaigns page shows the toggleable campaign cards.
