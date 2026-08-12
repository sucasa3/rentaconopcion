# Fix: value and equity blank on the home profile

## What the data shows

For `1010 Arbor Creek Dr, Roswell, GA` (the agent test profile):

- Property details, tax, and sales all matched fine (property ID 10897201, verified ZIP is **30076** — the profile still has no ZIP saved).
- The **valuation lookup returns "no result"** for the address without the ZIP, so estimated value is null. Everything downstream (equity, equity %, cash-out headroom, refi signal) is computed from that value, so all of it renders blank.
- The **mortgage record on file is empty**: amount `0`, no lender, no rate. This home has no recorded open mortgage, so loan balance can't be estimated either.

So two separate things: one fixable (missing ZIP breaking the valuation match), one real (no mortgage on public record).

## Fix

1. Save ZIP `30076` on that profile so the address matches exactly.
2. Make valuation matching resilient: when the valuation lookup returns no result but the details lookup matched, retry the valuation using the matched property ID / the provider's canonical one-line address instead of the raw profile address. Also backfill missing ZIP on the profile from the matched record so future lookups are exact.
3. Fall back for value: if there's still no automated valuation, use the assessed market value from the tax record as an "assessed value (estimate)" so the card isn't empty, clearly labelled as assessed rather than market estimate.
4. Treat an empty mortgage record (amount 0 / no lender) as "no mortgage on record" instead of a zero-dollar loan, and show that explicitly in Equity & mortgage: "No open mortgage found on public record" with equity shown as ~full value when a value exists.
5. Where nothing can be resolved, show a short reason line instead of em-dashes, so it's obvious whether it's a missing-data issue or a coverage gap.

## Technical notes

- `src/lib/valuation.server.ts`: add a retry path in the intel fetch that reuses the `detail` response's `property[0].address.oneLine` / `attomId` when `avm` comes back `SuccessWithoutResult`; add assessed-value fallback into `computeEquityRibbon` (flagged as `valueSource: "avm" | "assessed"`); treat `mortgage.amount === 0 && no lender` as `null` in `extractMortgage`.
- `src/lib/attom.server.ts`: allow lookups by property ID (`attomid` param) in addition to address1/address2.
- `src/lib/property-intel.functions.ts`: after a successful detail match, write back city/state/ZIP to `profiles` when missing.
- `src/components/home-intel-panel.tsx` and `src/components/equity-mortgage-panel.tsx`: label the value source and render the "no mortgage on record" state.
- One data correction: set ZIP `30076` on the Sam Agent profile.
