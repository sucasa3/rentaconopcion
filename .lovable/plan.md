# Role-aware opportunity messaging (agent vs lender)

One engine, one set of facts, two ways of speaking. Agents get relationship and property reasons to reconnect. Lenders get financing reasons. Nothing about detection, permissions, access gates, ranking, consent or outcomes changes.

## What is wrong today (verified in the code)

1. **Two different equity calculations exist.**
   - The opportunity engine (`src/lib/opportunities.server.ts`) resolves value and equity through the Value Engine + equity resolver, with confidence and suppression rules.
   - The agent roster and the agent listing brief (`src/lib/agent.functions.ts`, in `getAgentPortfolio` and `generateAgentBrief`) each recompute their own value and equity from raw property records (`avm ?? tax market ?? assessed` minus an amortization estimate).
   This is why one screen can say ~$58K and a generated message can say ~$216K for the same person.

2. **Agents are shown lender plays.** Detected categories include `heloc`, `refinance_review`, `mortgage_age`, `equity`. The card takes the raw category label straight from `CATEGORY_META` ("HELOC opportunity"), so an agent sees a financing recommendation as the headline even though the agent recipe underneath is a relationship play.

3. **Overclaiming copy.** `computeMoveScore` in `src/lib/agent-portfolio-helpers.ts` emits a signal literally labeled "Likely outgrown", and the equity signal is worded as "move-up down payment sitting in the house". The listing-brief prompt also asks the model to "cite the numbers" from a fact set it was handed separately from the canonical one.

4. **Each surface writes its own narrative.** Today, the roster, the opportunity card, the AI brief and the email/text draft each assemble their own "why now" text from different inputs.

## The fix, in five pieces

### 1. One canonical fact snapshot per homeowner (highest priority)

Add `clientFactsFor()` to `src/lib/opportunities.server.ts`, built from the existing `propertyRecords` + `engineFactsFor` + `recordForClient` path already used to derive opportunities. It returns the single sanctioned snapshot:

```text
value, valueConfidence, valueSource, loanBalance, equityDollars, equityPct,
ltvPct, ratePct, tenureYears, lastSaleDate, beds, baths, sqft, yearBuilt,
taxAmount, permitCount, equityActionable, suppressionReason
```

Then remove the duplicate math:
- `getAgentPortfolio` (the block that computes `value`, `balance`, `equityDollars`, `equityPct`)
- `generateAgentBrief` (the same block again)
- the lender brief path already reads the workspace snapshot; it will read the same helper so all three agree.

Rule enforced in code and in every AI prompt: **no surface computes value, equity, LTV, balance, years owned or square footage.** They format what the snapshot gives them.

### 2. One role-aware narrative builder

New pure, client-safe module `src/lib/opportunity-narrative.ts`:

```text
buildNarrative({ audience, category, strength, reasons, facts, engagement })
  -> {
       primary:   { type, whyNow, whyItMatters, howToBeUseful, ctaLabel },
       signals:   [ short factual chips ],
       secondary: [ { label, helper } ],
       openerSeed: { topic, facts, tone }
     }
```

Role mapping (presentation only — stored opportunity rows are untouched):

| Detected | Agent primary becomes | Lender primary stays |
|---|---|---|
| equity, heloc, mortgage_age, refinance_review, mortgage_review | Home-value & future-plans conversation (or move-up when tenure/size support it) | Equity review, HELOC/cash-out, refinance review, annual mortgage review |
| move_up | Possible move-up conversation | Purchase-financing conversation |
| home_condition, permit_activity | Property condition / project conversation | Renovation financing (informational) |
| market_timing, recent_purchase, free_and_clear | Check-in, milestone, future plans | Financing check-in |

For agents, any financing-flavoured detection appears **only** in `secondary` as:
"Additional signal: meaningful equity" + "If financing comes up, consider involving a licensed mortgage professional."
Financing may still be primary for an agent in exactly one case: the homeowner explicitly asked for financing help.

Language guardrails baked into the builder: "possible", "may be worth", "could be a natural time", "subject to qualification". Banned strings ("likely outgrown", "prime candidate", "needs to", "should get") are removed at the source in `agent-portfolio-helpers.ts` — "Likely outgrown" becomes "Possible move-up signal", and the equity signal is reworded for agents as ownership context rather than down-payment financing.

### 3. Openers and drafts read the snapshot only

- `generateDraft` in `src/lib/nba.server.ts` receives `facts` (the canonical snapshot) plus the role narrative instead of a free-text reason list, with a hard prompt rule: use only these numbers, rounded as given, or none at all.
- `generateAgentBrief` in `src/lib/agent.functions.ts` is rebuilt on the same snapshot and narrative, so brief, card and email cannot disagree.
- Lender brief keeps its existing gating and structure; it takes the narrative for the "why now" section.

### 4. Card presentation

`src/components/action-queue.tsx`, `src/components/agent-today.tsx`, `src/components/opportunities-board.tsx` and the lender contact card render the same block order, no competing narratives:

```text
OPPORTUNITY TYPE   Possible move-up conversation
WHY NOW            21 years in a 1-bedroom home
WHY IT MATTERS     one soft sentence
SIGNALS            21.6 yrs owned · 625 sq ft · 1 bed · ~46% equity
HOW TO BE USEFUL   one line
SUGGESTED OPENER   2-4 human sentences
PRIMARY CTA        Prepare home update
SECONDARY          Call · Text · Email · View homeowner
```

Channel eligibility, permission gates and blocked reasons are rendered exactly as they are today.

### 5. Kevin DeJesus audit

Before shipping, run a read-only check of his record: the canonical snapshot, what the roster shows, what the brief generates, and what the queue card says. Expected outcome after the change — one agent narrative:

- Primary: possible move-up / future-plans conversation
- Supporting: long tenure, 1 bed / 625 sq ft, meaningful equity
- Action: offer a home-value update and ask about future plans
- Financing intelligence preserved as a secondary signal for the agent, and available as a primary opportunity to a lender with an independent right to see him

## Files to change

| File | Change |
|---|---|
| `src/lib/opportunities.server.ts` | export `clientFactsFor()` canonical snapshot |
| `src/lib/opportunity-narrative.ts` | new: role-aware primary/secondary/signals/opener seed |
| `src/lib/opportunity-narrative.test.ts` | new: role separation, no financing primary for agents, fact-consistency, softened language |
| `src/lib/next-best-action.ts` | recipes gain objective / why-it-matters / CTA label; agent recipes stay relationship-first |
| `src/lib/agent-portfolio-helpers.ts` | soften "Likely outgrown" and the equity signal wording |
| `src/lib/agent.functions.ts` | roster + listing brief read the canonical snapshot and narrative |
| `src/lib/nba.server.ts` | queue items carry the narrative; drafts use snapshot-only prompts |
| `src/components/action-queue.tsx`, `agent-today.tsx`, `opportunities-board.tsx`, `lender-contact-card.tsx`, `lender-brief.tsx` | render the shared card structure |

No database, schema, permission, consent, ranking or outcome changes.

## Verification

- Unit tests: same facts + agent vs lender produce different primaries and identical numbers.
- A test asserting no agent-facing surface can emit a HELOC/refinance/qualification recommendation as primary.
- A fact-consistency test: card, opener, brief and email all format from one snapshot object.
- Typecheck, full library test run, and a signed-in pass over agent Today, agent homeowner detail, lender Today and lender detail for Kevin.
