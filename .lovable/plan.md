
## Goal

Make the Fello Import portfolio show real, useful data: full names for cold-lead uploads, and real close_date / loan amount / rate / term pulled from ATTOM.

## 1. Show full names for cold-lead rows

In `src/lib/lender.functions.ts` (`getPortfolio` mapper), change the name rule:

- If `homeowner_id IS NULL` → cold lead → show `client_name` unmasked (lender's own record).
- If `homeowner_id` is set AND consent is granted → unmasked.
- If `homeowner_id` is set AND consent is pending/revoked → keep `maskName(...)`.

Email stays gated by consent (only revealed when a linked homeowner grants access).

## 2. Enrich Fello rows from ATTOM

Add a server function `enrichPortfolioFromAttom({ portfolioId })` in `src/lib/lender.functions.ts` that, for each client in the portfolio missing loan data:

1. Uses the existing `attom.server.ts` helpers to resolve the property by `address_line1 + city + state + zip` and fetch the **mortgage** and **sales** endpoints (`fetchMortgage`, `fetchSales` — already used by `valuation.server.ts`).
2. Extracts:
   - `close_date` ← latest mortgage origination date (fallback: most recent sale date).
   - `loan_amount_at_close_cents` ← original loan amount from the mortgage record.
   - `rate_at_close` ← interest rate on that mortgage.
   - `term_months` ← loan term (default 360 when ATTOM reports nothing).
3. Writes results back to `lender_portfolio_clients` with `context.supabase.from(...).update(...)` scoped by `portfolio_id`, respecting the existing lender RLS.
4. Skips rows already populated. Rate-limited via the existing ATTOM caching layer (`property_intel` + `attom_call_log`) so re-runs are cheap.
5. Returns `{ enriched, skipped, failed }` for a toast.

### UI wire-up

In `src/routes/_authenticated/lender/portfolio.$id.tsx`, add an **"Enrich from ATTOM"** button next to "Upload CSV" that:

- Calls `enrichPortfolioFromAttom` via `useServerFn` + mutation.
- Shows a spinner + progress toast (`Enriching 76 clients…`).
- On success, invalidates `["lender-portfolio", id]` so the table refreshes with real loan/rate/close_date/equity/segment values.

Only visible when at least one client has `loan_amount_at_close_cents = null`.

## Out of scope

- Changing the CSV import contract.
- Backfilling `homeowner_id` on cold leads (that's the consent flow, separate track).
- Modifying the 250-client synthetic seeder.

## Files touched

- `src/lib/lender.functions.ts` — new mapper rule + new `enrichPortfolioFromAttom` server fn.
- `src/routes/_authenticated/lender/portfolio.$id.tsx` — enrich button + mutation.

No DB migration needed — schema already supports these columns.
