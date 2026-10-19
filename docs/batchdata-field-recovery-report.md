# Stored BatchData field recovery — Phase 1

Audit date: October 19, 2026. No provider requests or database writes.

Replayed 206 stored attempts; 174 successful property responses. Counts below are per response, not unique homes or individual liens. Repeated properties are included; do not interpret these as book counts.

Before = existing persisted normalized payload; after = exact-path evidence preserved by the isolated recovery module. Differences can include old mapping versions and intentionally ownership-filtered history; they are not all newly discovered provider fields. Fields already mapped remain unchanged in production.

| Field | Actual response path | Before | After | % populated | Evidence | Source-date range | Use / limitation |
|---|---|---:|---:|---:|---|---|---|
| ownerNames | `owner.names[].full` | 0 | 174 | 100% | reported | 1993-10-29T00:00:00.000Z → 2026-07-06T00:00:00.000Z | Ownership review only; never household proof |
| ownerOccupied | `owner.ownerOccupied` | 174 | 174 | 100% | reported | undated → undated | Residence candidate; confirmation preferred |
| ownerStatus | `owner.ownerStatusType` | 0 | 174 | 100% | reported | undated → undated | Ownership context, not household identity |
| ownershipStart | `owner.ownershipStartDate` | 0 | 162 | 93.1% | recorded | 1993-10-29T00:00:00.000Z → 2026-07-06T00:00:00.000Z | Ownership window |
| residenceYears | `owner.lengthOfResidenceYears` | 89 | 162 | 93.1% | reported | undated → undated | Tenure context |
| value | `valuation.estimatedValue` | 156 | 156 | 89.7% | estimated | 2022-06-22T00:00:00.000Z → 2026-08-27T00:00:00.000Z | Estimated value only |
| valueLow | `valuation.priceRangeMin` | 80 | 156 | 89.7% | estimated | 2022-06-22T00:00:00.000Z → 2026-08-27T00:00:00.000Z | Estimated range |
| valueHigh | `valuation.priceRangeMax` | 80 | 156 | 89.7% | estimated | 2022-06-22T00:00:00.000Z → 2026-08-27T00:00:00.000Z | Estimated range |
| valueConfidence | `valuation.confidenceScore` | 157 | 157 | 90.2% | reported | 2022-06-22T00:00:00.000Z → 2026-08-27T00:00:00.000Z | Provider confidence, not identity confidence |
| valueDate | `valuation.asOfDate` | 81 | 158 | 90.8% | reported | 2022-06-22T00:00:00.000Z → 2026-08-27T00:00:00.000Z | Valuation freshness |
| assessedValue | `assessment.totalAssessedValue` | 94 | 173 | 99.4% | reported | undated → undated | Tax assessment context |
| marketValue | `assessment.totalMarketValue` | 94 | 172 | 98.9% | reported | undated → undated | Assessment context, not AVM |
| openLienCount | `openLien.totalOpenLienCount` | 94 | 174 | 100% | reported | undated → undated | Current lien count only |
| aggregateLienBalance | `openLien.totalOpenLienBalance` | 51 | 108 | 62.1% | unverified | undated → undated | Aggregate semantics need confirmation for incomplete components |
| lender | `openLien.mortgages[].lenderName` | 57 | 110 | 63.2% | reported | 1993-10-29T00:00:00.000Z → 2026-05-28T00:00:00.000Z | Active-loan review |
| originalPrincipal | `openLien.mortgages[].loanAmount` | 55 | 108 | 62.1% | recorded | 1993-10-29T00:00:00.000Z → 2026-05-28T00:00:00.000Z | Original principal, never payoff |
| estimatedBalance | `openLien.mortgages[].currentEstimatedBalance` | 0 | 91 | 52.3% | estimated | undated → undated | Estimated component balance; no aggregate addition |
| estimatedRate | `openLien.mortgages[].currentEstimatedInterestRate` | 57 | 109 | 62.6% | estimated | undated → undated | General mortgage review, not verified refinance |
| rateClassification | `openLien.mortgages[].financingType` | 0 | 62 | 35.6% | reported | 1993-10-29T00:00:00.000Z → 2026-05-28T00:00:00.000Z | ARM review only; no reset date |
| loanType | `openLien.mortgages[].loanType` | 55 | 108 | 62.1% | reported | 1993-10-29T00:00:00.000Z → 2026-05-28T00:00:00.000Z | Product review, no insurance eligibility claim |
| termMonths | `openLien.mortgages[].loanTermMonths` | 0 | 107 | 61.5% | reported | 1993-10-29T00:00:00.000Z → 2026-05-28T00:00:00.000Z | Exact months, no rounding loss |
| recordingDate | `openLien.mortgages[].recordingDate` | 57 | 110 | 63.2% | recorded | 1993-10-29T00:00:00.000Z → 2026-05-28T00:00:00.000Z | Recording date, not proven origination |
| maturityDate | `openLien.mortgages[].dueDate` | 54 | 106 | 60.9% | reported | 1993-10-29T00:00:00.000Z → 2026-05-28T00:00:00.000Z | Maturity, never ARM reset |
| estimatedPayment | `openLien.mortgages[].estimatedPaymentAmount` | 48 | 104 | 59.8% | estimated | undated → undated | Estimated payment, no savings promise |
| ltv | `openLien.mortgages[].ltv` | 51 | 106 | 60.9% | estimated | undated → undated | LTV review, not guaranteed PMI removal |
| helocFlag | `openLien.mortgages[].helocFlag` | 0 | 1 | 0.6% | reported | 1993-10-29T00:00:00.000Z → 2026-05-28T00:00:00.000Z | Existing lien context, not newly detected |
| equityCreditLine | `openLien.mortgages[].equityCreditLine` | 0 | 91 | 52.3% | reported | 1993-10-29T00:00:00.000Z → 2026-05-28T00:00:00.000Z | Existing line context |
| historicalPrincipal | `mortgageHistory[].loanAmount` | 0 | 111 | 63.8% | recorded | 1998-09-25T00:00:00.000Z → 2026-05-27T00:00:00.000Z | History only; not currently open |
| historicalRate | `mortgageHistory[].interestRate` | 0 | 111 | 63.8% | reported | 1998-09-25T00:00:00.000Z → 2026-05-27T00:00:00.000Z | History only; not current-loan rate |
| historicalRateType | `mortgageHistory[].interestRateType` | 0 | 38 | 21.8% | reported | 1998-09-25T00:00:00.000Z → 2026-05-27T00:00:00.000Z | Historical classification only |
| historicalLender | `mortgageHistory[].lenderName` | 0 | 111 | 63.8% | reported | 1998-09-25T00:00:00.000Z → 2026-05-27T00:00:00.000Z | Historical lender, never current without proof |
| historicalRecordingDate | `mortgageHistory[].recordingDate` | 0 | 111 | 63.8% | recorded | 1998-09-25T00:00:00.000Z → 2026-05-27T00:00:00.000Z | Historical source date |
| historicalTermMonths | `mortgageHistory[].loanTermMonths` | 0 | 111 | 63.8% | reported | 1998-09-25T00:00:00.000Z → 2026-05-27T00:00:00.000Z | Historical term only |
| historicalLoanType | `mortgageHistory[].loanType` | 0 | 110 | 63.2% | reported | 1998-09-25T00:00:00.000Z → 2026-05-27T00:00:00.000Z | Historical product only |
| lastSaleDate | `sale.lastSale.saleDate` | 90 | 160 | 92% | recorded | 1993-10-28T00:00:00.000Z → 2026-06-29T00:00:00.000Z | Sale date, separate from loan age |
| lastSalePrice | `sale.lastSale.price` | 89 | 142 | 81.6% | reported | 1993-10-28T00:00:00.000Z → 2026-06-29T00:00:00.000Z | Respect salePriceIsEstimated flag |
| salePriceEstimated | `sale.lastSale.salePriceIsEstimated` | 0 | 174 | 100% | reported | 1993-10-28T00:00:00.000Z → 2026-06-29T00:00:00.000Z | Price evidence classification |
| priorSaleDate | `sale.priorSale.saleDate` | 89 | 139 | 79.9% | recorded | 1994-01-27T00:00:00.000Z → 2026-06-29T00:00:00.000Z | Prior sale history |
| priorSalePrice | `sale.priorSale.price` | 89 | 124 | 71.3% | reported | 1994-01-27T00:00:00.000Z → 2026-06-29T00:00:00.000Z | Prior sale, no duplicate totals |
| deedHistoryDate | `deedHistory[].recordingDate` | 89 | 154 | 88.5% | recorded | 1983-12-23T00:00:00.000Z → 2026-07-06T00:00:00.000Z | Deeds are not necessarily sales |
| deedHistoryPrice | `deedHistory[].salePrice` | 89 | 154 | 88.5% | reported | 1983-12-23T00:00:00.000Z → 2026-07-06T00:00:00.000Z | Historical transfer context |
| permitCount | `permit.permitCount` | 174 | 45 | 25.9% | reported | 1986-09-22T00:00:00.000Z → 2026-03-01T00:00:00.000Z | Homeowner only; count is summary |
| permitLatestDate | `permit.latestDate` | 23 | 41 | 23.6% | reported | 1986-09-22T00:00:00.000Z → 2026-03-01T00:00:00.000Z | Homeowner only; no diagnosis |
| permitEarliestDate | `permit.earliestDate` | 23 | 41 | 23.6% | reported | 1986-02-21T00:00:00.000Z → 2024-07-01T00:00:00.000Z | Homeowner only |
| permitTags | `permit.allTags[]` | 19 | 33 | 19% | reported | 1986-09-22T00:00:00.000Z → 2026-03-01T00:00:00.000Z | Summary tags, not event descriptions |
| permitTotalJobValue | `permit.totalJobValue` | 26 | 45 | 25.9% | reported | 1986-09-22T00:00:00.000Z → 2026-03-01T00:00:00.000Z | Summary only; never add to event totals |

