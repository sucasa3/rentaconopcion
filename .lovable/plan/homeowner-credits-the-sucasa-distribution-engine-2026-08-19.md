# Homeowner credits: the SuCasa distribution engine

The free homeowner product stays free, but capacity becomes the currency. Agents hold a balance of homeowner credits — granted by a sponsoring lender, earned by working the platform, or bought — and every homeowner they add spends one. This turns the enrichment cost into something we meter, and turns agents into distributors.

Decisions locked from your answers: plans and limits are real but there is no checkout yet, a credit burns the moment a homeowner is added, earned credits never expire, and lender-sponsored agent seats become the headline unit while the existing per-client sponsored premium profile stays as a separate lender tool.

## 1. The credit ledger

Every agent org gets a running balance built from an append-only ledger, so any number on screen can be explained line by line.

- **Base grant** — 25 credits on org creation.
- **Sponsor grant** — a lender sponsoring an agent seat grants 25 or 50, depending on the lender plan.
- **Earned** — activity credits (below), permanent.
- **Purchased** — Agent Plus / Pro capacity while the subscription is active.
- **Spent** — one per homeowner added to the book; refunded if the client is removed within 30 days and never activated.

Balance = grants + earned + purchased − spent. Never negative: adding a client with zero remaining is blocked with an upgrade prompt, and bulk CSV upload imports up to the remaining balance and tells the agent exactly how many rows were held back.

## 2. Earning credits

Awarded once per homeowner per event, written by the same server paths that already record these things:

| Behavior | Credits |
| --- | --- |
| Homeowner activates their account | +1 |
| Home Profile completed | +1 |
| Agent engages the homeowner (intro, campaign, note) | +1 |
| Opportunity identified on that home | +2 |
| Lender opportunity engaged | +2 |
| Vendor / service request created | +2 |
| Opportunity progresses to an outcome | +3 |
| Referral or transaction recorded | +5 |

To keep it honest: awards are idempotent per (client, event), and only fire on real state changes — an activation credit needs a claimed homeowner account, not an invite.

## 3. Agent plans

| | Agent Core | Agent Plus — $20/mo | Agent Pro — $39/mo |
| --- | --- | --- | --- |
| Homeowner connections | 25 base + earned | +100 | +250 |
| Home Intelligence | Basic | Premium reports | Premium reports |
| Opportunity alerts | Yes | Yes | Advanced |
| Referral network | — | Included | Priority |

Positioned as capacity, never as software: the upgrade card reads "Unlock 100 more homeowners", not "upgrade your plan". Since there is no billing this phase, the upgrade button records interest and notifies us — the plan and its limits are otherwise fully real, so switching on checkout later is a wiring change, not a rebuild.

## 4. Lender side

Lender plans gain a **sponsored agent seats** number alongside the existing sponsored-profile allocation. In the lender network view they pick a connected agent and sponsor a seat; the agent immediately sees "25 homeowner credits sponsored by {lender}" and the lender sees seats used, agents activated, homeowners activated through those seats, and opportunities produced. Ending a sponsorship stops future grants and never claws back credits already spent — homeowner profiles are never deleted.

## 5. Gamification, kept tasteful

A **SuCasa Score** (0–100) on the agent dashboard blends activation rate, profile completeness, opportunity engagement, and recency across their book. It sits next to the credit balance with one honest sentence: "You've earned 47 credits this month." Below it, a short "ways to earn" list that doubles as a product tour, and a monthly recap of credits earned by source. Lenders see a leaderboard of their sponsored agents by homeowners activated — the one place ranking genuinely helps.

## Technical notes

- New tables, each with grants, RLS and policies in the same migration: `agent_credit_ledger` (org_id, kind, delta, reason, portfolio_client_id, event_key unique for idempotency, created_at), `agent_credit_awards` rules held in code rather than data, `agent_plans` (org_id, plan_key, status, capacity, requested_at), and `sponsored_agent_seats` (sponsor_org_id, agent_org_id, credits_granted, status, started_at, ended_at). `plan_tiers` gains `sponsored_seats` and rows for `agent_plus` / `agent_pro`.
- Balance is a security-definer function returning grants/earned/purchased/spent for an org, so no view recomputes it. A single client-safe module holds the credit weights and score math, shared by dashboard copy and server enforcement — same pattern as `src/lib/engagement.ts`.
- Enforcement lives in the data layer: adding a client goes through a server function that checks the balance and writes the spend in the same transaction; a trigger on `lender_portfolio_clients` blocks direct inserts past the cap. Bulk upload calls the same path per row.
- Awards are emitted from existing server paths (activation, profile save, opportunity compute, introduction outcome, service request creation) via one `awardCredit(orgId, clientId, eventKey)` helper that no-ops on duplicate keys.
- Existing orgs are backfilled with a base grant plus earned credits reconstructed from current state, so nobody logs in below their current client count.

## What I'd flag

- **Credit-on-add punishes bad lists.** An agent who imports 25 cold contacts burns the whole grant on people who may never activate. The 30-day unactivated refund softens this, and I'd surface it clearly at import time so nobody feels cheated.
- **Earned credits are a cost commitment.** Every earned credit is a future enrichment bill. Once we have a few weeks of real per-profile cost, the weights table should be revisited before we publish them externally.
- **Don't ship the leaderboard to agents.** Ranking agents against each other publicly tends to backfire in real estate; keep it lender-facing.
