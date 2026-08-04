# Expand "Referral activity" into a full client-touchpoint feed

Short answer: yes, it can be done, and it makes the widget much more useful. Today the panel only lists service jobs linked homeowners placed. Two other signals already exist in the data and can join it:

- **Recommendations that are due** — maintenance/repair items pulled from a linked homeowner's uploaded inspection report (system, urgency, recommended action, matching service category). These are stored per homeowner and are not yet surfaced anywhere in the agent view.
- **What has already been communicated** — homeowner campaign sends (which campaign, when, delivery status) recorded per client. This lets an agent see "value update was emailed 6 days ago" instead of guessing.

Only clients whose record is linked to a SuCasa homeowner account will have recommendations; campaign sends exist for any client the agency has activated a campaign on.

## The change

Rename the widget to **Client activity** with three tabs:

1. **Referrals** (current content, unchanged) — service jobs, status, date.
2. **Recommendations due** — open, high/medium-urgency items from linked homeowners' inspection findings that have no matching service job yet. Each row: client name, system (e.g. Roof), urgency chip, recommended action, matching service category.
3. **Communicated** — recent campaign sends for this book: client name, campaign name, channel, sent date, status (sent / scheduled / failed).

Summary line at the top of the widget: `X open referrals · Y recommendations due · Z touches in last 30 days`.

In the client detail drawer, add the same two sections under the existing referral list so a single client's full touch history is visible in one place.

## Technical details

Backend — `src/lib/agent.functions.ts`, inside `getAgentPortfolioDetail`:

- Query `home_inspection_findings` (admin client, same pattern as the existing referral query) for the portfolio's `homeowner_id` list, selecting `user_id, system, condition, urgency, recommended_action, recommended_category, created_at`. Keep urgency high/medium, drop items whose `recommended_category` already matches an existing service request for that homeowner, cap at 3 per client.
- Query `campaign_sends` filtered by `portfolio_client_id in (client ids)`, selecting `campaign_id, portfolio_client_id, subject, status, scheduled_for, sent_at`, joined to `campaigns(name, channel)`, ordered newest first.
- Attach `recommendations` and `touches` arrays per client alongside the existing `referrals`, and return flattened `recommendation_feed` and `touch_feed` (12 each) plus summary counts `recommendations_due` and `touches_30d`.

Frontend — `src/routes/_authenticated/agent/portfolio.$id.tsx`:

- Replace the single referral list with a `Tabs` block (existing shadcn `Tabs`) holding the three feeds; keep the current row styling and empty states.
- Add the two extra sections to the client drawer below the referrals block.

No schema changes, no new tables, no migration.

## Verify

- Build/typecheck pass.
- Open the agent portfolio: the widget shows three tabs; Referrals matches today's list; Recommendations and Communicated populate for linked clients and show clean empty states otherwise.
