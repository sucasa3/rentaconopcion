# Signal Intelligence: revised first build (plan only)

Nothing gets built, no tables are created, no data provider is called and nothing is published until you approve this plan.

## Exact scope

1. **Signal history.** A read-only "Signals" tab on the homeowner detail page, for both Agent and Lender. It shows only evidence types that are already permitted for that specific relationship.
2. **Supporting facts on Today cards.** Eligible Today cards get 2–3 supporting facts, each with its source and the date it was observed. Card order does not change.
3. **Feedback.** Two buttons on each signal: **Dismiss** and **Not accurate**. Feedback is saved per organization, through a separate write path that checks access again.
4. **Labels** in English and Spanish.

**Not changing:** Today ranking weights, `combineIntent`, the opportunity engine, weather, new data sources, new tracking, and existing contact rules.

## Evidence-type permission table

"Allowed now" means this relationship can already see this kind of fact on today's screens. Anything else is left out until the homeowner makes a recorded sharing choice.

| Evidence | Agent (own relationship) | Lender: own relationship | Lender: homeowner asked to connect | Sponsor-only / agent-connected lender |
|---|---|---|---|---|
| Property facts already shown (value, equity, mortgage, tax, permits, listing status) | Allowed (same fields as today) | Allowed, within scope (valuation, mortgage, equity, property details) | Only the scopes the homeowner granted | Anonymous counts only |
| Value change between saved snapshots | Allowed (value is already shown) | Allowed if valuation is in scope | Only if valuation was granted | Anonymous counts only |
| Homeowner activity (value/equity/refinance views, uploads, service requests) | **Left out, needs a decision** (see U1) | Only if engagement was granted, shown only as the existing one-line summary | Only if engagement was granted, same summary | Never |
| The homeowner's own request to this professional (selling form, value request, connection request) | Allowed (already shown for this relationship) | Allowed for requests made to this lender | Allowed | Never |
| Email opens and clicks on this organization's own messages | **Left out** (see U2) | **Left out** | **Left out** | Never |
| Text replies to this organization's own messages | **Left out** (see U2) | **Left out** | **Left out** | Never |
| STOP / opt-out status | Shown only as "can't contact by text", never as a signal | Same | Same | Never |
| This organization's own call notes, outcomes and next steps | Allowed (already shown to this organization) | Allowed | Allowed | Never |
| Documents, inspection findings, service-request details | Left out | Left out | Left out | Never |

Rules applied every time the history is read: the same organization checks as the detail page, revoked relationships return nothing, the small-group anonymity minimum of 5 stays in place, and each contact channel keeps its own gate.

## Provenance rules

- Each fact shows **source · observation date**. The date comes from the record itself: when the value was taken, when the permit was recorded, when the event happened. It is never the date the card is opened.
- **BatchData** is shown only when the record says `source = batchdata` and has a BatchData enrichment timestamp. Otherwise the label is **"Historical · source unknown"**. Old records are not changed or relabelled.
- **Stale:** a value more than 90 days old, or any property record flagged as outdated in the existing data, is marked "May be out of date."
- **Estimated:** values, equity, loan balance and loan-to-value are marked "Estimate." Equity that assumes no mortgage (because none was found) is marked "Estimate · no active loan found."

## Evidence strength (fixed rules)

- **Strong:**
  - The homeowner's own explicit request.
  - A logged call outcome or next step from this organization.
  - A recorded property change such as a sale, listing change or permit, with a date.
- **Medium:**
  - A value change of 5% or more between two saved snapshots at least 30 days apart.
  - A tax or assessment change.
  - Grouped homeowner activity, where engagement is allowed: 3 or more views in 14 days.
- **Weak:**
  - A single activity event.
  - A value change under 5%.
  - Any stale or "source unknown" fact.
  - Any estimate that isn't backed by a second fact.

Email opens aren't in this first build. When they are added later, an open alone is always weak, and opens within 60 seconds of sending, or from known image proxies or link-preview tools, are labelled "may be automatic." That label means likely, not certain.

## Overall confidence (a separate label, not a score)

