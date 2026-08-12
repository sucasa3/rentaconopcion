# Fix: value, equity and cash-out blank for 1010 Arbor Creek Dr

## What the data shows

The profile is now complete (`1010 Arbor Creek Dr, Roswell, GA 30076`) and the property matched fine:

- Property record matched (ID 10897201), assessor market value **$585,000**, assessed total $234,000.
- Mortgage record on file is empty (amount 0, no lender) — no open mortgage on public record.
- The automated valuation lookup keeps returning "no result", even after the canonical-address and property-ID retries ran tonight. That's a coverage gap for this property, not a bad address — three valuation attempts, all empty.

Confirmed cause of the blank equity card: the Equity & mortgage panel only asks for valuation, sales, mortgage and permits — it never requests the tax/assessor data. The assessed-value fallback added earlier lives in the equity math, but with no tax data passed in there is no value to fall back to, so estimated equity, equity %, cash-out headroom and the refi signal all compute to null.

## Fix

1. Include assessor/tax data in the Equity & mortgage panel's request so the fallback value actually reaches the equity math. With $585,000 assessed and no mortgage on record, equity, equity % and cash-out headroom will populate.
2. Label the source clearly on that card — "Based on assessor market value" when no automated estimate exists — so it's never presented as a live market estimate.
3. Make the same fallback apply anywhere else value is consumed (home score, opportunity scoring, lender/agent portfolio value columns) so one home doesn't show a value in one place and a dash in another.
4. When even the assessor value is missing, show a short reason line ("No valuation on record for this address") instead of em-dashes.
5. Stop the repeated failing valuation and permit retries for a property already known to have no coverage: remember the empty result for a cooling-off window so refreshes don't burn paid lookups on every dashboard load.

## Technical notes

- `src/components/equity-mortgage-panel.tsx`: add `"tax"` to the `classes` array in the `getMyHomeIntel` query; render the `valueSource === "assessed"` label on the equity and cash-out stats.
- `src/lib/valuation.server.ts`: `computeEquityRibbon` already falls back to `tax.marketTotal`; add an "empty result" timestamp per class so `avm`/`permits` aren't retried on every load after a `SuccessWithoutResult`.
- `src/lib/property-intel.functions.ts`: no change needed — it already passes `tax` into `computeEquityRibbon`.
- Verify afterwards on the agent home profile that estimated value, equity, equity % and cash-out headroom all render with the assessed label.

## Note

No database change is required — the address data is already correct.
