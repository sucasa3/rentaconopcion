
# ATTOM Integration + Monetization Plan

## 1. Read the pricing math first

ATTOM's tiers (annual sub, paid monthly):

| Plan | Calls/mo | Cost/call |
|---|---|---|
| $500 | 5,000 | $0.10 |
| $1,000 | 10,000 | $0.10 |
| $1,350 | 15,000 | $0.09 |
| $1,500 | 25,000 | $0.06 |
| $2,000 | 50,000 | $0.04 |
| $2,500 | 100,000 | $0.025 |
| +$100 | Building Permits add-on | — |

Key insight: the **$1,500/25k tier is the sweet spot** — the price per call drops 40% vs. the $1k tier. Below that, every homeowner pull is expensive; above it, marginal cost is trivial. So the plan below is designed to **live at the $500 tier during trial, jump to $1,500 the moment we cross ~800 active homeowners**, and never pull ATTOM data we can't attribute to a revenue event.

At the $500 trial tier, 5,000 calls = about **150 homeowners** if we allow ~30 calls each per month (initial enrichment + weekly AVM refresh + report). That's the ceiling we design against.

## 2. Cost-control architecture (built once, saves forever)

**a. Single valuation abstraction layer** — `src/lib/valuation.server.ts` with a `getPropertyIntel(address, options)` interface. Providers behind it: `attom`, `fello`, `mock`. Callers never know which one fired. Lets us run Fello in parallel and swap providers per field without touching the dashboard.

**b. Aggressive per-field caching in Postgres** — one `property_intel` table with columns for each ATTOM data class and a `fetched_at` per class. TTLs:
- AVM: 30 days (refresh on-demand for premium users, or when equity ribbon changes materially)
- Property detail (beds/baths/sqft/lot): 365 days (rarely changes)
- Tax assessment: 365 days
- Sales history / deed: 180 days
- Permits: 90 days
- Neighborhood / school / risk: 180 days
- Owner / mortgage: 90 days

**c. Event-driven pulls, never background sweeps** — ATTOM is only called on: signup enrichment, explicit "refresh" click, monthly report generation, and a claim event on a service request. No cron sweeps of the whole userbase.

**d. Per-endpoint budgeter** — `attom_call_log` table with monthly rollups + a soft cap that switches to cached/stale data with a UI badge when we hit 80% of the tier. Admin dashboard shows spend to date and projected month-end.

**e. Pre-flight dedupe** — same address requested twice in a session hits the cache, not ATTOM. Signup enrichment for a duplicate address (roommate, spouse, second account) reuses the existing `property_intel` row.

## 3. Monetization stack (the actual answer to "how do we pay for it")

Layered so each ATTOM call has a **named revenue source** before it fires.

### Tier 1 — Homeowner Premium: **SuCasa+ at $12/mo or $99/yr**
Free tier gets: 1 AVM refresh/mo, static property detail, basic Home Score.
Premium gets: weekly AVM, full mortgage/equity/tax view, permit history, neighborhood intel, risk score, unlimited monthly reports, PDF export, price-drop and equity-milestone alerts.
- Break-even at $0.10/call: **~120 ATTOM calls per premium user per year** — well within budget.
- Target: 8–12% of active homeowners upgrade. At 1,000 homeowners → ~$1,200/mo recurring, covers the $1,500 tier by itself.

### Tier 2 — Transactional unlocks (impulse buys, no subscription friction)
- **Home Intelligence Report PDF — $4.99** one-off. Consumes ~15 ATTOM calls; margin ~$3.50.
- **"Should I refi?" readiness report — $9.99** (AVM + mortgage + equity + rate delta).
- **"Should I sell?" readiness report — $9.99** (AVM + comps + market timing + net-proceeds calc).
- **Pre-listing valuation packet — $19** (bundled report for owners talking to agents).
These convert users who won't subscribe. Each has a **1:1 cost-to-revenue mapping**.

### Tier 3 — Pro/Partner data add-ons (highest AOV — this is the real business)
Enrich the leads we already sell to trades/lenders/agents with ATTOM attributes:
- **Standard lead** ($X existing): address + name + service need.
- **Enriched lead** (+$15–35 per accepted lead): + AVM, equity band, tenure, mortgage age, permit history relevant to the trade.
Costs us ~3–5 ATTOM calls per enriched lead ($0.30–$0.50). Sells for **$15–35 uplift**. Best margin lever in the whole model.

### Tier 4 — Lender / Agent MSA seats: **$997/mo** (already scoped)
Portfolio dashboard powered by ATTOM: their book of past clients, refi-eligibility flags, equity-milestone alerts, listing-triggered notifications. High-ticket, RESPA-safe (flat MSA, not per-deal). Big ATTOM consumer, but they pay for the calls many times over.

### Tier 5 — Data-driven product surfaces that indirectly monetize
- **Equity milestone alerts** ("You crossed 30% equity — refi window open") → routes to a lender partner → claim fee.
- **Permit-triggered service prompts** ("Your neighbor pulled a roof permit — get 3 quotes") → routes to trades → claim fee.
- **Sale-triggered agent match** (nearby sale changes your comp set) → routes to agent partner → claim fee / MSA activation.
Each of these is an ATTOM call that **directly triggers a lead offer**. The call pays for itself the first time it fires a claim.

### Tier 6 — Anonymized aggregate data (later)
Neighborhood-level trend reports for pros ("Cherokee County: 340 homes crossed 40% equity this quarter") — sellable subscription for lender/agent partners hunting territory. Aggregated from data we already paid for.

## 4. Build sequence (once you send the ATTOM trial credentials)

1. Add `ATTOM_API_KEY` via secure secret input.
2. Migration: `property_intel`, `attom_call_log`, `attom_monthly_budget` tables + RLS.
3. `src/lib/valuation.server.ts` abstraction + `src/lib/attom.server.ts` provider with per-endpoint methods (AVM, detail, tax, sales, permits).
4. Wire the homeowner dashboard hero + Home Score to real ATTOM AVM via the abstraction (behind the cache).
5. Free vs. Premium gating on the dashboard and `/report` route — hook into the existing `usePremium` scaffold.
6. Admin: ATTOM spend widget (calls this month, projected total, tier utilization).
7. Enriched-lead toggle in the pro claim flow (+$X on accept).
8. Transactional unlock buttons on `/report` (Stripe checkout — separate turn).
9. Keep Fello wired in parallel behind the same abstraction for engagement events (dashboard clicks, email opens) — no changes to the current Fello code.

## 5. Decisions I need before build

- Confirm the pricing anchors: **$12/mo SuCasa+**, **$4.99 report PDF**, **+$15–35 lead enrichment**. Adjust any.
- Confirm we start on the **$500 trial tier** and I set the internal soft cap at 4,000 calls/mo (80%).
- Confirm we keep Fello running in parallel (yes per your message) — I won't remove any Fello code.
- Building Permits add-on ($100/mo) — worth turning on now since permit-triggered leads are a Tier 5 revenue driver? I'd say yes, but confirm.
