# BatchData follow-ups — PARKED

Nothing here runs until you say go. No API calls, no integration changes, no enrichment.

Blocking question for the BatchData rep, before any of this is worth doing:
- What is the billing unit — per request, per match, or per returned record?
- Skip-trace (phone/email) endpoint and price.
- How are apartment / multi-unit addresses handled?
- Is `totalOpenLienBalance` ever an amortized payoff, or always original recorded principal?

## Parked item 1 — Fix the normalizer, re-score stored data (zero API calls)

The test harness read key names BatchData does not emit, so the in-app report
showed mortgage, prior sales and permits as missing on all 80 matched records
while the raw responses contained them.

Corrections needed in the BatchData normalizer:
- mortgage: read `openLien` (count, total balance, `mortgages[]` with lender,
  amount, type, term, recording date, LTV, current estimated rate, estimated
  payment) and `mortgageHistory[]`, filtered to the current ownership window.
- valuation: read `valuation.estimatedValue` / `priceRangeMin` / `priceRangeMax`
  / `confidenceScore` / `asOfDate`, and `assessment.totalAssessedValue` /
  `totalMarketValue`.
- sales: read `sale.lastSale`, `sale.priorSale`, `deedHistory[]`.
- permits: read `permit` (singular).
- ownership: read `owner.names[]` for co-owners, `ownerStatusType`,
  `ownershipStartDate`, `lengthOfResidenceYears`.

Then re-run the report over the 80 already-stored raw responses to produce the
true completeness numbers. No provider calls.

## Parked item 2 — Complete the run (13 calls)

Rows 92-104 died on HTTP 403 "Insufficient balance." Re-run only those 13 once
the account is funded, so the evaluation covers all 104 records.

## Parked item 3 — Owner-name match test (30-50 calls)

Send owner name alongside the address for homes where SuCasa knows the contact
is the owner. This is the only way to settle whether the 46% surname mismatch
means our contacts are renters or BatchData matched the wrong parcel.

## Unchanged guardrails

- Production ATTOM, the enrichment worker and `property_intel` stay untouched.
- All work stays inside the isolated Test Lab tables.
