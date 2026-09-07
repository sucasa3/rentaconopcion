# Lender experience: from dashboard to daily operating system

A refinement of the existing lender product. No architecture rewrite: the access classifier, permission gates, sponsored-homeowner anonymity, compliance rewriting, CRM sync, outcome history and billing all stay exactly as they are.

## Answers to your pre-implementation questions

**Is the equity discrepancy a display issue or a data issue?**
Neither exactly — it is a **unit mismatch in one place in the lender code**, not bad stored data and not a formatting trick.

Two different sources feed the same lender fields:
- Uploaded loan figures are stored in cents.
- Saved property records (value, tax, mortgage) are stored in whole dollars.

The lender read treats both as cents and the card divides by 100, so a real $163,043 of equity prints as about $1,590. The "why now" line on the same card comes from the opportunity engine, which already speaks in dollars, so it prints the correct $163,043. Same homeowner, two numbers, one wrong. The stored records are fine; the fix is a single conversion at the point the property record is read, plus tests that lock the units.

**Schema changes required:** none for P0/P1. The weekly recap (P2) reads existing outcome and event rows only.

**Reused rather than newly built:** the whole server layer (`lender-workspace.server.ts`, `lender-access.ts`, `lender-workspace.functions.ts`), the shared UI kit (`StatCard`, `SectionHeader`, `StatusPill`, `EmptyState`), the existing brief generator and its compliance rewriting, the existing outcome vocabulary and logging function, existing filters in My Book, and the existing opportunity/next-step engine. New files are limited to a compact contact card and the short brief builder.

**Risk to access/compliance behaviour:** low and contained. No change to `classifyLenderAccess`, scope checks, channel decisions, prohibited-language patterns or ranking-input audits. The one behavioural change near the gate is ordering — contactable records rank above uncontactable ones — which filters presentation only, never widens access. Existing access/privacy/compliance tests must pass unchanged.

## P0 — one number per homeowner (blocking)

- Convert property-record values (value, tax value, mortgage balance) to cents at the single point they enter the lender read, so every downstream field is cents.
- Route every lender-facing financial field through one resolver so value, equity, equity %, LTV, balance, loan age, modelled savings and opportunity text all come from the same computed object — Today, My Book, cards, filters, briefs, detail view.
- Add regression tests: a homeowner whose figures come from a property record and one whose figures come from uploaded loan data both produce identical numbers in the card fields and in the "why now" text; a mixed-source homeowner never produces two different equity values.

## P1 — Today becomes Your Daily 10

- Compact metric strip at the top (monitored, needs attention today, requesting contact, follow-ups due, conversations this month). Changes detected stays but is phrased as "of which N deserve action".
- **SuCasa's Take**: 1–3 sentences generated from permitted facts only, naming the top three homeowners and the strongest reason. No invented facts.
- **Connection requests**: zero requests collapses to a single line ("No homeowner requests waiting"); one or more moves above the Daily 10 as an urgent block.
- **Your Daily 10**: max 10 cards with "View more". Order: asked to connect, contactable Hot, Warm, Nurture. A homeowner with no permitted channel does not displace a contactable one unless their priority is far higher.

## P1 — compact contact card

Collapsed card (target: 2–3 per phone screen):

```text
[temp] [reason]                    #3
Gilberto Ramirez
Annual review due · last touch 11 mo
Next: schedule an annual review call
"Hi Gilberto — your latest update is ready…"
[ Call ]  [ Text ]  [ Email ]   Log outcome
More intelligence ▾
```

Primary contact buttons are visually dominant; "Generate review brief" moves inside the expandable section. Locked channels keep their existing locked treatment and reason tooltip.

## P1 — agentic outcomes

Same eight outcomes, behind one "Log outcome" control revealed after an outreach action. After logging, SuCasa proposes and creates the next step using the existing task/follow-up and CRM sync paths: no answer creates a permitted retry, talked asks for an optional note plus next step, review scheduled creates the follow-up task, follow up later asks for timing, application/in-process suppresses prospecting prompts, closed moves the relationship to a post-close cadence rather than removing them.

## P1 — temperature calibration

Audit why every homeowner currently lands in Warm (likely a single threshold band over a narrow priority spread). Separate the two ideas: priority orders the list, temperature describes urgency, driven by explicit request, recency of a meaningful change, follow-up overdue and review timing. Document the rules in code and cover them with tests. No artificial distribution.

## P1 — 30-second brief

New first layer in the existing brief dialog: why they are on today's list, up to three facts, relationship context, objective, opener, two or three questions. "View full review brief" expands to today's brief unchanged, with all existing compliance rewriting.

## P1 — My Book

- Rename the lender homeowners surface to **My Book** with "[X] homeowner relationships monitored".
- Replace the refinance-rate hero with a cross-opportunity "What to do now" recommendation; refinance appears as one supporting signal with modelled-savings wording, never as the page's identity, and the benchmark rate is no longer a headline.
- Filters: needs attention, follow-up due, asked to connect, annual review due, recently engaged, equity change, mortgage age, tenure, move planning, refinance opportunity, agent relationship, temperature. Existing filters retained; nothing added that we lack data for.

## P1 — homeowner record

Reorder the existing detail view into: next best action, why now, relationship, home intelligence, opportunities, timeline, permissions. Reuses current components and data.

## P2 — weekly recap foundation

A server-side aggregate ("Your SuCasa week") over existing outcome and event rows, surfaced as one compact strip. No new tables, no reporting build-out.

## Files expected to change

- `src/lib/lender-workspace.server.ts` — unit fix, single financial resolver, temperature calibration, contactability in ordering, daily-take inputs, weekly aggregate
- `src/lib/lender-workspace.functions.ts` — short brief, outcome → next-step orchestration
- `src/lib/lender-access.ts` — unchanged logic; read-only reference
- `src/components/lender-today.tsx` — Daily 10, take, compact metrics, collapsed request line
- `src/components/lender-contact-card.tsx` *(new)* — compact card extracted from today
- `src/components/lender-brief.tsx` *(new)* — 30-second layer wrapping the existing brief
- `src/components/lender-book.tsx`, `src/components/lender-command-center.tsx` — My Book naming, filters, cross-opportunity hero
- `src/routes/_authenticated/lender/portfolio.$id.index.tsx` — de-emphasise the refi-rate hero, reorder the homeowner record
- `src/lib/lender-workspace.test.ts` *(new)* + existing `src/lib/lender-access.test.ts` — unit/consistency and temperature tests

## Verification

Run the existing access/privacy/compliance suite plus the new consistency and temperature tests, then walk the mobile lender flow at 420px against the 14 acceptance checks.
