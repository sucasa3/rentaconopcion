# Fewer property-data calls per home

Goal: keep every current feature, but pull the smallest set of records per address so we can scale to many more homeowners, agents and lenders on the same monthly allowance.

## What the code does today

- The property-data layer supports nine record classes with per-class caching and a monthly budget cap.
- The homeowner dashboard requests six classes on load: valuation, profile, assessor/tax, sale history, mortgage, permits.
- The background queue requests five per client: profile, assessor/tax, sale history, mortgage, valuation.
- The agent portfolio refresh requests seven, including owner records.
- Assessor/tax is currently a hard dependency in two places: the fallback "estimated value" when no valuation exists, and the assessed/tax card.
- Sale history is a dependency for tenure, gain-since-purchase and the close-date fallback in the queue.

## The new call policy

**Always pull (the core four)**
1. Property profile — base attributes for every UI.
2. Valuation — homeowner value, equity, refi targeting.
3. Mortgage — lender tie-ins, equity math.
4. Building permits — renovation/upsell signals.

**Pull only when the answer is actually needed (conditional)**
- Sale history: only when the profile record does not already carry the last sale, or when a screen shows the multi-sale chain (agent net-proceeds, tenure history). Never in the routine homeowner load once last sale comes from the profile.
- Assessor/tax: only when (a) valuation returned nothing for that address and we need the assessed fallback, or (b) a screen shows multi-year tax history. Not part of the default queue set.
- Owner records: only for investor / multi-property scenarios — dropped from the agent refresh default.

**Verification step first.** Before removing sale-history and assessor calls from the default paths, capture one live profile response for a known address and confirm which fields it carries (last sale date/price, APN, assessed value). The reduced sets ship only for the fields that are confirmed present; anything missing stays a conditional call.

## Efficiency work beyond the endpoint list

- **Derive, don't re-fetch.** Store last sale and assessed value extracted from the profile record into the cached property row so downstream code reads them without a second class.
- **One shared cache per address.** Already keyed by normalized address; keep enforcing it across homeowner, lender and agent paths so the same home is never bought twice.
- **Longer holds on static data.** Profile and assessor records effectively never change between sales — hold them indefinitely and only re-pull when a new sale appears. Sale history moves to a yearly window; permits quarterly; valuation stays the only monthly-ish refresh.
- **Engagement-tiered valuation refresh.** Monthly for active homeowners/opened clients, quarterly for dormant ones, on-demand only for the rest.
- **Address validation before spend.** Keep routing unresolvable addresses to "needs review" instead of retrying.
- **Budget split unchanged:** background work halts at the soft cap; on-demand user requests keep working.

Expected effect: routine homeowner load drops from six records to four (and to one or two once cached); background enrichment per new client drops from five to four with two of those bought once for the lifetime of the address.

## Technical notes

- `ATTOM_TTL_DAYS` in `src/lib/attom.server.ts`: profile/assessor become effectively permanent (re-pull triggered by a new sale, not by age), sales 365, permits 90, valuation tiered by engagement.
- `HOME_INTEL_CLASSES` in `src/hooks/use-home-intel.ts` reduces to the core four; `getMyHomeIntel` in `src/lib/property-intel.functions.ts` adds conditional follow-up pulls for assessor (only when valuation is empty) and sales (only when the profile lacks last sale).
- `DEFAULT_CLASSES` in `src/lib/enrichment.server.ts` becomes the core four; the queue's close-date fallback reads last sale from the profile-derived field, with a sale-history pull only when it is absent.
- `enrichPortfolioFromAttom` / agent refresh in `src/lib/agent.functions.ts` drops `owner` and `tax` from its default class list; owner stays available behind an explicit investor lookup.
- `extractDetail` in `src/lib/valuation.server.ts` gains `lastSaleDate`, `lastSaleAmount`, `apn` and `assessedTotal` when the profile payload carries them; `resolveHomeValue` reads the profile-derived assessed value before deciding it needs an assessor call.
- Confirm endpoint paths against the provider's current spec while touching `ENDPOINT_PATHS` (mortgage and permits paths differ between their note and our constants); fix only if a live call proves the current path wrong.
- No UI copy changes and no vendor name anywhere in the interface.
