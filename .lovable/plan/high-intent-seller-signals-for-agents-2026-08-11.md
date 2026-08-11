# High Intent Seller signals for agents

Yes — and we're most of the way there. The agent portfolio already computes a **Move intent** score (Hot 60+, Warm 38–59, Nurture 18–37, Hold) from property signals: expired/withdrawn listing, tenure, equity, recent permits, tax jumps, absentee owner, outgrown home.

What Fello has that we don't is the **behavioral half** — what the homeowner actually did in the last few weeks. Today the only behavioral data we keep is a single `last_activity_at` timestamp on the profile. Nothing records that someone checked their home value three times this month, opened an equity panel, or asked about selling. That's the missing piece, and it's the strongest tell in Fello's model too.

## What gets built

### 1. Homeowner activity events

Start recording lightweight, timestamped events from the homeowner dashboard:

- Home value viewed / refreshed
- Equity panel opened, refi options opened
- Home Score or maintenance timeline opened
- Document uploaded, maintenance item marked done
- Service request submitted
- Campaign email opened or clicked (we already receive send status)

Events are the homeowner's own data — they see and control it, and only their own agent's org can read the derived score, never a raw activity log.

### 2. A "Thinking of selling?" signal capture

Two explicit intent forms on the homeowner dashboard, framed as help rather than lead capture:

- **What's my home worth?** — a value-check request
- **Thinking about selling?** — timeframe (now / 3–6 mo / 12 mo / just curious) plus an optional note

An explicit submission is the single highest-weight signal in the model, the same way it is in Fello.

### 3. Engagement score feeding Move intent

A behavioral score computed over a rolling 30-day window, added to the existing property score:

| Behavior | Weight |
| --- | --- |
| "Thinking of selling" form, near-term timeframe | 35 |
| Home value / cash-offer style request | 25 |
| 3+ value or equity checks in 14 days | 25 |
| 2 value or equity checks in 14 days | 12 |
| Campaign email clicked (value or equity content) | 10 |
| Any dashboard session in last 7 days | 5 |
| **Signal clustering bonus** — 3+ distinct signal types within 14 days | +15 |

Recency decay: anything older than 30 days counts at half weight, older than 90 days drops out. Intent goes stale fast — that's the whole point.

### 4. High intent band and agent surfacing

- New top band: **High intent** at 75+ combined, requiring at least one behavioral signal. Property signals alone can reach Hot but never High intent — that distinction is what keeps the band trustworthy.
- The agent portfolio list gets a High intent pill and a sort option; the client drawer shows the behavioral signals in plain language ("checked their home value 3 times in the past 9 days", "asked about selling — 3–6 month timeframe").
- The agent Client activity feed gains a **High intent** tab that fires when a client crosses into the band, reusing the existing seen/reviewed "New" marking.
- Intent explainer popover updated with the new band and the fact that behavior drives it.

Compliance carries over unchanged: a home listed with another agent stays in quiet mode and scores zero regardless of behavior.

### 5. Lender side

High intent is a seller signal, so it stays agent-facing. Lenders continue to see de-identified opportunity categories only — no behavioral detail, no change to the reveal rules.

## Technical notes

- New table `homeowner_activity_events` (homeowner_id, event_type, context jsonb, occurred_at) with grants, RLS, and policies in the same migration: homeowners insert and read their own; agents read nothing directly. New table `seller_intent_submissions` for the explicit forms, same pattern.
- A security-definer function returns per-portfolio-client engagement aggregates (counts and last-seen per event type) so agents get the score without ever reading a raw activity log. Client match is via the existing `lender_portfolio_clients.homeowner_id` link — clients with no claimed homeowner account simply score on property signals only, as they do today.
- Scoring math lives in a client-safe module beside `computeMoveScore` in `src/lib/agent.server.ts`, so the band logic and the explainer copy never drift apart.
- Event writes are fire-and-forget from the dashboard through a server function; no ATTOM calls and no added data cost.

## What I'd flag

- **Coverage depends on homeowner accounts.** Behavioral signals only exist for portfolio clients who have claimed a SuCasa dashboard. For an agent's cold book, this changes nothing until clients are invited — worth pairing with an invite push.
- **Disclosure.** The homeowner dashboard should say plainly that their agent can see engagement-based intent. Cleaner posture than Fello's, and cheap to add now.
