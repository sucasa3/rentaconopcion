# Agent Portal — Phase 1 (listing intelligence, not a CRM)

## MLS: what's realistic

MLS data cannot be centrally licensed and resold. Access is per-board, per-agent, under a data license (IDX / RESO Web API), and each agent's brokerage credentials govern what may be displayed and to whom. So SuCasa should not try to hold one MLS feed.

Three tiers, in order of practicality:

1. **Public record (available today, no license).** ATTOM already gives recorded sales, deeds, mortgages, permits, tax/assessment and AVM. This tells us tenure, equity, appreciation, and recent-work signals — the substance behind "why call this person today."
2. **Fello listing events (available today via the existing webhook).** Fello reports when a contact's home goes on market, goes under contract, or the listing expires — including when it's listed with a different agent. That is the highest-signal event an agent can get about a past client, and we already have `fello_events` receiving webhooks.
3. **Per-agent MLS connection (later, optional).** Design the data layer so an agent can attach their own IDX/RESO credentials for their own board, feeding the same normalized "listing status" record. No rewrite required if we model it as one status table with a `source` column now.

## The line we hold: not a CRM

SuCasa does not manage the agent's contacts, pipeline stages, tasks, GCI forecasts, or leaderboards. Their CRM (GHL, Follow Up Boss, kvCORE) does that. SuCasa answers one question: **who among your past homeowners has something happening right now, why it matters, and what to say.** Every insight is exportable/pushable to their CRM rather than duplicated inside SuCasa. That means from the ChatGPT list we build the homeowner intelligence, opportunity signals, and message generation — and we skip GCI pipeline math, task management, gamification, and referral revenue accounting.

## What the agent dashboard shows

**1. Today's signals (the landing view)**
A ranked list of past clients with a live reason to reach out, each row: client name, address, the signal, the supporting numbers, and one-tap call / email / generate-message. Signal types in Phase 1:

- Listed with another agent (from Fello) — a win-back moment
- Listing expired or withdrawn (from Fello) — the single best re-list conversation
- Listing signal from public record: high equity + long tenure + strong appreciation
- Recent major permit (renovation done → value story)
- Purchase anniversary / annual home review due

**2. My homeowners**
Same portfolio table pattern as the lender view, with agent-relevant columns instead of loan columns: estimated value, equity, tenure, last sale price and date, tax, listing status, move score. Clicking a client opens the detail dialog with talking points and contact actions.

**3. Move score**
One 0–100 number per homeowner, derived from equity %, tenure, appreciation vs. neighborhood, permit activity, and listing events. It replaces the lender's refi signal and drives the ranking in Today's signals.

**4. Agent campaigns**
The existing campaign engine, filtered to the agent-flavored catalog (home value update, anniversary, market snapshot, post-renovation value, expired-listing re-engagement) with the agent's branding as sender.

Deferred to a later phase: marketing asset generation, referral network tracking, engagement score, business snapshot metrics.

## Technical approach

- Reuse `lender_orgs.org_type` (already `lender | agent`) rather than new org tables. Agent members, portfolios, and clients all reuse `lender_portfolios` / `lender_portfolio_clients`; the portal differs by org type, not by schema.
- New table `property_listing_status` keyed by portfolio client: `status` (on_market, pending, sold, expired, withdrawn), `list_price`, `list_date`, `expiry_date`, `listing_agent_is_client_agent`, `source` (`fello` | `mls` | `manual`), timestamps. GRANTs plus RLS scoped to members of the owning org. The `source` column is what lets a per-agent MLS feed slot in later.
- Extend `src/routes/api/public/fello.webhook.ts` to map listing-related Fello events into `property_listing_status` in addition to the existing `fello_events` log.
- New `src/lib/agent.server.ts` with the move-score computation and signal ranking, reading `property_intel` (ATTOM cache) plus listing status; new `src/lib/agent.functions.ts` exposing authenticated server functions for the portal.
- New routes under `src/routes/_authenticated/agent/`: `route.tsx` (ssr false), `index.tsx` (today's signals + portfolio list), `portfolio.$id.tsx`, `campaigns.tsx` — following the existing lender route structure and the `ContactDialog` pattern.
- Campaign catalog gains an `org_type` filter so agent orgs see the agent subset.
- No new external API cost: everything reads the existing ATTOM cache and Fello webhook stream.

## Out of scope for this phase

Pipeline/GCI tracking, task lists, leaderboards, referral revenue accounting, marketing asset library, direct MLS integration.
