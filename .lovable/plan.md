# Fix: no property data for 1010 Arbor Creek

## What's actually wrong

The agent test account (`agent.officer@sucasatest.com`, Sam Agent) has this saved on its home profile:

- address: `1010 Arbor Creek Dr.`
- city: empty, state: empty, zip: empty

Property lookups need a city/state or ZIP. Because those fields are blank, every lookup made tonight (value, detail, tax, sales, mortgage, permits) came back rejected with "Address1 and Address2 are required" — 12+ failed calls at 01:32 UTC today. Nothing is cached for that address, so the dashboard shows empty.

So it isn't a Roswell-specific data gap: the address is incomplete, and the app let it be saved and then kept retrying anyway.

## Fix

1. Complete the address for that profile — set city `Roswell`, state `GA`, plus ZIP (30075/30076/30075 depending on the exact street; confirm) — then run one refresh so value/equity/detail populate.
2. Prevent the repeat: on the homeowner dashboard, when a profile has a street but no city/state/ZIP, show a short "Finish your address" inline form instead of silently failing, and skip lookups until it's complete.
3. Stop wasted lookups: the property-records layer returns a clear "incomplete address" result (no external call, no log spend) when city/state and ZIP are both missing.
4. Tighten capture: onboarding's address parser already expects "street, city, ST zip"; if the entered address doesn't parse into city/state, require the user to fill city/state/ZIP fields before continuing.

## Technical notes

- `src/lib/property-intel.functions.ts` `getMyHomeIntel` joins `address, city, state, zip`; add a guard returning `{ ok: false, error: "incomplete_address" }` when city/state and zip are all empty.
- `src/lib/attom.server.ts` `splitAddress` yields `address2: ""` for this input; make `attomFetch` refuse to call out when `address2` is empty.
- Dashboard (`src/routes/_authenticated/dashboard.tsx` + hero/equity panels) renders the completion prompt on that error code; saving writes back to `profiles` and invalidates the intel queries.
- Data correction for Sam Agent's profile applied directly (one row update), not a schema change.

## Open question

Confirm the exact address so the ZIP is right: `1010 Arbor Creek Dr, Roswell, GA` — is this a real property you want live records for, or a placeholder for the test agent account?