## Verification and phase gate

- The active normalizer is shared by production valuation/provider-primary and Test Lab. It was not edited. The older batchdata.server.ts extractors also remain untouched.
- New src/lib/batchdata-recovery.ts preserves exact source paths, evidence kinds, retrieval times, source dates, all owner names, exact term months and separate active/historical lien rows. It deliberately does not infer identity or perform loan/equity calculations.
- Recovered per-lien currentEstimatedBalance and financingType were previously not retained. CurrentEstimatedInterestRate was already present but is now explicitly estimated, never a verified recorded current-loan rate.
- Permit samples contain only permitCount, allTags, tags, earliestDate, latestDate and totalJobValue. No nested event dates/descriptions exist in these samples. Tags do not establish diagnosis, completion, system age or an individual event.
- False flags and zero counts are populated evidence, not positive signals. A missing permitCount is not proof of zero permits.
- Recording/source-event dates are not evidence of current freshness. Undated loan estimates need a verified provider update timestamp and freshness policy before activation. Valuation source dates are retained; retrieval timestamps do not refresh stale values.
- There are 32 multi-lien responses. Only 6 contain estimated balances for every component, and all 6 aggregates match their estimated component sum. The other 26 cannot validate aggregate balance semantics. This is supporting evidence, not proof of a verified payoff or a guarantee for incomplete records. No aggregate-plus-component summation is performed.
- Open-lien interestRate, actual origination date, verified ARM initial fixed period/adjustment date and mortgage-insurance evidence are absent from the inspected active-lien schema. Historical interestRate and sale-associated rates cannot be promoted to current loans without reliable same-loan identity.

