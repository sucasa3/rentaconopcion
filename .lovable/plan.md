# Backfill missing client addresses from the CRM sources

## What's going on

Mauricio Patino's address isn't coming from a special source — it was already in the imported roster. The 25 households showing "Address on file" were imported that way: the seed file (`src/lib/data/fello-homeowners.json`) literally has `address_line1: "Address on file"` with null city/state/zip for those contacts, so there is nothing to pull property records against.

The good news: every one of those 25 rows has an email (and usually a phone), and the same contacts exist in the two connected CRMs:

- Fello contacts return `properties[].address` (street, city, state, zip) — the wrapper already models this in `src/lib/fello.server.ts`.
- The GoHighLevel contact record carries `address1 / city / state / postalCode`.

So instead of hand-typing addresses, we look each contact up by email and write the address back onto the household.

## What I'll build

1. **Address backfill engine** (server side)
   - For each portfolio client whose `address_line1` is missing or a placeholder ("Address on file", blank), look up the contact:
     1. Fello by email → first property address.
     2. If Fello has nothing, GHL contact lookup by email → address fields.
     3. If still nothing, fall back to the linked homeowner profile address when the client is matched to a SuCasa account.
   - Write `address_line1 / city / state / zip` back to the household, and record which source filled it.
   - Skip anything already having a real street address; never overwrite good data.

2. **"Find addresses" action in the Records coverage panel**
   - Sits next to "Retry pulls", batches through all placeholder rows, shows progress ("Found 9 of 25").
   - When it finishes, it automatically kicks off a property-records pull for the newly addressed homes so value / equity / net proceeds populate in the same click.

3. **Coverage panel reporting**
   - The "No address" filter chip gains a per-row note of the outcome: found via Fello, found via CRM, or "not found — needs manual entry".

4. **Manual edit fallback**
   - Inline edit of street / city / state / ZIP on any household row, so the handful the CRMs can't resolve can be fixed in-app without a re-import.

## Expected outcome

Realistically the CRMs will resolve many but not all 25 — contacts that were buyer leads and never owned a home won't have a property on file. Those stay flagged as "No address" and can be fixed with the inline editor.

## Technical notes

- New server functions in `src/lib/agent.functions.ts`: `backfillClientAddresses` (batched, returns per-row result) and reuse of the existing pull path afterwards.
- New helpers: `findFelloAddressByEmail` in `src/lib/fello.server.ts`, `findContactByEmail` in `src/lib/ghl.server.ts`.
- Updates to `src/components/agent-coverage-panel.tsx` for the new action, progress state, per-row source note, and inline address editing.
- Writes go to `lender_portfolio_clients`; no schema change needed.
