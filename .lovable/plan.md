# Lender experience: same power as the agent side, different permissions

Goal: a lender opens SuCasa and immediately knows who to contact today, why now,
what to say, and what happened after — but only for homeowners the lender has an
independent right to see.

## What already exists and gets reused

- Daily work queue (`ActionQueue`) already accepts `kind="lender"` and already
  has lender-specific plays, hot/warm/nurture, draft email, call/text, and
  one-tap outcome logging. Reused as-is with a lender wrapper.
- Ranking, temperature, outcome vocabulary, funnel rollup, tasks, CRM sync,
  Copilot search, opportunity detection, Value Engine, equity resolver: all
  shared. Nothing is rewritten.
- The lender command center (My Book / Homeowners Served / Permissioned
  Opportunities) stays and becomes the frame for the new sections.

## The access gate (the core new logic)

One shared classifier decides, per homeowner, what a lender may see:

- **Own relationship** — the lender uploaded them or has a documented basis.
  Full lender-side intelligence and named workflow.
- **Asked to connect** — homeowner affirmatively requested contact. Named, top
  of the queue, limited to the information they authorized.
- **Sponsored only** — lender funds Premium but has no relationship and no
  request. Never named, never in the queue, never in a brief. Counts only
  toward aggregate service-delivery numbers.
- **Agent-connected only** — invisible individually. An agent connection is not
  a data permission.

Every named surface (queue, book, detail, brief, CRM push, outreach draft)
passes through this gate on the server. Sponsorship never affects ranking.

## New lender surfaces

1. **Today**: Homeowners monitored · Changes detected · Review opportunities ·
   Asked to connect · Engaged this month · Tasks due, then "Who to contact
   today" with the shared hot/warm/nurture queue. The score is labeled
   **Contact Priority** — never a credit, approval or qualification score.
2. **Asked to Connect** queue at the top, with a REQUESTED CONTACT badge, what
   they asked about, when, and exactly what they authorized.
3. **Review opportunity cards**: equity review, mortgage checkup, refinance
   review, home-equity conversation, move planning, improvement planning,
   ownership anniversary, value milestone, equity milestone, property change.
   Each shows estimated value / equity / LTV / loan age, a "Why now" line, a
   suggested opener, and next best action.
4. **Homeowner detail (lender view)**: property snapshot, mortgage snapshot with
   every estimate labeled as an estimate, Why Now signals, engagement signals
   only where permitted.
5. **Generate Homeowner Review Brief** — lender sibling of the agent's listing
   brief: why now, data-backed signals, conversation opportunities, questions to
   ask, suggested call/email/text openers, next best action, compliance notes.
6. **My Book filters**: equity change, value change, mortgage age, engagement,
   tenure, recent property activity, projects, annual review due, opportunity
   type, last contact, contact priority.
7. **Service delivery**: Premium memberships active, reports delivered, data
   refreshes, alerts delivered, sponsor impressions, CRM syncs.

## Language rules enforced in code

Allowed: review, worth reviewing, estimated, may support a conversation.
Blocked everywhere: qualified, prequalified, approved, eligible, guaranteed
savings, preferred/recommended lender. A shared check strips these from AI
output before it reaches the screen.

## Fair-lending guardrails

Prioritization uses only property, mortgage, tenure and engagement facts. No
protected characteristics or demographic proxies, no approval/denial/credit
scores, no underwriting output. Sponsorship, agent connection and referral
activity are excluded from ranking inputs.

## Data changes

No destructive changes. Existing `relationship_basis` on book records is put to
work, backfilled to "own relationship" for records the lender already uploaded,
and consent records supply the other categories. Lender outcome logging reuses
the existing outcome tables and can never award agent credits or capacity.

## Tests

Automated tests cover the nine acceptance scenarios: lender-uploaded customer
visible, agent-connected homeowner hidden, sponsored-only homeowner aggregate
only, connection request unlocks the authorized view, agent and lender views
independent, equity opportunity never claims qualification, brief labels
estimates, sponsor change does not move ranking, closing a loan grants no agent
benefit.

Stripe pricing and plan commitments are untouched.
