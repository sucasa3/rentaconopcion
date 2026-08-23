# Homeowner North Star: from home profile to Home Operating System

I agree with the direction, and most of the foundation is already in place. The signal engine (`src/lib/signals.ts`) already emits typed, ranked signals with reasons — condition, equity, refi, value movement, intent, record gaps. The Home Record already assembles property, financial, physical and behavior sections from one shared read. What's missing is the part the homeowner actually feels: memory (a timeline), a reason to come back (alerts), and proof of worth (money found).

North Star to adopt: **a homeowner is "actively managed" when SuCasa holds a verified home, a meaningful record, at least one live signal, and at least one interaction in 90 days.** Everything below is built to move that one number.

## Phase 1 — The Home Timeline (memory)

A single chronological story of the house on its own tab: purchase, sales history, permits, service log entries, inspections, documents, value snapshots, completed service requests. Every entry is tappable and links to its source; documents and receipts attach to the entry they belong to.

Nothing new is fetched — permits, sales, service log, findings, documents and requests are already loaded for the dashboard; value snapshots already exist as a table. This is assembly and presentation.

Why first: it is the piece that makes leaving expensive, and it makes the rest of the app feel like it knows the house.

## Phase 2 — Alerts and the monthly Home Brief (the reason to return)

Turn signals into dated, dismissible alerts with read state, so the same signal doesn't shout forever and a new one is visibly new.

- An "Things you should know" strip at the top of the dashboard: at most three, plain language, each with one action.
- Add rules the engine doesn't have yet: property-tax assessment change, insurance-review reminder driven by roof age and last policy note, neighborhood market movement.
- A monthly Home Brief email through the existing sender infrastructure: value, equity change, top three things to know, one suggested action.

## Phase 3 — Home Wealth (make money)

One screen that answers "what is my home worth to me": value, mortgage balance, equity, 12-month and since-purchase change, drawn from value snapshots so the trend is real rather than a single point. Below it, the equity-use options — renovate, HELOC, refinance, pay down, sell — each shown as education first, with a "talk to someone" action second.

## Phase 4 — Value Delivered ("money SuCasa found for you")

A running ledger per home: estimated refi savings, avoided maintenance cost from work done on time, equity gained, estimated improvement ROI, insurance review potential. Shown as one headline number with an itemized breakdown, every line traceable to the signal that produced it. This becomes the retention metric and the pitch line at the same time.

## Phase 5 — Assistant as the front door

The assistant answers from the Home Record and signal list rather than free-form, so it says the same thing the screens do: "what should I do this year", "show me everything about my roof", "who serviced my HVAC", "should I refinance". It gets the timeline and signal report as grounded context and can hand off to the right action.

## Phase 6 — Intent-led vendor introductions

Signals already declare which network they fire into. Close the loop on the homeowner side: value first ("your roof is approaching a milestone"), then an opt-in ("want three qualified roofers to quote?"), then the existing service-request pipeline. No vendor appears before the homeowner asks.

## Technical notes

- New pure module `src/lib/home-timeline.ts` merges existing record sections into typed timeline entries; new route `/_authenticated/timeline` renders it inside `HomeownerShell`.
- Alerts: a small `homeowner_alerts` table (signal key, first seen, read/dismissed) so signal state persists across sessions; the engine stays the source of truth, the table only stores lifecycle. New rules are added inside `evaluateHome`, not as new panels.
- Wealth trend reads `home_value_snapshots`; a light write on each intel refresh keeps the series growing with no extra property-record spend.
- Value Delivered is a derived view over signals plus `opportunity_outcomes` and the service log — no new provider calls.
- Assistant grounding extends `src/lib/assistant.functions.ts` to pass the record + signal report; no model change.
- Mobile-first, existing tokens and card primitives, English and Spanish strings added to `src/lib/i18n`.

## Suggested order

Phases 1 and 2 change how the product feels and are the cheapest to build on what exists. I'd do those next, then 3 and 4 together since they share the wealth math.

## To confirm

Should I start with Phase 1 (Timeline) plus Phase 2 (Alerts strip) in the next build, or lead with Phase 3/4 (Wealth + Money found) because it is the more visible promise?
