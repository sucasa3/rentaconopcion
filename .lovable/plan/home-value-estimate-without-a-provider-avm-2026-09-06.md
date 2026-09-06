# Home Value Estimate Without a Provider AVM

## The problem, stated from the data

Across the 13 matched properties in the latest validation run, the provider returned an automated value estimate on **0 of 13**. What it did return, consistently:

| Field | Present |
|---|---|
| Assessor market value | 13 / 13 |
| Living area (sqft), beds, baths, year built | 13 / 13 |
| Last sale price + date | 12 / 13 |
| Open lien balance + LTV | 8 / 13 |

So we have plenty of value signal — just not a packaged estimate. The fix is to compute our own, transparently, and show how confident we are.

## The approach: SuCasa Value Engine

One shared function that every screen calls (it replaces the ad-hoc "value or dash" logic in `src/lib/home-value.ts`). It evaluates several independent value candidates, picks and blends the strongest, and always returns a number **plus** a plain-English source line and a confidence band.

### Candidate 1 — Recent sale price (strongest)
A sale in the last 12 months is the market's own answer. Use the price, drifted forward by a market factor for the months elapsed. Example from the data: 2319 Castilla Isle sold Feb 2026 for $3,000,000.

### Candidate 2 — Mortgage-implied value
Open lien balance divided by the reported LTV. Example: 429 Regina St, $241,656 / 0.702 = about $344,000. Only used when there is exactly one open lien and the LTV clearly belongs to it — never when liens are ambiguous, and never by inventing a missing balance.

### Candidate 3 — Assessor market value, ratio-corrected
Counties assess at different fractions of true market value. We build a correction factor per state/county and apply it, rather than showing the raw assessor number as if it were market value.

### Candidate 4 — Sale price aged forward
An older sale price grown by a market appreciation factor for the years since. Low confidence on its own, useful as a sanity check and as a floor/ceiling.

### Blending and confidence
- Candidates are ranked; where two independent candidates agree within a tolerance, confidence rises and we publish a tight range.
- Where they disagree materially, we publish the stronger one, widen the range, and say why.
- Output always carries: estimate, low/high range, source label, as-of date, confidence (High / Medium / Low).
- If nothing qualifies, we say "not enough public record data yet" instead of a dash — no invented number.

## Guardrails (matching your earlier direction)

- Show with a label rather than hide. An assessor-derived number says "based on county assessor records, {year}". A mortgage-derived number says "estimated from recorded loan data".
- Equity, cash-out and any lender-facing offer only uses **High or Medium** confidence values; Low confidence shows the number to the homeowner but suppresses the money-offer opportunity.
- Never derive value from LTV when liens are ambiguous or a balance is missing.

## Validating it before it ships (no new API calls)

We already have stored provider AVMs from the August benchmark run and stored ATTOM values in the database. We backtest the engine against those saved records: run the estimator on the stored inputs, compare to the stored AVM, and report median absolute error, share within 10%, and error by candidate type. That tells us how good each candidate really is and sets the correction factors and tolerances from evidence rather than guesswork. Results go into a short accuracy report.

## Technical notes

- New `src/lib/value-engine.ts` — pure, testable, no I/O: takes a normalized property record, returns `{ estimate, low, high, source, asOf, confidence, reason }`.
- Market drift and assessment-ratio factors live in a small data table in `src/lib/data/` so they can be tuned without touching logic.
- `src/lib/home-value.ts` `resolveHomeValue` delegates to the engine, keeping its current signature so no screen breaks.
- Backtest runs as a script against `batchdata_test_results` and stored ATTOM records; read-only.
- No provider calls, no change to live enrichment, no ATTOM activation.

## Out of scope for now

- Comparable-sales modelling (needs a comps endpoint we haven't priced).
- Switching live enrichment to the new provider — that stays gated behind the earlier checkpoint.
