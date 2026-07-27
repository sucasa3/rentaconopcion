## Why the enrichment left those columns blank

I checked the raw ATTOM payloads cached in `property_intel` against the extractor and the writer. Three separate bugs, all in `src/lib/valuation.server.ts` `extractMortgage`, plus one data limit from ATTOM itself.

### Root causes (verified against real cached data)

1. **Loan amount always null — wrong JSON path.**
   Extractor reads `property[0].mortgage.FirstConcurrent.amount`, but ATTOM's `/property/detailmortgage` returns fields directly on `mortgage`:
   ```json
   "mortgage": { "amount": 139000, "date": "2016-09-15", "term": 360, "lender": {...} }
   ```
   45 of 76 addresses have `mortgage.amount` in cache — extractor returns `null` for every one, so enrichment never writes `loan_amount_at_close_cents`.

2. **Term always null — wrong shape.**
   ATTOM returns `term` as a number of months (e.g. `360`). Extractor treats it as `{ termYears }`.

3. **Rate always null — field doesn't exist in this endpoint.**
   `/property/detailmortgage` doesn't return `interestRate` at all. Rate cannot come from this call; we'd need a different ATTOM product or estimate it from origination date × prevailing-rate table.

4. **`close_date` is the only column that populated (49/76)** because it also falls back to `sales.lastSale.date`, which the sales extractor reads correctly.

### Downstream effect
With `loan_amount_at_close_cents` null, every derived field goes blank: balance, equity, LTV, refi savings, segment. That's why the table looked mostly empty even after enrichment ran.

### Fix plan

1. **Rewrite `extractMortgage` in `src/lib/valuation.server.ts`** to match the real payload:
   - `loanAmount` from `property[0].mortgage.amount`
   - `originationDate` from `property[0].mortgage.date`
   - `termYears` from `property[0].mortgage.term` (number of months → divide by 12; keep months too)
   - `lender` from `property[0].mortgage.lender.lastname`
   - Keep `interestRate: null` — endpoint doesn't provide it.
   - Update the `MortgageSummary` shape (add `termMonths`) so `enrichPortfolioFromAttom` can write months directly without the ×12.

2. **Update `enrichPortfolioFromAttom` in `src/lib/lender.functions.ts`** to use the corrected fields (write `term_months` from `termMonths`, keep rate handling but expect null).

3. **Fill rate with a prevailing-rate estimate** so the refi math works. Add a small lookup table (Freddie Mac PMMS annual averages, hard-coded) keyed by year of `close_date`. When ATTOM has no rate, write the estimated rate into `rate_at_close` and note it (via a `notes` suffix like "rate est."). This keeps segments/savings meaningful.

4. **Re-run enrichment** on the Fello portfolio. Existing 45 cached mortgages won't re-hit ATTOM (cache), so this is free.

5. **Verify**: query `lender_portfolio_clients` — expect ~45 rows with `loan_amount_at_close_cents` set and `rate_at_close` populated (real or estimated) for anything with a close date.

### Files touched
- `src/lib/valuation.server.ts` — fix `extractMortgage` + `MortgageSummary`.
- `src/lib/lender.functions.ts` — use corrected fields, add prevailing-rate fallback.

No schema or RLS changes.