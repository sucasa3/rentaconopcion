# Agent Daily Intelligence — implementation plan

Presentation and orchestration only. No change to ranking, opportunity detection,
channel eligibility, permissions, entitlements or outcome logic.

## A. Components that change

- `src/components/agent-today.tsx` — restructured (the main work).
- `src/lib/agent-daily.ts` — add pure helpers: daily-read builder, "handled today"
  counter, service-language phrasing for the recommended play. Existing helpers stay.
- `src/lib/agent-daily.test.ts` — extend for the new pure helpers.
- `src/components/action-queue.tsx` — small additions only: accept an optional
  `excludeOpportunityIds` and `hideCounts` prop so the queue below Start Here does not
  repeat the same homeowner or repeat the temperature tiles. Ranking, cards, compose
  dialog, channel rendering and outcome logging untouched.
- `src/lib/nba.server.ts` — one small additive field (see D).
- `src/components/channel-actions.tsx` — unchanged.

## B. Existing data reused (nothing new invented)

From `getActionQueue`: `items[]` with `name`, `why`, `headline`, `ask`,
`categoryLabel`, `temperature`, `engagedRecently`, `engagementLine`, `channels`
(server-decided), `draftSubject`/`draftBody`, `phone`, `email`, `portfolioId`,
`clientId`, `lastOutcome`; plus `counts.hot/warm/nurture/engaged` and `yesterday`.

From `getBusinessOverview`: `counts.people`, `counts.activated`,
`counts.opportunities`, `books[0]`.

From `getMyBusinessTasks`: `openCount`.

## C. Best Move becomes "Start here"

Same object, same index: `items[cursor]`, cursor still starts at 0 and still advances
after an outcome. Ranking untouched — this is a heading, layout and copy change:
WHO / WHY NOW / HOW TO BE USEFUL (the existing agent recipe `headline` + `ask`) /
WHAT TO SAY (existing `draftBody` or headline) / permitted channels / outcome row.

## D. Removing duplication

Today currently shows the same person in Best Move, Next up and the full ActionQueue.
New hierarchy, each person appearing once:

1. Greeting + Daily Intelligence summary
2. SuCasa Daily Read
3. Start here (`items[cursor]`)
4. Next relationships — lightweight rows for `items` after the cursor (name, category,
   why, suggested play, permitted channel buttons, View homeowner)
5. Copilot search
6. SuCasa working for you (metrics + links to Opportunities / Tasks / My book)

The heavy `ActionQueue` block is no longer rendered a second time on Today; the
component keeps working and stays in use on the Opportunities workspace. Its new
`excludeOpportunityIds`/`hideCounts` props exist for that reuse. "Next relationships"
renders from the same query data, so no extra request.

## E. "Relationships handled today", truthfully

`buildActionQueue` already loads `opportunity_outcomes` (client id, stage, occurred_at)
for exactly this agent's visible clients. Additive change: return
`recentOutcomes: { clientId, occurredAt }[]` for the last 48 hours — no new table,
no new query.

The count of distinct clients whose `occurredAt` falls on today is computed in the
browser using the signed-in user's own device timezone, so no server-local-midnight
assumption is made. It counts across the book, not the current queue, so someone
correctly leaving the queue after being worked still counts.

Presented as two separate honest numbers, never "4 of 10":

- `4 relationships handled today`
- `6 relationships currently worth your attention`

## F. Metrics that can honestly back "SuCasa working for you"

- Homeowners monitored — `counts.people`
- Home Profiles activated — `counts.activated`
- Relationships worth attention today — distinct homeowners in the queue (the queue is
  already deduplicated to one item per homeowner)
- Homeowners engaged recently — `queue.counts.engaged`
- Signals detected — `counts.opportunities`, labelled as signals, never as listings
- Follow-ups due — tasks `openCount`

Signal counts and relationship counts get separate labels.

## G. Channels

Untouched. `item.channels` from the server is passed straight to `ChannelActions`,
which already renders every available channel, emphasises the recommended one and
explains unavailable ones. Start Here and Next relationships both use it.

## H. How this stays different from the lender page

Warmer language throughout ("worth your attention", "good reason to reconnect", "be
useful by"), the recommendation is expressed as a homeowner-service play from the
existing agent recipes, Hot/Warm/Nurture is de-emphasised to a small quiet label, and
the page keeps agent-only elements: Copilot search, Home Profiles activated, the
import/preparing/aha first-run states. No financial-institution framing, no equity
dollar hero, no compliance disclosure panel.

## I. Preserved as-is

Empty-book import state, preparing state, first-run "aha" moment, cursor advance,
outcome toasts and existing acknowledgement copy (upgraded visually to an inline
"✓ [Name] is handled for today" + real next-person line), Copilot search, all links.

## J. What the data cannot honestly support

- "Overnight" / "since yesterday" changes — no per-day change timestamps exist, so the
  copy says "monitoring" instead.
- "4 of today's 10 completed" — the queue is rebuilt dynamically with no stored daily
  cohort; two separate counts are used instead.
- Any likelihood-to-list or seller-intent number — not created.
