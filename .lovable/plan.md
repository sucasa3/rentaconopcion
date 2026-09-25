# Signal Intelligence — audit and smallest safe first build

This is a review only. Nothing gets built or published until you approve the plan.

## What already works

- **Property changes (partly):** SuCasa already checks value, equity, cash-out room, mortgage rate, taxes, the last sale, permits and listing status. BatchData is the only live data source, and ATTOM is used only as older stored history. There are 33 saved value snapshots, so "value now versus before" can be worked out, but only for a few homes.
- **Activity inside SuCasa (partly):** Nine kinds of homeowner activity are recorded. Real activity so far: 659 value views, 208 equity opens, 20 refinance opens and 5 value refreshes. Selling-form answers and value requests also count, and older activity counts for less over time.
- **Messages (partly):** Email opens and clicks are tracked. Text replies and STOP / opt-out come back from GoHighLevel. Call outcomes and spoken or typed call notes, with next step and due date, are saved.
- **Signal engine:** There is one shared set of rules. It covers inspection findings, refinance, available equity, value movement, selling intent and a spike in activity. Opportunities cover 8 main types (equity 719, home condition 589, refinance review 537, and others).
- **Privacy rules:** Workspaces are kept separate. Agent and lender access are independent. Introductions follow a fixed order (anonymous count, agent offer, homeowner accepts, name revealed), and small groups stay anonymous (at least 5 homeowners). Contact permission is checked separately for each channel, and STOP / do-not-disturb and suppression rules are enforced before sending.
- **Homeowner alerts:** Alerts already exist (9 so far).

## What is missing or weak

1. **No weather feature.** No weather or storm alert service is connected anywhere in the app.
2. **No single history of signals.** The evidence is spread across about six places. A professional cannot scroll through every valid reason, filter it, or dismiss a wrong one. Today only shows the top reasons.
3. **Evidence isn't graded.** An email open counts about the same as a click or reply, and nothing screens out automatic opens by mail privacy features or link previews. Cards do not show the source and date of each fact, or how confident the reading is.
4. **Data source isn't labelled.** All 480 stored property records have no source recorded. So cards cannot say "BatchData, Sept 2026" versus "older ATTOM data."
5. **No clear sharing choice (unconfirmed):** I did not find one recorded, disclosed "share insights with my agent/lender" choice for each relationship. Today's access comes from relationship and portfolio status. I need to confirm this before any activity is shown to professionals in a new way.
6. **Missing inputs:** Purchase anniversary, annual review due, homeowner goals with a timeframe, and insurance/escrow changes are not turned into signals yet. Report downloads, questions and viewing a professional's page are not recorded.
7. **No feedback loop.** Professionals cannot say "this was missed" or "this wasn't helpful," and dismissed reasons can come back without any new evidence.

## Smallest safe first build (preview only)

A **signal history per homeowner**, built only from data SuCasa already has. There are no new data sources, no new calls to paid data providers, and no new sharing.

1. **Standard evidence records.** Every existing fact is shown in one consistent way:
   - **What it is:** a value change from snapshots, an activity event, a click or reply, a call note, a permit, a listing change.
   - **Details:** source, date, strength (strong / medium / weak) and whether it is estimated.
   - An email open alone always counts as **weak**. Opens a few seconds after sending, or from known link-preview tools, are marked as possibly automatic.
2. **"Signals" tab** on the homeowner detail page for Agents and Lenders:
   - Filters for topic, how recent and how strong.
   - Repeated events are grouped together.
   - Each item has **Dismiss** and **Not accurate** buttons. A dismissed reason stays hidden until new evidence arrives.
3. **Today cards get "why now" facts:**
   - The 2–3 supporting facts, each with source and date, and a confidence label.
   - How cards are ranked stays exactly the same.
4. **Access is checked every time the history is viewed:**
   - It uses the existing relationship, workspace, revoked-access and small-group rules.
   - Lenders who only sponsor still see anonymous counts only.
   - Anything that current permission doesn't clearly cover is left out.
5. **English and Spanish text** for the new tab and labels.
6. **Tests:**
   - Automatic opens rated weak.
   - Old values marked as outdated.
   - Duplicate events grouped.
   - Sponsor-only lenders see anonymous data only.
   - Workspaces stay separate.
   - Access that has been taken away is removed.
   - Dismissed items stay hidden without new evidence.
   - Example cards at low, medium and high confidence.

## Deliberately later (separate approvals)

- **Weather alerts** from the National Weather Service: storage, matching alerts to homes, homeowner alert and check-in, quiet hours.
- **Relationship-level sharing choice**, disclosed to the homeowner and recorded. This must come before any new activity is shown to professionals.
- Anniversary, review, goal and insurance/escrow signals, plus more activity events.
- Using professional feedback to change ranking.

## Technical details

- One read-only function (`*.functions.ts`) builds the evidence list. It draws from `home_value_snapshots`, `homeowner_activity_events`, `outreach_events`/tracked opens and clicks, GoHighLevel inbound messages, `professional_conversations`, `property_intel` (permits/listings) and `property_listing_status`. It is protected by the same checks used by the portfolio detail page.
- One small new table, `signal_feedback`, holds dismiss and "not accurate" feedback (org, client, signal key, evidence hash, reason). It is limited to the org's own members, with GRANTs and row-level security.
- `property_intel.source` gets filled for new BatchData records. Older rows are shown as "source unknown / historical." Older records are not changed.
- No changes to `signals.ts` ranking weights, `combineIntent` or the opportunity engine.
