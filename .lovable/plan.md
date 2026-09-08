# Homeowner Home Intelligence — implementation plan

Goal: turn `/dashboard` from a stack of equal-weight cards into one coherent
"Your Home Today" experience. Presentation and composition only. No changes to
valuation, equity, Home Score, Home Plan generation, maintenance, documents,
assistant, Premium or consent logic.

## What changes (and what does not)

Changed files:

- `src/routes/_authenticated/dashboard.tsx` — rebuilt hierarchy, same data reads.
- New `src/lib/home-today.ts` — pure presentation helpers (what SuCasa sees,
  recent updates, home-health phrasing, completeness invitations) with tests.
- New small presentational components under `src/components/home-today/`
  (intelligence summary, coming-up card, compact destination rows).
- `src/components/home-plan-*` completion feedback: a calm "Taken care of —
  your Home Plan has been updated" confirmation on the existing mark-done path.
- Timeline, documents, assistant and home-care pages: heading/label wording
  only ("Your home's story", "Your home vault", "Ask SuCasa about your home"),
  through the existing i18n keys. No behavior change.

Untouched: `HomeHero`, `use-home-record`, `use-home-intel`, `home-plan.ts`,
`home-plan.functions.ts`, maintenance engine, inspection/document functions,
alerts engine, Premium/sponsorship logic, consent boundaries.

## Data that drives "What SuCasa sees"

All already loaded on the dashboard today, so no new queries:

- `report.signals` (Home Alerts engine) — leading signal, strength.
- `record.physical.timeline` statuses — `overdue`, `due_soon` counts.
- `planCounts(homePlan)` — `next90Days`, `total`, `top` item and cost band.
- `okIntel.value.value`, `okIntel.equity.equityDollars`, `equityPct`.
- `listInspectionFindings()` — count of saved findings.
- `listHomeDocuments()` — count, and whether an inspection exists.
- `homeScore.score` / `zones`.

The summary is deterministic sentence assembly from these counts — no new AI
call, no assessment the data does not support. Priority order: overdue care →
strong alert → items due in 90 days → missing inspection → steady state.

## "What changed" — what can be proven today

Truthfully detectable, because each row carries a real timestamp:

- Estimated value moved — `home_value_snapshots.captured_on` + value; compare
  the newest snapshot to the most recent earlier one.
- New document added — `home_documents.created_at`.
- New inspection findings — findings `created_at`.
- Care item now due soon/overdue — derived from the current timeline status.

Not detectable: "since your last visit" and "overnight". There is no
last-seen-dashboard timestamp and value snapshots are captured only on visit,
so gaps are irregular. Therefore the section is labelled **Worth knowing now**,
with a "Recent updates" list limited to items timestamped in the last 30 days
and each row stating its own date ("Value updated Sep 2"). No wording implies
change since yesterday.

## Section-by-section

1. **Greeting** — real first name from `profiles.full_name`; time-of-day
   greeting; one honest state line ("Your home is in good shape." / "A few
   things are worth knowing about your home."), plus a monitoring line naming
   only what is actually watched.
2. **HomeHero** — unchanged component, kept directly under the greeting as the
   identity anchor with address, estimated value, equity, equity %, Home Score
   and existing estimate disclosures. It is the only large visual block.
3. **What SuCasa sees** — 2–3 sentence intelligence summary integrated
   immediately beneath the hero, followed by the existing `HomeAlerts` row when
   a real signal exists, then "Worth knowing now" recent updates when any exist.
4. **Coming up for your home** — one prominent card: count in the next 90 days,
   the top plan item title, its existing cost band, and a link to `/home-plan`.
   It shows a summary only; all plan interaction (done, dismiss, request help,
   horizons, why) stays on `/home-plan` so nothing is duplicated.
5. **Home health** — compact row derived from existing timeline statuses:
   "Everything looks on track" / "1 thing coming up soon" / "2 items need
   attention". Links to `/home-care`. No manufactured urgency.
6. **Your home's financial picture** — estimated value and estimated equity
   with the existing labels, plus one plain translation ("You've built about
   38% equity in your home."). No refinance, borrowing or unlock language on
   the dashboard; lender/agent actions stay on `/money` and stay
   permission-based.
7. **Make SuCasa smarter about your home** — the existing `profileCompleteness`
   missing list rendered as invitations with the benefit stated, not a percent
   bar and no points or streaks. Hidden entirely when nothing is missing.
8. **Compact destination rows** — Home vault (documents; surfaces "SuCasa found
   N items in your inspection report" only when findings exist), Ask SuCasa
   about your home, Your home's story (timeline), Get help with your home
   (`/request`, framed as homeowner-initiated). These become quiet single-line
   rows rather than full cards.

## SellerIntentCard

The current card leads with "Thinking about your next move?" and submits a
selling-interest signal, so it stays on `/money` and is not surfaced on Home
Today. Instead the dashboard offers a neutral, homeowner-first "What are you
thinking about?" row (Staying put / Improving this home / Curious about my
value / Thinking about moving / Not sure yet) that only links to the matching
existing destination for the choice the homeowner makes. No intent score is
computed, stored or displayed on the homeowner surface, and nothing is shared
with a professional without the homeowner's explicit request.

## Quiet-home state

When there are no overdue or due-soon items, no non-low signals and no plan
items in 90 days: the hero stays, the summary reads "Your home looks good
today — nothing needs immediate attention", and the coming-up and health
sections collapse into calm one-liners. Recent updates and invitations still
appear if truthful. Nothing is invented to fill space.

## Card fatigue

One hero, one intelligence summary, one primary "coming up" card, everything
else as quiet rows or a compact two-up strip. `SummaryCard` remains available
but is used at most twice on this page.

## Premium

Premium state is read through the existing `getMyPremium` and shown as a subtle
membership line describing benefits the product actually delivers. No new
Premium-only feature, no pricing change, and sponsored Premium copy continues
to state that the sponsor does not receive the homeowner's data.

## Things the current data cannot honestly support

- "Since your last visit" / "overnight" change detection.
- Value change between arbitrary dates (snapshots exist only for visited days).
- Condition change over time (Home Score is computed fresh, not versioned).
- Improvement ROI or "value added by your maintenance".

These are stated as absent rather than approximated.

## Verification

`bunx tsgo --noEmit`, unit tests for the new pure helpers (summary priority,
recent-update windowing, quiet state, completeness invitations), and an
authenticated browser check of `/dashboard` in both languages.