**Phase 1 result: isolated recovery and replay complete; production activation gate remains blocked by unresolved balance/freshness semantics. Phase 2 and Phase 3 have not begun.**

## Household / import audit (no data-model or production changes)

- Current per-book email-or-address dedupe can discard different properties of the same contact. No authorized household membership/unit identity layer currently exists. Existing contacts and records were not changed, merged, imported or enriched.
- Future work must preserve multiple contacts and distinct units, require explicit household/property confirmation, preserve assigned-book ownership, and enforce workspace/consent permissions before aggregating properties or equity.
- Before any production recovery of skipped CSV rows, supply the original CSV and authorize a reviewed, no-paid-lookup import; the stored Test Lab cannot reconstruct discarded contacts.
- Lender provider/permit leakage remains a Phase 2 task: lender-contact-card.tsx, opportunity rationale and API projections require a complete scope-aware fix, not removal of internal provenance.

## Lender signal readiness

| Signal | Readiness | Precise blocker |
|---|---|---|
| Verified refinance incentive | Blocked from recovered data | Only estimated active rates; no reliable same-loan recorded rate plus established terms/current balance. Existing mortgage-age and product safeguards must remain. |
| General mortgage review | Candidate only, not enabled | Needs verified freshness, household dedupe and existing access/suppression tests; never promise savings. |
| Specific ARM reset alert | Blocked | FinancingType is available but actual reset date/initial fixed period is absent. N/A index is not reset evidence. |
| Mortgage-insurance removal | Blocked | Loan type and estimated LTV alone do not establish MI, original value, servicer criteria or cancellation eligibility. |
| Existing junior-lien review | Candidate only, not enabled | Line flags/loan types exist, but position and current balance semantics need verification. |
| Newly detected junior lien | Blocked | Recording dates alone do not prove change; no reliable prior snapshot comparison. |

## Execution status

- No migrations or production record writes; property_intel, ATTOM, enrichment worker, billing and entitlements untouched.
- No provider calls, outreach, notification campaigns, or publication.
- Offline evidence output is temporary and private; this report contains aggregate counts only.
- Focused automated tests: 27 passed (8 new recovery safeguards, 17 existing mortgage-implied-value tests, 2 existing lender-mortgage facts tests); preview build OK. Offline replay covered all 206 stored attempts without provider or database writes.
- Household/card/reporting/permission/UI acceptance tests are not claimed passed: those phases remain gated.
