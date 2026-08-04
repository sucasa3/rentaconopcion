# Make property records the single source of homeowner data; retire Fello

## What I verified first

- **Fello has never produced any data.** Of 17 homeowner profiles, 0 have a Fello contact ID, estimated value, equity, lead score, or sync timestamp. The `fello_events` and `fello_webhook_subscriptions` tables are both empty. The integration is wired but dormant — removing it loses nothing.
- **The Fello roster file is separate from the Fello API.** `src/lib/data/fello-homeowners.json` is a frozen CSV export that seeded the portfolio. It stays; it's just client contact rows (name, email, phone, address) and is the origin of the household list.
- **Property-records coverage is thin today.** 402 portfolio clients, but only 49 rows in the property cache and just 7 with a valuation. The pull has barely been run, which is the real reason value/equity/net proceeds look empty — not a provider problem.
- **50 clients have no usable street address** (null, blank, or "Address on file").

## The one thing to decide up front

Property records are **address-keyed**. Fello was **email-keyed**. That means removing Fello closes the only automated path to recover a missing street address from an email. For those 50 households, the remaining options are the GHL contact record (email-keyed, still connected) or manual entry. This plan uses GHL first, manual entry as the fallback — no property-records call can help until an address exists.

## What I'll build

### 1. Property records become the sole valuation source
The valuation layer already abstracts providers and already computes everything Fello was going to supply — estimated value, loan balance, equity dollars and percent, cash-out headroom, refi signal, tenure. Nothing new is needed there. The work is repointing the homeowner side at it:

- Homeowner onboarding stops calling the Fello sync and instead triggers a property-records pull for the address just entered.
- Homeowner dashboard value/equity reads from the property cache rather than the (empty) `fello_*` profile columns.
- A single shared helper resolves "value + equity for this address" so the homeowner, lender, and agent dashboards all compute it identically.

### 2. Retire the Fello integration
- Delete `fello.server.ts`, `fello.functions.ts`, the `/api/public/fello/webhook` route, and the admin Fello panel.
- Drop the `fello_events` and `fello_webhook_subscriptions` tables (both empty).
- Drop the unused `fello_*` columns from `profiles`, and remove the "Fello synced" column from the admin profiles table.
- Rename the seed roster to a neutral name (`portfolio-seed.json`) and relabel the lender import button, so nothing user-facing names a provider.
- Leave the `FELLO_API_KEY` secret in place until you confirm the account is cancelled; I'll note it as safe to delete.

### 3. Close the coverage gap
This is what actually makes the dashboards show numbers:

- **Address backfill from GHL** — for the 50 placeholder rows, look the contact up by email in GHL and write back street/city/state/ZIP. Never overwrite a real address.
- **Inline address editing** in the coverage panel for whatever GHL can't resolve.
- **Then pull records** — the existing batched "Retry pulls" flow runs against every newly-addressed home so value, equity, and net proceeds populate.

### 4. Budget guardrail
Going all-in on property records raises call volume against a metered API. The spend controls already exist (per-class TTL cache, monthly budget, soft cap that flips to cache-only at 80%). I'll surface the current month's usage and cap status in the coverage panel so a bulk pull can't silently burn through the tier.

## What this does not give you

Property records supply passive signals — valuation, sale history, permits, tax, mortgage-at-origination. They do **not** supply live MLS status (Active / Expired / Withdrawn). That continues to come from the manually-maintained listing-status table, and the move-intent score keeps treating it as a manual input until a real MLS feed is connected.

## Technical notes

- Loan balance stays a straight-line amortization estimate from origination amount, date, and rate — there is no live servicer balance in the feed.
- Migration is destructive but safe: verified zero rows and zero non-null values across everything being dropped.
- Provider names stay out of all four dashboards; user-facing copy remains "property records".
