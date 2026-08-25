# SuCasa 100X: from home-information dashboard to AI operating system for the home

The North Star shifts from "Home Dashboard" to **"My home has an AI that takes care of it."** One Home Record, one intelligence engine, three beneficiaries. The product-development filter for everything below: count the steps without SuCasa vs. with it, and ask what SuCasa actually *does* — showing information is 10% better, coordinating the outcome is the 100X direction.

You chose the **Homeowner AI manager** as the flagship pillar and a roadmap with Phase 1 buildable. The gamification plan stays parked.

## Where we stand (audited against the vision)

| Pillar | State | Gap |
| --- | --- | --- |
| 7. Shared Home Record flywheel | **Exists** | `assembleHomeRecord` is the canonical record for homeowner, agent, and lender views. Agent/lender side uses cached property records without live behavior data. |
| 5. Lender opportunity detection | **Exists** | Refi/HELOC/cash-out/move-up signals with per-category "what to say" recipes. Most complete pillar. |
| 4. Agent opportunity segments | **Exists** | Category counts ("8 likely to sell") plus ranking and AI listing briefs. |
| 6. "What your home needs today" + Ask SuCasa | **Exists** | Alert banner hands off to the assistant, but the assistant is single-turn, stateless, and cannot take action. |
| 1. Forward-looking Home Plan | **Partial** | Lifespans, seasonal cadence, and timeline projections exist as pieces; nothing aggregates them into a 90-day / 12-month / 3–5-year plan with costs and priorities. |
| 3. Selling analysis for the homeowner | **Partial, agent-only** | Listing readiness and net proceeds exist on the agent side; the homeowner has no price range, no ROI-ranked improvement plan, no pre-sale flow. |
| 2. "I'll take care of it" execution | **Missing** | Full marketplace and lead-routing infrastructure exists, but every step needs a human; no cost estimates, no AI vendor selection, no booking loop. |

The honest read: SuCasa is a strong *read-only intelligence* product today. The 100X leap is concentrated in pillars 1, 2, and 3 — and Phase 1 can deliver pillar 1 with a real (not mocked) execution hand-off into the marketplace that already exists.

## Roadmap

**Phase 1 — Your Home Plan (buildable now).** The homeowner gets a living forward plan: what to do in the next 90 days, the next 12 months, and the next 3–5 years, each item with a reason, an estimated cost band, and a "Take care of it" action that starts a real service request. The dashboard hero becomes "Here's what your home needs" instead of a summary of cards.

**Phase 2 — Selling analysis.** Homeowner asks "Could I sell for $750K?" and gets a price range, then an ROI-ranked pre-sale improvement plan ("spend ~$18K here, likely add $35–50K") built from valuation, comps, inspection findings, and component condition. Each improvement converts into the same "Take care of it" flow from Phase 1.

**Phase 3 — True agentic execution.** "Take care of it" stops meaning "start a request" and starts meaning SuCasa matches qualified pros, estimates the job cost band, and coordinates scheduling — the human pros stay in the loop, but the homeowner stops doing the Google-call-compare-schedule dance.

**Phase 4 — The assistant becomes the OS.** Multi-turn, memory of the Home Plan and past conversations, and tool use: it can create requests, log maintenance, schedule tasks, and answer from the full record. The home screen converges to one greeting, today's needs, and one big Ask SuCasa button.

**Phase 5 — Coordinated, consent-gated opportunities.** A homeowner event (a pre-sale plan started, a major project requested, an equity milestone) becomes **one coordinated opportunity** instead of three dashboards noticing separately — but information flows selectively, not broadcast. Each event is checked for relevance per role (a pre-sale plan matters to the agent; an equity milestone matters to the lender; a filter change matters to neither), and nothing reaches a professional unless the homeowner has permitted that class of sharing. Lenders won't always need to know — and under this rule, they don't.

## The consent-and-relevance gate (cross-cutting rule)

Every homeowner event that could surface to a professional passes two tests before anyone sees it:

1. **Relevance** — does this role actually need this signal? Maintenance and project events default to the agent/vendor side; financing-relevant events (equity, refi window, cash-out headroom) are the ones that can reach a lender.
2. **Permission** — has the homeowner consented to this class of sharing? Enforcement rides on the existing `homeowner_lender_consents` table and the consent-check function already used by campaigns; every new sharing path in every phase goes through the same gate, never around it.

