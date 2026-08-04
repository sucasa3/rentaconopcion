# Show rate + estimated savings in the Refi options popup

When a homeowner clicks "Refi signal · strong · See options", the dialog already has small tiles for Equity, Your rate, and Est. savings — but the rate and savings tiles show a dash whenever the property records have no origination interest rate, and there is no explanation of how savings were figured. This adds a real savings breakdown.

## What changes

Inside the "Connect with lender" dialog:

1. **Savings breakdown block** (new, above the contact buttons):
   - Your current rate (from property records, origination) with a small "origination rate" note
   - Today's benchmark rate used for the comparison
   - Estimated loan balance
   - Estimated current payment vs. estimated new payment (principal + interest)
   - **Estimated savings: $X/mo · about $Y/yr**
2. **When no rate is on record** (common for equity-driven "strong" signals): instead of dashes, show a cash-out/HELOC framing — available equity and 80% LTV headroom — with a line saying no origination rate is on record, so a lender quote is needed for exact savings.
3. **Disclaimer line**: savings are estimates from public property records and standard amortization; principal & interest only, not taxes/insurance; actual terms come from the lender.

## Technical notes

- `src/components/connect-lender-dialog.tsx`: accept additional props (`loanBalance`, `cashOutHeadroom`, `benchmarkRate`, `estSavingsMonthly`, `currentRate`) and render the breakdown; keep the existing three-tile summary.
- Move the payment math out of the inline IIFE in `src/components/equity-mortgage-panel.tsx` into a small shared helper so the dialog can show current vs. new payment, not just the delta.
- Use the same benchmark rate the refi signal already uses (6.5 in `computeEquityRibbon`, `src/lib/valuation.server.ts`) by exporting it as a named constant instead of duplicating the literal.
- No database or server-function changes; all values are already returned by `getMyHomeIntel`.