- **High:** at least one strong fact, plus one more independent fact that is not stale.
- **Medium:** one strong fact, or two independent medium facts.
- **Low:** everything else.
- **Conflicting evidence:** if facts disagree (for example a listing marked sold while the value is from before the sale, or two different loan balances), confidence drops one level and the card says "Conflicting information."
- **Too little evidence:** if there is only one fact, the card says "Limited evidence."
- A weak fact can never raise confidence to High on its own.

## Feedback rules

- Each item has a stable signal key, made from the signal type, the homeowner and an **evidence version**.
- The evidence version is built from the sorted record IDs and observation dates behind the signal. It ignores wording, formatting and the date the card was opened, so refreshing or re-reading the page doesn't change it.
- Dismiss and Not accurate apply to the **whole organization**. The item stays hidden while the evidence version is unchanged.
- It comes back only when there is **genuinely new evidence**: a new record with a later observation date, or a new strong fact. Re-reading the same data, or a refresh that returns the same values, does not bring it back.
- The history builder is read-only. Feedback goes through a separate server function that checks organization membership and the relationship's current access again when the feedback is submitted.

## Data and UI changes

- **New table `signal_feedback`:**
  - Columns: organization, homeowner client, signal type, evidence version, action (dismiss / not accurate), optional note, who, when.
  - One row per organization, homeowner, signal type and evidence version.
  - Access is limited to members of that organization, with row-level security and grants.
- **Read-only function `getSignalHistory`:**
  - It works from the relationship's access result and pulls only the permitted evidence types.
  - It uses the existing tables: snapshots, `property_intel`, `property_listing_status`, activity only where allowed, requests, and `professional_conversations` / outcomes.
- **Write function `submitSignalFeedback`**, with access checked again.
- **UI:**
  - A "Signals" tab with filters for topic, how recent, strength and confidence. Repeated events are grouped.
  - Each item shows its facts with source and date, a confidence label, and Dismiss / Not accurate buttons.
  - Today cards get a supporting-facts area; their order does not change.
- English and Spanish text for every new label.

## Tests

- **Automatic opens** (for the later email phase): the rule function marks an open alone, or an open within 60 seconds, as weak or possibly automatic, and never High.
- **Stale values:** a value more than 90 days old is marked stale and counts as weak.
- **Grouping duplicates:** repeated events are grouped, and independent reasons stay separate.
- **Sponsor-only:** a sponsor-only lender gets anonymous counts only, with no individual rows.
- **Workspace separation:** another organization's evidence and feedback never appear.
- **Revoked access:** after access is revoked, the history is empty and feedback is refused.
- **Dismissal:** the same evidence version stays hidden, and a newer observation brings the item back.
- **Confidence examples** at low, medium and high, plus conflicting and limited evidence.
- **Detail page doesn't grant everything:** an agent and a lender without engagement scope who can open the detail page still get no activity items, email events or text replies.
- **Provenance:** a record with no source shows "Historical · source unknown," and the date shown is the observation date, not the date viewed.

## Decisions I need from you

- **U1: agent access to homeowner activity.** I couldn't confirm from the code whether agents currently see homeowners' SuCasa activity through a recorded, disclosed permission. Proposed: leave it out of the agent history until the homeowner sharing choice exists. Alternative: show only the one-line activity summary already on today's screens.
- **U2: email and text engagement.** Open, click and reply tracking exists, but no recorded homeowner choice covers showing it as signals. Proposed: leave all of it out of this build.
- **U3: thresholds.** Please confirm, or give your own numbers: stale after 90 days, a 5% value change as medium, grouped activity at 3 events in 14 days, and 60 seconds for possibly automatic opens.

## Assumptions I couldn't verify

- The lender baseline scope does not include engagement. I confirmed this in the access rules.
- I have not confirmed that every agent screen that shows activity checks the same rules. I'll check this before building.
- All 480 stored property records currently have no source recorded, so older facts will show "Historical · source unknown" until new BatchData records are saved.
- How accurately automatic email opens can be detected is unknown. They'll be labelled "may be automatic," never "confirmed bot."
