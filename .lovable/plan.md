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

## Opens and clicks (engagement tracking)

Yes — but it needs one addition. Today the send record only stores whether SuCasa handed the message to the sending platform (`scheduled` / `sent` / `failed`); nothing records what the client did with it, and no webhook currently listens for email events. Open and click tracking is produced by the sending platform, so it has to be fed back in.

The addition:

- Migration: add `delivered_at`, `opened_at`, `clicked_at`, `open_count`, `click_count` to the campaign send record.
- New public webhook route `src/routes/api/public/ghl.email.ts` — HMAC-verified with the existing `GHL_WEBHOOK_SECRET`, same pattern as the billing webhook. It matches the incoming event to a send record (by contact id + campaign tag, stored at send time) and stamps the delivered/opened/clicked fields.
- Requires a workflow in the sending platform that posts email delivered/opened/clicked events to that URL — a one-time setup on your side; without it the columns simply stay empty and the feed shows "Sent".

UI effect in the Communicated tab: each row shows a status chip progressing `Scheduled → Sent → Delivered → Opened → Clicked`, with the relative time of the latest event ("Opened 2 days ago"). Clients who opened but never replied become the natural follow-up list, and the widget summary gains an `N opened` count.

Caveat worth knowing: open tracking relies on a tracking pixel, so Apple Mail Privacy Protection and similar tools inflate or suppress opens. Clicks are the reliable signal; opens are directional.

## Scope

- Recommendations + communicated feeds: no schema change.
- Open/click tracking: one migration plus one webhook route, and a workflow set up on the sending platform side.

## Verify

- Build/typecheck pass.
- Open the agent portfolio: the widget shows three tabs; Referrals matches today's list; Recommendations and Communicated populate for linked clients and show clean empty states otherwise.
- Post a signed test event to the new webhook and confirm the matching send row flips to Opened in the Communicated tab.

