# Stage 1 — Production-economics test (10 homeowners, BatchData only)

A controlled 10-property run inside the existing isolated Test Lab, measuring the true cost and call count to build one production-quality SuCasa home profile, plus a mortgage-derived implied value experiment. No ATTOM calls, no changes to production data flow.

## Sample

Your uploaded file has 18 contacts; 17 have a usable address (one has none and is skipped). Stage 1 uses the first 10 usable addresses, deliberately mixed: metro Atlanta suburbs, a condo/apartment unit, a lot-numbered record, plus the two out-of-state homes (La Vergne TN, Maywood IL) so we see coverage outside Georgia.

Each address is checked against prior test results first; anything already fetched is either swapped for an untested address or clearly labelled as a warm record, so the "cold enrichment" number stays honest.

## What gets built

1. **Per-call audit log.** Extend the test result rows so every single HTTP request writes its own row with: property ID, normalized address, endpoint, request number, HTTP status, matched/no-match/failed, latency, fields returned, fields SuCasa actually uses, necessary yes/no, "data already present in an earlier response" flag, cache hit/miss, and any cost/credit figure BatchData returns in the response or headers.
2. **Cost meter.** Capture whatever cost signal the provider exposes (response body, headers) rather than only the flat 10-cent estimate. Wallet balance before and after is recorded if the API or your dashboard exposes it; if it does not, the report says "not measurable" instead of guessing.
3. **Hard stops.** Cap of 10 properties, one call per property, retries disabled, immediate halt on any payment/quota/rate error. The run cannot spend more than roughly $2 at the current estimate.
4. **Implied-value module.** A separate calculated field `batchdata_implied_value` stored alongside — never overwriting — the raw response, with the exact inputs and method stored for audit.
5. **Report views + CSV export** for the per-call log and the per-home summary.

## Implied value logic

Before any arithmetic, the raw mortgage block of each response is inspected to establish which balance the returned LTV corresponds to (open-lien balance, first-mortgage balance, original amount, combined). Pairing is decided from the actual response structure across the 10 records, not assumed.

- Value = corresponding balance / (LTV / 100). Never divide by zero or a missing figure.
- If the pairing cannot be established with confidence, the record is marked UNVERIFIED, the raw fields are reported, and the plan states exactly what to confirm with your BatchData rep.
- First-mortgage LTV and CLTV are calculated and reported separately; balances are never summed unless the response structure supports it.
- Implausible outputs are flagged for review, not displayed.
- Source is labelled internally as "BatchData Mortgage-Derived Implied Value"; homeowner-facing wording would be the neutral "Estimated Home Value". It is never described as a provider AVM.
- Where an implied value exists, the test environment may use it for equity/LTV/cash-out signals — labelled as derived, and never re-presented as independent confirmation of the original LTV.

## Reports produced

**Per homeowner:** total/successful/failed/duplicate calls, availability of property, owner, tax, mortgage/lien, valuation, sales history, permits; equity/LTV calculable; opportunity signals generated; estimated cost; usable SuCasa profile yes/no.

**Stage 1 summary:** total calls, average and median calls per homeowner, success %, match %, mortgage %, valuation %, equity/LTV calculable %, permit %, opportunity-generation %, wasted calls, total spend, average initial-enrichment cost, cost per enriched homeowner, cost per actionable homeowner, wallet start/end/reduction where measurable.

**Implied-valuation table:** address, balance used, LTV used, implied value, calculation successful, confidence/status, existing stored benchmark value (offline only, from data we already hold — no new paid calls), variance %, notes. Variance grouped into 0-5 / 5-10 / 10-15 / 15-20 / 20%+ bands, with implied-valuation coverage = successful implied values ÷ matched properties, plus median and average implied value and the multiple-lien share.

**Waste analysis:** every call that looks unnecessary or could be consolidated, cached, or served from data already present in another response. Findings only — no production change.

**Incremental valuation cost:** confirmation of whether the implied value needs any call beyond the mortgage/bundled lookup already being purchased, targeting $0 incremental.

## Monthly refresh analysis

Every field we collect is categorized A (initial only / rarely changes), B (monthly refresh for lender opportunity detection), or C (event-driven), followed by the minimum calls needed to monitor an already-enriched homeowner each month. Produces: initial calls and cost per homeowner, and monthly calls and cost per homeowner.

## Plan economics

Using measured initial and recurring costs, project provider COGS at 250 / 1,000 / 5,000 / 10,000 / 25,000 profiles, for the first (full-enrichment) month and a normal recurring month. Add $10/month platform reserve per paying account, and show gross profit and gross margin against MLO $79/250, Growth $149/1,000, Branch $499/5,000, Branch Pro $799/10,000, Network $1,499/25,000 — both months shown side by side.

## Guardrails

- Zero ATTOM calls; the ATTOM path stays untouched and remains disabled.
- Writes only to the isolated test tables. Nothing touches property records, the enrichment queue, or homeowner-facing data.
- Production valuation logic is unchanged. Optimizations are recommended, not applied.
- Stage 2 (the further 15 properties) does not run without your explicit approval.

## Sequence

1. Build the audit fields, cost meter, implied-value module and reports.
2. Confirm the 10 selected addresses back to you.
3. Wait for your go-ahead before a single provider call is made.
4. Run, then report and stop.
