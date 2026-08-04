# Backfill missing client addresses from the CRM sources

## What's going on

Mauricio Patino's address isn't from a special source — it was already in the imported roster. The 25 households showing "Address on file" were imported that way: the seed file (`src/lib/data/fello-homeowners.json`, a one-time Fello "Expired Seller" export) literally has `address_line1: "Address on file"` with null city/state/zip for those contacts, so there is nothing to pull property records against.

There are two Fello things in the codebase:
- **Static**: `fello-homeowners.json` — a frozen export that seeded the portfolio. Not a live connection.
- **Live**: `src/lib/fello.server.ts` — a real REST client hitting `api.fello.ai` with `FELLO_API_KEY`. It can look up a contact by email and the response includes `properties[].address` (street, city, state, zip).

The plan is to use the **live** API to look up the 25 contacts by email and recover the addresses the static export omitted. If Fello doesn't have them, we fall back to GHL (also live, also keyed by email), and finally to the linked homeowner's profile address.

## Step 0 — Verify Fello actually returns addresses (do this first)

Before building anything, call `getFelloContact({ email })` for 2–3 of the 25 placeholder contacts using the `invoke-server-function` tool. This confirms whether Fello's API returns a `properties[].address` for contacts that the export listed without one. If it comes back empty, Fello drops to a fallback source and GHL / homeowner-profile becomes primary.

## What I'll build

1. **Address backfill engine** (server side, in `src/lib/agent.functions.ts`)
   - For each portfolio client whose `address_line1` is missing or a placeholder ("Address on file", blank), look up the contact:
     1. Fello by email → first property address (if Step 0 confirms it works).
     2. GHL contact lookup by email → address fields (`address1 / city / state / postalCode`).
     3. If still nothing, fall back to the linked homeowner profile address when the client is matched to a SuCasa account.
   - Write `address_line1 / city / state / zip` back to `lender_portfolio_clients`, and record which source filled it.
   - Skip anything already having a real street address; never overwrite good data.
   - New helpers: `findFelloAddressByEmail` in `src/lib/fello.server.ts`, `findContactByEmail` in `src/lib/ghl.server.ts`.

2. **"Find addresses" action in the Records coverage panel**
   - Sits next to "Retry pulls" in `src/components/agent-coverage-panel.tsx`.
   - Batches through all placeholder rows, shows progress ("Found 9 of 25").
   - When it finishes, automatically kicks off a property-records pull for the newly addressed homes so value / equity / net proceeds populate in the same click.

3. **Coverage panel reporting**
   - The "No address" filter chip gains a per-row note of the outcome: found via Fello, found via CRM, or "not found — needs manual entry".

4. **Manual edit fallback**
   - Inline edit of street / city / state / ZIP on any household row, so the handful the CRMs can't resolve can be fixed in-app without a re-import.

## Expected outcome

The CRMs will resolve many but likely not all 25 — contacts that were buyer leads and never owned a home won't have a property address on file. Those stay flagged as "No address" and can be fixed with the inline editor.

## Technical notes

- Writes go to `lender_portfolio_clients`; no schema change needed.
- All CRM lookups happen server-side inside `createServerFn` handlers; no API keys reach the client.
