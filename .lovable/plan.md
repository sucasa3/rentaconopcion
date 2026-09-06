# Shared Home Profile pool, five-plan lineup, and the pricing page

One standardized product. Every paid plan includes the full platform; plans differ only by Home Profile capacity and sponsored-agent capacity.

## 1. Final pricing table

| Plan | Monthly | Home Profiles | Max sponsored agents |
| --- | --- | --- | --- |
| MLO | $79 | 250 | 3 |
| MLO Growth | $149 | 1,000 | 10 |
| Branch | $499 | 5,000 | 25 |
| Branch Pro | $799 | 10,000 | 50 |
| Network | $1,499 | 25,000 | 100 |

## 2. Plan entitlements (identical on every paid plan)

Home Profiles, property enrichment, the SuCasa Value Engine, mortgage/lien/equity intelligence, opportunity detection, lender action dashboard, AI reasons to contact and outreach suggestions, sponsored-agent accounts, agent dashboards, homeowner dashboards, bulk homeowner upload, CRM integration, property/tax/sales intelligence, permit and home-improvement intelligence, alerts, AI Document Inbox when released, standard onboarding, mobile access.

No feature gating by tier. Only the two capacity numbers change.

## 3. Allocation behaviour

```text
Total capacity ......... 1,000
Lender used ............   180
Agent allocated ........   650   (across 5 agents)
Agent used .............   410
Available ..............   170
```

- Lender reserve is optional and may be 0.
- Any amount per agent; presets 50 / 100 / 250 / Custom.
- Lender reserve + agent allocations can never exceed total capacity; active sponsored agents can never exceed the plan's agent cap.
- Used profiles keep counting against capacity until they are reassigned or archived. Ending a sponsorship moves those profiles back to the lender's own usage — it does not free capacity, so there is no loophole.
- Reducing an allocation below what an agent already used is refused with the exact number needed.
- Nothing here deletes homeowner records, ever.
- Agents see "410 of 650 used" and can request more; the lender is notified and can raise it from Available.
- Allocation logic lives entirely apart from billing: plans set the two caps, allocation spends within them.

## 4. Billing rules

- 90-day initial commitment on all plans, billed monthly throughout.
- Month-to-month after 90 days; cancel anytime after that, effective at the end of the current billing period.
- Upgrades take effect immediately, with capacity raised at once.
- Downgrades take effect at the next billing cycle. If current usage or allocations exceed the lower plan's caps, the app blocks the change and states plainly what to reduce, archive or reassign first.
- Add-on architecture (extra profiles, extra agent seats) is built as separate, configurable capacity grants stacked on top of plan caps — present but inactive and unpriced.

## 5. Pricing page copy

Headline message: "Every plan includes the full SuCasa intelligence platform. Choose the plan based on the size of your homeowner database and agent network."

Under the plan grid: "90-day initial commitment. Month-to-month after that."

Each card shows plan name, monthly price, Home Profiles, sponsored agents, and a shared "Everything in SuCasa is included" feature list rendered once beneath the grid.

## 6. What gets built

1. Plan records updated to the five names, prices and caps; legacy tiers retired without touching existing accounts.
2. Capacity engine (`src/lib/profile-pool.ts`): one pure module computing total / lender used / agent allocated / agent used / available, plus every allow/refuse decision with a plain-English reason.
3. Backend enforcement on allocation changes and homeowner adds, plus a database-level guard so caps can't be bypassed.
4. Lender allocation screen: the five-number summary, one row per agent showing used / allocated with Change allocation, and Add Agent / Allocate Profiles actions.
5. Agent-side usage display and "request more" action.
6. Upgrade/downgrade handling with the blocked-downgrade explanation.
7. Public pricing page with the copy above, and the billing page updated to the same lineup and commitment terms.

## 7. Technical notes

- Caps: `plan_tiers.profile_allowance` and `plan_tiers.sponsored_seats`, mirrored onto `lender_orgs` at activation.
- Per-agent allocation reuses `sponsored_agent_seats.credits_granted`; a lender reserve column and an add-on capacity table are added.
- Agent usage comes from the existing credit ledger spend; lender usage from portfolio clients.
- Migration replaces the fixed-allocation trigger with a pool-aware guard, with grants included.

## 8. Business decisions still needed before Stripe prices are created

1. Is there a free or trial entry point below MLO, or is MLO the floor?
2. What happens at the end of the 90 days if a lender does nothing — silent continuation month-to-month (assumed) or an explicit renewal step?
3. Annual pricing at launch, or monthly only?
4. Should exceeding capacity block new homeowner adds outright, or allow a small soft overage with a prompt to upgrade?
5. Archiving policy: what does "archived" mean for a homeowner profile — hidden but retained (assumed), and for how long before capacity is released?
6. Add-on pricing units (per 100 profiles? per seat?) — needed only when add-ons are activated.