The homeowner controls this in plain language ("Share financing opportunities with my lender" — on/off per class), with the default being conservative. This applies starting in Phase 1: when a plan item becomes a service request, the event is visible to the homeowner's vendor flow and their agent's relationship view only where relevant and permitted — it never lands in a lender's queue by default.

## Phase 1 in buildable detail — Your Home Plan

### The plan object

New pure module `src/lib/home-plan.ts` (client-safe, same pattern as `engagement.ts`). Input: the existing Home Record (`assembleHomeRecord` output). Output:

```text
HomePlan
├─ next90Days: PlanItem[]     ← overdue/due-soon components, seasonal tasks
│                               due now, high-urgency inspection findings
├─ next12Months: PlanItem[]   ← components inside replacement window,
│                               insurance/permit/value reviews, medium findings
└─ next3to5Years: PlanItem[]  ← long-horizon replacements (roof, HVAC,
                                water heater) with target years
PlanItem = { key, title, why, horizon, costBand, urgency,
             category, source: "component"|"finding"|"seasonal"|"review" }
```

Deterministic rules do the planning (lifespans, seasonal cadence, finding urgency — all already in the codebase); AI is used once per plan to write the one-sentence "why" per item in plain language, grounded only in on-file facts. No invented numbers.

### Cost bands

Static band table in code per category (e.g. roof inspection $0–300, HVAC replacement $5–12K) — clearly labeled "typical range," not a quote. Real quoting is Phase 3.

### Data

New table `home_plans` (user_id, plan jsonb, generated_at, source_hash) with GRANT + RLS in the same migration, owner-read/write policies. Regenerated when the underlying record changes (address, new findings, new service log, completed item) — the source_hash makes that cheap and idempotent. Items dismissed or marked done are tracked in a `home_plan_state` table so the plan is a living list, not a regenerated surprise.

### The "Take care of it" hand-off

Every plan item gets one action: **"Take care of it"** → opens the existing service-request flow pre-filled with category, description (from the item), and home context. This is a real execution loop on day one without pretending Phase 3 automation exists. Completed requests feed the existing timeline, and the plan item clears itself.

### UI

- Dashboard hero rework: replace the stack of summary cards' lead position with a **Home Plan hero** — "Good morning, {name}. Your home needs {n} things this quarter." plus the top item and a "See my plan" link to a new `/home-plan` route.
- `/home-plan` route: three horizon sections (90 days / 12 months / 3–5 years) as stacked cards — iOS-first, cost band, why, and the action button on each.
- The existing HomeAlerts nudge points at the plan instead of a dead-end.
- Assistant: the plan is injected into the existing assistant snapshot so "What should I do with my house?" answers from the plan verbatim. Still single-turn this phase; conversational memory is Phase 4.

### Wiring

- `src/lib/home-plan.ts` — pure planner + cost bands.
- `src/lib/home-plan.functions.ts` — get/regenerate/act-on-plan server functions (requireSupabaseAuth; AI "why" generation streams internally per the long-call rule).
- `src/lib/home-plan.server.ts` — assembly, persistence, hash check.
- `src/routes/_authenticated/home-plan.tsx` — the plan page (own head() metadata).
- Modify: `dashboard.tsx` (hero), `home-alerts.tsx` (route to plan), `assistant.functions.ts` (plan in snapshot), service-request creation (accept prefill params).

### Success check

A homeowner with an enriched profile opens the dashboard and sees a plan hero, opens `/home-plan`, sees all three horizons populated from their real record, taps "Take care of it" on one item, and lands in a pre-filled request. After the request completes, the item is gone from the plan.

## What I'd flag

- **Don't oversell the agent loop yet.** Phase 1's "Take care of it" is a real hand-off, not autonomous coordination — the copy must say "we'll find and route this to pros," not "consider it done," until Phase 3.
- **Cost bands carry liability and trust risk.** Keep them wide, labeled as typical ranges, and sourced from category tables we control — never from AI generation.
- **The plan must never fight the record.** Because it's derived from `assembleHomeRecord` with a source hash, homeowner, agent, and lender keep seeing one truth; that invariant is the moat and we protect it in every phase.
- **AI spend stays bounded.** The planner is deterministic; AI writes only the "why" sentences, cached in `home_plans` — fits inside the existing per-seat usage cap pattern.
