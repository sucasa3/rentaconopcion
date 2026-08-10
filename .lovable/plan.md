# Phase 6 — Plan tiers, limits, and alerts

The five lender tiers (plus the free agent tier) already exist as reference data in the database. This phase surfaces them in the app and enforces their limits.

## What each tier includes

| Tier | Price | Seats | Sponsored profiles | Who it's for |
| --- | --- | --- | --- | --- |
| MLO Essentials | $197/mo | 1 | 0 | Individual MLO. Core homeowner intelligence, opportunity alerts, basic opportunity views. |
| MLO Growth | $397/mo | 1 | 250 | Hero plan. Everything in Essentials plus agent network, full opportunity engine, sponsored profiles, co-branded campaigns, prospecting and outcome tracking. |
| Branch Growth | $1,497/mo | 5 | 2,500 | Small branch. Shared branch-wide agent and homeowner opportunity network across up to 5 MLOs. |
| Branch Pro | $2,497/mo | 15 | 7,500 | Larger branch. Bigger agent and profile capacity, advanced analytics and network tools. |
| Enterprise | Custom | Unlimited | Unlimited | Regional/national lenders. Large portfolios, custom integrations and branding, multi-branch intelligence. |
| Agent Core | Free | Unlimited | — | Agents. Homeowner intelligence for their own book, lender partner connections, approval center. |

Feature gating by tier:

- **Essentials** — own book, opportunity list, alerts. No agent network, no sponsorships, no co-branded campaigns.
- **Growth and above** — agent network, introduction requests, sponsored profiles, co-branded campaign proposals.
- **Branch tiers** — everything in Growth, plus a manager roster view across seats and branch-level rollups.
- **Enterprise** — no seat or allocation ceiling.

## What gets built

1. **Plans page for lenders** — a Plan & billing view showing the current tier, seats used vs. limit, sponsored profiles used vs. allocation, and a comparison of all tiers with the current one marked. No payment provider in this phase; upgrade is a request/contact action.
2. **Seat enforcement** — adding a member to a lender org checks the tier's seat limit and blocks with an upgrade message at the ceiling.
3. **Allocation enforcement** — agents allocating a sponsored profile against a lender's capacity are blocked when the lender's allocation is exhausted, with a clear "capacity full" message on both sides.
4. **Feature gating** — network, sponsorship, and campaign-proposal actions check the org's tier and show an upgrade prompt instead of the feature when the tier doesn't include it.
5. **Opportunity alerts** — lenders get a count of new opportunities across their connected agent network; agents get new opportunities in their own book. Both reuse the existing seen/reviewed mechanism, so the "New" badge clears the same way as today's feed.

## Technical notes

- `plan_tiers` already holds all six rows; `lender_orgs.plan_key`, `seat_limit` and `sponsored_allocation` already exist. NULL means unlimited.
- Enforcement lives server-side in the network and org-member server functions, not in the UI, so the limits hold regardless of client.
- A shared tier-capability helper (server + client safe) maps `plan_key` to feature flags, so gating is defined in one place.
- Alerts reuse `agent_feed_seen` and the existing opportunity records; no new data collection or ATTOM cost.
