# Correct the mortgage-implied valuation path

No Value Engine redesign. The shared canonical-facts architecture stays exactly as it is; the changes are inside the existing functions plus one small pure helper.

## How current vs. historical mortgage will be represented

One new pure module, `src/lib/mortgage-position.ts`, holding the shared vocabulary:

```text
lienStatus:
  confirmed_open    one or more current open liens on record
  likely_paid_off   zero open liens AND a closed/prior mortgage trail
  unconfirmed       zero open liens AND no mortgage history, or lag risk
```

The normalized mortgage object gains two clearly separated collections instead of one blended list:

- `liens[]` — current open liens only, sourced strictly from `openLien.mortgages`
- `history[]` — `mortgageHistory` records, evidence only, never promoted to liens
- `currentBalance` — from `openLien.totalOpenLienBalance` only
- `lienStatus` — computed by the new helper

No database or schema change; these are extra fields on the JSON already stored on the shared property record, so older records keep working (missing fields read as unconfirmed).

## Affected functions

**`src/lib/batchdata-normalize.ts` — `normalizeBatchdataProperty`**
Remove the `openLienRows.length ? openLienRows : historyRows` fallback. Build `liens` from open liens only, keep `history` separately, set `currentBalance`, and stop letting a historical loan amount stand in as the current balance.

**`src/lib/mortgage-position.ts` (new)**
`classifyLienStatus({ openLienCount, liens, history, lastSaleDate })` with a conservative 120-day recent-sale window that forces `unconfirmed`, and `mortgageImpliedValue({ openLienCount, currentBalance, ltv })` returning a value only when exactly one confirmed open lien, a current balance > 0, and a valid LTV are all present (LTV accepted as 20 or 0.20).

**`src/lib/value-engine.ts` — `buildValueCandidates`**
The `mortgage_implied` candidate calls the strict helper. Drops the `loanAmount` fallback. Its weight moves above recent sale so, when the strict conditions hold, it is the primary point estimate; sale and assessor candidates still corroborate confidence and widen/tighten the range but never replace it. When conditions fail, the existing fall-through is unchanged.

**`src/lib/equity.ts` — `resolveEquity`**
`freeAndClear` no longer comes from `openLienCount === 0` alone: it requires `lienStatus === "likely_paid_off"`. `unconfirmed` yields balance-unknown suppression, not full equity.

**`src/lib/valuation.server.ts` — `computeEquityRibbon`**
Passes current balance, lien status and last sale date through to the engine and equity resolver. `valueSource` stops collapsing to `"assessed"` and reports the real methodology (`avm`, `mortgage`, `sale`, `assessed`), matching `valueMethodology`.

**`src/lib/property-intel.functions.ts` — `getMyHomeIntel`**
The second, mortgage-blind `resolveHomeValue` call is removed. The homeowner's canonical `value` is read off the same equity ribbon result the equity figures come from, so HomeHero, equity, agent facts (`client-facts.server.ts`) and lender facts all resolve from one valuation.

**`src/lib/opportunities.ts`**
The free-and-clear play only fires on `likely_paid_off`, never on an ambiguous record.

## Tests

New `src/lib/__tests__/mortgage-implied-value.test.ts` plus additions to the value-engine tests, covering: $219,000 / 20% = $1,095,000; LTV as 20 and 0.20; one lien allowed; multiple, zero, history-only, missing balance, missing/invalid LTV all producing no implied value; historical paid mortgage never used as current balance; zero liens + empty history = unconfirmed, not free-and-clear; a sale inside 120 days suppressing the free-and-clear conclusion; and homeowner/agent/lender snapshots resolving to the same value and methodology for one BatchData record.
