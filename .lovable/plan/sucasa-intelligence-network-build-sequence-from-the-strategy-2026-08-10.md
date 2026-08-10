# SuCasa Intelligence Network — build sequence from the strategy brief

The brief maps well onto what already exists. Agent and lender organizations already share one org model, portfolios and books exist for both, campaigns already carry per-org branding and per-campaign overrides, and homeowner consent records with an immutability guard are already in place. Four things in the brief are genuinely new, and they have a natural order.

## Decisions I'm making (you skipped the questions)

- **Build order:** Opportunity Engine first. Every other module in the brief consumes it — the lender aggregate counts, the agent feed, campaign audiences, and alerts are all just different views of the same opportunity objects. Building it first means the other three are mostly UI.
- **Identity reveal:** de-identified rows with agent-approved unmask. A lender connected to an agent sees one row per opportunity — category, equity band, city/ZIP, a signal summary — with no name, address, or contact. The lender requests an introduction on a specific row; the agent approves or declines; approval reveals contact for that homeowner only and writes an audit record. This is stricter than most competitors and still gives the lender something to act on, which pure aggregate counts do not.
- **Pricing:** model and enforce, no payment provider yet. Plans, seat limits, and sponsored-profile allocations become real data with real limits. No Stripe in this phase.
- **MLO model:** keep one book per MLO. The branch tiers are just seat limits on the org; nothing structural changes.

## Phase 1 — Opportunity Engine

Turn the signals we already compute ad hoc (equity, LTV, tenure, rate delta, tax pressure, permits, inspection findings) into named, stored opportunity objects.

Six categories from the brief: Equity, HELOC, Refinance Review, Move-Up, Investment, Mortgage Review.

Each opportunity records the category, a confidence/strength band, the reasons behind it in plain language, when it was computed, and its state (open, introduced, declined, expired). Recomputed whenever a client's property intelligence refreshes, so it never goes stale silently.

Strictly opportunity language throughout — "may benefit from a financing review", never "needs a loan", and never anything that reads as an eligibility determination.

Surfaces: the agent's book gets an Opportunities tab; the homeowner dashboard keeps showing its own opportunities in homeowner terms.

## Phase 2 — Agent ↔ Lender connection network

- Lender dashboard gains **My Agents**: connected agents, pending invitations, and agents SuCasa knows about who aren't connected yet.
- Invitation flow: lender invites an agent by email; the agent accepts from their own dashboard; either side can disconnect.
- Per connected agent the lender sees: homeowner count and opportunity counts by category. Lenders can sort agents by network size and opportunity volume.
- Agent dashboard gains **Lender Partners**: who they're connected to and what those lenders offer.

## Phase 3 — Opportunity marketplace with agent-controlled reveal

- Lender drills from an agent's counts into de-identified opportunity rows.
- **Request introduction** on a row creates a request the agent sees in an approval center.
- Agent approves (contact revealed to that lender, for that homeowner, logged) or declines.
- Full lifecycle tracked: opportunity → request → approval → conversation → outcome.

## Phase 4 — Sponsored Premium Profiles

- Each plan carries a sponsored-profile allocation. Lender sponsors capacity; the agent allocates individual sponsorships to chosen clients.
- Homeowner profile shows "Premium — sponsored by {lender}" while active, and unlocks the premium feature set.
- Sponsorship lifecycle: when a lender's sponsorship ends, a grace period runs, then the profile reverts to core. The homeowner profile and its data are never deleted, and another lender can sponsor it later.
- Allocation usage is visible to both sides, and over-allocation is blocked.

## Phase 5 — Agent-approved campaigns

Extends the existing campaigns workspace rather than replacing it.

- Lender proposes a campaign against an opportunity segment across connected agents.
- Each affected agent gets an approval request showing the audience and the exact email.
- Agent can approve the whole audience, deselect individual homeowners, or decline.
- Approved sends go out branded as agent + lender + SuCasa, using the branding and override system already built.
- Nothing reaches a homeowner without an agent approval on record.

## Phase 6 — Plans, allocations, and alerts

- Five plans as data: MLO Essentials $197, MLO Growth $397, Branch Growth $1,497 (5 seats), Branch Pro $2,497 (15 seats), Enterprise (custom). Each with a seat limit and a sponsored-profile allocation (250 / 2,500 / 7,500).
- Seat and allocation limits enforced when adding members or allocating sponsorships, with clear upgrade messaging at the limit.
- Lender opportunity alerts: new opportunities in the connected network. Agent opportunity feed: new opportunities in their own book. Both reuse the existing seen/reviewed mechanism.

## Technical notes

- New tables: `homeowner_opportunities` (per client per category, with signals and state), `agent_lender_connections` (invite/accept/disconnect states), `introduction_requests` (with approval and reveal audit), `sponsored_profiles` (sponsor org, homeowner, allocated_by agent, active window), `campaign_approvals` (per agent per campaign, with the approved audience), and `plan_tiers` as reference data. Every new public table ships with grants, RLS, and policies in the same migration.
- Opportunity computation lives in a server-only module beside the existing refi and maintenance rule modules, recomputed on the existing enrichment path so it piggybacks on the ATTOM budget logic already in place rather than adding new data cost.
- **Identity protection is enforced in the data layer, not the UI.** Lender-facing reads project a de-identified view; the unmask path is a separate server function that checks for an approved introduction plus the existing homeowner consent guard before returning contact details, and writes an audit row on every reveal.
- Reuses the existing org/member role model (owner = manager, member = MLO/agent), campaign branding and override tables, and the consent immutability trigger.
- Regulatory framing carried into copy and code comments: opportunity signals are informational and explicitly not underwriting or eligibility determinations.

## What I'd flag

- **Legal review before launch, not after.** Mortgage marketing and consumer financial data carry real rules. The de-identified-by-default architecture is the right posture, but the actual campaign copy and disclosures need a professional read.
- **Sponsored capacity should be priced against real data cost.** The brief says the same. Once we have a few weeks of real per-profile enrichment cost, the 250/2,500/7,500 allocations should be revisited before any expansion pricing is published.
- **Two-sided cold start.** Agents connect for the intelligence about their own book, which works with zero lenders present. Building Phase 1 first means agents have a reason to be there before the lender network exists.
