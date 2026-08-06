# Why "Recommendations due" is empty — and how to fill it

## What I found

The tab isn't broken; it has nothing to draw from. Today it is built from **inspection-report findings**, and those only exist when a homeowner has created a SuCasa account, linked to the agent's client record, and uploaded an inspection report.

Checked against the live data:

- 76 client records across the agent portfolios — **0** are linked to a homeowner account
- **0** inspection findings in the system (no reports uploaded yet)
- **0** campaign sends recorded, so the Communicated tab is empty for the same reason
- Meanwhile, **17 properties already have permit history cached** from property records, including year built, permit type, and permit dates

So the signal that could power recommendations is already sitting in the property data — it just isn't being read.

## What to build

### 1. Property-level "Home needs" (no homeowner account required)

Derive the next likely need from the property record itself, using the same component-lifespan logic the homeowner dashboard already uses:

| Component | Expected life | Clock resets on permit matching |
| --- | --- | --- |
| Roof | 25 yrs | roof |
| HVAC | 15 yrs | hvac / furnace / AC |
| Water heater | 10 yrs | water heater |
| Windows | 25 yrs | window |
| Electrical panel | 30 yrs | electrical / panel / service upgrade |
| Siding & exterior paint | 12 yrs | siding / stucco / paint |

Each component starts at year built and resets when a matching permit is found. Anything past its expected life is **Overdue**, within two years is **Due soon**. Only overdue and due-soon items surface in the tab, capped at the three most urgent per household.

Each row shows the home, the component, why it's flagged ("Roof installed 1998, past 25-year life" or "HVAC replaced 2011 per permit"), and the service category so the agent can hand it to SuCasa or their own vendor.

### 2. Recent permit activity as its own signal

A permit pulled in the last 18 months (addition, remodel, kitchen, bath) is a strong pre-listing signal. Surface those as "Recently improved" rows so the agent can follow up with a value-add conversation.

### 3. Keep inspection findings, layered on top

When a homeowner account is linked and a report exists, those findings still take priority and show as a higher-confidence source. Each row is tagged **From inspection report** or **From property records** so the agent knows how firm it is.

### 4. Suppress what's already handled

A recommendation disappears when there's a matching service job in the referral feed, or when the matching campaign has already gone out to that client — no repeating a nudge the client already received.

### 5. Honest empty state

When a household has no permit history and no year built, say so and offer the "Retry pulls" action, instead of showing a blank tab.

## Technical notes

- Move the lifespan table out of `maintenance-timeline-panel.tsx` into a shared `src/lib/maintenance-rules.ts` so the homeowner dashboard and the agent feed compute identically.
- In `getAgentPortfolio` (`src/lib/agent.functions.ts`), the cached `property_intel` rows already loaded for value/equity get run through the rules to produce property-level needs — no extra data pulls, no extra cost.
- Merge order per client: inspection findings first, then property-record needs, then recent-permit signals; dedupe by service category and cap at three.
- `recommendations_due` in the summary counts the merged list. The client drawer and the Recommendations tab both read the same merged shape, with a `source` field driving the badge.
- Lender dashboards are untouched.
