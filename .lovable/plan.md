# Agent Portal — listing intelligence built on ATTOM + Fello

## MLS: what's realistic

MLS data cannot be centrally licensed and resold. Access is per-board, per-agent, under a data license (IDX / RESO Web API), governed by the agent's brokerage. SuCasa should not try to hold one feed.

1. **Public record (today, no license).** ATTOM gives recorded sales, deeds, mortgages, permits, tax/assessment, AVM, owner and neighborhood data. This is the substance behind "why call this person today."
2. **Fello listing events (today, already wired).** Fello reports when a past client's home goes on market — including with another agent — goes pending, or the listing expires. Highest-signal event an agent can receive. Our webhook already receives these.
3. **Per-agent MLS (later, optional).** Model listing status as one normalized table with a `source` column now, so an agent can attach their own board credentials later without a rewrite.

## The line we hold: not a CRM

SuCasa does not manage contacts, pipeline stages, tasks, GCI forecasts, or leaderboards — their CRM does that. SuCasa answers: **who among your homeowners has something happening right now, why it matters, and what to say.** Insights push out to their CRM rather than being duplicated inside SuCasa.

## What ATTOM gives agents beyond the lender fields

The lender view uses ATTOM for equity and loan math. For agents, the same cached data supports a much richer set of signals — none of it costing extra calls, since we already cache all nine endpoints per address.

**Ownership and timing**
- Tenure since last recorded sale, plus purchase price and appreciation since — the core of "you've gained $X."
- Owner-occupied vs. absentee (owner mailing address differs from the property) — absentee owners are far more likely to sell.
- Deed type and multiple owner names — vesting changes (added/removed name) are life-event signals.
- Second mortgage or HELOC on record — signals a cash-need or renovation already financed.

**Property fitness for a move**
- Beds, baths, square footage, lot size, year built, garage, stories — feeds "your family may have outgrown this" and drives comp selection.
- Assessed vs. market value gap and the tax trend across years — a jumping tax bill is a real conversation starter and an appeal-help angle.
- Building condition and effective year built — supports pre-list improvement recommendations.

**Work already done**
- Permit history with type, value, and date: a $60k kitchen permit two years ago means the home shows better than the AVM implies. This is the single most under-used agent talking point and we already pull it.
- Permits also feed the vendor side: recent roof/HVAC work vs. aging systems.

**Neighborhood and comps**
- Recent nearby recorded sales, median sale price, and price trend — the basis of a lightweight CMA-style value range without MLS.
- Sales velocity and turnover rate in the immediate area — "inventory in your neighborhood is down" style claims, sourced from recorded transactions.
- Community/demographic profile for the farm area.

**Risk and cost of ownership**
- Flood/hazard indicators and school ratings from the detail-with-schools endpoint — school quality change is a genuine move trigger for families.

These roll into three derived numbers shown on every homeowner: **Move score**, **Estimated sale range**, and **Equity gained since purchase**.

## What the agent dashboard shows

**1. Today's signals** — ranked list of homeowners with a live reason to reach out. Each row: name, address, signal, supporting numbers, one-tap call / email / generate-message. Phase 1 signals:
- Listed with another agent (Fello) — win-back
- Listing expired or withdrawn (Fello) — best re-list conversation
- High equity + long tenure + strong appreciation (ATTOM)
- Absentee owner (ATTOM owner mailing mismatch)
- Major permit completed (ATTOM permits) — value story
- Tax assessment jump (ATTOM tax trend)
- Purchase anniversary / annual home review due

**2. My homeowners** — portfolio table with agent columns: estimated value, equity gained, tenure, last sale price/date, beds/baths/sqft, tax trend, listing status, move score. Clicking a client opens a detail dialog with the ATTOM-derived talking points and contact actions.

**3. Move score** — 0–100 per homeowner from equity %, tenure, appreciation vs. neighborhood, occupancy, permit activity, tax trend, and listing events. Replaces the lender's refi signal and drives the ranking.

**4. Property brief** — per-client one-screen summary: value range, equity gained, improvements on record, neighborhood trend, tax and risk notes. Generated from cache, exportable as the basis of a value conversation.

**5. Agent campaigns** — existing campaign engine filtered to the agent catalog (home value update, purchase anniversary, neighborhood market snapshot, post-renovation value, expired-listing re-engagement), sent under the agent's brand.

Deferred: marketing asset library, referral network accounting, engagement score, business snapshot/GCI metrics, gamification.

## Technical approach

- Reuse `lender_orgs.org_type` (already `lender | agent`); agent members, portfolios and clients reuse the existing `lender_portfolios` / `lender_portfolio_clients` tables. The portal differs by org type, not schema.
- New table `property_listing_status` keyed by portfolio client: `status` (on_market, pending, sold, expired, withdrawn), `list_price`, `list_date`, `expiry_date`, `listed_with_other_agent`, `source` (`fello` | `mls` | `manual`), timestamps. GRANTs plus RLS scoped to members of the owning org. `source` is the seam for a future per-agent MLS feed.
- Extend `src/lib/valuation.server.ts` with agent-facing extractors the lender flow doesn't need: owner/occupancy, property characteristics, tax trend across years, neighborhood comps and trend, schools/hazard. All read the existing `property_intel` cache — no new ATTOM spend beyond first fetch per address.
- New `src/lib/agent.server.ts`: move score, signal detection and ranking, property brief assembly. New `src/lib/agent.functions.ts`: authenticated server functions for the portal.
- Extend `src/routes/api/public/fello.webhook.ts` to map listing events into `property_listing_status` alongside the existing `fello_events` log.
- New routes under `src/routes/_authenticated/agent/`: `route.tsx` (ssr false), `index.tsx` (today's signals + portfolios), `portfolio.$id.tsx`, `campaigns.tsx` — following the lender route structure and `ContactDialog` pattern.
- Campaign catalog gains an `org_type` filter so agent orgs see the agent subset.

## Out of scope

Pipeline/GCI tracking, task lists, leaderboards, referral revenue accounting, marketing asset library, direct MLS integration.
